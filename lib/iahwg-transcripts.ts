import { getTursoClient } from "./turso";
import { getSpeakerMapping } from "./speakers";
import { resolveEntryId } from "./kaltura-helpers";
import { extractKalturaId } from "./kaltura";

const IAHWG_SESSIONS = [
  {
    assetId: "k1k/k1k41vpaer",
    description:
      "Session 1: Initial Discussion on Mandate Creation (Sep 16, 2025)",
  },
  {
    assetId: "k1k/k1k5t0nzg8",
    description: "Session 2: Negotiation on Mandate Framework (Sep 27, 2025)",
  },
  {
    assetId: "k1k/k1k9tz7f4e",
    description: "Session 3: Mandate Implementation Planning (Oct 9, 2025)",
  },
  {
    assetId: "k1k/k1kbrdj75w",
    description: "Session 4: Implementation Progress Review (Oct 23, 2025)",
  },
  {
    assetId: "k1k/k1ke9tpwk7",
    description: "Session 5: Review and Assessment (Nov 14 Part 1, 2025)",
  },
  {
    assetId: "k1q/k1q3djbdxu",
    description: "Session 6: Continued Review Discussion (Nov 14 Part 2, 2025)",
  },
  {
    assetId: "k1q/k1q2ukeao9",
    description: "Session 7: Final Review and Next Steps (Nov 25, 2025)",
  },
];

export async function loadIAHWGTranscripts(): Promise<string> {
  const client = await getTursoClient();

  let markdown = "# IAHWG Session Transcripts\n\n";
  markdown +=
    "Complete transcripts from 7 Informal Ad Hoc Working Group sessions (Sep-Nov 2025).\n\n";

  for (const session of IAHWG_SESSIONS) {
    const videoResult = await client.execute({
      sql: "SELECT asset_id, entry_id FROM videos WHERE asset_id = ?",
      args: [session.assetId],
    });

    if (videoResult.rows.length === 0) {
      continue;
    }

    const video = videoResult.rows[0];
    const entryId = video.entry_id as string;

    const kalturaId = extractKalturaId(session.assetId);
    if (!kalturaId) {
      continue;
    }

    let actualEntryId: string;
    try {
      const resolved = await resolveEntryId(session.assetId);
      actualEntryId = resolved || entryId;
    } catch {
      actualEntryId = entryId;
    }

    const result = await client.execute({
      sql: `
        SELECT 
          t.transcript_id,
          t.content
        FROM transcripts t
        WHERE t.entry_id = ?
          AND t.status = 'completed'
          AND t.start_time IS NULL
        LIMIT 1
      `,
      args: [actualEntryId],
    });

    if (result.rows.length === 0) {
      continue;
    }

    const row = result.rows[0];
    const content = JSON.parse(row.content as string);
    const speakerMapping = await getSpeakerMapping(row.transcript_id as string);

    markdown += `## ${session.description}\n`;
    markdown += `Video: /video/${session.assetId}\n\n`;

    content.statements.forEach((statement: unknown, idx: number) => {
      const speaker = speakerMapping?.[idx.toString()];

      if (speaker?.affiliation) {
        markdown += `**${speaker.affiliation}**`;
        if (speaker.name) markdown += ` | ${speaker.name}`;
        if (speaker.function) markdown += `, ${speaker.function}`;
        markdown += `\n`;
      } else {
        markdown += `**[Speaker Unknown]**\n`;
      }

      const stmt = statement as {
        paragraphs: Array<{ sentences: Array<{ text: string }> }>;
      };
      const text = stmt.paragraphs
        .flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");

      markdown += `${text}\n\n`;
    });

    markdown += "---\n\n";
  }

  return markdown;
}
