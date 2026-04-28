const PRICE_RE = /(\d{1,4}[.,]\d{2})/g;
const TOTAL_RE = /\b(totale|total|tot)\b/i;
const PRIORITY_RE = /\b(euro|eur|da pagare|importo)\b/i;
const MAX_AMOUNT = 9999.99;

interface Candidate {
  value: number;
  score: number;
}

export function smartExtract(rawText: string): number | null {
  const candidates: Candidate[] = [];

  for (const line of rawText.split(/\n|\\n/)) {
    const matches = [...line.matchAll(PRICE_RE)];
    if (!matches.length) continue;

    let score = 0;
    if (TOTAL_RE.test(line)) score += 10;
    else if (PRIORITY_RE.test(line)) score += 5;

    for (const match of matches) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (value > 0 && value <= MAX_AMOUNT) {
        candidates.push({ value, score });
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}
