import fs from "fs";
import os from "os";
import path from "path";

const CONFIG_ROOT =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const CONFIG_DIR = path.join(CONFIG_ROOT, "snaptrade");
export const CONFIG_FILE = path.join(CONFIG_DIR, "settings.json");

export type ProfileData = {
  // Per-profile API credentials
  clientId?: string;
  consumerKey?: string;
  // Per-profile user and local prefs
  userId?: string;
  userSecret?: string;
  lastAccountId?: string;
  basePath?: string;
};

export interface Settings {
  // Profiles support
  activeProfile?: string; // name of the selected profile
  profiles?: Record<string, ProfileData>;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getSettings(): Settings {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed: Settings = JSON.parse(raw);
    return parsed;
  } catch {
    return {};
  }
}

function saveSettings(updates: Partial<Settings>) {
  const current = getSettings();
  const newSettings = { ...current, ...updates } as Settings;

  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newSettings, null, 2));
}

export function getActiveProfileName(): string {
  const settings = getSettings();
  return settings.activeProfile || "default";
}

export function listProfiles(): string[] {
  const settings = getSettings();
  const names = Object.keys(settings.profiles || {});
  // Ensure default is always present (even if not created yet)
  return Array.from(new Set(["default", ...names]));
}

export function getProfile(name?: string): ProfileData {
  const settings = getSettings();
  const profileName = name || getActiveProfileName();
  return (settings.profiles && settings.profiles[profileName]) || {};
}

export function saveProfile(updates: Partial<ProfileData>): void {
  const settings = getSettings();
  const profiles = { ...(settings.profiles || {}) };
  const profileName = getActiveProfileName();
  const existing = profiles[profileName] || {};
  profiles[profileName] = { ...existing, ...updates };
  saveSettings({ profiles });
}

export function setActiveProfile(profileName: string): void {
  // Ensure profiles map exists and the named profile exists (empty ok)
  const settings = getSettings();
  const profiles = { ...(settings.profiles || {}) };
  if (!profiles[profileName]) {
    profiles[profileName] = {};
  }
  saveSettings({ activeProfile: profileName, profiles });
}

export function deleteProfile(profileName: string): void {
  const settings = getSettings();
  const profiles = { ...(settings.profiles || {}) };
  delete profiles[profileName];

  let activeProfile = settings.activeProfile;
  if (activeProfile === profileName) {
    const remaining = Object.keys(profiles);
    activeProfile = remaining[0] || "default";
  }
  saveSettings({ profiles, activeProfile });
}
