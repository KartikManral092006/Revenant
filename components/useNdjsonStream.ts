"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Shared NDJSON reader for live runs. Client code: no imports from lib/.
export interface NdjsonState<T> {
  events: T[];
  running: boolean;
  error: string | null;
}

export function useNdjsonStream<T = Record<string, unknown>>() {
  const [state, setState] = useState<NdjsonState<T>>({ events: [], running: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async (url: string, init?: RequestInit) => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setState({ events: [], running: true, error: null });
    const push = (ev: T) => setState((s) => ({ ...s, events: [...s.events, ev] }));
    try {
      const res = await fetch(url, { cache: "no-store", ...init, signal: ctl.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        buf += decoder.decode(value, { stream: !done });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) push(JSON.parse(line) as T);
        }
        if (done) break;
      }
      if (buf.trim()) push(JSON.parse(buf) as T);
      setState((s) => ({ ...s, running: false }));
    } catch (e) {
      if (ctl.signal.aborted) return;
      setState((s) => ({ ...s, running: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { ...state, start, stop };
}
