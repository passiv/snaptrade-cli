import { yf } from "./yahooFinance.ts";

export type ChandelierStop = {
  price: number;
  atr: number;
  highestClose: number;
  lookback: number;
  multiplier: number;
  period: number;
};

export async function computeChandelierStop({
  symbol,
  atrPeriod = 14,
  lookback = 22,
  multiplier = 3,
}: {
  symbol: string;
  atrPeriod?: number;
  lookback?: number;
  multiplier?: number;
}): Promise<ChandelierStop | undefined> {
  // Need enough bars for ATR smoothing + the lookback window. Pull ~90 calendar
  // days which typically gives ~60 trading days — plenty for period=14,
  // lookback=22.
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setDate(period1.getDate() - 90);

  let result;
  try {
    result = await yf.chart(
      symbol,
      { period1, period2, interval: "1d", return: "object" },
      { validateResult: false }
    );
  } catch {
    return undefined;
  }

  const quote = (result as any)?.indicators?.quote?.[0];
  if (!quote) return undefined;

  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const n = (quote.close as Array<number | null>).length;
  for (let i = 0; i < n; i++) {
    const h = quote.high[i];
    const l = quote.low[i];
    const c = quote.close[i];
    if (h == null || l == null || c == null) continue;
    highs.push(h);
    lows.push(l);
    closes.push(c);
  }

  if (closes.length < atrPeriod + 1 || closes.length < lookback) {
    return undefined;
  }

  // Wilder's ATR
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  let atr =
    trs.slice(0, atrPeriod).reduce((sum, tr) => sum + tr, 0) / atrPeriod;
  for (let i = atrPeriod; i < trs.length; i++) {
    atr = (atr * (atrPeriod - 1) + trs[i]) / atrPeriod;
  }

  const recentCloses = closes.slice(-lookback);
  const highestClose = Math.max(...recentCloses);

  return {
    price: highestClose - multiplier * atr,
    atr,
    highestClose,
    lookback,
    multiplier,
    period: atrPeriod,
  };
}
