import os from "os";
import chalk from "chalk";
import { SnaptradeError } from "snaptrade-typescript-sdk";
import { getActiveProfileName, getProfile, saveProfile } from "./settings.ts";
import { printSetupIntro, promptAuthMode } from "./authPrompt.ts";
import { ensureOAuthLogin } from "./oauth.ts";
import type { SnaptradeClient } from "./snaptradeClient.ts";

export type User =
  | {
      userId: string;
      userSecret: string;
    }
  | {
      userId?: undefined;
      userSecret?: undefined;
    };

export async function loadOrRegisterUser(
  snaptrade: SnaptradeClient,
): Promise<User> {
  const profile = getProfile();

  if (profile.authMode === "oauth") {
    await ensureOAuthLogin();
    return {};
  }

  if (profile.authMode === "apiKey" && profile.accountType === "personal") {
    return {};
  }

  if (!profile.authMode && !profile.clientId && !profile.consumerKey) {
    printSetupIntro();
    const authChoice = await promptAuthMode();
    saveProfile(authChoice);

    if (authChoice.authMode === "oauth") {
      await ensureOAuthLogin();
      return {};
    }

    if (authChoice.accountType === "personal") {
      return {};
    }
  }

  if (profile.userId && profile.userSecret) {
    return {
      userId: profile.userId,
      userSecret: profile.userSecret,
    };
  }

  console.log(
    chalk.yellow(
      "🔐 No user found in settings. Creating new SnapTrade user...",
    ),
  );

  const activeProfile = getActiveProfileName();
  const suffix =
    activeProfile && activeProfile !== "default" ? `-${activeProfile}` : "";
  const userId = `snaptrade-cli-${os.userInfo().username}${suffix}`;

  async function register() {
    const response = await snaptrade.authentication.registerSnapTradeUser({
      userId,
    });
    console.log(chalk.green(`✅ User created: ${response.data.userId}`));
    saveProfile({
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
            "⚠️ User already exists. Deleting and recreating the user...",
          ),
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
