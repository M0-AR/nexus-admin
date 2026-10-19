const PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#22c55e",
  "#8b5cf6",
  "#ef4444",
];

/** Deterministic avatar color so the same email always gets the same swatch. */
export function pickAvatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
