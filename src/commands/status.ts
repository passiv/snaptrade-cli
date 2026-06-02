import chalk from "chalk";
import { Command } from "commander";
import type { SnaptradeClient } from "../utils/snaptradeClient.ts";
import { loadOrRegisterUser } from "../utils/user.ts";
import { getActiveProfileName, getProfile } from "../utils/settings.ts";

export function statusCommand(snaptrade: SnaptradeClient): Command {
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

      if (profile.authMode === "apiKey" && profile.accountType === "personal") {
        const response = await snaptrade.referenceData.getPartnerInfo();
        console.log(
          "Authentication: Personal SnapTrade client ID and consumer key",
        );
        console.log("Client ID:", chalk.green(response.data.slug));
        console.log("API credentials ✅");
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
