import chalk from "chalk";
import stringWidth from "string-width";
import type {
  Account,
  AccountOrderRecord,
  Balance,
} from "snaptrade-typescript-sdk";
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
  timeInForce,
  currency,
}: {
  action: "BUY" | "SELL";
  orderType: string;
  limitPrice?: number;
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
  logLine("📈", "Ticker", symbol);
  printOrderParams({
    action: order.action as "BUY" | "SELL",
    orderType: order.order_type!,
    limitPrice: Number(order.limit_price) ?? undefined,
    timeInForce: order.time_in_force || order.tif,
    currency,
  });

  const filled = Number(order.filled_quantity);
  const total = Number(order.total_quantity);
  logLine("🔢", "Shares", Number(order.total_quantity));
  logLine("📦", "Fills", `${filled}/${total} units filled`);
  if (order.execution_price != null) {
    logLine("💳", "Filled Price", {
      amount: Number(order.execution_price),
      currency,
    });
  }

  printDivider();
}
