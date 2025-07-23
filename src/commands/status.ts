import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import chalk from "chalk";
import Table from "cli-table3";

export function statusCommand(snaptrade: Snaptrade): Command {
  return new Command("status")
    .description(
      "Check the current status of the SnapTrade API with your API credentials"
    )
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      console.log(`Logged in as ${chalk.green(user.userId)}`);
      const response = await snaptrade.referenceData.getPartnerInfo();
      console.log("Client ID:", chalk.green(response.data.slug));
      console.log("API credentials ✅");
      console.log(
        `Trading access ${response.data.can_access_trades ? "✅" : "❌"}`
      );
    });
}
