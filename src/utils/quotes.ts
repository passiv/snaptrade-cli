import { yf } from "./yahooFinance.ts";

type YahooQuote = {
  regularMarketPrice?: number;
  currency?: string;
  // Allow additional fields when callers request them
  [key: string]: unknown;
};

/**
 * Yahoo Finance treats OCC option symbols without spaces (e.g., AAPL  250118C00100000 -> AAPL250118C00100000).
 * This helper removes spaces to match Yahoo's expected format.
 */
function sanitizeYahooSymbol(symbol: string): string {
  return symbol.replaceAll(" ", "");
}

/**
 * Fetch Yahoo Finance quotes for one or more symbols.
 * - Returns a map keyed by the original symbols passed in (not sanitized),
 *   so callers don't need to remember to strip spaces for options.
 * - You can pass a custom list of fields supported by yahoo-finance2.
 */
async function getYahooQuotesForSymbols(
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

export type LastQuote = {
  last: number;
  currency: string;
};

export type Quote = {
  bid: number;
  ask: number;
  last: number;
  currency: string;
};

export async function getLastQuote(
  ticker: string
): Promise<LastQuote | undefined> {
  const quotes = await getLastQuotes([ticker]);
  return quotes[ticker];
}

export async function getLastQuotes(
  tickers: string[]
): Promise<Record<string, LastQuote | undefined>> {
  try {
    const uQuotes = await getYahooQuotesForSymbols(tickers, [
      "regularMarketPrice",
      "currency",
    ]);
    const result: Record<string, LastQuote> = {};
    for (const [ticker, data] of Object.entries(uQuotes)) {
      if (data?.regularMarketPrice != null && data.currency) {
        result[ticker] = {
          last: data.regularMarketPrice,
          currency: data.currency,
        };
      }
    }
    return result;
  } catch (_) {
    return {};
  }
}

export async function getFullQuote(ticker: string): Promise<Quote | undefined> {
  const quotes = await getFullQuotes([ticker]);
  return quotes[ticker];
}

export async function getFullQuotes(
  tickers: string[]
): Promise<Record<string, Quote | undefined>> {
  try {
    const uQuotes = await getYahooQuotesForSymbols(tickers, [
      "regularMarketPrice",
      "currency",
      "bid",
      "ask",
    ]);
    const result: Record<string, Quote> = {};
    for (const [ticker, data] of Object.entries(uQuotes)) {
      if (
        data?.regularMarketPrice != null &&
        data.currency &&
        data.bid != null &&
        data.ask != null
      ) {
        result[ticker] = {
          bid: data.bid as number,
          ask: data.ask as number,
          last: data.regularMarketPrice,
          currency: data.currency,
        };
      }
    }
    return result;
  } catch (_) {
    return {};
  }
}

export type Amount = {
  value: number;
  currency?: string;
};

export function formatLastQuote(quote: LastQuote) {
  return `${quote.last.toLocaleString("en-US", { style: "currency", currency: quote.currency })}`;
}

export function formatAmount(amount: Amount) {
  return `${amount.value.toLocaleString("en-US", { style: "currency", currency: amount.currency })}`;
}
