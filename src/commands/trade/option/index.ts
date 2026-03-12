import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import type {
  Balance,
  MlegActionStrict,
  MlegInstrumentType,
  OptionImpact,
} from "snaptrade-typescript-sdk";
import { Snaptrade, type Account } from "snaptrade-typescript-sdk";
import { generateOccSymbol } from "../../../utils/generateOccSymbol.ts";
import {
  logLine,
  printAccountSection,
  printDivider,
  printOrderParams,
} from "../../../utils/preview.ts";
import {
  formatAmount,
} from "../../../utils/quotes.ts";
import type { OptionQuote } from "snaptrade-typescript-sdk";
import { selectAccount } from "../../../utils/selectAccount.ts";
import { handlePostTrade } from "../../../utils/trading.ts";
import { loadOrRegisterUser } from "../../../utils/user.ts";
import { withDebouncedSpinner } from "../../../utils/withDebouncedSpinner.ts";
import { ORDER_TYPES, TIME_IN_FORCE } from "../index.ts";
import { callCommand } from "./call.ts";
import { ironCondorCommand } from "./iron-condor.ts";
import { putCommand } from "./put.ts";
import { straddleCommand } from "./straddle.ts";
import { strangleCommand } from "./strangle.ts";
import { verticalCallSpreadCommand } from "./vertical-call-spread.ts";
import { verticalPutSpreadCommand } from "./vertical-put-spread.ts";

export function optionCommand(snaptrade: Snaptrade): Command {
  const cmd = new Command("option")
    .description("Place single leg or multi-leg option trade")
    .requiredOption(
      "--contracts <number>",
      "Number of contracts to trade",
      "1"
    );

  cmd.addCommand(callCommand(snaptrade));
  cmd.addCommand(putCommand(snaptrade));
  cmd.addCommand(straddleCommand(snaptrade));
  cmd.addCommand(strangleCommand(snaptrade));
  cmd.addCommand(verticalCallSpreadCommand(snaptrade));
  cmd.addCommand(verticalPutSpreadCommand(snaptrade));
  cmd.addCommand(ironCondorCommand(snaptrade));

  return cmd;
}

export type Leg = {
  type: "CALL" | "PUT";
  action: "BUY" | "SELL";
  strike: number;
  expiration: string;
  quantity: number;
};

export type TradeArgs = {
  account: Account;
  ticker: string;
  orderType: (typeof ORDER_TYPES)[number];
  limitPrice?: string;
  action: "BUY" | "SELL";
  quantity: number;
  tif: (typeof TIME_IN_FORCE)[number];
  balance?: Balance;
};

export async function processCommonOptionArgs(
  snaptrade: Snaptrade,
  command: any
): Promise<TradeArgs> {
  const user = await loadOrRegisterUser(snaptrade);

  const { ticker, orderType, limitPrice, action, tif } =
    command.parent.parent.opts();

  const orderTypeInput = orderType as (typeof ORDER_TYPES)[number];

  if (orderTypeInput === "Limit" && !limitPrice) {
    console.error("Limit price is required for limit orders.");
    process.exit(1);
  }

  const { contracts } = command.parent.opts();
  const quantity = parseInt(contracts);

  const selectedAccount = await selectAccount({
    snaptrade,
    context: "option_trade",
    useLastAccount: command.parent.parent.parent.opts().useLastAccount,
  });

  const balanceResponse = await withDebouncedSpinner(
    "Generating trade preview, please wait...",
    async () =>
      snaptrade.accountInformation.getUserAccountBalance({
        ...user,
        accountId: selectedAccount.id,
      })
  );

  return {
    account: selectedAccount,
    ticker,
    orderType: orderTypeInput,
    limitPrice,
    action,
    quantity,
    tif,
    balance: balanceResponse.data[0], // TODO Handle multiple currencies
  };
}

