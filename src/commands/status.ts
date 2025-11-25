import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import { getActiveProfileName } from "../utils/settings.ts";

export function statusCommand(snaptrade: Snaptrade): Command {
  return new Command("status")
    .description("Get current status of your SnapTrade API credentials")
    .action(async () => {
      console.log(`Using profile ${chalk.green(getActiveProfileName())}`);
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
