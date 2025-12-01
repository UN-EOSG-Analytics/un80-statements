import json
import os
import sqlite3

IAHWG_SESSIONS = [
    (
        "k1k%2Fk1k41vpaer",
        "Session 1: First meeting of the working group (Sep 16, 2025)",
    ),
    (
        "k1q%2Fk1q3jsibpv",
        "Session 2: Mandate Creation briefing - Panel followed by questions from members of the working group (Oct 13, 2025)",
    ),
    (
        "k1w%2Fk1w9g0n7gs",
        "Session 3: Mandate Creation consultations - Statements from members of the working group (Oct 23, 2025)",
    ),
    (
        "k11%2Fk11rftq8ch",
        "Session 4: Mandate Implementation briefing - Panel followed by questions from members of the working group (Oct 30, 2025)",
    ),
    (
        "k1j%2Fk1jax5ye21",
        "Session 5: Mandate Implementation consultations - Statements from members of the working group – Part 1 (Nov 14, 2025)",
    ),
    (
        "k1q%2Fk1q3djbdxu",
        "Session 6: Mandate Implementation consultations - Statements from members of the working group – Part 2 (Nov 14, 2025)",
    ),
    (
        "k1q%2Fk1q2ukeao9",
        "Mandate Review briefing - Panel followed by questions from members of the working group (Nov 25, 2025)",
    ),
]


def get_transcripts():
    """Get IAHWG transcripts from database."""
    db_path = os.getenv("TURSO_DB", "").replace("libsql://", "").split("?")[0]
    conn = sqlite3.connect(f"https://{db_path}")
    cursor = conn.cursor()

    markdown = "# IAHWG Session Transcripts\n\n"

    for asset_id, description in IAHWG_SESSIONS:
        # Get entry_id
        cursor.execute("SELECT entry_id FROM videos WHERE asset_id = ?", (asset_id,))
        row = cursor.fetchone()
        if not row:
            continue
        entry_id = row[0]

        # Get transcript
        cursor.execute(
            """
            SELECT transcript_id, content 
            FROM transcripts 
            WHERE entry_id = ? AND status = 'completed' AND start_time IS NULL
            LIMIT 1
        """,
            (entry_id,),
        )

        row = cursor.fetchone()
        if not row:
            continue

        transcript_id, content = row
        content = json.loads(content)

        # Get speaker mapping
        cursor.execute(
            "SELECT mapping FROM speaker_mappings WHERE transcript_id = ?",
            (transcript_id,),
        )
        mapping_row = cursor.fetchone()
        speakers = json.loads(mapping_row[0]) if mapping_row else {}

        # Format output
        markdown += f"## {description}\n\n"

        for idx, statement in enumerate(content["statements"]):
            speaker = speakers.get(str(idx), {})

            if speaker.get("affiliation"):
                markdown += f"**{speaker['affiliation']}**"
                if speaker.get("name"):
                    markdown += f" | {speaker['name']}"
                if speaker.get("function"):
                    markdown += f", {speaker['function']}"
                markdown += "\n"

            text = " ".join(
                s["text"] for p in statement["paragraphs"] for s in p["sentences"]
            )
            markdown += f"{text}\n\n"

        markdown += "---\n\n"

    conn.close()
    return markdown


if __name__ == "__main__":
    print(get_transcripts())
