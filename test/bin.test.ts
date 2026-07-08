import { execFile } from "child_process";
import { promisify } from "util";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { useIsolatedConfigHome } from "./helpers/cli.ts";

const execFileAsync = promisify(execFile);

describe("CLI invocation", () => {
  it("prints help for the real CLI entry without prompting or network calls", async () => {
    const configHome = useIsolatedConfigHome();

    const { stdout } = await execFileAsync("node", ["src/main.ts", "--help"], {
      cwd: process.cwd(),
      env: { ...process.env, XDG_CONFIG_HOME: configHome },
    });

    expect(stdout).toContain("CLI tool to interact with SnapTrade API");
    expect(stdout).toContain("connect");
    expect(stdout).toContain("positions");
    expect(stdout).toContain("trade");
    expect(stdout).toContain("profiles");
  });

  it("prints the package version for the real CLI entry", async () => {
    const configHome = useIsolatedConfigHome();

    const { stdout } = await execFileAsync("node", ["src/main.ts", "--version"], {
      cwd: process.cwd(),
      env: { ...process.env, XDG_CONFIG_HOME: configHome },
    });

    expect(stdout.trim()).toBe(packageJson.version);
  });

  it("keeps the bin wrapper runnable for non-interactive help", async () => {
    const configHome = useIsolatedConfigHome();

    await expect(
      execFileAsync("node", ["bin/snaptrade.js", "--help"], {
        cwd: process.cwd(),
        env: { ...process.env, XDG_CONFIG_HOME: configHome },
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("advertises the generated man page in package metadata", () => {
    expect(packageJson.man).toBe("./man/snaptrade.1");
    expect(packageJson.files).toContain("man");
  });
});
