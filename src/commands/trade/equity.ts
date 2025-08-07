import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import type {
  Account,
  Balance,
  SymbolsQuotesInner,
} from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../../utils/selectAccount.ts";
import { handlePostTrade } from "../../utils/trading.ts";
import { loadOrRegisterUser } from "../../utils/user.ts";

type TradePreviewParams = {
  account: Account;
  ticker: string;
  action: "BUY" | "SELL";
  quantity?: number;
  notional?: number;
  orderType: string;
  limitPrice?: number;
  timeInForce: string;
  quote?: SymbolsQuotesInner;
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
      } else if (quote?.last_trade_price != null) {
        return quantity * quote.last_trade_price;
      }
    }
  })();

  const estimatedQty = (() => {
    if (notional !== undefined) {
      if (limitPrice != null) {
        return notional / limitPrice;
      } else if (
        quote?.last_trade_price != null &&
        quote.last_trade_price !== 0
      ) {
        return notional / quote.last_trade_price;
      }
    }
  })();

  console.log(chalk.bold("\n📄 Trade Preview\n"));

  function logLine(
    icon: string,
    label: string,
    value:
      | string
      | number
      | { amount: number | undefined; currency: string | undefined }
      | undefined
  ) {
    if (value == null) {
      return;
    }
    if (
      typeof value === "object" &&
      "amount" in value &&
      value.amount == null
    ) {
      return;
    }
    console.log(
      `  ${icon} ${chalk.bold(label.padEnd(15))} ${typeof value === "string" || typeof value === "number" ? value : `${value.amount!.toLocaleString("en-US", { style: "currency", currency: value.currency })}`}`
    );
  }
  const currency = account.balance.total?.currency;
  logLine("🏦", "Account", account.name!);
  logLine("💰", "Total Value", {
    amount: account.balance.total?.amount!,
    currency,
  });
  logLine("💰", "Cash", {
    amount: balance.cash!,
    currency: balance.currency?.code,
  });
  logLine("💰", "Buying Power", {
    amount: balance.buying_power!,
    currency: balance.currency?.code,
  });
  console.log();
  logLine("📈", "Ticker", ticker);
  if (quote != null) {
    logLine(
      "💵",
      "Quote",
      `Bid: ${quote.bid_price?.toLocaleString("en-US", {
        style: "currency",
        currency: quote.symbol?.currency.code,
      })} x${quote.bid_size} · Ask: ${quote.ask_price?.toLocaleString("en-US", {
        style: "currency",
        currency: quote.symbol?.currency.code,
      })} x${quote.ask_size} · Last: ${quote.last_trade_price?.toLocaleString(
        "en-US",
        {
          style: "currency",
          currency: quote.symbol?.currency.code,
        }
      )}`
    );
  }

  logLine(
    "🛒",
    "Action",
    action === "BUY" ? chalk.green(action) : chalk.red(action)
  );
  logLine("🔢", "Shares", quantity);
  logLine("💵", "Dollars", { amount: notional, currency });
  logLine("💡", "Order Type", orderType);
  logLine("🎯", "Limit Price", { amount: limitPrice, currency });
  logLine("⏳", "Time in Force", timeInForce);

  console.log();

  if (quantity != null) {
    logLine("📊", `Est. ${action === "BUY" ? "Cost  " : "Credit"}`, {
      amount: estimatedAmount,
      currency: account.balance.total?.currency,
    });
  }
  if (notional != null) {
    logLine("📊", "Est. Shares", estimatedQty);
  }
  console.log(
    chalk.gray("\n-----------------------------------------------------")
  );
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

      const [quoteResponse, balanceResponse] = await Promise.all([
        snaptrade.trading.getUserAccountQuotes({
          ...user,
          accountId: account.id,
          symbols: ticker,
          useTicker: true,
        }),
        snaptrade.accountInformation.getUserAccountBalance({
          ...user,
          accountId: account.id,
        }),
      ]);

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
        quote: quoteResponse.data[0],
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

      // TODO Switch to placeSimpleOrder once it's ready

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
          brokerageOrderId: replace,
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
