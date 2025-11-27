# Optimal Context Format for IAHWG Transcripts

Based on Claude/Anthropic best practices for long context and prompt caching.

## Structure Principles

1. **XML Tags for Multi-Document Structure**: Use `<document>` wrapper with metadata subtags
2. **Documents First, Query Last**: Place all 7 session transcripts BEFORE user query/instructions
3. **Structured Metadata**: Include session info, date, phase for easy reference
4. **Quote-Friendly Format**: Enable Claude to extract quotes before answering
5. **Cache-Optimized**: Structure for 1-hour cache TTL on static transcript content

## Recommended XML Structure

```xml
<documents>
  <document index="1">
    <source>
      <title>IAHWG Session 1: Initial Discussion on Mandate Creation</title>
      <date>2025-09-16</date>
      <phase>Mandate Creation</phase>
      <asset_id>k1k/k1k41vpaer</asset_id>
      <url>/video/k1k/k1k41vpaer</url>
    </source>
    <document_content>
## Session 1: Initial Discussion on Mandate Creation (Sep 16, 2025)

**USA** | Ambassador Sarah Johnson, Permanent Representative
The United States believes that establishing a clear mandate...

**CHN** | Mr. Li Wei, Deputy Representative
China emphasizes the importance of multilateral cooperation...

**FRA** | Ambassador Marie Dubois, Permanent Representative
France supports the creation of a comprehensive framework...
    </document_content>
  </document>

  <document index="2">
    <source>
      <title>IAHWG Session 2: Negotiation on Mandate Framework</title>
      <date>2025-09-27</date>
      <phase>Mandate Creation</phase>
      <asset_id>k1k/k1k5t0nzg8</asset_id>
      <url>/video/k1k/k1k5t0nzg8</url>
    </source>
    <document_content>
## Session 2: Negotiation on Mandate Framework (Sep 27, 2025)

**GBR** | Lord William Thompson, Ambassador
The United Kingdom proposes the following amendments...
    </document_content>
  </document>

  <!-- Repeat for all 7 sessions -->
</documents>
```

## Within Each Document Content

### Speaker Format

```
**{ISO3_COUNTRY_CODE}** | {Name}, {Role}
{Statement text...}

**{ISO3_COUNTRY_CODE}** | {Name}, {Role}
{Statement text...}
```

### Why This Format Works

1. **XML Tags**: Claude documentation explicitly recommends `<document>`, `<source>`, `<document_content>` for multi-doc scenarios
2. **Index Attribute**: Makes it easy to reference "see document 3" or "in the fifth session"
3. **Rich Metadata**: All context for filtering/understanding without redundancy
4. **Markdown Inside XML**: Combines readability with structure
5. **Country Codes Bold**: Makes visual scanning easy, supports quote extraction
6. **Clean Statements**: No timestamps, no verbose IDs cluttering the context

## System Prompt Structure

```typescript
const systemPrompt = [
  {
    type: "text" as const,
    text: `You are an expert assistant analyzing UN80 IAHWG (Inter-Agency Humanitarian Working Group) meeting transcripts.

You have access to complete transcripts from 7 sessions spanning September-November 2025 across three phases:
- Mandate Creation (Sep 16, 27)
- Implementation (Oct 9, 23)  
- Review (Nov 14 Part 1, Nov 14 Part 2, Nov 25)

When answering questions:
1. Quote relevant passages first before providing your analysis
2. Always cite the country, speaker, and session date when referencing statements
3. Use the format: "As Ambassador X from COUNTRY stated in the [date] session: '[quote]'"
4. Link to sessions using /video/{asset_id} format when relevant
5. Compare positions across sessions when asked about evolution or disagreement

The transcripts follow this structure:
- Country codes in ISO3 format (USA, CHN, FRA, etc.)
- Speaker name and role provided
- Statements organized chronologically within each session`,
    cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
  },
  {
    type: "text" as const,
    text: transcriptsXML, // The full <documents>...</documents> XML
    cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
  },
];
```

## Token Efficiency Comparison

| Format            | Est. Tokens | Notes                     |
| ----------------- | ----------- | ------------------------- |
| Current Markdown  | 130,604     | Baseline                  |
| XML with Metadata | ~145,000    | +11% for structure        |
| **Benefit**       | **Cached**  | 90% cheaper on cache hits |

The ~11% increase in tokens is offset by:

- Better retrieval accuracy (quotes grounded in structure)
- Clearer session boundaries (index attribute)
- Richer metadata for filtering
- 90% cost savings via 1-hour caching

## Implementation Checklist

- [ ] Convert markdown generator to XML format
- [ ] Add `<document>` wrappers with index attributes
- [ ] Add `<source>` metadata blocks (title, date, phase, asset_id, url)
- [ ] Wrap content in `<document_content>` tags
- [ ] Update system prompt with quote-first instructions
- [ ] Configure 1-hour cache TTL (longer than default 5m)
- [ ] Test with quote extraction queries
- [ ] Validate cache hit rates in Usage dashboard

## Example Queries to Test

1. "What did France say about mandate creation? Quote the relevant passage first."
2. "Compare the USA and China positions on implementation across all sessions."
3. "Summarize the key disagreements in the November 25 review session."
4. "Which countries supported the framework in the early sessions?"
5. "How did the discussion evolve from September to November?"

These queries benefit from:

- XML structure enabling precise document boundaries
- Quote-first approach reducing hallucination
- Rich metadata supporting multi-session analysis
