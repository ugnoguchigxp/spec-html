export const THEME_STORAGE_KEY = "spec-html-theme";

export type ThemePreference = "light" | "system" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "system",
  "dark",
];

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this page when storage is unavailable.
  }
}

export function applyThemePreference(
  root: HTMLElement,
  preference: ThemePreference,
): void {
  if (preference === "system") {
    delete root.dataset.theme;
    return;
  }
  root.dataset.theme = preference;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "system" || value === "dark";
}
