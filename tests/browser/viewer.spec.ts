import { expect, test } from "@playwright/test";

test("shows the first navigation document and updates active navigation", async ({
  page,
}) => {
  await page.goto("/");

  const frame = page.frameLocator("iframe.viewer-document");
  await expect(frame.locator("h1")).toHaveText("Overview");
  await expect(page.locator(".viewer-sidebar a", { hasText: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveTitle("Overview — HTML Docs");
});

test("applies theme-aware document styles on desktop and mobile", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const frame = page.frameLocator("iframe.viewer-document");
  await expect
    .poll(() =>
      page.locator(".viewer").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() =>
      frame.locator("body").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() =>
      frame.locator('aside[data-type="warning"]').evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(255, 248, 197)");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() =>
      page.locator(".viewer").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(13, 17, 23)");
  await expect
    .poll(() =>
      frame.locator("body").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(13, 17, 23)");
  await expect
    .poll(() =>
      frame.locator('aside[data-type="warning"]').evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(59, 46, 0)");

  await page.setViewportSize({ width: 375, height: 700 });
  await expect
    .poll(() =>
      frame.locator("body").evaluate((element) =>
        getComputedStyle(element).paddingLeft,
      ),
    )
    .toBe("16px");
});

test("opens a document from its query URL and resolves a nested asset", async ({
  page,
}) => {
  await page.goto("/?doc=nested%2Fpage.html");

  const frame = page.frameLocator("iframe.viewer-document");
  await expect(frame.locator("h1")).toHaveText("Nested document");
  await expect
    .poll(() => frame.locator("img").evaluate((image) => (image as HTMLImageElement).src))
    .toMatch(/\/_content\/assets\/pixel\.svg$/);
  await expect
    .poll(() =>
      frame.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

test("routes sidebar and iframe document links, then restores browser history", async ({
  page,
}) => {
  await page.goto("/");
  const frame = page.frameLocator("iframe.viewer-document");

  await frame.getByRole("link", { name: "Open the nested document" }).click();
  await expect(frame.locator("h1")).toHaveText("Nested document");
  await expect(page).toHaveURL(/\?doc=nested%2Fpage\.html$/);
  await expect(
    page.locator(".viewer-sidebar a", { hasText: "Nested document" }),
  ).toHaveAttribute("aria-current", "page");

  await frame.getByRole("link", { name: "Return to overview details" }).click();
  await expect(frame.locator("h1")).toHaveText("Overview");
  await expect(page).toHaveURL(/\?doc=overview\.html#details$/);
  await expect
    .poll(() => frame.locator("body").evaluate((body) => body.ownerDocument.defaultView?.scrollY))
    .toBeGreaterThan(0);

  await page.goBack();
  await expect(frame.locator("h1")).toHaveText("Nested document");
  let overviewRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/_content/overview.html") {
      overviewRequests += 1;
    }
  });
  await page.goForward();
  await expect(frame.locator("h1")).toHaveText("Overview");
  expect(overviewRequests).toBe(1);
  await page.reload();
  await expect(frame.locator("h1")).toHaveText("Overview");
});

test("renders Chart.js and Mermaid when optional integrations are installed", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Chart" }).click();
  const chartFrame = page.frameLocator("iframe.viewer-document");
  await expect(chartFrame.locator("h1")).toHaveText("Chart");
  await expect
    .poll(() =>
      chartFrame.locator("#latency-chart").evaluate((canvas) => {
        const chartWindow = canvas.ownerDocument.defaultView as Window & {
          fixtureChart?: unknown;
        };
        const context = (canvas as HTMLCanvasElement).getContext("2d");
        if (chartWindow.fixtureChart === undefined || context === null) {
          return false;
        }
        const chartCanvas = canvas as HTMLCanvasElement;
        if (chartCanvas.width === 0 || chartCanvas.height === 0) {
          return false;
        }
        return context
          .getImageData(0, 0, chartCanvas.width, chartCanvas.height)
          .data.some((channel) => channel !== 0);
      }),
    )
    .toBe(true);

  await page.getByRole("link", { name: "Diagram" }).click();
  const diagramFrame = page.frameLocator("iframe.viewer-document");
  await expect(diagramFrame.locator("h1")).toHaveText("Diagram");
  await expect(diagramFrame.locator(".mermaid svg")).toBeVisible();
});

test("uses dark palettes for Chart.js and Mermaid", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await page.getByRole("link", { name: "Chart" }).click();
  const frame = page.frameLocator("iframe.viewer-document");
  await expect
    .poll(() =>
      frame.locator("#latency-chart").evaluate((canvas) => {
        const chartWindow = canvas.ownerDocument.defaultView as Window & {
          Chart?: { defaults: { borderColor: string; color: string } };
        };
        return chartWindow.Chart?.defaults;
      }),
    )
    .toMatchObject({ color: "#e6edf3", borderColor: "#30363d" });

  await page.getByRole("link", { name: "Diagram" }).click();
  const actor = frame.locator(".mermaid svg rect.actor").first();
  await expect(actor).toBeVisible();
  await expect
    .poll(() => actor.evaluate((element) => getComputedStyle(element).fill))
    .toBe("rgb(31, 32, 32)");
});

test("shows an in-viewer error for a missing document and supports the mobile menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/?doc=missing.html");

  await expect(page.locator(".viewer-status")).toContainText("設計書が見つかりません");
  await expect(page.locator("iframe.viewer-document")).toBeHidden();
  await expect(page.locator(".viewer-sidebar")).toHaveAttribute("aria-hidden", "true");
  await expect
    .poll(() =>
      page
        .locator(".viewer-sidebar")
        .evaluate((sidebar) => (sidebar as HTMLElement).inert),
    )
    .toBe(true);

  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(page.locator(".viewer")).toHaveAttribute("data-sidebar-open", "true");
  await expect(page.locator(".viewer-sidebar")).not.toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".viewer")).toHaveAttribute("data-sidebar-open", "false");
  await expect(page.getByRole("button", { name: "メニュー" })).toBeFocused();
});

