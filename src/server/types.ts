import type { OptionalIntegrations } from "./integrations.js";

export interface StartServerOptions {
  contentRoot: string;
  runtimeRoot: string;
  host: string;
  allowedHosts?: readonly string[];
  port: number;
  markdownLanguage?: string;
  integrations?: OptionalIntegrations;
}

export interface RunningServer {
  origin: string;
  port: number;
  close(): Promise<void>;
}
