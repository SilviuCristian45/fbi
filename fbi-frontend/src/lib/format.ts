// Display helpers for FBI list data (presentation only; stored values are untouched).

// "The FBI is offering a reward of up to $20,000 for information..." -> "$20,000".
// Returns null when the text has no dollar amount.
export function rewardAmount(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\$\s?[\d,.]+(?:\s*(?:million|billion))?/i);
  return match ? match[0].replace(/\s+/g, " ") : null;
}

export function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

export function formatDateTime(value: string | number | Date) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
