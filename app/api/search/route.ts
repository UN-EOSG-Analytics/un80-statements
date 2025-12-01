import { NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { z } from "zod";
import { LRUCache } from "lru-cache";
import { getRagClient } from "@/lib/turso-rag";
import "@/lib/load-env";

export const runtime = "nodejs";

const EMBEDDING_MODEL = "text-embedding-3-large";

// Cache for query embeddings: stores query text -> embedding vector
// Max 1000 queries, ~500MB memory limit
const embeddingCache = new LRUCache<string, Float32Array>({
  max: 1000,
  maxSize: 500_000_000,
  sizeCalculation: (value) => value.byteLength,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

const topKSchema = z
  .preprocess((value) => {
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return value;
  }, z.number().int().min(1).max(200))
  .optional();

const searchSchema = z.object({
  query: z.string().min(2, "Query must be at least 2 characters"),
  topK: topKSchema,
  filters: z
    .object({
      assetId: z.string().trim().optional(),
      sessionDate: z.string().trim().optional(),
      sessionTitle: z.string().trim().optional(),
      speakerAffiliationName: z.string().trim().optional(),
      speakerName: z.string().trim().optional(),
      speakerGroup: z.string().trim().optional(),
    })
    .partial()
    .optional(),
});

type SentenceRow = {
  id: number;
  asset_id: string;
  session_num: string | null;
  session_title: string;
  session_date: string;
  statement_idx: number;
  speaker_affiliation_code: string | null;
  speaker_affiliation_name: string | null;
  speaker_name: string | null;
  speaker_function: string | null;
  speaker_group: string | null;
  paragraph_idx: number;
  sentence_idx: number;
  text: string;
  context_text: string;
  embedding: Uint8Array;
};

function ensureEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
}

function normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i];
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares) || 1;
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    normalized[i] = vector[i] / magnitude;
  }
  return normalized;
}

function blobToFloat32(blob: Uint8Array): Float32Array {
  return new Float32Array(
    blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
  );
}

function coerceEmbedding(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
  throw new Error("Unexpected embedding value type received from Turso");
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = searchSchema.parse(rawBody);
    const topK = parsed.topK ?? 20;

    const client = await getRagClient();

    const whereClauses: string[] = [];
    const args: Array<string> = [];

    const filters = parsed.filters ?? {};
    if (filters.assetId) {
      whereClauses.push("asset_id = ?");
      args.push(filters.assetId);
    }
    if (filters.sessionDate) {
      whereClauses.push("session_date = ?");
      args.push(filters.sessionDate);
    }
    if (filters.sessionTitle) {
      whereClauses.push("session_title LIKE ?");
      args.push(`%${filters.sessionTitle}%`);
    }
    if (filters.speakerAffiliationName) {
      whereClauses.push("speaker_affiliation_name LIKE ?");
      args.push(`%${filters.speakerAffiliationName}%`);
    }
    if (filters.speakerName) {
      whereClauses.push("speaker_name LIKE ?");
      args.push(`%${filters.speakerName}%`);
    }
    if (filters.speakerGroup) {
      whereClauses.push("speaker_group LIKE ?");
      args.push(`%${filters.speakerGroup}%`);
    }

    const whereSegment = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const result = await client.execute({
      sql: `
        SELECT
          id,
          asset_id,
          session_num,
          session_title,
          session_date,
          statement_idx,
          speaker_affiliation_code,
          speaker_affiliation_name,
          speaker_name,
          speaker_function,
          speaker_group,
          paragraph_idx,
          sentence_idx,
          text,
          context_text,
          embedding
        FROM sentences
        ${whereSegment}
      `,
      args,
    });

    if (result.rows.length === 0) {
      return NextResponse.json({
        data: [],
        meta: {
          totalCandidates: 0,
          topK,
        },
      });
    }

    const sentences: SentenceRow[] = result.rows.map((row) => ({
      id: Number(row.id),
      asset_id: row.asset_id as string,
      session_num: row.session_num as string | null,
      session_title: row.session_title as string,
      session_date: row.session_date as string,
      statement_idx: Number(row.statement_idx),
      speaker_affiliation_code: row.speaker_affiliation_code as string | null,
      speaker_affiliation_name: row.speaker_affiliation_name as string | null,
      speaker_name: row.speaker_name as string | null,
      speaker_function: row.speaker_function as string | null,
      speaker_group: row.speaker_group as string | null,
      paragraph_idx: Number(row.paragraph_idx),
      sentence_idx: Number(row.sentence_idx),
      text: row.text as string,
      context_text: row.context_text as string,
      embedding: coerceEmbedding(row.embedding),
    }));

    // Check cache for query embedding
    const cacheKey = `${EMBEDDING_MODEL}:${parsed.query}`;
    let queryVector: Float32Array;
    
    const cachedEmbedding = embeddingCache.get(cacheKey);
    if (cachedEmbedding) {
      queryVector = cachedEmbedding;
    } else {
      // Cache miss - fetch from Azure OpenAI
      const apiKey = ensureEnv("AZURE_OPENAI_API_KEY");
      const endpoint = ensureEnv("AZURE_OPENAI_ENDPOINT");
      const apiVersion =
        process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview";

      const azureClient = new AzureOpenAI({
        apiKey,
        endpoint,
        apiVersion,
      });

      const embeddingResponse = await azureClient.embeddings.create({
        model: EMBEDDING_MODEL,
        input: parsed.query,
      });

      queryVector = new Float32Array(embeddingResponse.data[0].embedding);
      
      // Store in cache for future requests
      embeddingCache.set(cacheKey, queryVector);
    }

    const normalizedQuery = normalize(queryVector);

    const scored = sentences.map((sentence) => {
      const normalizedEmbedding = normalize(blobToFloat32(sentence.embedding));
      const score = dotProduct(normalizedEmbedding, normalizedQuery);
      return {
        id: sentence.id,
        score,
        text: sentence.text,
        contextText: sentence.context_text,
        assetId: sentence.asset_id,
        sessionNum: sentence.session_num,
        sessionTitle: sentence.session_title,
        sessionDate: sentence.session_date,
        statementIdx: sentence.statement_idx,
        speakerAffiliationCode: sentence.speaker_affiliation_code,
        speakerAffiliationName: sentence.speaker_affiliation_name,
        speakerName: sentence.speaker_name,
        speakerFunction: sentence.speaker_function,
        speakerGroup: sentence.speaker_group,
        paragraphIdx: sentence.paragraph_idx,
        sentenceIdx: sentence.sentence_idx,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      data: scored.slice(0, Math.min(topK, scored.length)),
      meta: {
        totalCandidates: scored.length,
        topK,
      },
    });
  } catch (error) {
    console.error("/api/search error", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
