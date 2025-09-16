import chalk from "chalk";
import stringWidth from "string-width";
import type {
  Account,
  AccountOrderRecord,
  Balance,
} from "snaptrade-typescript-sdk";
import type { Leg as OptionLeg } from "../commands/trade/option/index.ts";
import type { Quote } from "./quotes.ts";

export type PrintableValue =
  | string
  | number
  | { amount?: number; currency?: string }
  | undefined
  | null;

export function logLine(icon: string, label: string, value: PrintableValue) {
  if (value == null) return;
  if (typeof value === "object" && "amount" in value && value.amount == null) {
    return;
  }
  const formatted =
    typeof value === "string" || typeof value === "number"
      ? value
      : value.amount!.toLocaleString("en-US", {
          style: "currency",
          currency: value.currency,
        });
  // Fixed-width icon column (emoji-aware) + label padded by visual width
  const ICON_TARGET = 2; // most emojis render as width 2 in terminals
  const iconWidth = stringWidth(icon);
  const iconPad = Math.max(0, ICON_TARGET - iconWidth);
  const iconCol = icon + " ".repeat(iconPad + 1); // +1 separator

  const TARGET = 15; // desired visual width for the label column
  const labelBold = chalk.bold(label);
  const width = stringWidth(labelBold);
  const pad = Math.max(0, TARGET - width);
  const padded = labelBold + " ".repeat(pad);
  console.log(`  ${iconCol}${padded} ${formatted}`);
}

export function printDivider() {
  console.log(
    chalk.gray("\n-----------------------------------------------------")
  );
}

export function printAccountSection({
  account,
  balance,
}: {
  account: Account;
  balance?: Balance;
}) {
  const currency = account.balance.total?.currency;
  logLine("🏦", "Account", account.name!);
  logLine("💰", "Total Value", {
    amount: account.balance.total?.amount!,
    currency,
  });
  if (balance) {
    logLine("💰", "Cash", {
      amount: balance.cash!,
      currency: balance.currency?.code || currency,
    });
    logLine("💰", "Buying Power", {
      amount: balance.buying_power!,
      currency: balance.currency?.code || currency,
    });
  }
}

export function printOrderParams({
  action,
  orderType,
  limitPrice,
  stopPrice,
  timeInForce,
  currency,
}: {
  action: "BUY" | "SELL";
  orderType: string;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: string;
  currency?: string;
}) {
  logLine(
    "🛒",
    "Action",
    action === "BUY" ? chalk.green(action) : chalk.red(action)
  );
  logLine("💡", "Order Type", orderType);
  logLine("🎯", "Limit Price", {
    amount: limitPrice,
    currency,
  });
  logLine("🛑", "Stop Price", {
    amount: stopPrice,
    currency,
  });
  logLine("⏳", "Time in Force", timeInForce);
}

export type TradePreviewParams = {
  account: Account;
  ticker: string;
  action: "BUY" | "SELL";
  quantity?: number;
  notional?: number;
  orderType: string;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: string;
  quote?: Quote;
  balance: Balance;
};

export function printTradePreview({
  account,
  ticker,
  quote,
  balance,
  action,
  quantity,
  notional,
  orderType,
  limitPrice,
  stopPrice,
  timeInForce,
}: TradePreviewParams) {
  const estimatedAmount = (() => {
    if (quantity !== undefined) {
      if (limitPrice != null) {
        return quantity * limitPrice;
      } else if (quote?.last != null) {
        return quantity * quote.last;
      }
    }
  })();

  const estimatedQty = (() => {
    if (notional !== undefined) {
      if (limitPrice != null) {
        return notional / limitPrice;
      } else if (quote?.last != null && quote.last !== 0) {
        return notional / quote.last;
      }
    }
  })();

  console.log(chalk.bold("\n📄 Trade Preview\n"));

  const currency = account.balance.total?.currency;
  printAccountSection({ account, balance });
  console.log();
  logLine("📈", "Ticker", ticker);
  if (quote != null) {
    logLine(
      "💵",
      "Quote",
      `Bid: ${quote.bid?.toLocaleString("en-US", {
        style: "currency",
        currency: quote.currency,
      })} · Ask: ${quote.ask?.toLocaleString("en-US", {
        style: "currency",
        currency: quote.currency,
      })} · Last: ${quote.last?.toLocaleString("en-US", {
        style: "currency",
        currency: quote.currency,
      })}`
    );
  }

  printOrderParams({
    action,
    orderType,
    limitPrice,
    stopPrice,
    timeInForce,
    currency,
  });

  logLine("🔢", "Shares", quantity);
  logLine("💵", "Dollars", { amount: notional, currency });

  console.log();

  if (quantity != null) {
    logLine("📊", `Est. ${action === "BUY" ? "Cost  " : "Credit"}`, {
      amount: estimatedAmount,
      currency: account.balance.total?.currency,
    });
  }
  if (notional != null) {
    logLine("📊", "Est. Shares", estimatedQty?.toFixed(4));
  }
  printDivider();
}

// -------------------------
// Order Detail Preview
// -------------------------

function getOrderCurrency(order: AccountOrderRecord): string | undefined {
  // Prefer option underlying currency, fallback to equity universal symbol currency
  // TODO Ideally the curerncy for the price on the order should be on the order itself
  return (
    order.option_symbol?.underlying_symbol?.currency?.code ||
    order.universal_symbol?.currency?.code
  );
}

function getOrderSymbol(order: AccountOrderRecord): string | undefined {
  return order.option_symbol?.ticker || order.universal_symbol?.symbol;
}

