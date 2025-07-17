import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import chalk from "chalk";

export function statusCommand(snaptrade: Snaptrade): Command {
  return new Command("status")
    .description(
      "Check the current status of the Snaptrade API with your API credentials"
    )
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      console.log(`Logged in as ${chalk.green(user.userId)}`);
      const response = await snaptrade.referenceData.getPartnerInfo();
      console.log("API credentials ✅");
      console.log(
        `Trading access ${response.data.can_access_trades ? "✅" : "❌"}`
      );
    });
}
