import chalk from "chalk";
import { Command } from "commander";
import { revokeOAuthTokensForProfile } from "../utils/oauth.ts";
import {
  clearProfileFields,
  getActiveProfileName,
  getProfile,
} from "../utils/settings.ts";

export function logoutCommand(): Command {
  return new Command("logout")
    .description("Sign out of the active Personal OAuth profile")
    .action(async () => {
      const profile = getProfile();
      if (profile.authMode !== "oauth") {
        console.log("The active profile does not use SnapTrade OAuth.");
        return;
      }

      let revoked = true;
      try {
        await revokeOAuthTokensForProfile(profile);
      } catch {
        revoked = false;
      }

      clearProfileFields([
        "oauthAccessToken",
        "oauthRefreshToken",
        "oauthExpiresAt",
        "oauthScope",
        "oauthSubject",
        "oauthEmail",
        "lastAccountId",
      ]);

      console.log(
        `Signed out of OAuth profile ${chalk.green(getActiveProfileName())}.`,
      );
      if (!revoked) {
        console.warn(
          chalk.yellow(
            "Local credentials were cleared, but SnapTrade token revocation could not be confirmed.",
          ),
        );
      }
    });
}
