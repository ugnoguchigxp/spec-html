import { sortNavigation } from "./navigation.js";
import type {
  SortDirection,
  SortPreference,
  ViewerElements,
} from "./types.js";

export class SortController {
  preference: SortPreference = "name";
  direction: SortDirection = "ascending";

  constructor(private readonly elements: ViewerElements) {
    this.updateButtons();
    for (const preference of ["name", "date"] as const) {
      elements.sortButtons[preference].addEventListener("click", () => {
        if (this.preference === preference) {
          this.direction = this.direction === "ascending"
            ? "descending"
            : "ascending";
        } else {
          this.preference = preference;
          this.direction = preference === "date" ? "descending" : "ascending";
        }
        this.apply();
      });
    }
  }

  apply(): void {
    sortNavigation(
      this.elements.navigation,
      this.preference,
      this.direction,
    );
    this.updateButtons();
  }

  private updateButtons(): void {
    for (const value of ["name", "date"] as const) {
      const button = this.elements.sortButtons[value];
      const isActive = value === this.preference;
      const label = value === "name" ? "Name" : "Date";
      button.setAttribute("aria-pressed", String(isActive));
      button.textContent = isActive
        ? `${label} ${this.direction === "ascending" ? "↑" : "↓"}`
        : label;
      button.setAttribute(
        "aria-label",
        isActive
          ? `${label}, ${this.direction}`
          : `Sort by ${label.toLowerCase()}`,
      );
      if (isActive) {
        button.title = "Reverse sort order";
      } else {
        button.removeAttribute("title");
      }
    }
  }
}
