import { z } from "zod";

import { demoFetch } from "./demo";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

// With NEXT_PUBLIC_DEMO_MODE=1 the app runs without the backend, on the
// fixed data in public/demo-data. See src/lib/api/demo.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

type FetchJsonInit = Omit<RequestInit, "body" | "headers"> & {
  body?: BodyInit;
  headers?: Record<string, string>;
};

export async function fetchJson<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: FetchJsonInit = {},
): Promise<z.infer<TSchema>> {
  if (DEMO_MODE) {
    return schema.parse(await demoFetch(path, init.method, init.body));
  }

  const { headers, ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...rest,
    headers: {
      Accept: "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Backend request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload: unknown = await response.json();
  return schema.parse(payload);
}
