import { describe, expect, it } from "vitest";
import {
  createContentUrl,
  createShellUrl,
  documentPathFromContentUrl,
  normalizeDocumentPath,
  parseRoute,
} from "../../src/browser/router.js";

const BASE = new URL("http://127.0.0.1:4173/");

describe("normalizeDocumentPath", () => {
  it.each([
    ["overview.html", "overview.html"],
    ["nested/page.html", "nested/page.html"],
    ["space file.HTML", "space file.HTML"],
    ["plan.md", "plan.md"],
    ["nested/design.Markdown", "nested/design.Markdown"],
    ["日本語.html", "日本語.html"],
    ["", null],
    ["/absolute.html", null],
    ["../outside.html", null],
    ["nested/../page.html", null],
    ["nested//page.html", null],
    ["nested\\page.html", null],
    ["nul\0page.html", null],
    ["asset.svg", null],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeDocumentPath(value)).toBe(expected);
  });
});

describe("route URLs", () => {
  it("parses missing, valid, and invalid routes", () => {
    expect(parseRoute(new URL("http://localhost/"))).toEqual({
      kind: "missing",
      route: { doc: null, hash: "", view: "documents" },
    });
    expect(
      parseRoute(new URL("http://localhost/?doc=nested%2Fpage.html#section")),
    ).toEqual({
      kind: "valid",
      route: { doc: "nested/page.html", hash: "#section", view: "documents" },
    });
    expect(parseRoute(new URL("http://localhost/?doc=../secret.html"))).toEqual(
      {
        kind: "invalid",
        rawDoc: "../secret.html",
        hash: "",
        view: "documents",
      },
    );
    expect(parseRoute(new URL("http://localhost/?doc=%2Fnested.html"))).toEqual(
      {
        kind: "invalid",
        rawDoc: "/nested.html",
        hash: "",
        view: "documents",
      },
    );
    expect(
      parseRoute(
        new URL("http://localhost/?doc=nested%2Fpage.html&view=archive"),
      ),
    ).toEqual({
      kind: "valid",
      route: { doc: "nested/page.html", hash: "", view: "archive" },
    });
  });

  it("serializes shell and content URLs", () => {
    expect(
      createShellUrl(
        { doc: "nested/page.html", hash: "#details", view: "documents" },
        new URL("http://localhost/?unused=yes"),
      ).href,
    ).toBe("http://localhost/?doc=nested%2Fpage.html#details");
    expect(
      createShellUrl(
        { doc: "nested/page.html", hash: "", view: "archive" },
        new URL("http://localhost/"),
      ).href,
    ).toBe("http://localhost/?doc=nested%2Fpage.html&view=archive");
    expect(createContentUrl("nested/page.html", BASE).href).toBe(
      "http://127.0.0.1:4173/_content/nested/page.html",
    );
    expect(createContentUrl("日本語.html", BASE).href).toBe(
      "http://127.0.0.1:4173/_content/%E6%97%A5%E6%9C%AC%E8%AA%9E.html",
    );
  });

  it("converts content URLs back to document paths", () => {
    expect(
      documentPathFromContentUrl(
        new URL("http://localhost/_content/nested/page.html"),
      ),
    ).toBe("nested/page.html");
    expect(
      documentPathFromContentUrl(
        new URL("http://localhost/_content/%E6%97%A5%E6%9C%AC%E8%AA%9E.html"),
      ),
    ).toBe("日本語.html");
    expect(
      documentPathFromContentUrl(
        new URL("http://localhost/_content/nested%2Fpage.html"),
      ),
    ).toBeNull();
    expect(
      documentPathFromContentUrl(
        new URL("http://localhost/_content/assets/pixel.svg"),
      ),
    ).toBeNull();
  });
});
