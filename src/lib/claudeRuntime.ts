// Acesso às capacidades do Claude quando o app roda como artefato no claude.ai.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    claude?: { use(name: string): Promise<any> };
  }
}

const cache: Record<string, Promise<any>> = {};

/** Resolve uma capacidade (`db`, `user`, `sample`, `downloads`) ou `null` quando indisponível. */
export function useCap<T = any>(name: string): Promise<T | null> {
  if (!cache[name]) {
    const w = typeof window !== "undefined" ? window.claude : undefined;
    cache[name] = w?.use
      ? Promise.race([w.use(name).catch(() => null), new Promise((r) => setTimeout(() => r(null), 12000))])
      : Promise.resolve(null);
  }
  return cache[name];
}

export const inClaude = () => typeof window !== "undefined" && !!window.claude?.use;
