from pathlib import Path
import sqlite3
import numpy as np
from datetime import datetime

DB_PATH = Path("data") / "db" / "iahwg_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY,
    asset_id TEXT,
    session_num TEXT,
    session_title TEXT,
    session_date TEXT,
    statement_idx INTEGER,
    speaker_affiliation_code TEXT,
    speaker_affiliation_name TEXT,
    speaker_name TEXT,
    speaker_function TEXT,
    speaker_group TEXT,
    paragraph_idx INTEGER,
    sentence_idx INTEGER,
    text TEXT NOT NULL,
    context_text TEXT NOT NULL,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT NOT NULL
);
""")
conn.commit()


cur.execute("""
CREATE UNIQUE INDEX IF NOT EXISTS idx_sentences_unique_sentence
ON sentences(asset_id, statement_idx, paragraph_idx, sentence_idx);
""")

conn.close()
