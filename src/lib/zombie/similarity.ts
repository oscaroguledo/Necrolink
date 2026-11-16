/**
 * Cheap text similarity for the zombie quick check (spec 03, stage 1).
 */

const STOPWORDS = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with you your we our'.split(
    ' '
  )
);

/** Lowercase word tokens (letters/digits, 2+ chars), stopwords removed. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOPWORDS.has(w));
}

/** Jaccard index of two strings' word sets, in [0, 1]. Two empty strings → 1. */
export function jaccard(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared++;
  return shared / (setA.size + setB.size - shared);
}

/**
 * Cosine similarity of word-frequency vectors, in [0, 1]. Insensitive to page
 * length, so an article that gained a few paragraphs still scores high.
 * Two empty texts → 1; one empty → 0.
 */
export function contentSimilarity(a: string, b: string): number {
  const freqA = frequencies(tokenize(a));
  const freqB = frequencies(tokenize(b));
  if (freqA.size === 0 && freqB.size === 0) return 1;
  if (freqA.size === 0 || freqB.size === 0) return 0;

  let dot = 0;
  for (const [word, count] of freqA) dot += count * (freqB.get(word) ?? 0);
  const norm = (f: Map<string, number>) => Math.sqrt([...f.values()].reduce((s, c) => s + c * c, 0));
  const score = dot / (norm(freqA) * norm(freqB));
  // Clamp floating-point noise (identical texts can give 0.9999999999)
  return Math.min(1, Math.max(0, Math.round(score * 1e9) / 1e9));
}

function frequencies(words: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of words) map.set(w, (map.get(w) ?? 0) + 1);
  return map;
}

/** Number of tokens, for "too short to judge" decisions. */
export function wordCount(text: string): number {
  return tokenize(text).length;
}
