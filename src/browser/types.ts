import type { ThemePreference } from "./theme.js";

export interface RouteState {
  doc: string | null;
  hash: string;
}

export type RouteParseResult =
  | { kind: "missing"; route: RouteState }
  | { kind: "valid"; route: RouteState & { doc: string } }
  | { kind: "invalid"; rawDoc: string; hash: string };

export interface ViewerElements {
  root: HTMLDivElement;
  menuButton: HTMLButtonElement;
  documentModeButton: HTMLButtonElement;
  sourceDialog: HTMLDialogElement;
  sourceDialogCode: HTMLPreElement;
  sourceDialogCloseButton: HTMLButtonElement;
  sortButtons: Record<SortPreference, HTMLButtonElement>;
  themeButtons: Record<ThemePreference, HTMLButtonElement>;
  sidebar: HTMLElement;
  navigation: HTMLDivElement;
  status: HTMLDivElement;
  frame: HTMLIFrameElement;
}

export type SortPreference = "name" | "date";
export type SortDirection = "ascending" | "descending";

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; doc: string }
  | { kind: "ready"; doc: string; title: string }
  | { kind: "error"; doc: string | null; message: string };

export interface NavigationItem {
  anchor: HTMLAnchorElement;
  doc: string;
  hash: string;
}
