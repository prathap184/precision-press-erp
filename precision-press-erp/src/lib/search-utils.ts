/**
 * Shared Search & Normalization Utilities
 * 
 * Provides delimiter-insensitive (spaces, hyphens, underscores, slashes, punctuation)
 * and token-based fuzzy matching across ERP search bars and dropdowns.
 */

/**
 * Normalizes a string for fuzzy delimiter-insensitive matching:
 * - converts to lowercase
 * - strips all spaces, hyphens, underscores, slashes, and common punctuation
 */
export function normalizeSearchTerm(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * Checks if a target string matches a query string, being lenient about:
 * - Case insensitivity
 * - Spaces, hyphens (-), underscores (_), slashes (/), dots (.), unicode arrows (→), etc.
 * 
 * Examples:
 * - target "3m Black Back Vinyl", query "3mblack" -> TRUE
 * - target "3m Black Back Vinyl", query "3m-black" -> TRUE
 * - target "3m Black Back Vinyl", query "3m_black" -> TRUE
 * - target "3m Black Back Vinyl", query "black 3m" -> TRUE
 * - target "B H A R A T H → 9902060076", query "bharath9" -> TRUE
 * - target "Acme Solutions - Pvt Ltd", query "acmesolutions" -> TRUE
 * 
 * Returns true if query is empty/blank or if target matches.
 */
export function fuzzyMatch(
  target: string | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const rawTarget = String(target).toLowerCase();
  const rawQuery = String(query).trim().toLowerCase();

  // 1. Direct standard substring match
  if (rawTarget.includes(rawQuery)) return true;

  // 2. Normalized continuous match (ignores spaces, -, _, arrows, etc.)
  const normTarget = normalizeSearchTerm(rawTarget);
  const normQuery = normalizeSearchTerm(rawQuery);

  if (normQuery && normTarget.includes(normQuery)) {
    return true;
  }

  // 3. Multi-token match: all non-empty tokens in the query must match something in the target
  const tokens = rawQuery.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
  if (tokens.length > 1) {
    const allTokensMatch = tokens.every((tok) => {
      const normTok = normalizeSearchTerm(tok);
      return rawTarget.includes(tok) || (normTok && normTarget.includes(normTok));
    });
    if (allTokensMatch) return true;
  }

  return false;
}

/**
 * Creates a regex that matches query tokens even if the source text contains
 * spaces, hyphens, underscores, or arrows between characters of the token.
 * 
 * Example:
 * query "3mblack" generates pattern matching "3m Black" in "3m Black Back Vinyl".
 * query "bharath9" matches "B H A R A T H → 9".
 */
export function createHighlightRegex(query: string | null | undefined): RegExp | null {
  if (!query) return null;
  const clean = String(query).replace(/^ct[:\s\-\/]?\s*/i, '').trim();
  if (!clean) return null;

  const tokens = clean.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
  const patterns: string[] = [];

  tokens.forEach((tok) => {
    const chars = tok.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (chars.length > 0) {
      patterns.push(chars.join('[\\s\\p{P}\\p{S}]*'));
    }
  });

  if (patterns.length === 0) return null;
  return new RegExp(`(${patterns.join('|')})`, 'giu');
}