export async function confirmTrade(
  snaptrade: Snaptrade,
  user: { userId: string; userSecret: string },
  account: Account,
  ticker: string,
  legs: Leg[],
  limitPrice: string | undefined,
  orderType: string,
  action: string,
  tif: string,
  balance?: Balance,
  impact?: OptionImpact
) {
  // Section: Header
  console.log(chalk.bold("\n📄 Trade Preview\n"));

  // Section: Account selection
  printAccountSection({ account, balance });
  console.log();

  // Section: Fetch option quotes for each leg via SnapTrade API
  const occSymbols = legs.map((leg) =>
    generateOccSymbol(ticker, leg.expiration, leg.strike, leg.type)
  );
  const legQuotes: Record<string, OptionQuote | undefined> = {};
  await Promise.all(
    occSymbols.map(async (symbol) => {
      try {
        const res = await snaptrade.options.getOptionQuote({
          ...user,
          accountId: account.id,
          symbol,
        });
        legQuotes[symbol] = res.data;
      } catch (e: any) {
        if (process.argv.includes("--verbose")) {
          console.error(`[option-quote] ${symbol}:`, e?.responseBody ?? e?.response?.data ?? e?.message);
        }
        legQuotes[symbol] = undefined;
      }
    })
  );

  const currency = account.balance.total?.currency;

  // Section: Underlying quote (use underlying_price from first available option quote)
  const underlyingPrice = Object.values(legQuotes).find(
    (q) => q?.underlying_price != null
  )?.underlying_price;
  logLine(
    "📈",
    "Underlying",
    underlyingPrice
      ? `${ticker} · ${formatAmount({ value: underlyingPrice, currency })}`
      : ticker
  );

  // Section: Overall option strategy quote
  const contracts = Math.max(1, ...legs.map((l) => l.quantity || 0));
  const perLegForBand = legs.map((leg, idx) => {
    const q = legQuotes[occSymbols[idx]];
    const bid = q?.bid_price;
    const ask = q?.ask_price;
    const last = q?.last_price;
    const mid =
      bid != null && ask != null ? (bid + ask) / 2 : undefined;
    const ratio = Math.max(0, (leg.quantity || contracts) / contracts);
    const bidUsed = (bid ?? mid ?? last ?? 0) * ratio;
    const askUsed = (ask ?? mid ?? last ?? 0) * ratio;
    const stratBid = leg.action === "BUY" ? +bidUsed : -askUsed;
    const stratAsk = leg.action === "BUY" ? +askUsed : -bidUsed;
    const price = (() => {
      if (mid != null) return leg.action === "BUY" ? -mid : mid;
      if (leg.action === "BUY") return -askUsed;
      return bidUsed;
    })();
    return { stratBid, stratAsk, price };
  });
  const strategyBid = perLegForBand.reduce((s, l) => s + l.stratBid, 0);
  const strategyAsk = perLegForBand.reduce((s, l) => s + l.stratAsk, 0);
  const bothNegative = strategyBid < 0 && strategyAsk < 0;
  const displayBid = bothNegative
    ? Math.abs(strategyAsk)
    : Math.abs(strategyBid);
  const displayAsk = bothNegative
    ? Math.abs(strategyBid)
    : Math.abs(strategyAsk);
  const bidLabel = chalk.cyan("Bid");
  const askLabel = chalk.magenta("Ask");
  const bidStr = chalk.cyan(
    formatAmount({ value: displayBid, currency })
  );
  const askStr = chalk.magenta(
    formatAmount({ value: displayAsk, currency })
  );
  logLine(
    "💵",
    "Strategy Quote",
    `${bidLabel}: ${bidStr} · ${askLabel}: ${askStr}`
  );

  // Section: Option legs
  const rows = legs.map((leg, idx) => ({
    action:
      leg.action === "BUY" ? chalk.green(leg.action) : chalk.red(leg.action),
    qty: String(leg.quantity),
    type: leg.type,
    strike: formatAmount({ value: leg.strike, currency }),
    exp: leg.expiration,
    quote: (() => {
      const q = legQuotes[occSymbols[idx]];
      if (!q) return "Quote: N/A";
      const bidLabel =
        leg.action === "BUY" ? chalk.cyan("Bid") : chalk.magenta("Bid");
      const askLabel =
        leg.action === "BUY" ? chalk.magenta("Ask") : chalk.cyan("Ask");
      return `${bidLabel}: ${formatAmount({ value: q.bid_price ?? 0, currency })} · ${askLabel}: ${formatAmount({ value: q.ask_price ?? 0, currency })} · Last: ${formatAmount({ value: q.last_price ?? 0, currency })}`;
    })(),
  }));
  const widths = {
    action: Math.max(...rows.map((r) => r.action.length)),
    qty: Math.max(...rows.map((r) => r.qty.length)),
    type: Math.max(...rows.map((r) => r.type.length)),
    strike: Math.max(...rows.map((r) => r.strike.length)),
    exp: Math.max(...rows.map((r) => r.exp.length)),
    quote: Math.max(...rows.map((r) => r.quote.length)),
  };
  const makeLine = (r: (typeof rows)[number]) =>
    [
      r.action.padEnd(widths.action),
      r.qty.padStart(widths.qty),
      r.type.padEnd(widths.type),
      r.strike.padStart(widths.strike),
      r.exp.padEnd(widths.exp),
      r.quote.padEnd(widths.quote),
    ].join("  ");
  if (rows.length > 0) {
    logLine("🧩", "Legs", makeLine(rows[0]));
    for (let i = 1; i < rows.length; i++) {
      logLine("  ", "", makeLine(rows[i]));
    }
  }

  // Section: Order Parameters
  printOrderParams({
    action: action as "BUY" | "SELL",
    orderType,
    limitPrice: limitPrice ? Number(limitPrice) : undefined,
    timeInForce: tif,
    currency,
  });

  // Section: Estimated cost/credit
  if (impact) {
    // Use broker-provided impact estimate when available
    const directionLabel =
      impact.cash_change_direction === "CREDIT"
        ? chalk.green("CREDIT")
        : impact.cash_change_direction === "DEBIT"
          ? chalk.red("DEBIT")
          : impact.cash_change_direction ?? "UNKNOWN";
    logLine(
      "📊",
      impact.cash_change_direction === "CREDIT" ? "Est. Credit" : "Est. Cost",
      `${formatAmount({ value: Number(impact.estimated_cash_change), currency })} ${directionLabel}`
    );
    if (impact.estimated_fee_total) {
      logLine(
        "  ",
        "Est. Fees",
        formatAmount({ value: Number(impact.estimated_fee_total), currency })
      );
    }
  } else {
    // Fallback: manual estimate from quotes
    const perContract = Math.abs(
      perLegForBand.reduce((sum, l) => sum + l.price, 0)
    );
    const effectivePerContract =
      orderType === "Limit" && limitPrice ? Number(limitPrice) : perContract;
    const multiplier = 100;
    const total = effectivePerContract * multiplier * contracts;
    logLine(
      "📊",
      action === "SELL" ? "Est. Credit" : "Est. Cost",
      formatAmount({ value: total, currency })
    );
    logLine(
      "  ",
      "",
      `${formatAmount({ value: effectivePerContract, currency })} × ${multiplier} multiplier × ${contracts} contract${contracts > 1 ? "s" : ""}`
    );
  }

  printDivider();

  const result = await confirm({
    message: "Are you sure you want to place this trade?",
  });

  if (!result) {
    console.log("❌ Trade cancelled by user.");
    process.exit(0);
  }
}

