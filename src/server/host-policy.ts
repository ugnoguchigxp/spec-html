import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

export class HostPolicyConfigurationError extends Error {
  override name = "HostPolicyConfigurationError";
}

export interface HostPolicy {
  readonly allowedHosts: ReadonlySet<string>;
  readonly browserHost: string;
}

export type RequestHostValidation =
  | { readonly status: "allowed"; readonly origin: string }
  | { readonly status: "invalid" }
  | { readonly status: "disallowed" };

export function createHostPolicy(
  bindHost: string,
  allowedHosts: readonly string[] = [],
): HostPolicy {
  const normalizedBindHost = normalizeConfiguredHostname(bindHost, "host");
  const normalizedAllowedHosts = allowedHosts.map((host) =>
    normalizeConfiguredHostname(host, "allowed-host"),
  );

  if (WILDCARD_HOSTS.has(normalizedBindHost)) {
    if (normalizedAllowedHosts.length === 0) {
      throw new HostPolicyConfigurationError(
        "wildcard hostには--allowed-hostを1つ以上指定してください",
      );
    }
    return {
      allowedHosts: new Set(normalizedAllowedHosts),
      browserHost: normalizedAllowedHosts[0]!,
    };
  }

  if (
    LOOPBACK_HOSTS.includes(
      normalizedBindHost as (typeof LOOPBACK_HOSTS)[number],
    )
  ) {
    if (normalizedAllowedHosts.length > 0) {
      throw new HostPolicyConfigurationError(
        "loopback hostでは--allowed-hostを指定できません",
      );
    }
    const hosts = new Set<string>();
    for (const loopbackHost of LOOPBACK_HOSTS) {
      hosts.add(loopbackHost);
    }
    return { allowedHosts: hosts, browserHost: normalizedBindHost };
  }
  const hosts = new Set<string>(normalizedAllowedHosts);
  hosts.add(normalizedBindHost);
  return { allowedHosts: hosts, browserHost: normalizedBindHost };
}

export function normalizeConfiguredHostname(
  value: string,
  optionName: "host" | "allowed-host" = "host",
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HostPolicyConfigurationError(
      `${optionName}を空にすることはできません`,
    );
  }

  const directIp = normalizeIpLiteral(trimmed);
  if (directIp !== null) {
    return directIp;
  }
  if (trimmed.includes(":") || /[\s,@/?#\\]/u.test(trimmed)) {
    throw invalidHostname(optionName, value);
  }

  let url: URL;
  try {
    url = new URL(`http://${trimmed}`);
  } catch {
    throw invalidHostname(optionName, value);
  }
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw invalidHostname(optionName, value);
  }
  const hostname = stripIpv6Brackets(url.hostname)
    .toLowerCase()
    .replace(/\.$/u, "");
  if (hostname.length === 0) {
    throw invalidHostname(optionName, value);
  }
  return hostname;
}

export function validateRequestHost(
  request: IncomingMessage,
  policy: HostPolicy,
): RequestHostValidation {
  const hostValues = getDistinctHeaderValues(request, "host");
  if (hostValues.length !== 1) {
    return { status: "invalid" };
  }
  const authority = parseRequestAuthority(hostValues[0]!);
  if (authority === null) {
    return { status: "invalid" };
  }
  if (!policy.allowedHosts.has(authority.hostname)) {
    return { status: "disallowed" };
  }
  return { status: "allowed", origin: authority.origin };
}

export function requestOriginMatches(
  request: IncomingMessage,
  requestOrigin: string,
): boolean {
  const origins = getDistinctHeaderValues(request, "origin");
  if (origins.length === 0) {
    return true;
  }
  if (origins.length !== 1) {
    return false;
  }
  try {
    const origin = new URL(origins[0]!);
    return (
      (origin.protocol === "http:" || origin.protocol === "https:") &&
      origin.origin === requestOrigin
    );
  } catch {
    return false;
  }
}

function getDistinctHeaderValues(
  request: IncomingMessage,
  name: string,
): readonly string[] {
  const distinctValues = request.headersDistinct?.[name];
  if (distinctValues !== undefined) {
    return distinctValues;
  }

  const values: string[] = [];
  for (let index = 0; index + 1 < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1]!);
    }
  }
  return values;
}

function parseRequestAuthority(
  value: string,
): { readonly hostname: string; readonly origin: string } | null {
  if (value.length === 0 || /[\s,@/?#\\]/u.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(`http://${value}`);
  } catch {
    return null;
  }
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    return null;
  }
  const hostname = stripIpv6Brackets(url.hostname)
    .toLowerCase()
    .replace(/\.$/u, "");
  if (hostname.length === 0) {
    return null;
  }
  return { hostname, origin: url.origin };
}

function normalizeIpLiteral(value: string): string | null {
  const unwrapped = stripIpv6Brackets(value).toLowerCase();
  const version = isIP(unwrapped);
  if (version === 0) {
    return null;
  }
  const authority = version === 6 ? `[${unwrapped}]` : unwrapped;
  return stripIpv6Brackets(new URL(`http://${authority}`).hostname);
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

function invalidHostname(
  optionName: "host" | "allowed-host",
  value: string,
): HostPolicyConfigurationError {
  return new HostPolicyConfigurationError(
    `${optionName}はportやpathを含まないhostnameで指定してください: ${value}`,
  );
}
