import { Separator } from "@inquirer/core";
import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { getProfile, saveProfile } from "./settings.ts";
import { loadOrRegisterUser } from "./user.ts";

const brokers_with_mleg_options = [
  "WEBULL",
  "SCHWAB",
  "TASTYTRADE",
  "ETRADE",
  "ALPACA",
  "ALPACA-PAPER",
  "WEALTHSIMPLETRADE",
  "MOOMOO",
  "TRADESTATION",
];

const brokers_with_crypto = ["COINBASE", "BINANCE", "KRAKEN"];

export async function selectAccount({
  snaptrade,
  context,
  useLastAccount,
}: {
  snaptrade: Snaptrade;
  useLastAccount: boolean;
  context?: "option_trade" | "equity_trade" | "crypto_trade";
}) {
  const user = await loadOrRegisterUser(snaptrade);

  // Skip the selector is the user wants to use the last account and it still exists
  if (useLastAccount) {
    const profile = getProfile();
    const accountId = profile.lastAccountId;
    if (!accountId) {
      console.log("⚠️ No last account found. Falling back to selector.");
    } else {
      try {
        const accountResponse =
          await snaptrade.accountInformation.getUserAccountDetails({
            ...user,
            accountId,
          });
        return accountResponse.data;
      } catch (error) {
        console.log("⚠️ Last account not found. Falling back to selector.");
      }
    }
  }

  const accounts = (await snaptrade.accountInformation.listUserAccounts(user))
    .data;

  // Group accounts by connection so we can display them under their respective brokerages
  const accountsByConnection = accounts.reduce(
    (acc, acct) => {
      if (!acc[acct.brokerage_authorization]) {
        acc[acct.brokerage_authorization] = [];
      }
      acc[acct.brokerage_authorization].push(acct);
      return acc;
    },
    {} as Record<string, typeof accounts>
  );

  const connections = (
    await snaptrade.connections.listBrokerageAuthorizations(user)
  ).data;

  const choices = connections.flatMap((connection) => {
    const accounts = accountsByConnection[connection.id!];
    if (!accounts || accounts.length === 0) {
      return []; // Skip if no accounts for this connection
    }
    return [
      new Separator(chalk.bold(`${connection.brokerage!.name?.toUpperCase()}`)),
      ...accounts.map((acct) => ({
        name: `${acct.name?.padEnd(45)} ${chalk.dim(
          acct.balance.total?.amount?.toLocaleString("en-US", {
            style: "currency",
            currency: acct.balance.total.currency,
          })
        )}`,
        value: acct.id,
        short: acct.name ?? acct.institution_name,
        disabled: (() => {
          // If there's no context, all accounts are valid
          if (!context) return false;
          // If trying to trade, check if the connection is disabled or read-only
          if (context === "equity_trade" || context === "option_trade") {
            if (connection.disabled) return "Connection disabled";
            if (connection.type === "read") return "Read-only connection";
          }
          // For options, check if the brokerage supports multi-leg options
          if (context === "option_trade") {
            if (
              !brokers_with_mleg_options.includes(connection.brokerage!.slug!)
            ) {
              return "Option trading not supported";
            }
          }
          if (context === "crypto_trade") {
            if (!brokers_with_crypto.includes(connection.brokerage!.slug!)) {
              return "Crypto trading not supported";
            }
          }
          return false; // No issues, account is selectable
        })(),
      })),
    ];
  });

  if (
    choices.every(
      (choice) =>
        choice instanceof Separator || ("disabled" in choice && choice.disabled)
    )
  ) {
    console.error(
      `No valid accounts available. Connect an account with ${chalk.green(`snaptrade connect`)} or fix your disabled connections with ${chalk.green(`snaptrade reconnect`)}.`
    );
    process.exit(1);
  }

  const accountId = await select({
    message: "Select an account to use:",
    choices,
    pageSize: 30,
    loop: false,
  });

  saveProfile({
    lastAccountId: accountId,
  });

  const account = accounts.find((acct) => acct.id === accountId);
  if (!account) {
    console.error("Selected account not found.");
    process.exit(1);
  }
  return account;
}
