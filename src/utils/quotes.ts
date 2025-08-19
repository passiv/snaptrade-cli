import { yf } from "./yahooFinance.ts";

export type YahooQuote = {
  regularMarketPrice?: number;
  currency?: string;
  // Allow additional fields when callers request them
  [key: string]: unknown;
};

/**
 * Yahoo Finance treats OCC option symbols without spaces (e.g., AAPL  250118C00100000 -> AAPL250118C00100000).
 * This helper removes spaces to match Yahoo's expected format.
 */
export function sanitizeYahooSymbol(symbol: string): string {
  return symbol.replaceAll(" ", "");
}

/**
 * Fetch Yahoo Finance quotes for one or more symbols.
 * - Returns a map keyed by the original symbols passed in (not sanitized),
 *   so callers don't need to remember to strip spaces for options.
 * - You can pass a custom list of fields supported by yahoo-finance2.
 */
export async function getYahooQuotesForSymbols(
  symbols: string[],
  fields: string[] = ["regularMarketPrice", "currency"]
): Promise<Record<string, YahooQuote | undefined>> {
  if (!symbols.length) return {};

  const sanitized = symbols.map(sanitizeYahooSymbol);

  // yahoo-finance2 can take an array of symbols and return an object map
  const quotes = (await yf.quote(
    sanitized,
    {
      fields,
      return: "object",
    } as any,
    {
      // Some symbols (especially options) may not resolve; don't throw
      validateResult: false,
    }
  )) as Record<string, YahooQuote | undefined>;

  // Map results back to the original symbols
  const byOriginal: Record<string, YahooQuote | undefined> = {};
  for (let i = 0; i < symbols.length; i++) {
    const original = symbols[i];
    const key = sanitized[i];
    byOriginal[original] = quotes?.[key];
  }
  return byOriginal;
}
