import { anthropic } from "@ai-sdk/anthropic";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import { loadIAHWGTranscripts } from "@/lib/iahwg-transcripts";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    systemPrompt,
  }: {
    messages: UIMessage[];
    model?: string;
    systemPrompt?: string;
  } = await req.json();

  // Load IAHWG transcripts
  const transcripts = await loadIAHWGTranscripts();

  // Combine system prompt with transcripts for caching
  const fullSystemPrompt = `${systemPrompt || DEFAULT_SYSTEM_PROMPT}

---

${transcripts}`;

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    messages: convertToModelMessages(messages),
    system: fullSystemPrompt,
  });

  // send sources and reasoning back to the client
  return result.toUIMessageStreamResponse({
    sendSources: true,
    sendReasoning: true,
  });
}
