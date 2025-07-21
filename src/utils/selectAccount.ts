import { Separator } from "@inquirer/core";
import { select } from "@inquirer/prompts";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { getSettings, saveSettings } from "./settings.ts";
import { loadOrRegisterUser } from "./user.ts";

const brokers_with_mleg_options = [
  "WEBULL",
  "SCHWAB",
  "TASTYTRADE",
  "ETRADE",
  "ALPACA",
  "ALPACA-PAPER",
];

export async function selectAccount({
  snaptrade,
  context,
  useLastAccount,
}: {
  snaptrade: Snaptrade;
  context: "equity_trade" | "option_trade" | "positions" | "recent-orders" | "balances";
  useLastAccount: boolean;
}) {
  const user = await loadOrRegisterUser(snaptrade);
  const accounts = (await snaptrade.accountInformation.listUserAccounts(user))
    .data;

  // Skip the selector is the user wants to use the last account and it still exists
  if (useLastAccount) {
    const settings = getSettings();
    const accountId = settings.lastAccountId;
    if (!accountId) {
      console.log("⚠️ No last account found. Falling back to selector.");
    } else {
      const account = accounts.find((acct) => acct.id === accountId);
      if (!account) {
        console.log("⚠️ Last account not found. Falling back to selector.");
      } else {
        return account;
      }
    }
  }

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

  const choices = connections.flatMap((connection) => [
    new Separator(`-- ${connection.brokerage!.name} --`),
    ...accountsByConnection[connection.id!]?.map((acct) => ({
      name: `${acct.name} - ${acct.balance.total?.amount?.toLocaleString(
        "en-US",
        {
          style: "currency",
          currency: acct.balance.total.currency,
        }
      )}`,
      value: acct.id,
      disabled:
        context === "option_trade" &&
          !brokers_with_mleg_options.includes(connection.brokerage!.slug!)
          ? "Option trading not supported"
          : connection.disabled
            ? "Connection disabled"
            : connection.type === "read"
              ? "Read-only connection"
              : false,
    })),
  ]);

  const accountId = await select({
    message: "Select an account to use:",
    choices,
    pageSize: 30,
  });

  saveSettings({
    lastAccountId: accountId,
  });

  const account = accounts.find((acct) => acct.id === accountId);
  if (!account) {
    console.error("Selected account not found.");
    process.exit(1);
  }
  return account;
}