test("shows a useful message when nav.html has no document links", async ({
  page,
}) => {
  await page.route("**/_content/nav.html", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<nav><h2>Empty</h2></nav>",
    });
  });

  await page.goto("/");

  await expect(page.locator(".viewer-status")).toHaveText(
    "表示可能な設計書がありません",
  );
});

test("reports malformed navigation and disables javascript links", async ({
  page,
}) => {
  await page.route("**/_content/nav.html", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: [
        '<nav aria-label="Test">',
        '<a href="javascript:alert(1)">Unsafe</a>',
        '<a href="./overview.html">Overview</a>',
        "</nav>",
      ].join(""),
    });
  });
  await page.goto("/");

  const unsafeLink = page.locator(".viewer-sidebar a", { hasText: "Unsafe" });
  await expect(unsafeLink).toHaveAttribute("data-html-docs-blocked", "javascript");
  await expect(unsafeLink).not.toHaveAttribute("href", /.+/);

  await page.unroute("**/_content/nav.html");
  await page.route("**/_content/nav.html", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<p>not navigation</p>",
    });
  });
  await page.reload();
  await expect(page.locator(".viewer-status")).toHaveText(
    "nav.htmlを読み込めません",
  );
});

test("keeps the latest document after a slow request is aborted", async ({
  page,
}) => {
  await page.route("**/_content/nav.html", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: [
        "<nav>",
        '<a href="./overview.html">Overview</a>',
        '<a href="./slow.html">Slow</a>',
        "</nav>",
      ].join(""),
    });
  });
  await page.route("**/_content/slow.html", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<article><h1>Slow response</h1></article>",
    });
  });
  await page.goto("/");
  const frame = page.frameLocator("iframe.viewer-document");
  await expect(frame.locator("h1")).toHaveText("Overview");

  await page.getByRole("link", { name: "Slow" }).click();
  await page.getByRole("link", { name: "Overview" }).click();

  await expect(frame.locator("h1")).toHaveText("Overview");
  await page.waitForTimeout(300);
  await expect(frame.locator("h1")).toHaveText("Overview");
});

test("clears the previous document state when a linked document is missing", async ({
  page,
}) => {
  await page.goto("/");
  const frame = page.frameLocator("iframe.viewer-document");

  await frame.getByRole("link", { name: "Open a missing document" }).click();

  await expect(page.locator(".viewer-status")).toContainText("設計書が見つかりません");
  await expect(page.locator(".viewer-title")).toHaveText("HTML Docs");
  await expect(page).toHaveTitle("HTML Docs");
  await expect(page.locator(".viewer-sidebar a[aria-current='page']")).toHaveCount(0);
});
