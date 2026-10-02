import WebsiteSettings from "../config/Settings.js";

type Settings = typeof WebsiteSettings;

export default function requireSettings(): Settings;
export default function requireSettings<K extends keyof Settings>(section: K): Settings[K];
export default function requireSettings<K extends keyof Settings>(section?: K) {
  return section === undefined ? WebsiteSettings : WebsiteSettings[section];
}

export function getPublicSettings() {
  const publicSettings: Record<string, Record<string, unknown>> = {};

  for (const [section, values] of Object.entries(WebsiteSettings)) {
    publicSettings[section] = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith("_")) {
        publicSettings[section][key.slice(1)] = value;
      }
    }
  }

  return publicSettings;
}
