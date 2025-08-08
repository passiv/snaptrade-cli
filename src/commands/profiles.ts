import chalk from "chalk";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import {
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  setActiveProfile,
} from "../utils/settings.ts";

export function profilesCommand(snaptrade: Snaptrade): Command {
  const cmd = new Command("profiles").description(
    "Manage SnapTrade CLI profiles"
  );

  cmd
    .command("list")
    .description("List available profiles")
    .action(() => {
      const active = getActiveProfileName();
      const names = listProfiles();
      if (names.length === 0) {
        console.log("No profiles found.");
        return;
      }
      for (const name of names) {
        const mark = name === active ? chalk.green("*") : " ";
        console.log(`${mark} ${name}`);
      }
    });

  cmd
    .command("use <name>")
    .description("Switch active profile (creates it if it doesn't exist)")
    .action(async (name: string, opts: { register?: boolean }) => {
      setActiveProfile(name);
      console.log(`Active profile set to ${chalk.green(name)}`);
    });

  cmd
    .command("delete <name>")
    .description("Delete a profile locally")
    .action((name: string) => {
      deleteProfile(name);
      const nextActive = getActiveProfileName();
      console.log(
        `Deleted profile ${chalk.red(name)}. Active profile: ${chalk.green(nextActive)}.`
      );
    });

  return cmd;
}
