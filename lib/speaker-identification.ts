import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { setSpeakerMapping, SpeakerInfo } from './speakers';
import { saveTranscript, getTursoClient } from './turso';
import { writeFileSync } from 'fs';
import { join } from 'path';
import './load-env';

const ParagraphSpeakerMapping = z.object({
  paragraphs: z.array(z.object({
    index: z.number(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
    has_multiple_speakers: z.boolean(),
  })),
});

const ResegmentationResult = z.object({
  should_split: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  segments: z.array(z.object({
    text: z.string(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
  })),
});

const API_VERSION = '2025-01-01-preview';

const IDENTIFICATION_RULES = `IDENTIFICATION RULES:
- Look for "Thank you [name]" to identify when a new speaker starts (thanking the previous one)
- Use AssemblyAI labels as HINTS for speaker changes (label change often = new speaker), but verify with text
- AssemblyAI may incorrectly group different speakers under same label, or split one speaker across labels
- Extract both personal names AND official functions when available
- For country representatives, provide ISO 3166-1 alpha-3 country codes (e.g., PRY, USA, CHN)
- For UN bodies/agencies, use standard abbreviations (e.g., ACABQ, UNICEF, UNDP, OHCHR, 5th Committee)
- If a representative is speaking on behalf of a group (e.g., G77 + China, EU), capture that group code
- If identity cannot be determined, return all null values
- Only use information literally in the text (no world knowledge)
- Fix transcription errors: "UN80 Initiative" (not "UNAT", "UNA", "UNAT Initiative", etc.)
- The co-chairs of the UN80 / MIR IAHWG are called "Carolyn Schwalger" and "Brian Wallace", their affiliation is "IAHWG", and their function is "Co-Chair"`;

const COMMON_ABBREVIATIONS = `COMMON ABBREVIATIONS
- Informal Ad hoc Working Group (on UN80 initiative / mandate implementation review / ...) -> IAHWG (just "IAHWG", NOT "IAHWG on ...")
- common member state groups (use only the short form in your response, not the part in brackets):
  - G77 + China (Group of 77 + China)
  - NAM (Non-Aligned Movement)
  - WEOG (Western European and Others Group)
  - GRULAC (Latin American and Caribbean Group)
  - Africa Group
  - Asia-Pacific Group
  - EEG (Eastern European Group)
  - LDCs (Least Developed Countries)
  - SIDS (Small Island Developing States)
  - LLDCs (Landlocked Developing Countries)
  - AOSIS (Alliance of Small Island States)
  - Arab Group
  - OIC (Organisation of Islamic Cooperation)
  - ACP (African, Caribbean and Pacific States)
  - EU (European Union)
  - JUSCANZ
  - CANZ
  - Nordic Group
  - LMG (Like-Minded Group)
  - LGBTI Core Group
  - Friends of R2P
  - Friends of the SDGs
  - Friends of Mediation
  - Friends of UNAOC (UN Alliance of Civilizations)
  - G24 (Intergovernmental Group of 24)
  - BRICS
  - G20
  - OECD-DAC
  - Umbrella Group
  - BASIC (Brazil, South Africa, India, China)
  - LMDC (Like-Minded Developing Countries)
  - EIG (Environmental Integrity Group)`;

const SCHEMA_DEFINITIONS = `SCHEMA DEFINITIONS:

name: Person name as best as can be identified from the text. Do NOT use world knowledge. Only use what is literally stated. Fix transcription errors. May be given name, surname, or full name. Add "Mr."/"Ms." only if surname-only AND gender explicitly known. E.g., "Yacine Hamzaoui", "Mr. Hamasu", "Dave". Use null if unknown.

function: Function/title. Be concise, use canonical abbreviations. E.g. "SG", "PGA", "Chair", "Representative", "Vice-Chair", "Officer", "Spokesperson", "USG Policy". Use null if unknown.

affiliation: For country representatives, use ISO 3166-1 alpha-3 country codes of their country, e.g. "PRY", "KEN". For organizations use the canonical abbreviation of the organization, e.g. "OECD", "OHCHR", "UN Secretariat", "GA", "5th Committee", "UN80 Initiative". Use null if unknown/not applicable.

group: If applicable, group of countries that a country representative is speaking on behalf of. Use the canonical abbreviation, e.g. "G77 + China", "EU", "AU". Use null if not applicable.`;

export interface ParagraphWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface ParagraphInput {
  text: string;
  start: number;
  end: number;
  words: ParagraphWord[];
}

export type SpeakerMapping = Record<string, SpeakerInfo>;

function createOpenAIClient() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: API_VERSION,
  });
}

