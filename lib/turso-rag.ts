import { createClient } from "@libsql/client/web";
import "@/lib/load-env";

const REQUIRED_VARS = ["TURSO_RAG", "TURSO_RAG_TOKEN"] as const;

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var ${key} for RAG search`);
  }
}

const ragClient = createClient({
  url: process.env.TURSO_RAG!,
  authToken: process.env.TURSO_RAG_TOKEN!,
});

export async function getRagClient() {
  return ragClient;
}
