import { getTursoClient } from "../lib/turso";
import { getSpeakerMapping } from "../lib/speakers";
import { resolveEntryId } from "../lib/kaltura-helpers";
import { writeFileSync } from "fs";
import { join } from "path";

// All 7 IAHWG sessions found in database
const IAHWG_SESSIONS = [
  {
    assetId: "k1k/k1k41vpaer",
    description: "Session 1: Initial Discussion on Mandate Creation (Sep 16, 2025)",
  },
  {
    assetId: "k1w/k1w9g0n7gs",
    description: "Session 2: Negotiation on Mandate Framework (Sep 27, 2025)",
  },
  {
    assetId: "k1q/k1q3jsibpv",
    description: "Session 3: Mandate Implementation Planning (Oct 9, 2025)",
  },
  {
    assetId: "k11/k11rftq8ch",
    description: "Session 4: Implementation Progress Review (Oct 23, 2025)",
  },
  {
    assetId: "k1j/k1jax5ye21",
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

async function exportIAHWGTranscripts() {
  const client = await getTursoClient();
  let markdown = "# IAHWG Session Transcripts\n\n";
  markdown +=
    "Complete transcripts from 7 Informal Ad Hoc Working Group sessions (Sep-Nov 2025).\n\n";

  for (const session of IAHWG_SESSIONS) {
    console.log(`Processing ${session.description}...`);

    const videoResult = await client.execute({
      sql: "SELECT asset_id, entry_id FROM videos WHERE asset_id = ?",
      args: [session.assetId],
    });

    if (videoResult.rows.length === 0) {
      console.error(`❌ Missing video: ${session.assetId}`);
      continue;
    }

    const video = videoResult.rows[0];
    const entryId = video.entry_id as string;

    let actualEntryId = entryId;
    try {
      const resolved = await resolveEntryId(session.assetId);
      actualEntryId = resolved || entryId;
    } catch {
      // Use original entry_id if resolution fails
    }

    const result = await client.execute({
      sql: `SELECT transcript_id, content 
            FROM transcripts 
            WHERE entry_id = ? AND status = 'completed' AND start_time IS NULL
            LIMIT 1`,
      args: [actualEntryId],
    });

    if (result.rows.length === 0) {
      console.error(`❌ No transcript for: ${session.assetId}`);
      continue;
    }

    const row = result.rows[0];
    const content = JSON.parse(row.content as string);
    const speakerMapping = await getSpeakerMapping(row.transcript_id as string);

    markdown += `## ${session.description}\n`;
    markdown += `Video: /video/${session.assetId}\n\n`;

    content.statements.forEach(
      (
        statement: {
          paragraphs: Array<{ sentences: Array<{ text: string }> }>;
        },
        idx: number
      ) => {
        const speaker = speakerMapping?.[idx.toString()];

        if (speaker?.affiliation) {
          markdown += `**${speaker.affiliation}**`;
          if (speaker.name) markdown += ` | ${speaker.name}`;
          if (speaker.function) markdown += `, ${speaker.function}`;
          markdown += "\n";
        } else {
          markdown += "**[Speaker Unknown]**\n";
        }

        const text = statement.paragraphs
          .flatMap((p) => p.sentences.map((s) => s.text))
          .join(" ");

        markdown += `${text}\n\n`;
      }
    );

    markdown += "---\n\n";
    console.log(`✓ Processed ${session.description}`);
  }

  // Write to file
  const outputPath = join(process.cwd(), "iahwg-transcripts.md");
  writeFileSync(outputPath, markdown, "utf-8");

  console.log(`\n✓ Successfully exported all transcripts to: ${outputPath}`);
  console.log(`Total size: ${markdown.length} characters`);
}

// Run the export
exportIAHWGTranscripts().catch(console.error);
