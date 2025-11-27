import { getTursoClient } from "@/lib/turso";
import { getSpeakerMapping } from "@/lib/speakers";
import { encoding_for_model } from "tiktoken";

// IAHWG Session Asset IDs
const IAHWG_SESSIONS: Array<{ assetId: string; description: string }> = [
  {
    assetId: "k1k/k1k41vpaer",
    description: "First meeting of the working group (Sep 16)",
  },
  {
    assetId: "k1q/k1q3jsibpv",
    description: '"Mandate Creation" briefing (Oct 13)',
  },
  {
    assetId: "k1w/k1w9g0n7gs",
    description: '"Mandate Creation" consultations (Oct 23)',
  },
  {
    assetId: "k11/k11rftq8ch",
    description: '"Mandate Implementation" briefing (Oct 30)',
  },
  {
    assetId: "k1j/k1jax5ye21",
    description: '"Mandate Implementation" consultations (Nov 14) - Part 1',
  },
  {
    assetId: "k1q/k1q3djbdxu",
    description: '"Mandate Implementation" consultations (Nov 14) - Part 2',
  },
  {
    assetId: "k1q/k1q2ukeao9",
    description: '"Mandate Review" briefing (Nov 25)',
  },
];

async function loadIAHWGTranscriptsAsMarkdown(): Promise<string> {
  const client = await getTursoClient();

  let markdown = "# IAHWG Session Transcripts\n\n";
  markdown +=
    "These are complete transcripts from the 7 Informal Ad Hoc Working Group sessions.\n\n";

  for (const session of IAHWG_SESSIONS) {
    // Get the video record by asset_id
    const videoResult = await client.execute({
      sql: "SELECT asset_id, entry_id FROM videos WHERE asset_id = ?",
      args: [session.assetId],
    });

    if (videoResult.rows.length === 0) {
      console.log(`⚠️  Video not found for ${session.description}`);
      continue;
    }

    const video = videoResult.rows[0];
    const entryId = video.entry_id as string;

    // Resolve the actual Kaltura entry ID (handles redirects)
    const { resolveEntryId } = await import("@/lib/kaltura-helpers");
    const { extractKalturaId } = await import("@/lib/kaltura");

    const kalturaId = extractKalturaId(session.assetId);
    if (!kalturaId) {
      console.log(`⚠️  Could not extract Kaltura ID from ${session.assetId}`);
      continue;
    }

    let actualEntryId: string;
    try {
      const resolved = await resolveEntryId(session.assetId);
      actualEntryId = resolved || entryId;
    } catch {
      actualEntryId = entryId;
    }

    // Query transcript by the resolved entry ID
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
      console.log(
        `⚠️  No transcript found for ${session.description} (asset: ${session.assetId}, entry: ${actualEntryId})`,
      );
      continue;
    }

    const row = result.rows[0];
    const content = JSON.parse(row.content as string);
    const speakerMapping = await getSpeakerMapping(row.transcript_id as string);

    // Format session header (compact) - use asset_id as stable identifier
    markdown += `## ${session.description}\n`;
    markdown += `Video: /video/${session.assetId}\n\n`;

    // Format each statement (no timestamps)
    content.statements.forEach((statement: unknown, idx: number) => {
      const speaker = speakerMapping?.[idx.toString()];

      // Speaker header (compact format)
      if (speaker?.affiliation) {
        markdown += `**${speaker.affiliation}**`;
        if (speaker.name) markdown += ` | ${speaker.name}`;
        if (speaker.function) markdown += `, ${speaker.function}`;
        markdown += `\n`;
      } else {
        markdown += `**[Speaker Unknown]**\n`;
      }

      // Statement text (flatten paragraphs/sentences)
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

async function main() {
  console.log("🔍 Loading IAHWG transcripts...\n");

  const transcripts = await loadIAHWGTranscriptsAsMarkdown();

  console.log("📊 Statistics:\n");
  console.log(`  Character count: ${transcripts.length.toLocaleString()}`);
  console.log(
    `  Line count: ${transcripts.split("\n").length.toLocaleString()}`,
  );
  console.log(
    `  Word count (approx): ${transcripts.split(/\s+/).length.toLocaleString()}`,
  );

  // Accurate token count using tiktoken (GPT-4/Claude compatible)
  console.log("\n⏳ Counting tokens with tiktoken...");
  const encoding = encoding_for_model("gpt-4");
  const tokens = encoding.encode(transcripts);
  const tokenCount = tokens.length;
  encoding.free(); // Clean up

  console.log(`  Actual token count: ${tokenCount.toLocaleString()}`);

  // Calculate costs (Claude Sonnet 4.5 pricing)
  const inputCostPer1M = 3.0; // $3 per million input tokens (≤200K prompts)
  const outputCostPer1M = 15.0; // $15 per million output tokens (≤200K prompts)
  const cachingWriteCostPer1M = 3.75; // $3.75 per million tokens (write)
  const cachingReadCostPer1M = 0.3; // $0.30 per million tokens (read)

  const inputCostPerRequest = (tokenCount * inputCostPer1M) / 1_000_000;
  const estimatedOutputTokens = 1000; // Assume ~1K tokens output per response
  const outputCostPerRequest =
    (estimatedOutputTokens * outputCostPer1M) / 1_000_000;
  const totalCostPerRequest = inputCostPerRequest + outputCostPerRequest;

  // With prompt caching (90% cache hit rate assumed)
  const cachedInputCost = (tokenCount * cachingReadCostPer1M) / 1_000_000;
  const cachedTotalCost = cachedInputCost + outputCostPerRequest;

  console.log(`\n💰 Cost estimates (Claude Sonnet 4.5):`);
  console.log(`  Per request (no cache): $${totalCostPerRequest.toFixed(4)}`);
  console.log(
    `    - Input (~${tokenCount.toLocaleString()} tokens): $${inputCostPerRequest.toFixed(4)}`,
  );
  console.log(
    `    - Output (~${estimatedOutputTokens.toLocaleString()} tokens): $${outputCostPerRequest.toFixed(4)}`,
  );
  console.log(
    `  Per request (with prompt caching): $${cachedTotalCost.toFixed(4)}`,
  );
  console.log(
    `    - Cache read: $${cachedInputCost.toFixed(4)} (90% savings!)`,
  );
  console.log(`    - Output: $${outputCostPerRequest.toFixed(4)}`);
  console.log(
    `  Per 100 requests (no cache): $${(totalCostPerRequest * 100).toFixed(2)}`,
  );
  console.log(
    `  Per 100 requests (cached): $${(cachedTotalCost * 100).toFixed(2)}`,
  );

  console.log(`\n📝 Context window usage:`);
  console.log(`  Claude 3.5 Sonnet: 200,000 tokens`);
  console.log(
    `  Used by transcripts: ${tokenCount.toLocaleString()} tokens (${((tokenCount / 200000) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Remaining for conversation: ${(200000 - tokenCount).toLocaleString()} tokens`,
  );

  console.log("\n✅ Token measurement complete!");
}

main().catch(console.error);
