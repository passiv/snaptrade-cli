import fs from "fs";
import os from "os";
import path from "path";

const CONFIG_ROOT =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const CONFIG_DIR = path.join(CONFIG_ROOT, "snaptrade");
export const CONFIG_FILE = path.join(CONFIG_DIR, "settings.json");

interface Settings {
  clientId?: string;
  consumerKey?: string;
  userId?: string;
  userSecret?: string;
  lastAccountId?: string;
}

export function getSettings(): Settings {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveSettings(updates: Partial<Settings>) {
  const current = getSettings();
  const newSettings = { ...current, ...updates };

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newSettings, null, 2));
}
