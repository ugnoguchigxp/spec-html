import { THEME_PREFERENCES } from "./theme.js";
import type { ThemePreference } from "./theme.js";
import type { ViewerElements } from "./types.js";

export function updateThemeButtons(
  elements: ViewerElements,
  preference: ThemePreference,
): void {
  for (const value of THEME_PREFERENCES) {
    elements.themeButtons[value].setAttribute(
      "aria-pressed",
      String(value === preference),
    );
  }
}
