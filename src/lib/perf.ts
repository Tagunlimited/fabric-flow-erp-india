export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - start);
      console.log(`[perf] ${label}: ${elapsed}ms`);
    }
  }
}

export function measureSync<T>(label: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - start);
      console.log(`[perf] ${label}: ${elapsed}ms`);
    }
  }
}
