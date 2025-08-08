import chalk from "chalk";
import type { Account, Balance } from "snaptrade-typescript-sdk";

export type PrintableValue =
  | string
  | number
  | { amount?: number; currency?: string }
  | undefined;

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
  console.log(`  ${icon} ${chalk.bold(label.padEnd(15))} ${formatted}`);
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
