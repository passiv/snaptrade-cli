import chalk from "chalk";
import { yf } from "./yahooFinance.ts";

const isVerbose = process.argv.includes("--verbose");

type YahooQuote = {
  regularMarketPrice?: number;
  currency?: string;
  // Allow additional fields when callers request them
  [key: string]: unknown;
};

/**
 * Map broker-reported symbols to their Yahoo Finance equivalents.
 * Brokers like Fidelity strip special characters (e.g. BRKB instead of BRK-B).
 */
const SYMBOL_MAP: Record<string, string> = {
  BRKB: "BRK-B",
  BRKA: "BRK-A",
};

/**
 * Symbols that cannot be resolved on Yahoo Finance (money market funds, sweep accounts, etc.).
 * These are silently skipped rather than causing failed lookups.
 */
const UNRESOLVABLE_SYMBOLS = new Set([
  "SPAXX",
  "FDRXX",
  "FCASH",
  "VMFXX",
  "SWVXX",
]);

/**
 * Yahoo Finance treats OCC option symbols without spaces (e.g., AAPL  250118C00100000 -> AAPL250118C00100000).
 * This helper removes spaces and applies known symbol mappings.
 * Returns null for symbols that cannot be resolved on Yahoo Finance.
 */
function sanitizeYahooSymbol(symbol: string): string | null {
  const stripped = symbol.replaceAll(" ", "");
  if (UNRESOLVABLE_SYMBOLS.has(stripped)) return null;
  return SYMBOL_MAP[stripped] ?? stripped;
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

  // Build mapping from sanitized symbol back to original, filtering out unresolvable symbols
  const sanitizedToOriginal: Record<string, string> = {};
  const sanitizedSymbols: string[] = [];
  for (const sym of symbols) {
    const sanitized = sanitizeYahooSymbol(sym);
    if (sanitized === null) continue;
    sanitizedToOriginal[sanitized] = sym;
    sanitizedSymbols.push(sanitized);
  }

  if (!sanitizedSymbols.length) return {};

  // yahoo-finance2 can take an array of symbols and return an object map
  const quotes = (await yf.quote(
    sanitizedSymbols,
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
  for (const [sanitized, original] of Object.entries(sanitizedToOriginal)) {
    byOriginal[original] = quotes?.[sanitized];
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
  } catch (error) {
    if (isVerbose) {
      console.error(
        chalk.yellow("Yahoo Finance error (getLastQuotes):"),
        error
      );
    }
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
  } catch (error) {
    if (isVerbose) {
      console.error(
        chalk.yellow("Yahoo Finance error (getFullQuotes):"),
        error
      );
    }
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
