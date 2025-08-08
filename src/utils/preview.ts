import chalk from "chalk";

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
