import json
import os
from pathlib import Path
from urllib.parse import unquote

import libsql
import pycountry
from dotenv import load_dotenv
from joblib import Memory
from tqdm import tqdm

load_dotenv()

# Setup cache
memory = Memory("cache", verbose=0)


def get_country_name(code):
    """Convert ISO3 country code to full country name."""
    try:
        return pycountry.countries.get(alpha_3=code.upper()).name
    except (AttributeError, KeyError):
        return code


IAHWG_SESSIONS = [
    (
        "k1k%2Fk1k41vpaer",
        "Session 1",
        "First meeting of the working group",
        "Sep 16, 2025",
    ),
    (
        "k1q%2Fk1q3jsibpv",
        "Session 2",
        "Mandate Creation briefing - Panel followed by questions from members of the working group",
        "Oct 13, 2025",
    ),
    (
        "k1w%2Fk1w9g0n7gs",
        "Session 3",
        "Mandate Creation consultations - Statements from members of the working group",
        "Oct 23, 2025",
    ),
    (
        "k11%2Fk11rftq8ch",
        "Session 4",
        "Mandate Implementation briefing - Panel followed by questions from members of the working group",
        "Oct 30, 2025",
    ),
    (
        "k1j%2Fk1jax5ye21",
        "Session 5",
        "Mandate Implementation consultations - Statements from members of the working group – Part 1",
        "Nov 14, 2025",
    ),
    (
        "k1q%2Fk1q3djbdxu",
        "Session 6",
        "Mandate Implementation consultations - Statements from members of the working group – Part 2",
        "Nov 14, 2025",
    ),
    (
        "k1q%2Fk1q2ukeao9",
        "Session 7",
        "Mandate Review briefing - Panel followed by questions from members of the working group",
        "Nov 25, 2025",
    ),
]


DB_URL = os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_DB")
AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN") or os.getenv("TURSO_TOKEN")


@memory.cache
def fetch_session_data(asset_id):
    """Fetch transcript data for a single session from database."""

    conn = libsql.connect(database=DB_URL, auth_token=AUTH_TOKEN)

    # Get entry_id
    result = conn.execute("SELECT entry_id FROM videos WHERE asset_id = ?", (asset_id,))
    row = result.fetchone()
    if not row:
        conn.close()
        return None

    entry_id = row[0]

    # Get transcript
    result = conn.execute(
        """
        SELECT transcript_id, content 
        FROM transcripts 
        WHERE entry_id = ? AND status = 'completed' AND start_time IS NULL
        LIMIT 1
    """,
        (entry_id,),
    )

    row = result.fetchone()
    if not row:
        conn.close()
        return None

    transcript_id, content = row
    content = json.loads(content)

    # Get speaker mapping
    result = conn.execute(
        "SELECT mapping FROM speaker_mappings WHERE transcript_id = ?",
        (transcript_id,),
    )
    mapping_row = result.fetchone()
    speakers = json.loads(mapping_row[0]) if mapping_row else {}

    conn.close()

    return {"transcript": content, "speakers": speakers}


def fetch_all_sessions():
    """Fetch data for all IAHWG sessions."""
    sessions_data = []

    for asset_id_url, session_num, description, date in tqdm(
        IAHWG_SESSIONS, desc="Fetching sessions"
    ):
        asset_id = unquote(asset_id_url)
        tqdm.write(f"Loading: {asset_id} - {session_num} - {description}")

        data = fetch_session_data(asset_id)
        if data:
            sessions_data.append(
                {
                    "asset_id": asset_id,
                    "session_num": session_num,
                    "description": description,
                    "date": date,
                    "data": data,
                }
            )

    return sessions_data


def format_session_markdown(session):
    """Convert single session data to markdown format."""
    markdown = f"# {session['session_num']} | {session['description']} ({session['date']}) \n\n"

    transcript = session["data"]["transcript"]
    speakers = session["data"]["speakers"]

    for idx, statement in enumerate(transcript["statements"]):
        speaker = speakers.get(str(idx), {})

        # Build full speaker info
        speaker_parts = []
        if speaker.get("affiliation"):
            affiliation = get_country_name(speaker["affiliation"])
            speaker_parts.append(affiliation)
        if speaker.get("name"):
            speaker_parts.append(speaker["name"])
        if speaker.get("function"):
            speaker_parts.append(speaker["function"])
        if speaker.get("group"):
            speaker_parts.append(f"({speaker['group']})")

        if speaker_parts:
            markdown += f"**{' | '.join(speaker_parts)}**\n\n"

        # Put each sentence on a new line
        sentences = [s["text"] for p in statement["paragraphs"] for s in p["sentences"]]
        markdown += "\n".join(sentences) + "\n\n"

    return markdown


def format_as_markdown(sessions_data):
    """Convert session data to markdown format."""
    markdown = "# IAHWG Session Transcripts\n\n"

    for session in sessions_data:
        markdown += f"## {session['session_num']}: {session['description']}\n\n"

        transcript = session["data"]["transcript"]
        speakers = session["data"]["speakers"]

        for idx, statement in enumerate(transcript["statements"]):
            speaker = speakers.get(str(idx), {})

            # Build full speaker info
            speaker_parts = []
            if speaker.get("affiliation"):
                speaker_parts.append(speaker["affiliation"])
            if speaker.get("name"):
                speaker_parts.append(speaker["name"])
            if speaker.get("function"):
                speaker_parts.append(speaker["function"])
            if speaker.get("group"):
                speaker_parts.append(f"({speaker['group']})")

            if speaker_parts:
                markdown += f"**{' | '.join(speaker_parts)}**\n"

            text = " ".join(
                s["text"] for p in statement["paragraphs"] for s in p["sentences"]
            )
            markdown += f"{text}\n\n"

        markdown += "---\n\n"

    return markdown


if __name__ == "__main__":
    sessions = fetch_all_sessions()
    print(f"\nFetched {len(sessions)} sessions")

    # Create output directory
    output_dir = Path("data/md")

    # Clear existing files
    if output_dir.exists():
        for file in output_dir.glob("*.md"):
            file.unlink()

    output_dir.mkdir(parents=True, exist_ok=True)

    # Save each session as separate markdown file
    for session in sessions:
        # Create clean filename: session_date_first_three_words
        session_num = session["session_num"].replace(" ", "_").lower()
        date_clean = session["date"].replace(" ", "_").replace(",", "")

        # Get first three words of description
        words = session["description"].lower().split()[:3]
        desc_short = "_".join(words)

        filename = f"{session_num}_{date_clean}_{desc_short}.md"
        filepath = output_dir / filename

        # Generate and save markdown
        markdown = format_session_markdown(session)
        filepath.write_text(markdown, encoding="utf-8")

        print(f"Saved: {filepath}")
