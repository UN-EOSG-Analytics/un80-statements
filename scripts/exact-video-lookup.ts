import { getTursoClient } from "@/lib/turso";
import { extractKalturaId } from "@/lib/kaltura";

async function finalCheck() {
  // Exact same flow as the video page
  const urlParam = "k1q%2Fk1q2ukeao9";
  const decodedId = decodeURIComponent(urlParam);

  console.log(`URL parameter: ${urlParam}`);
  console.log(`Decoded ID: ${decodedId}`);
  console.log();

  // Look up video by asset_id
  const client = await getTursoClient();
  const videoResult = await client.execute({
    sql: "SELECT * FROM videos WHERE asset_id = ?",
    args: [decodedId],
  });

  if (videoResult.rows.length === 0) {
    console.log("❌ Video not found!");
    return;
  }

  const video = videoResult.rows[0];
  console.log(`✅ Video found:`);
  console.log(`  Asset ID: ${video.asset_id}`);
  console.log(`  Entry ID: ${video.entry_id}`);
  console.log(`  Title: ${video.clean_title}`);
  console.log();

  // Extract Kaltura ID (same way video page does)
  const kalturaId = extractKalturaId(video.asset_id as string);
  console.log(`Kaltura ID extracted: ${kalturaId}`);
  console.log();

  // Check for transcripts with that entry_id
  const transcriptResult = await client.execute({
    sql: `
      SELECT transcript_id, status, start_time, LENGTH(content) as content_length
      FROM transcripts
      WHERE entry_id = ?
    `,
    args: [video.entry_id],
  });

  console.log(`Transcripts for entry_id "${video.entry_id}":`);
  if (transcriptResult.rows.length === 0) {
    console.log("  ❌ None found");
  } else {
    transcriptResult.rows.forEach((t) => {
      console.log(
        `  - ${t.transcript_id} | ${t.status} | ${t.start_time === null ? "full" : "segment"} | ${t.content_length} chars`,
      );
    });
  }
}

finalCheck().catch(console.error);
