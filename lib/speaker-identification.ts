import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { setSpeakerMapping, SpeakerInfo } from './speakers';
import './load-env';

const ParagraphSpeakerMapping = z.object({
  paragraphs: z.array(z.object({
    index: z.number(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
  })),
});

const API_VERSION = '2025-01-01-preview';

export interface ParagraphWord {
  text: string;
  speaker?: string;
}

export interface ParagraphInput {
  words: ParagraphWord[];
}

export type SpeakerMapping = Record<string, SpeakerInfo>;

export async function identifySpeakers(
  paragraphs: ParagraphInput[],
  transcriptId?: string,
) {
  if (!paragraphs?.length) {
    throw new Error('No paragraphs provided');
  }

  const transcriptParts = paragraphs.map((para, index) => {
    const text = para.words.map(word => word.text).join(' ');
    const assemblySpeaker = para.words?.[0]?.speaker || 'Unknown';
    return `[${index}] (AssemblyAI: Speaker ${assemblySpeaker}) ${text}`;
  });

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: API_VERSION,
  });

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

IDENTIFICATION RULES:
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
- The co-chairs of the UN80 / MIR IAHWG are called "Carolyn Schwalger" and "Brian Wallace", their affiliation is "IAHWG", and their function is "Co-Chair"

COMMON ABBREVIATIONS
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
  - EIG (Environmental Integrity Group)

SCHEMA DEFINITIONS:

name: Person name as best as can be identified from the text. Do NOT use world knowledge. Only use what is literally stated. Fix transcription errors. May be given name, surname, or full name. Add "Mr."/"Ms." only if surname-only AND gender explicitly known. E.g., "Yacine Hamzaoui", "Mr. Hamasu", "Dave". Use null if unknown.

function: Function/title. Be concise, use canonical abbreviations. E.g. "SG", "PGA", "Chair", "Representative", "Vice-Chair", "Officer", "Spokesperson", "USG Policy". Use null if unknown.

affiliation: For country representatives, use ISO 3166-1 alpha-3 country codes of their country, e.g. "PRY", "KEN". For organizations use the canonical abbreviation of the organization, e.g. "OECD", "OHCHR", "UN Secretariat", "GA", "5th Committee", "UN80 Initiative". Use null if unknown/not applicable.

group: If applicable, group of countries that a country representative is speaking on behalf of. Use the canonical abbreviation, e.g. "G77 + China", "EU", "AU". Use null if not applicable.
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

  const mapping: SpeakerMapping = {};
  parsed.paragraphs.forEach(para => {
    mapping[para.index.toString()] = {
      name: para.name,
      function: para.function,
      affiliation: para.affiliation,
      group: para.group,
    };
  });

  if (transcriptId) {
    await setSpeakerMapping(transcriptId, mapping);
  }

  return mapping;
}

