import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  createHostPolicy,
  HostPolicyConfigurationError,
  normalizeConfiguredHostname,
  requestOriginMatches,
  validateRequestHost,
} from "../../src/server/host-policy.js";

describe("host policy", () => {
  it("allows the loopback hostnames for a loopback bind", () => {
    const policy = createHostPolicy("127.0.0.1");

    expect([...policy.allowedHosts].sort()).toEqual([
      "127.0.0.1",
      "::1",
      "localhost",
    ]);
    expect(policy.browserHost).toBe("127.0.0.1");
    expect(policy.mutationOriginRequired).toBe(false);
    expect(() => createHostPolicy("localhost", ["viewer.example"])).toThrow(
      "loopback hostでは--allowed-hostを指定できません",
    );
  });

  it("uses only explicit hostnames and the bind hostname for a concrete bind", () => {
    const policy = createHostPolicy("192.0.2.10", ["viewer.example"]);

    expect([...policy.allowedHosts].sort()).toEqual([
      "192.0.2.10",
      "viewer.example",
    ]);
    expect(policy.mutationOriginRequired).toBe(true);
  });

  it("requires an explicit hostname for a wildcard bind", () => {
    expect(() => createHostPolicy("0.0.0.0")).toThrow(
      HostPolicyConfigurationError,
    );
    expect(createHostPolicy("::", ["viewer.local"])).toMatchObject({
      browserHost: "viewer.local",
      mutationOriginRequired: true,
    });
  });

  it.each([
    ["LOCALHOST.", "localhost"],
    ["[::1]", "::1"],
    ["0:0:0:0:0:0:0:1", "::1"],
    ["xn--r8jz45g.xn--zckzah", "xn--r8jz45g.xn--zckzah"],
  ])("normalizes configured hostname %s", (value, expected) => {
    expect(normalizeConfiguredHostname(value)).toBe(expected);
  });

  it.each(["", "localhost:4173", "http://localhost", "user@localhost", "a,b"])(
    "rejects a configured authority instead of a hostname: %s",
    (value) => {
      expect(() => normalizeConfiguredHostname(value)).toThrow(
        HostPolicyConfigurationError,
      );
    },
  );

  it("recognizes an expanded IPv6 wildcard bind", () => {
    expect(() => createHostPolicy("0:0:0:0:0:0:0:0")).toThrow(
      "wildcard hostには--allowed-host",
    );
  });

  it("falls back to raw headers when headersDistinct is unavailable", () => {
    const policy = createHostPolicy("127.0.0.1");
    const request = requestWithRawHeaders([
      "Host",
      "localhost:4173",
      "Origin",
      "http://localhost:4173",
    ]);

    expect(validateRequestHost(request, policy)).toEqual({
      status: "allowed",
      origin: "http://localhost:4173",
    });
    expect(requestOriginMatches(request, "http://localhost:4173")).toBe(true);
    expect(
      requestOriginMatches(
        requestWithRawHeaders(["Host", "localhost:4173"]),
        "http://localhost:4173",
        true,
      ),
    ).toBe(false);
  });

  it("rejects duplicate security headers through the raw-header fallback", () => {
    const policy = createHostPolicy("127.0.0.1");
    const duplicateHosts = requestWithRawHeaders([
      "Host",
      "localhost:4173",
      "Host",
      "127.0.0.1:4173",
    ]);
    const duplicateOrigins = requestWithRawHeaders([
      "Origin",
      "http://localhost:4173",
      "Origin",
      "http://127.0.0.1:4173",
    ]);

    expect(validateRequestHost(duplicateHosts, policy)).toEqual({
      status: "invalid",
    });
    expect(requestOriginMatches(duplicateOrigins, "http://localhost:4173")).toBe(
      false,
    );
  });
});

function requestWithRawHeaders(rawHeaders: string[]): IncomingMessage {
  return { rawHeaders } as IncomingMessage;
}
