import chalk from "chalk";
import { getProfile } from "./settings.ts";

export function isOAuthProfile(): boolean {
  return getProfile().authMode === "oauth";
}

export function assertApiKeyProfileForWrite(commandName: string): void {
  if (!isOAuthProfile()) return;

  console.error(
    chalk.red(
      `${commandName} requires SnapTrade API-key authentication. Personal OAuth currently grants read access only and cannot be used for trading or write operations.`,
    ),
  );
  process.exit(1);
}
