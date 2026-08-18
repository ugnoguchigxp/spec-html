export const THEME_STORAGE_KEY = "spec-html-theme";

export type ThemePreference = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
];

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : defaultThemePreference();
  } catch {
    return defaultThemePreference();
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
  root.dataset.theme = preference;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
}

function defaultThemePreference(): ThemePreference {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
