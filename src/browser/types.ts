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
  title: HTMLSpanElement;
  sidebar: HTMLElement;
  status: HTMLDivElement;
  frame: HTMLIFrameElement;
}

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
