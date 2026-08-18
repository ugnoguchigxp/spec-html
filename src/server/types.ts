import type { OptionalIntegrations } from "./integrations.js";

export interface StartServerOptions {
  contentRoot: string;
  runtimeRoot: string;
  host: string;
  port: number;
  integrations?: OptionalIntegrations;
}

export interface RunningServer {
  origin: string;
  port: number;
  close(): Promise<void>;
}
