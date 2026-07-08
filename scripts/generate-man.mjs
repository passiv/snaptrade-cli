import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await readFile("package.json", "utf-8"));

const { stdout: helpOutput } = await execFileAsync(
  process.execPath,
  ["dist/main.js", "--help"],
  {
    env: {
      ...process.env,
      SNAPTRADE_GENERATING_MANPAGE: "1",
    },
  },
);

function escapeGroffText(text) {
  return text
    .replace(/\\/g, "\\e")
    .split("\n")
    .map((line) => (line.startsWith(".") || line.startsWith("'") ? `\\&${line}` : line))
    .join("\n");
}

const escapedHelpOutput = escapeGroffText(helpOutput.trimEnd());

const manPage = String.raw`.TH SNAPTRADE 1 "" "" "User Commands"
.SH NAME
snaptrade \- CLI tool to interact with SnapTrade API
.SH SYNOPSIS
.B snaptrade
.RI [ options ]
.RI [ command ]
.SH DESCRIPTION
.nf
${escapedHelpOutput}
.fi
.SH SEE ALSO
.BR snaptrade\ --help
`;

await writeFile("man/snaptrade.1", manPage);
