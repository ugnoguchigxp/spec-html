import { describe, expect, it } from "vitest";
import { messageForCliError } from "../../src/cli/errors.js";
import { CliUsageError } from "../../src/cli/options.js";

describe("messageForCliError", () => {
  it("formats usage errors in English", () => {
    expect(messageForCliError(new CliUsageError("unknown option"))).toBe(
      "Invalid arguments: unknown option",
    );
  });

  it("formats an occupied port without exposing the Node.js error", () => {
    const error = Object.assign(new Error("listen EADDRINUSE"), {
      code: "EADDRINUSE",
      port: 4173,
    });
    expect(messageForCliError(error)).toBe("Port is unavailable: 4173");
  });

  it("keeps ordinary error messages", () => {
    expect(messageForCliError(new Error("失敗しました"))).toBe("失敗しました");
  });
});
