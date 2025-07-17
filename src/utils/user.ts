import os from "os";
import chalk from "chalk";
import { Snaptrade, SnaptradeError } from "snaptrade-typescript-sdk";
import { getSettings, saveSettings } from "./settings.ts";

export type User = {
  userId: string;
  userSecret: string;
};

export async function loadOrRegisterUser(snaptrade: Snaptrade): Promise<User> {
  const settings = getSettings();

  if (settings.userId && settings.userSecret) {
    return {
      userId: settings.userId,
      userSecret: settings.userSecret,
    };
  }

  console.log(
    chalk.yellow("🔐 No user found in settings. Creating new SnapTrade user...")
  );

  const userId = `snaptrade-cli-${os.userInfo().username}`;

  async function register() {
    const response = await snaptrade.authentication.registerSnapTradeUser({
      userId,
    });
    console.log(chalk.green(`✅ User created: ${response.data.userId}`));
    saveSettings({
      userId: response.data.userId,
      userSecret: response.data.userSecret,
    });

    return {
      userId: response.data.userId!,
      userSecret: response.data.userSecret!,
    };
  }

  try {
    return await register();
  } catch (error: unknown) {
    if (error instanceof SnaptradeError) {
      if ((error.responseBody as Record<string, unknown>)["code"] === "1010") {
        // User already exists. This is possible if the user has run the CLI before but the settings were cleared.
        // Delete the user and recreate it
        console.warn(
          chalk.yellow(
            "⚠️ User already exists. Deleting and recreating the user..."
          )
        );
        await snaptrade.authentication.deleteSnapTradeUser({
          userId,
        });
        return register();
      }
    }
    throw error;
  }
}
