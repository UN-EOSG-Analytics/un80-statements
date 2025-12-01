import type { Metadata } from "next";
import { RagSearch } from "@/components/rag-search";

export const metadata: Metadata = {
  title: "Semantic Search | UN80 Statements",
  description:
    "Run semantic similarity search across stored sentences with Azure OpenAI embeddings and Turso.",
};

export default function SearchPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Retrieval-Augmented Search
        </p>
        <h1 className="text-3xl font-semibold">Sentence-level semantic search</h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Embed your question with Azure OpenAI&apos;s text-embedding-3-large model and
          explore the most relevant statements captured in the UN80 RAG store. Use the filters
          to narrow by speaker, affiliation, or session, and copy the contexts directly into your
          favorite LLM workspace.
        </p>
      </section>
      <RagSearch />
    </main>
  );
}
