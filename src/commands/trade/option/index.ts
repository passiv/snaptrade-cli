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
  formatLastQuote,
  getFullQuotes,
  getLastQuote,
} from "../../../utils/quotes.ts";
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

  // Section: Quote for the underlying ticker
  const underlyingQuote = await getLastQuote(ticker);
  logLine(
    "📈",
    "Underlying",
    underlyingQuote ? `${ticker} · ${formatLastQuote(underlyingQuote)}` : ticker
  );

  // Section: Overall option strategy quote
  const occSymbols = legs.map((leg) =>
    generateOccSymbol(ticker, leg.expiration, leg.strike, leg.type)
  );
  const legQuotes = await getFullQuotes(occSymbols);
  const currency = account.balance.total?.currency;

  // Compute combined per-contract strategy Bid/Ask and show it prominently
  const contracts = Math.max(1, ...legs.map((l) => l.quantity || 0));
  const perLegForBand = legs.map((leg, idx) => {
    const q = legQuotes[occSymbols[idx]];
    const mid =
      q?.bid != null && q.ask != null ? (q.bid + q.ask) / 2 : undefined;
    const ratio = Math.max(0, (leg.quantity || contracts) / contracts);
    const bidUsed = (q?.bid ?? mid ?? q?.last ?? 0) * ratio;
    const askUsed = (q?.ask ?? mid ?? q?.last ?? 0) * ratio;
    const stratBid = leg.action === "BUY" ? +bidUsed : -askUsed;
    const stratAsk = leg.action === "BUY" ? +askUsed : -bidUsed;
    const currency = q?.currency;
    const price = (() => {
      if (mid != null) return leg.action === "BUY" ? -mid : mid;
      // Fallback: favor conservative side when no mid
      if (leg.action === "BUY") return -askUsed;
      return bidUsed;
    })();
    return { stratBid, stratAsk, currency, price };
  });
  const strategyBid = perLegForBand.reduce((s, l) => s + l.stratBid, 0);
  const strategyAsk = perLegForBand.reduce((s, l) => s + l.stratAsk, 0);
  const strategyCurrency = perLegForBand[0]?.currency;
  // Display mapping: if both are negative (net credit), flip so Bid shows smaller credit (abs of ask), Ask shows larger credit (abs of bid)
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
    formatAmount({
      value: displayBid,
      currency: strategyCurrency ?? currency,
    })
  );
  const askStr = chalk.magenta(
    formatAmount({
      value: displayAsk,
      currency: strategyCurrency ?? currency,
    })
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
      // Highlight which side contributes to Strategy Bid (cyan) vs Strategy Ask (magenta)
      const bidLabel =
        leg.action === "BUY" ? chalk.cyan("Bid") : chalk.magenta("Bid");
      const askLabel =
        leg.action === "BUY" ? chalk.magenta("Ask") : chalk.cyan("Ask");
      return `${bidLabel}: ${formatAmount({ value: q?.bid, currency: q?.currency })} · ${askLabel}: ${formatAmount({ value: q?.ask, currency: q?.currency })} · Last: ${formatAmount({ value: q?.last, currency: q?.currency })}`;
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
    // First leg on the same line as the label
    logLine("🧩", "Legs", makeLine(rows[0]));
    // Subsequent legs aligned under the first leg
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

  // Section: Estimated net debit/credit for the strategy
  const perContract = Math.abs(
    perLegForBand.reduce((sum, l) => sum + l.price, 0)
  );
  // If user provided a limit for the overall strategy, prefer that per-contract
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

  // Section: Broker-provided impact estimate (if available)
  if (impact) {
    console.log();
    const directionLabel =
      impact.cash_change_direction === "CREDIT"
        ? chalk.green("CREDIT")
        : impact.cash_change_direction === "DEBIT"
          ? chalk.red("DEBIT")
          : impact.cash_change_direction ?? "UNKNOWN";
    logLine(
      "🏦",
      "Broker Estimate",
      `${formatAmount({ value: Number(impact.estimated_cash_change), currency })} ${directionLabel}`
    );
    if (impact.estimated_fee_total) {
      logLine(
        "  ",
        "Est. Fees",
        formatAmount({ value: Number(impact.estimated_fee_total), currency })
      );
    }
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
    const impactResponse = await withDebouncedSpinner(
      "Fetching order impact estimate...",
      async () =>
        snaptrade.trading.getOptionImpact({
          ...user,
          accountId: account.id,
          order_type: orderTypeInput,
          time_in_force: tif,
          limit_price: limitPrice,
          price_effect: action === "BUY" ? "DEBIT" : "CREDIT",
          legs: legsInput,
        })
    );
    impact = impactResponse.data;
  } catch {
    // Silently ignore — this endpoint is not supported by all brokers
  }

  await confirmTrade(
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
