import { RagSearch } from "@/components/rag-search";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Statements | UN80",
  description:
    "Quickly find sentences from past meetings using the delegate-friendly semantic search tool.",
};

export default function SearchPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold">IAHWG UN80 Statements</h1>
        <p className="text-base text-muted-foreground">
          Browse all statements or semantically search for specific content. Use
          filters to narrow by meeting, date, affiliation, or speaker.
        </p>
      </section>
      <RagSearch />
    </main>
  );
}
