import sqlite3
import numpy as np
from pathlib import Path

DB_PATH = Path("data") / "db" / "iahwg_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Check row count
cur.execute("SELECT COUNT(*) FROM sentences;")
count = cur.fetchone()[0]
print("Rows in DB:", count)

# Peek at a few rows
cur.execute("SELECT id, text, embedding FROM sentences LIMIT 3;")
rows = cur.fetchall()
for _id, text, emb_blob in rows:
    vec = np.frombuffer(emb_blob, dtype=np.float32)
    print(f"ID: {_id} | dim: {vec.shape[0]} | text: {text[:80]}...")

conn.close()
