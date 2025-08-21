import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import type { Account, Balance } from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import {
  logLine,
  printAccountSection,
  printDivider,
  printOrderParams,
} from "../../utils/preview.ts";
import { getFullQuote } from "../../utils/quotes.ts";
import type { Quote } from "../../utils/quotes.ts";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";
import { withDebouncedSpinner } from "../../utils/withDebouncedSpinner.ts";

type TradePreviewParams = {
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

function printTradePreview({
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

export function equityCommand(snaptrade: Snaptrade): Command {
  return new Command("equity")
    .description("Place a simple equity trade with one leg")
    .option(
      "--shares <number>",
      "Number of shares. Either shares or notional must be provided."
    )
    .option(
      "--notional <number>",
      "Notional amount. Either shares or notional must be provided."
    )
    .action(async (opts, command) => {
      const user = await loadOrRegisterUser(snaptrade);

      const { ticker, orderType, limitPrice, action, tif, replace } =
        command.parent.opts();

      const { shares, notional } = opts;

      if (!shares && !notional) {
        console.error("You must provide either --shares or --notional.");
        return;
      }
      const sharesParsed = parseFloat(shares) || undefined;
      const notionalParsed = parseFloat(notional) || undefined;
      const limitPriceParsed = parseFloat(limitPrice) || undefined;

      const account = await selectAccount({
        snaptrade,
        useLastAccount: command.parent.parent.opts().useLastAccount,
        context: "equity_trade",
      });

      const [quote, balanceResponse] = await withDebouncedSpinner(
        "Generating trade preview, please wait...",
        async () =>
          Promise.all([
            getFullQuote(ticker),
            snaptrade.accountInformation.getUserAccountBalance({
              ...user,
              accountId: account.id,
            }),
          ])
      );

      const trade = {
        account,
        accountName: `${account.name} - ${account.balance.total?.amount?.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: account.balance.total.currency,
          }
        )}`,
        ticker,
        quote,
        balance: balanceResponse.data[0], // TODO handle multiple currencies
        action,
        quantity: sharesParsed,
        notional: notionalParsed,
        orderType,
        limitPrice: limitPriceParsed,
        timeInForce: tif,
        replace,
      };

      printTradePreview(trade);

      const result = await confirm({
        message: "Are you sure you want to place this trade?",
      });

      if (!result) {
        console.log("❌ Trade cancelled by user.");
        return;
      }

      if (!replace) {
        const response = await snaptrade.trading.placeForceOrder({
          ...user,
          account_id: account.id,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          time_in_force: tif,
          units: sharesParsed,
          notional_value: notional,
        });

        console.log("✅ Order submitted!");
        handlePostTrade(snaptrade, response, account, user, "trade");
      } else {
        const response = await snaptrade.trading.replaceOrder({
          ...user,
          accountId: account.id,
          brokerage_order_id: replace,
          symbol: ticker,
          action,
          order_type: orderType,
          price: limitPrice,
          time_in_force: tif,
          units: sharesParsed,
          // FIXME This is missing notional value
        });

        console.log("✅ Order replacement submitted!");
        handlePostTrade(snaptrade, response, account, user, "replace");
      }
    });
}
