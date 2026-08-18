import { describe, expect, it } from "vitest";
import { getContentType } from "../../src/server/mime.js";

describe("getContentType", () => {
  it.each([
    ["page.html", "text/html; charset=utf-8"],
    ["page.HTM", "text/html; charset=utf-8"],
    ["viewer.js", "text/javascript; charset=utf-8"],
    ["viewer.mjs", "text/javascript; charset=utf-8"],
    ["theme.css", "text/css; charset=utf-8"],
    ["data.json", "application/json; charset=utf-8"],
    ["diagram.svg", "image/svg+xml"],
    ["image.png", "image/png"],
    ["image.jpg", "image/jpeg"],
    ["image.jpeg", "image/jpeg"],
    ["image.gif", "image/gif"],
    ["image.webp", "image/webp"],
    ["font.woff", "font/woff"],
    ["font.woff2", "font/woff2"],
    ["unknown.bin", "application/octet-stream"],
  ])("maps %s", (filePath, expected) => {
    expect(getContentType(filePath)).toBe(expected);
  });
});