export function printOrderDetail(order: AccountOrderRecord) {
  console.log(chalk.bold("\n🧾 Order Detail\n"));

  const currency = getOrderCurrency(order) || "USD";
  const symbol = getOrderSymbol(order) || "-";

  // Header/basic fields
  logLine("🆔", "Order ID", order.brokerage_order_id);
  logLine("🕒", "Time Placed", order.time_placed);
  logLine("🏷", "Status", order.status);

  const isOption = Boolean(order.option_symbol);
  if (isOption) {
    const underlying = order.option_symbol?.underlying_symbol?.symbol || symbol;
    logLine("📈", "Underlying", underlying);
  } else {
    logLine("📈", "Ticker", symbol);
  }

  // Common order params
  printOrderParams({
    action: order.action as "BUY" | "SELL",
    orderType: order.order_type!,
    limitPrice: Number(order.limit_price) ?? undefined,
    stopPrice: Number(order.stop_price) ?? undefined,
    timeInForce: (order.time_in_force || (order as any).tif) as string,
    currency,
  });

  // Option legs (single or multi-leg)
  if (isOption) {
    // FIXME This will all need to be updated once we properly model multi-leg orders on the backend
    type RawOrderLeg = {
      action?: string;
      side?: string;
      quantity?: number;
      units?: number;
      total_quantity?: number;
      option_symbol?: { ticker?: string };
      instrument?: { symbol?: string };
      occ_symbol?: string;
      symbol?: string;
    };

    const rawLegs: RawOrderLeg[] = Array.isArray((order as any).legs)
      ? ((order as any).legs as RawOrderLeg[])
      : [];

    const toOptionLeg = (leg: RawOrderLeg): OptionLeg | undefined => {
      const occ =
        leg?.option_symbol?.ticker ||
        leg?.instrument?.symbol ||
        leg?.occ_symbol ||
        leg?.symbol ||
        order.option_symbol?.ticker ||
        "";
      const parsed = parseOccLike(String(occ));
      if (!parsed) return undefined;
      const actionRaw = (
        leg?.action ??
        leg?.side ??
        order.action ??
        ""
      ).toUpperCase();
      const action =
        actionRaw === "BUY" || actionRaw === "SELL"
          ? (actionRaw as OptionLeg["action"])
          : "BUY";
      const quantity = Number(
        leg?.quantity ??
          leg?.units ??
          leg?.total_quantity ??
          order.total_quantity ??
          1
      );
      return {
        type: parsed.type,
        action,
        strike: parsed.strike,
        expiration: parsed.expiration,
        quantity,
      };
    };

    const legs: OptionLeg[] = (
      rawLegs.length
        ? rawLegs.map(toOptionLeg).filter(Boolean)
        : [
            toOptionLeg({
              action: order.action,
              total_quantity: Number(order.total_quantity),
              option_symbol: { ticker: order.option_symbol?.ticker },
            } as RawOrderLeg),
          ]
    ).filter(Boolean) as OptionLeg[];

    if (legs.length > 0) {
      const rows = legs.map((leg) => ({
        action:
          leg.action === "BUY"
            ? chalk.green(leg.action)
            : chalk.red(leg.action),
        qty: String(leg.quantity),
        type: leg.type,
        strike: Number(leg.strike).toLocaleString("en-US", {
          style: "currency",
          currency,
        }),
        exp: leg.expiration,
      }));
      const widths = {
        action: Math.max(3, ...rows.map((r) => r.action.length)),
        qty: Math.max(1, ...rows.map((r) => r.qty.length)),
        type: Math.max(4, ...rows.map((r) => r.type.length)),
        strike: Math.max(2, ...rows.map((r) => r.strike.length)),
        exp: Math.max(8, ...rows.map((r) => r.exp.length)),
      };
      const makeLine = (r: (typeof rows)[number]) =>
        [
          r.action.padEnd(widths.action),
          r.qty.padStart(widths.qty),
          r.type.padEnd(widths.type),
          r.strike.padStart(widths.strike),
          r.exp.padEnd(widths.exp),
        ].join("  ");
      logLine("🧩", "Legs", makeLine(rows[0]));
      for (let i = 1; i < rows.length; i++) {
        logLine("  ", "", makeLine(rows[i]));
      }
    }
  }

  // Fills and execution
  const filled = Number(order.filled_quantity);
  const total = Number(order.total_quantity);
  logLine(
    "🔢",
    isOption ? "Contracts" : "Shares",
    Number(order.total_quantity)
  );
  logLine("📦", "Fills", `${filled}/${total} units filled`);
  if (order.execution_price != null) {
    logLine("💳", "Filled Price", {
      amount: Number(order.execution_price),
      currency,
    });
  }

  printDivider();
}

// Parse OCC-like symbol (YYMMDD + C/P + 8-digit strike), with or without 6-char underlying prefix
function parseOccLike(
  sym: string
): { type: OptionLeg["type"]; strike: number; expiration: string } | undefined {
  if (!sym) return undefined;
  const s = sym.trim();
  let m = s.match(/^(\d{6})([CP])(\d{8})$/i);
  if (!m && s.length >= 15) {
    const trimmed = s.length >= 21 ? s.slice(6) : s;
    m = trimmed.match(/^(\d{6})([CP])(\d{8})$/i) || (undefined as any);
  }
  if (!m) return undefined;
  const [, yymmdd, cp, strikeRaw] = m;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const expiration = `${yyyy}-${mm}-${dd}`;
  const strike = parseInt(strikeRaw, 10) / 1000;
  return {
    type: cp.toUpperCase() === "C" ? "CALL" : "PUT",
    strike,
    expiration,
  };
}
