#!/usr/bin/env node

import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const devPath = join(__dirname, "../src/main.ts");
const prodPath = join(__dirname, "../dist/main.js");

const isDev = existsSync(devPath);

// Choose which file to run
const entry = isDev ? devPath : prodPath;

// Spawn the child process with the correct entry
const child = spawn("node", [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", process.exit);
