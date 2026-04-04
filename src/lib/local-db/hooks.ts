"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Drop-in replacement for Convex's useQuery hook.
 *
 * Fetches data from the local API at `/api/db/[...path]` and polls every
 * second to approximate Convex's real-time reactivity.
 *
 * @param path  Dot-separated function path, e.g. "files.getFiles"
 * @param args  Query arguments, or "skip" to disable the query
 * @returns     The query result, or undefined while loading / skipped
 */
export function useLocalQuery<T = unknown>(
  path: string,
  args: Record<string, unknown> | "skip"
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const [, setError] = useState<Error | null>(null);

  // Keep a stable reference to the serialized args so we can correctly
  // detect changes without triggering unnecessary re-renders.
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);

  // Track whether the component is still mounted to avoid setting state
  // after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (args === "skip") {
      setData(undefined);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        const urlPath = path.replace(".", "/");
        const res = await fetch(`/api/db/${urlPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "query", path, args }),
        });

        if (!res.ok) {
          throw new Error(`Query ${path} failed: ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (!cancelled && mountedRef.current) {
          setData(json.data as T);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          console.error(`[useLocalQuery] Error fetching ${path}:`, err);
        }
      }
    };

    // Initial fetch
    fetchData();

    // Poll every 1 second
    const interval = setInterval(fetchData, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, argsKey]);

  return data;
}

/**
 * Drop-in replacement for Convex's useMutation hook.
 *
 * Returns an async function that POSTs to `/api/db/[...path]` with the
 * given args. Matches Convex's calling pattern:
 *
 *   const mutate = useLocalMutation("files.createFile");
 *   await mutate({ projectId, name, content });
 *
 * @param path  Dot-separated function path, e.g. "files.createFile"
 * @returns     Async function that executes the mutation
 */
export function useLocalMutation<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
>(path: string): (args: TArgs) => Promise<TResult> {
  const mutate = useCallback(
    async (args: TArgs): Promise<TResult> => {
      const urlPath = path.replace(".", "/");
      const res = await fetch(`/api/db/${urlPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "mutation", path, args }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Mutation ${path} failed: ${res.status} ${res.statusText} — ${body}`
        );
      }

      const json = await res.json();
      return json.data as TResult;
    },
    [path]
  );

  return mutate;
}
