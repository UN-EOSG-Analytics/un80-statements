import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
import numpy as np
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import OpenAI

DB_PATH = Path("data") / "db" / "iahwg_rag.db"
EMBEDDING_MODEL = "text-embedding-3-large"

load_dotenv()
os.environ["AZURE_OPENAI_ENDPOINT"] = os.getenv("UN80_AZURE_OPENAI_ENDPOINT")

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
)

openai_client = OpenAI(
    base_url="https://un80-eu-openai.openai.azure.com/openai/v1/",
    api_key=token_provider,
)


def embed_query(query: str) -> np.ndarray:
    """Embed a query string using the same model as the corpus."""
    resp = openai_client.embeddings.create(
        input=query,
        model=EMBEDDING_MODEL,
    )
    return np.array(resp.data[0].embedding, dtype=np.float32)


def search_sentences(query: str, top_k: int = 10):
    """Simple brute-force semantic search over the SQLite DB."""
    q_vec = embed_query(query)
    q_norm = q_vec / np.linalg.norm(q_vec)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Pull all sentences + embeddings into memory (fine for ~5k rows)
    cur.execute(
        """
        SELECT
            id,
            context_text,
            asset_id,
            session_title,
            session_date,
            speaker_affiliation_name,
            embedding
        FROM sentences
        """
    )
    rows = cur.fetchall()
    conn.close()

    ids, texts, metas, vecs = [], [], [], []
    for (
        _id,
        context_text,
        asset_id,
        session_title,
        session_date,
        speaker_affiliation_name,
        emb_blob,
    ) in rows:
        vec = np.frombuffer(emb_blob, dtype=np.float32)
        ids.append(_id)
        texts.append(context_text)
        metas.append((asset_id, session_title, session_date, speaker_affiliation_name))
        vecs.append(vec)

    mat = np.vstack(vecs)
    mat_norm = mat / np.linalg.norm(mat, axis=1, keepdims=True)

    sims = mat_norm @ q_norm  # cosine similarity

    top_idx = np.argsort(-sims)[:top_k]

    results = []
    for i in top_idx:
        asset_id, session_title, session_date, speaker_affiliation_name = metas[i]
        results.append(
            {
                "id": ids[i],
                "score": float(sims[i]),
                "context_text": texts[i],
                "asset_id": asset_id,
                "session_title": session_title,
                "session_date": session_date,
                "speaker_affiliation_name": speaker_affiliation_name,
            }
        )

    return results


if __name__ == "__main__":
    query = "mandate registries, mandate visibility transparency"
    print(f"Query: {query!r}\n")

    hits = search_sentences(query, top_k=20)

    for h in hits:
        print(
            f"{h['score']:.3f} | {h['speaker_affiliation_name']} | "
            f"{h['session_date']} | {h['session_title']}"
        )
        print("   ", h["context_text"])
        print()