export async function placeTrade(
  snaptrade: Snaptrade,
  legs: Leg[],
  trade: TradeArgs
) {
  const user = await loadOrRegisterUser(snaptrade);

  const { ticker, orderType, limitPrice, action, tif, account, balance } =
    trade;

  const orderTypeInput = (() => {
    switch (orderType as (typeof ORDER_TYPES)[number]) {
      case "Market":
        return "MARKET";
      case "Limit":
        return "LIMIT";
      case "Stop":
        return "STOP_LOSS_MARKET";
      case "StopLimit":
        return "STOP_LOSS_LIMIT";
      default:
        throw new Error(`Unsupported order type: ${orderType}`);
    }
  })();

  const legsInput = legs.map((leg) => ({
    instrument: {
      instrument_type: "OPTION" as MlegInstrumentType,
      symbol: generateOccSymbol(ticker, leg.expiration, leg.strike, leg.type),
    },
    action: `${leg.action}_TO_OPEN` as MlegActionStrict,
    units: leg.quantity,
  }));

  // Fetch broker-provided impact estimate (BETA — may not be supported by all brokers)
  let impact: OptionImpact | undefined;
  try {
    const impactResponse = await snaptrade.trading.getOptionImpact({
      ...user,
      accountId: account.id,
      order_type: orderTypeInput,
      time_in_force: tif,
      limit_price: limitPrice,
      price_effect: action === "BUY" ? "DEBIT" : "CREDIT",
      legs: legsInput,
    });
    impact = impactResponse.data;
  } catch (e: any) {
    if (process.argv.includes("--verbose")) {
      console.error("[option-impact]:", e?.responseBody ?? e?.response?.data ?? e?.message);
    }
  }

  await confirmTrade(
    snaptrade,
    user,
    account,
    ticker,
    legs,
    limitPrice,
    orderType,
    action,
    tif,
    balance,
    impact
  );

  const response = await snaptrade.trading.placeMlegOrder({
    ...user,
    accountId: account.id,
    order_type: orderTypeInput,
    limit_price: limitPrice,
    time_in_force: tif,
    price_effect: action === "BUY" ? "DEBIT" : "CREDIT",
    legs: legsInput,
  });

  console.log("✅ Order submitted!");
  handlePostTrade(snaptrade, response, account, user, "trade");
}
