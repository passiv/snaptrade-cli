import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import type {
  MlegActionStrict,
  MlegInstrumentType,
} from "snaptrade-typescript-sdk";
import { Snaptrade, type Account } from "snaptrade-typescript-sdk";
import { generateOccSymbol } from "../../../utils/generateOccSymbol.ts";
import { selectAccount } from "../../../utils/selectAccount.ts";
import { handlePostTrade } from "../../../utils/trading.ts";
import { loadOrRegisterUser } from "../../../utils/user.ts";
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
  strike: string;
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
};

export async function processCommonOptionArgs(
  snaptrade: Snaptrade,
  command: any
): Promise<TradeArgs> {
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

  return {
    account: selectedAccount,
    ticker,
    orderType: orderTypeInput,
    limitPrice,
    action,
    quantity,
    tif,
  };
}

export async function confirmTrade(
  account: Account,
  ticker: string,
  legs: Leg[],
  limitPrice: string | undefined,
  orderType: string,
  action: string,
  tif: string
) {
  const trade = {
    accountId: account.id,
    account: `${account.name} - ${account.balance.total?.amount?.toLocaleString(
      "en-US",
      {
        style: "currency",
        currency: account.balance.total.currency,
      }
    )}`,
    ticker,
    legs: legs.map(
      (leg) =>
        `${leg.action.padEnd(4)} ${leg.quantity} ${generateOccSymbol(ticker, leg.expiration, leg.strike, leg.type)}`
    ),
    action,
    orderType,
    timeInForce: tif,
    limitPrice,
  };

  console.log(trade);

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

  const { ticker, orderType, limitPrice, action, quantity, tif, account } =
    trade;
  const legsInput = legs.map((leg) => ({
    instrument: {
      instrument_type: "OPTION" as MlegInstrumentType,
      symbol: generateOccSymbol(ticker, leg.expiration, leg.strike, leg.type),
    },
    action: `${leg.action}_TO_OPEN` as MlegActionStrict,
    units: leg.quantity,
  }));

  await confirmTrade(account, ticker, legs, limitPrice, orderType, action, tif);

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