function normalizeText(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

async function resegmentParagraph(
  client: AzureOpenAI,
  paragraph: ParagraphInput,
  contextParas: Array<{ para: ParagraphInput, speaker: SpeakerInfo, position: 'before' | 'current' | 'after' }>,
  paragraphIndex?: number,
): Promise<{ segments: ParagraphInput[], speakers: SpeakerInfo[] }> {
  const formatPara = (p: ParagraphInput, s: SpeakerInfo, label: string) => {
    const text = p.words.map(w => w.text).join(' ');
    const speakerStr = s?.name || 'Unknown';
    const preview = text.length > 150 ? text.substring(0, 150) + '...' : text;
    return `${label}:\nSpeaker: ${speakerStr}\nText: ${preview}`;
  };

  const beforeParas = contextParas.filter(c => c.position === 'before');
  const currentPara = contextParas.find(c => c.position === 'current')!;
  const afterParas = contextParas.filter(c => c.position === 'after');
  const currentSpeaker = currentPara.speaker;

  const contextParts = [
    ...beforeParas.reverse().map((c, i) => formatPara(c.para, c.speaker, `BEFORE-${beforeParas.length - i}`)),
    `CURRENT (TO SPLIT):\nSpeaker: ${currentSpeaker.name || 'Unknown'}\nText: ${paragraph.text}`,
    ...afterParas.map((c, i) => formatPara(c.para, c.speaker, `AFTER+${i + 1}`)),
  ];

  const context = contextParts.join('\n\n');

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You are an expert at correcting speaker segmentation errors in UN proceedings transcripts.

BACKGROUND:
This transcript was created by automatic speech recognition (AssemblyAI), which divided the audio into paragraphs. However, the automatic paragraph boundaries are sometimes incorrect - a paragraph may contain the end of one speaker's remarks followed by the beginning of another speaker's remarks, all incorrectly grouped together.

In an initial identification pass, we detected that the CURRENT paragraph likely contains speech from multiple different speakers mixed together (e.g., the last few sentences of one speaker followed by the first sentences of the next speaker).

YOUR TASK:
Split the CURRENT paragraph at the actual speaker change boundaries. For each resulting segment, identify who is speaking.

The paragraph may contain:
- 2 speakers (most common: end of speaker A + beginning of speaker B)
- 3 or more speakers (e.g., Chair closes, introduces next speaker, who begins - all in one paragraph)
- Multiple brief interjections or procedural exchanges

You are provided with:
- BEFORE-N paragraphs: Several paragraphs before the current one (for broader context about conversation flow)
- CURRENT paragraph: The paragraph that needs evaluation and potential splitting
- AFTER+N paragraphs: Several paragraphs after the current one (for context about who speaks next)

Use this extended context to better understand the conversation flow and speaker transitions.

CRITICAL REQUIREMENTS:

1. FIRST, determine if this paragraph ACTUALLY needs splitting:
   - Set should_split = true ONLY if you find genuine speaker transitions
   - Set should_split = false if the entire paragraph is one continuous speaker
   - Be CAUTIOUS about false positives

2. Common FALSE POSITIVES to avoid:
   - "Thank [word]" expressions: "Thank God", "Thank goodness", "Thank heavens" are NOT speaker transitions
   - Only "Thank you" followed by period/comma at natural boundaries indicates transitions
   - Generic acknowledgments within a speech are not transitions
   - Rhetorical questions or quotes are not transitions

3. TRUE POSITIVES - genuine speaker changes:
   - Speaker A closes → "Thank you." → Chair takes over: "I thank the representative..."
   - Chair gives floor → New speaker begins: "...to Country X." → "Thank you, Madam President..."
   - Q&A exchanges with clear back-and-forth between different people
   - Multiple speakers in rapid succession (rare but happens in informal settings)

4. If should_split = true, then split at EACH speaker change boundary:
   - Return as many segments as there are different speakers
   - Each segment contains only one speaker's exact words
   - Copy EXACT text verbatim from the paragraph
   - Identify the speaker of each segment

5. Text integrity:
   - When concatenated, segments' text MUST reproduce the original exactly
   - Do NOT add, remove, rephrase, or modify any words
   - Include all punctuation and spacing exactly as it appears

6. Set confidence and reason:
   - confidence: "high" if very clear transitions, "medium" if somewhat ambiguous, "low" if uncertain
   - reason: Brief explanation of why you're splitting or not splitting

${IDENTIFICATION_RULES}

${COMMON_ABBREVIATIONS}

${SCHEMA_DEFINITIONS}

should_split: Boolean indicating whether this paragraph truly contains multiple speakers and should be split. Set to false if it's actually one continuous speaker (even if flagged for review).

confidence: Your confidence level in the splitting decision:
- "high": Very clear speaker transitions with obvious boundaries
- "medium": Likely transitions but some ambiguity
- "low": Uncertain, possibly a false positive from detection

reason: Brief explanation (1-2 sentences) of why you're splitting or not splitting. For example: "Clear transition from speaker closing to chair giving floor to next speaker" or "Only one speaker throughout, 'Thank God' is not a transition".

text: EXACT text of the segment, copied character-by-character from the paragraph. Every word, comma, period, space must be preserved exactly. Do NOT include any speaker labels, prefixes like "(Speaker: ...)", or other metadata - ONLY the actual spoken words from the paragraph.
`,
      },
      {
        role: 'user',
        content: `Analyze the CURRENT paragraph in context and determine if it should be split:

${context}

The BEFORE and AFTER paragraphs provide context about the conversation flow. Use them to understand:
- Who was speaking before
- Who speaks after
- Whether the CURRENT paragraph likely contains a transition between these speakers

If you determine the CURRENT paragraph should be split, copy the exact text from the "Text:" line of the CURRENT paragraph (not from BEFORE/AFTER paragraphs) and split it at speaker boundaries, returning each segment with its speaker identification.`,
      },
    ],
    response_format: zodResponseFormat(ResegmentationResult, 'resegmentation'),
  });

  const result = completion.choices[0]?.message?.content;
  const finishReason = completion.choices[0]?.finish_reason;
  
  if (!result) {
    if (finishReason === 'content_filter') {
      const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
      console.warn(`  ⚠ Content filter triggered for paragraph${indexStr}, keeping original unsplit`);
      return {
        segments: [paragraph],
        speakers: [currentSpeaker],
      };
    }
    console.error('Resegmentation API response:', JSON.stringify(completion, null, 2));
    throw new Error(`Failed to resegment paragraph: no content in response. Finish reason: ${finishReason}`);
  }

  let parsed: z.infer<typeof ResegmentationResult>;
  try {
    parsed = JSON.parse(result);
  } catch (e) {
    console.error('Failed to parse resegmentation result:', result);
    throw new Error(`Failed to parse resegmentation JSON: ${e instanceof Error ? e.message : e}`);
  }

  // Check if splitting is recommended
  if (!parsed.should_split) {
    const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
    console.log(`  → Para${indexStr} kept unsplit (${parsed.confidence} confidence): ${parsed.reason}`);
    return {
      segments: [paragraph],
      speakers: [currentSpeaker],
    };
  }

  // For low confidence splits, keep original
  if (parsed.confidence === 'low') {
    const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
    console.warn(`  ⚠ Low confidence split for para${indexStr}, keeping original: ${parsed.reason}`);
    return {
      segments: [paragraph],
      speakers: [currentSpeaker],
    };
  }

  const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
  console.log(`  ✓ Para${indexStr} split into ${parsed.segments.length} (${parsed.confidence} confidence): ${parsed.reason}`);

  // Verify content integrity
  const originalNormalized = normalizeText(paragraph.text);
  const segmentsNormalized = normalizeText(parsed.segments.map(s => s.text).join(' '));
  
  if (originalNormalized !== segmentsNormalized) {
    console.warn(`  ⚠ Content mismatch after resegmentation!`);
    console.warn(`    Original: "${paragraph.text.substring(0, 100)}..."`);
    console.warn(`    Segments: "${parsed.segments.map(s => s.text).join(' ').substring(0, 100)}..."`);
  }

  // Match segment texts to words
  const segments: ParagraphInput[] = [];
  const speakers: SpeakerInfo[] = [];
  let wordOffset = 0;

  for (const seg of parsed.segments) {
    const segNormalized = normalizeText(seg.text);
    const words: typeof paragraph.words = [];
    let matchedNormalized = '';

    while (wordOffset < paragraph.words.length && matchedNormalized.length < segNormalized.length) {
      words.push(paragraph.words[wordOffset]);
      matchedNormalized = normalizeText(words.map(w => w.text).join(' '));
      wordOffset++;
    }

    if (words.length > 0) {
      segments.push({
        text: words.map(w => w.text).join(' '),
        start: words[0].start,
        end: words[words.length - 1].end,
        words,
      });
      speakers.push({
        name: seg.name,
        function: seg.function,
        affiliation: seg.affiliation,
        group: seg.group,
      });
    }
  }

  return { segments, speakers };
}

export async function identifySpeakers(
  paragraphs: ParagraphInput[],
  transcriptId?: string,
  entryId?: string,
) {
  if (!paragraphs?.length) {
    throw new Error('No paragraphs provided');
  }

  console.log(`  → Analyzing ${paragraphs.length} paragraphs...`);

  const transcriptParts = paragraphs.map((para, index) => {
    const text = para.words.map(word => word.text).join(' ');
    const assemblySpeaker = para.words?.[0]?.speaker || 'Unknown';
    return `[${index}] (AssemblyAI: Speaker ${assemblySpeaker}) ${text}`;
  });

  const client = createOpenAIClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You are an expert at identifying speakers in UN proceedings. For each paragraph in the transcript, extract the speaker's name, function/title, affiliation, and country-group information strictly from the context.

CRITICAL: Identify WHO IS ACTUALLY SPEAKING each paragraph, NOT who is being introduced or mentioned.

TASK:
- Each paragraph is numbered [0], [1], [2], etc.
- Each paragraph has an AssemblyAI speaker label (A, B, C, etc.) - these are HINTS from automatic diarization
- WARNING: AssemblyAI labels may be incorrect or inconsistent - use them as hints, not facts
- For each paragraph, identify the ACTUAL SPEAKER (person saying those words) based on the text content
- IMPORTANT: If a paragraph contains "I invite X" or "X has the floor", the speaker is the person doing the inviting/giving the floor (usually the Chair), NOT X
- X will speak in SUBSEQUENT paragraphs
- When a speaker continues across multiple paragraphs, repeat their information
- Process EVERY paragraph from [0] to [last]. Never stop early.

MIXED SPEAKER DETECTION:
- Set has_multiple_speakers to true if a paragraph LIKELY contains speech from multiple people
- Automatic transcription often groups speaker transitions incorrectly
- Flag TRUE if these patterns are present:
  
  PRIMARY INDICATORS (high probability of mixed speakers):
  - "Thank you." followed by "I thank [name/title]" (previous speaker closes → chair responds)
  - "I give/now give the floor to..." followed by substantial text (chair hands off → next speaker begins)
  - "I call upon/invite..." followed by that person speaking (introduction → speech starts)
  - Clear Q&A pattern: question text → answer text in same paragraph
  - Speaker closes their remarks then different speaker starts (evident from context change)
  
  SECONDARY INDICATORS (moderate probability):
  - Paragraph ends with speaker closing PLUS contains procedural language at start
  - Very long paragraph (>500 words) with clear topic/style shift midway
  - AssemblyAI speaker label changes within words of paragraph
  - Paragraph contains both first-person speech and third-person procedural description
  
  DO NOT FLAG based on:
  - Single instances of "Thank" (e.g., "Thank God", "Thank goodness") - these are NOT transitions
  - Pure procedural paragraphs from chair with no other speaker mixed in
  - Long speeches with rhetorical questions or quoted speech
  - Paragraphs where speaker refers to themselves in third person
  
- When genuinely uncertain, flag it - false positives are acceptable, we'll verify
- Only set to false when confident the entire paragraph is one continuous speaker

${IDENTIFICATION_RULES}

${COMMON_ABBREVIATIONS}

${SCHEMA_DEFINITIONS}

has_multiple_speakers: Boolean indicating if this paragraph contains speech from multiple speakers. Set to true only when paragraph clearly mixes different speakers' words.
`,
      },
      {
        role: 'user',
        content: `Analyze the following UN transcript and identify the speaker for each numbered paragraph.

Transcript:
${transcriptParts.join('\n\n')}`,
      },
    ],
    response_format: zodResponseFormat(ParagraphSpeakerMapping, 'paragraph_speaker_mapping'),
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) throw new Error('Failed to parse speaker mappings');

  const parsed = JSON.parse(result) as z.infer<typeof ParagraphSpeakerMapping>;
  console.log(`  ✓ Initial identification complete`);

  // Collect paragraphs needing resegmentation
  const toResegment = parsed.paragraphs
    .filter(p => p.has_multiple_speakers)
    .map(p => p.index);

  let finalParagraphs = [...paragraphs];
  let finalMapping: SpeakerMapping = {};

  // Build initial mapping
  parsed.paragraphs.forEach(para => {
    finalMapping[para.index.toString()] = {
      name: para.name,
      function: para.function,
      affiliation: para.affiliation,
      group: para.group,
    };
  });

  // Resegment in parallel
  if (toResegment.length > 0) {
    console.log(`  → Found ${toResegment.length} paragraph(s) with mixed speakers: [${toResegment.join(', ')}]`);
    
    // Write before-resegmentation file
    if (transcriptId) {
      const beforeFile = join(process.cwd(), `${transcriptId}_before.json`);
      writeFileSync(beforeFile, JSON.stringify({
        paragraphs: paragraphs.map((p, i) => ({
          index: i,
          text: p.text,
          speaker: finalMapping[i.toString()],
          flagged: toResegment.includes(i),
        })),
      }, null, 2));
      console.log(`  → Wrote before file: ${beforeFile}`);
    }
    
    const CONTEXT_SIZE = 3; // Number of paragraphs before and after
    
    const resegmentTasks = toResegment.map(async (idx) => {
      const para = paragraphs[idx];
      const speaker = finalMapping[idx.toString()];
      
      // Gather context paragraphs
      const contextParas: Array<{ para: ParagraphInput, speaker: SpeakerInfo, position: 'before' | 'current' | 'after' }> = [];
      
      // Add before context
      for (let i = Math.max(0, idx - CONTEXT_SIZE); i < idx; i++) {
        contextParas.push({
          para: paragraphs[i],
          speaker: finalMapping[i.toString()],
          position: 'before',
        });
      }
      
      // Add current
      contextParas.push({
        para: para,
        speaker: speaker,
        position: 'current',
      });
      
      // Add after context
      for (let i = idx + 1; i <= Math.min(paragraphs.length - 1, idx + CONTEXT_SIZE); i++) {
        contextParas.push({
          para: paragraphs[i],
          speaker: finalMapping[i.toString()],
          position: 'after',
        });
      }

      return await resegmentParagraph(
        client,
        para,
        contextParas,
        idx,
      ).then(result => ({ index: idx, ...result }));
    });

    const resegmented = await Promise.all(resegmentTasks);
    console.log(`  ✓ Resegmentation and speaker identification complete`);
    console.log(`  → Rebuilding transcript with split paragraphs...`);

    // Rebuild paragraphs array and mapping
    const newParagraphs: ParagraphInput[] = [];
    const newMapping: SpeakerMapping = {};
    let currentNewIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const reseg = resegmented.find(r => r.index === i);
      
      if (reseg) {
        // Replace with segments
        for (let j = 0; j < reseg.segments.length; j++) {
          newParagraphs.push(reseg.segments[j]);
          newMapping[currentNewIndex.toString()] = reseg.speakers[j];
          currentNewIndex++;
        }
      } else {
        // Keep original
        newParagraphs.push(paragraphs[i]);
        newMapping[currentNewIndex.toString()] = finalMapping[i.toString()];
        currentNewIndex++;
      }
    }

    finalParagraphs = newParagraphs;
    finalMapping = newMapping;
    console.log(`  ✓ Rebuilt transcript: ${paragraphs.length} → ${finalParagraphs.length} paragraphs`);
    
    // Write after-resegmentation file
    if (transcriptId) {
      const afterFile = join(process.cwd(), `${transcriptId}_after.json`);
      writeFileSync(afterFile, JSON.stringify({
        paragraphs: finalParagraphs.map((p, i) => ({
          index: i,
          text: p.text,
          speaker: finalMapping[i.toString()],
        })),
      }, null, 2));
      console.log(`  → Wrote after file: ${afterFile}`);
    }
  }

  // Save to database
  if (transcriptId && entryId) {
    console.log(`  → Saving to database...`);
    const dbClient = await getTursoClient();
    const existing = await dbClient.execute({
      sql: 'SELECT start_time, end_time, audio_url, language_code FROM transcripts WHERE transcript_id = ?',
      args: [transcriptId],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      await saveTranscript(
        entryId,
        transcriptId,
        row.start_time as number | null,
        row.end_time as number | null,
        row.audio_url as string,
        'completed',
        row.language_code as string | null,
        { paragraphs: finalParagraphs }
      );
    }

    await setSpeakerMapping(transcriptId, finalMapping);
    console.log(`  ✓ Saved transcript and speaker mappings`);
  }

  return finalMapping;
}

