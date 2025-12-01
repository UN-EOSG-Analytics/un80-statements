from pathlib import Path

import pandas as pd
import tiktoken
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from joblib import Memory
from openai import OpenAI
from tqdm import tqdm

import sqlite3
import numpy as np
from datetime import datetime


input_path = Path("data") / "output" / "iahwg_sentences.csv"
df = pd.read_csv(input_path)

# Setup caching
memory = Memory("data/.cache", verbose=0)

EMBEDDING_MODEL = "text-embedding-3-large"

DB_PATH = Path("data") / "db" / "iahwg_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
)

openai_client = OpenAI(
    base_url="https://un80-eu-openai.openai.azure.com/openai/v1/",
    api_key=token_provider,
)


df["text"] = df["text"].str.replace(
    r"\b(UN\s?AD|UNAT|UNA|UNHC|UNAD)\b", "UN80", regex=True
)

# Create context_text: concat previous + current + next sentence for embedding
df["prev_text"] = df.groupby(["asset_id", "statement_idx"])["text"].shift(1)
df["next_text"] = df.groupby(["asset_id", "statement_idx"])["text"].shift(-1)

# Build context_text with current sentence in the middle
df["context_text"] = (
    df["prev_text"].fillna("") + " " + df["text"] + " " + df["next_text"].fillna("")
).str.strip()

df[["text", "context_text"]].head(10)


def num_tokens_from_string(string: str, encoding_name: str) -> int:
    """Returns the number of tokens in a text string."""
    encoding = tiktoken.get_encoding(encoding_name)
    num_tokens = len(encoding.encode(string))
    return num_tokens


df["text_num_tokens"] = df["context_text"].apply(
    lambda x: num_tokens_from_string(x, "cl100k_base")
)


df["text_exceeds_token_limit"] = df["text_num_tokens"] > 8192
df["text_exceeds_token_limit"].value_counts()


exceed_count = df["text_exceeds_token_limit"].sum()
if exceed_count > 0:
    print(f"Warning: {exceed_count} paragraphs exceed the token limit.")


df["text_num_tokens"].agg(["min", "mean", "std", "median", "max"]).round(2)


# FIXME: add async or batching for faster run!

@memory.cache
def get_embedding(text: str, model: str = EMBEDDING_MODEL) -> list[float]:
    response = openai_client.embeddings.create(input=text, model=model)
    return response.data[0].embedding


embeddings = [
    get_embedding(text)
    for text in tqdm(df["context_text"], desc="Generating embeddings")
]

df["embedding"] = embeddings


len(df)

df.columns

# Check for any missing embeddings
missing_embeddings = df["embedding"].isnull().sum()
if missing_embeddings > 0:
    print(f"Warning: {missing_embeddings} rows are missing embeddings.")
else:
    print("All rows have embeddings.")


#######################################


now = datetime.utcnow().isoformat() + "Z"

rows = []
for _, row in df.iterrows():
    emb = np.array(row["embedding"], dtype=np.float32)  # list[float] -> float32
    rows.append(
        (
            row["asset_id"],
            row["session_num"],
            row["session_title"],
            row["session_date"],
            int(row["statement_idx"]),
            row["speaker_affiliation_code"],
            row["speaker_affiliation_name"],
            row["speaker_name"],
            row["speaker_function"],
            row["speaker_group"],
            int(row["paragraph_idx"]),
            int(row["sentence_idx"]),
            row["text"],
            row["context_text"],
            emb.tobytes(),  # store as BLOB
            EMBEDDING_MODEL,
            now,
        )
    )

cur.executemany(
    """
    INSERT INTO sentences (
        asset_id, session_num, session_title, session_date,
        statement_idx,
        speaker_affiliation_code, speaker_affiliation_name,
        speaker_name, speaker_function, speaker_group,
        paragraph_idx, sentence_idx,
        text, context_text,
        embedding, embedding_model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
""",
    rows,
)

conn.commit()
conn.close()
