#!/usr/bin/env tsx
import '../lib/load-env';
import { identifySpeakers, ParagraphInput } from '../lib/speaker-identification';
import { getTursoClient } from '../lib/turso';
import { extractKalturaId } from '../lib/kaltura';

const usage = `Usage:
  npm run reidentify -- <asset|entry-id>
  npm run reidentify -- all`;

const rawArg = process.argv[2];

if (!rawArg) {
  console.error(usage);
  process.exit(1);
}

type TranscriptRow = {
  transcript_id: string;
  entry_id: string;
  content: string;
};

const SINGLE_QUERY = `
  SELECT transcript_id, entry_id, content
  FROM transcripts
  WHERE entry_id = ?
    AND status = 'completed'
    AND start_time IS NULL
    AND end_time IS NULL
  ORDER BY updated_at DESC
  LIMIT 1
`;

const ALL_QUERY = `
  SELECT transcript_id, entry_id, content
  FROM transcripts
  WHERE status = 'completed'
    AND start_time IS NULL
    AND end_time IS NULL
  ORDER BY updated_at DESC
`;

const clientPromise = getTursoClient();

const decodeId = (id: string) => decodeURIComponent(id.trim());

async function resolveEntryId(input: string) {
  const decoded = decodeId(input);
  if (!decoded) throw new Error('Empty id');

  const client = await clientPromise;

  const maybeEntry = decoded.startsWith('1_') && !decoded.includes('/')
    ? decoded
    : extractKalturaId(decoded);

  if (!maybeEntry) throw new Error(`Unable to parse id: ${input}`);

  const existing = await client.execute({
    sql: 'SELECT 1 FROM transcripts WHERE entry_id = ? LIMIT 1',
    args: [maybeEntry],
  });
  if (existing.rows.length) return maybeEntry;

  const response = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '1': {
        service: 'session',
        action: 'startWidgetSession',
        widgetId: '_2503451',
      },
      '2': {
        service: 'baseEntry',
        action: 'list',
        ks: '{1:result:ks}',
        filter: { redirectFromEntryId: maybeEntry },
        responseProfile: { type: 1, fields: 'id' },
      },
      apiVersion: '3.3.0',
      format: 1,
      ks: '',
      clientTag: 'html5:v3.17.30',
      partnerId: 2503451,
    }),
  });

  if (!response.ok) throw new Error(`Kaltura lookup failed (${response.status})`);
  const data = await response.json();
  const entryId = data[1]?.objects?.[0]?.id;
  if (!entryId) throw new Error(`No entry found for ${input}`);
  return entryId;
}

function parseParagraphs(row: TranscriptRow) {
  const content = typeof row.content === 'string'
    ? JSON.parse(row.content)
    : row.content;
  return (content?.paragraphs || []) as ParagraphInput[];
}

async function loadTargets(arg: string) {
  if (arg.toLowerCase() === 'all') {
    const client = await clientPromise;
    const rows = await client.execute({ sql: 'SELECT DISTINCT entry_id FROM transcripts WHERE status = \'completed\' AND start_time IS NULL AND end_time IS NULL' });
    return rows.rows.map(row => row.entry_id as string);
  }
  return [await resolveEntryId(arg)];
}

async function loadTranscripts(entryId: string) {
  const client = await clientPromise;
  const query = entryId === '*ALL*' ? ALL_QUERY : SINGLE_QUERY;
  const args = entryId === '*ALL*' ? [] : [entryId];
  const result = await client.execute({ sql: query, args });
  return result.rows.map(row => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    content: row.content as string,
  }));
}

async function run() {
  const targets = rawArg.toLowerCase() === 'all'
    ? ['*ALL*']
    : await loadTargets(rawArg);

  const allTranscripts = (await Promise.all(targets.map(loadTranscripts))).flat();
  
  const tasks = allTranscripts
    .map(row => ({ row, paragraphs: parseParagraphs(row) }))
    .filter(({ row, paragraphs }) => {
      if (!paragraphs.length) {
        console.warn(`Skipping ${row.transcript_id}: no paragraphs`);
        return false;
      }
      return true;
    })
    .map(async ({ row, paragraphs }) => {
      await identifySpeakers(paragraphs, row.transcript_id);
      console.log(`✓ Re-identified ${row.entry_id} (${row.transcript_id})`);
    });

  await Promise.all(tasks);
  console.log(`Done. Updated ${tasks.length} transcript(s).`);
  process.exit(0);
}

run().catch(error => {
  console.error('Reidentify failed:', error);
  process.exit(1);
});

