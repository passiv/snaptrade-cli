import { Command } from "commander";
import { loginWithDeviceOAuth, loginWithOAuth } from "../utils/oauth.ts";

export function loginCommand(): Command {
  return new Command("login")
    .description("Sign in to the active profile with Personal SnapTrade OAuth")
    .option(
      "--use-device-code",
      "Sign in using a code in any browser (read-only, suitable for SSH and containers)",
    )
    .action(async (options: { useDeviceCode?: boolean }, command: Command) => {
      try {
        if (options.useDeviceCode) {
          await loginWithDeviceOAuth();
        } else {
          await loginWithOAuth();
        }
      } catch (error) {
        command.error(
          error instanceof Error ? error.message : "OAuth login failed.",
        );
      }
    });
}
