import { getTursoClient } from "@/lib/turso";

const IAHWG_DATES = [
  "2025-09-16",
  "2025-10-13",
  "2025-10-23",
  "2025-10-30",
  "2025-11-14",
  "2025-11-25",
  "2025-12-03",
];

async function checkTranscripts() {
  const client = await getTursoClient();

  console.log("🔍 Checking IAHWG transcript status...\n");

  for (const date of IAHWG_DATES) {
    const result = await client.execute({
      sql: `
        SELECT 
          v.date,
          v.clean_title,
          v.asset_id,
          v.entry_id,
          t.transcript_id,
          t.status
        FROM videos v
        LEFT JOIN transcripts t ON v.entry_id = t.entry_id 
          AND t.start_time IS NULL
        WHERE v.date = ?
        LIMIT 1
      `,
      args: [date],
    });

    if (result.rows.length === 0) {
      console.log(`❌ ${date}: No video found in database`);
    } else {
      const row = result.rows[0];
      const status = row.status || "not transcribed";
      const emoji =
        status === "completed" ? "✅" : status === "processing" ? "⏳" : "❌";
      console.log(
        `${emoji} ${date}: ${row.clean_title} (${status}) [${row.asset_id}]`,
      );
    }
  }

  console.log("\n📊 Summary:");
  const completedResult = await client.execute({
    sql: `
      SELECT COUNT(*) as count
      FROM videos v
      JOIN transcripts t ON v.entry_id = t.entry_id
      WHERE v.date IN (?, ?, ?, ?, ?, ?, ?)
        AND t.status = 'completed'
        AND t.start_time IS NULL
    `,
    args: IAHWG_DATES,
  });

  const completed = completedResult.rows[0].count as number;
  console.log(`  ${completed}/7 sessions have completed transcripts`);
}

checkTranscripts().catch(console.error);
