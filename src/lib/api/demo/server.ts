import { readFile } from "node:fs/promises";
import path from "node:path";

// Server side of demo mode: server components read the same files the
// browser fetches from /demo-data. next.config.ts traces them into the build.
const DATA_DIR = path.join(process.cwd(), "public", "demo-data");

export async function readDemoFile(name: string): Promise<unknown> {
  const file = await readFile(path.join(DATA_DIR, name), "utf8");
  return JSON.parse(file);
}

// Imported lazily: client components are rendered on the server too, and
// their bundle may not import next/headers. They never call this.
export async function readDemoCookie(name: string): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get(name)?.value;
}
