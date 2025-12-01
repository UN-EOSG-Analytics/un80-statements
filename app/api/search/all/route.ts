import { NextResponse } from "next/server";
import { getRagClient } from "@/lib/turso-rag";
import "@/lib/load-env";

export const runtime = "nodejs";

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
};

export async function GET() {
  try {
    const client = await getRagClient();

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
          context_text
        FROM sentences
        ORDER BY session_date DESC, statement_idx ASC, paragraph_idx ASC, sentence_idx ASC
      `,
      args: [],
    });

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
    }));

    const data = sentences.map((sentence) => ({
      id: sentence.id,
      score: 1,
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
    }));

    return NextResponse.json({
      data,
      meta: {
        total: data.length,
      },
    });
  } catch (error) {
    console.error("/api/search/all error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
