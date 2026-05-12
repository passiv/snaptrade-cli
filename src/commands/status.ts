import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { loadOrRegisterUser } from "../utils/user.ts";
import { getActiveProfileName, getProfile } from "../utils/settings.ts";

export function statusCommand(snaptrade: Snaptrade): Command {
  return new Command("status")
    .description("Get current status of your SnapTrade authentication")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);
      console.log(`Using profile ${chalk.green(getActiveProfileName())}`);
      const profile = getProfile();
      if (profile.authMode === "oauth") {
        const oauthEmail =
          profile.oauthEmail ||
          (profile.oauthSubject?.includes("@") ? profile.oauthSubject : null);
        console.log("Authentication: Personal SnapTrade OAuth");
        if (oauthEmail) {
          console.log(`SnapTrade email: ${chalk.green(oauthEmail)}`);
        }
        return;
      }

      console.log(`Logged in as ${chalk.green(user.userId)}`);
      const response = await snaptrade.referenceData.getPartnerInfo();
      console.log("Client ID:", chalk.green(response.data.slug));
      console.log("API credentials ✅");
      console.log(
        `Trading access ${response.data.can_access_trades ? "✅" : "❌"}`,
      );
    });
}
