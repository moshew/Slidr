export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return {
    n: s.length,
    min: s[0],
    median: s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2,
    p95: q(0.95),
    max: s[s.length - 1],
  };
}

export const r1 = (x) => (x == null || Number.isNaN(x) ? 'n/a' : (Math.round(x * 10) / 10).toFixed(1));
export const r0 = (x) => (x == null || Number.isNaN(x) ? 'n/a' : String(Math.round(x)));
export const pct = (x) => (x == null || Number.isNaN(x) ? 'n/a' : x < 0.005 && x > 0 ? '<0.01' : x.toFixed(2));
