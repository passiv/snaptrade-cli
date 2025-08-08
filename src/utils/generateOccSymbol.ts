// Generate a 21 character OCC symbol for the given ticker, expiration, strike, and option type
export function generateOccSymbol(
  ticker: string,
  expiration: string,
  strike: number,
  optionType: "CALL" | "PUT"
): string {
  const formattedTicker = ticker.toUpperCase().padEnd(6, " ");
  const formattedExpiration = expiration.replace(/-/g, "").slice(2); // YYMMDD
  const formattedStrike = (strike * 1000).toFixed(0).padStart(8, "0");
  return `${formattedTicker}${formattedExpiration}${optionType === "CALL" ? "C" : "P"}${formattedStrike}`;
}
