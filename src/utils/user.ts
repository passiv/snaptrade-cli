import chalk from "chalk";
import { Snaptrade } from "snaptrade-typescript-sdk";
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
  const response = await snaptrade.authentication.registerSnapTradeUser({
    userId,
  });

  saveSettings({
    userId: response.data.userId,
    userSecret: response.data.userSecret,
  });

  console.log(chalk.green(`✅ User created: ${response.data.userId}`));
  return {
    userId: response.data.userId!,
    userSecret: response.data.userSecret!,
  };
}
