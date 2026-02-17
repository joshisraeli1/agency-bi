// String normalization and similarity scoring for entity resolution

const REMOVE_SUFFIXES = [
  "pty ltd",
  "pty. ltd.",
  "pty. ltd",
  "ltd",
  "limited",
  "inc",
  "inc.",
  "incorporated",
  "llc",
  "corp",
  "corporation",
  "co",
  "company",
  "group",
  "holdings",
  "australia",
  "au",
];

export function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().trim();
  // Remove common suffixes
  for (const suffix of REMOVE_SUFFIXES) {
    const regex = new RegExp(`\\s+${suffix.replace(".", "\\.")}\\s*$`, "i");
    normalized = normalized.replace(regex, "");
  }
  // Remove punctuation and extra whitespace
  normalized = normalized.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  return normalized;
}

export function normalizePersonName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Jaro-Winkler similarity score (0 to 1, where 1 = identical)
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Winkler modification: boost for common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function isExactMatch(a: string, b: string): boolean {
  return normalizeCompanyName(a) === normalizeCompanyName(b);
}

export function similarityScore(a: string, b: string, type: "company" | "person" = "company"): number {
  const normalize = type === "company" ? normalizeCompanyName : normalizePersonName;
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) {
    return 0.95;
  }

  return jaroWinkler(na, nb);
}
