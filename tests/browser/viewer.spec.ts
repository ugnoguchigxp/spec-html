import { expect, test } from "@playwright/test";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

test("reloads only when the content directory changes", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    if (window.top !== window) {
      return;
    }
    const count = Number(
      sessionStorage.getItem("spec-html-test-load-count") ?? "0",
    );
    sessionStorage.setItem("spec-html-test-load-count", String(count + 1));
  });
  const liveReloadResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/_spec-html/live-reload",
  );
  await page.goto("/");
  await liveReloadResponse;
  await expect(
    page.frameLocator("iframe.viewer-document").locator("h1"),
  ).toHaveText("Overview");

  const loadCount = (): Promise<number> =>
    page.evaluate(() =>
      Number(sessionStorage.getItem("spec-html-test-load-count") ?? "0"),
    );
  expect(await loadCount()).toBe(1);

  await writeFile(testInfo.outputPath("outside-content.txt"), "outside");
  await page.waitForTimeout(200);
  expect(await loadCount()).toBe(1);

  const watchedFile = resolve(
    "tests/fixtures/browser/nested/.spec-html-hot-reload-test",
  );
  try {
    await writeFile(watchedFile, "inside");
    await expect.poll(loadCount).toBe(2);
  } finally {
    await rm(watchedFile, { force: true });
  }
});

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
  await expect(page).toHaveTitle("Overview — Spec HTML");
  await expect(page.locator(".viewer-header")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator(".viewer-sidebar, .viewer-main").evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top),
      ),
    )
    .toEqual([0, 0]);
  await expect(page.locator(".viewer-brand")).toHaveCount(0);
  const sortSwitcher = page.getByRole("group", { name: "Sort by" });
  await expect(
    sortSwitcher.locator('[data-sort-value="name"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    sortSwitcher.locator('[data-sort-value="date"]'),
  ).toHaveAttribute("aria-pressed", "false");
  const longTitleLink = page.getByRole("link", { name: "Overview" });
  const longTitle = longTitleLink.locator(".viewer-navigation-title");
  const updatedAt = longTitleLink.locator("time");
  await expect(longTitleLink).toHaveAttribute("title", "Overview");
  await expect(longTitle).toHaveCSS("text-overflow", "ellipsis");
  await expect(longTitle).toHaveCSS("white-space", "nowrap");
  await expect(updatedAt).toHaveAttribute(
    "datetime",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  await expect(updatedAt).toHaveText(
    /^(?:just now|\d+ min|\d+ (?:hour|day)s? ago|\d{4}-\d{2}-\d{2})$/,
  );
  await longTitleLink.evaluate((link) => {
    link.style.width = "40px";
  });
  await expect
    .poll(() =>
      longTitle.evaluate((link) => link.scrollWidth > link.clientWidth),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.locator(".viewer-sidebar").evaluate(
        (sidebar) => sidebar.scrollWidth <= sidebar.clientWidth,
      ),
    )
    .toBe(true);

});

test("opens source HTML in a modal without replacing the document preview", async ({ page }) => {
  await page.goto("/");

  const frame = page.frameLocator("iframe.viewer-document");
  const modeButton = page.getByRole("button", { name: "ソースHTMLを表示" });
  await expect(modeButton).toBeVisible();
  await expect(modeButton).toHaveCSS("position", "absolute");
  await expect(modeButton).toHaveCSS("right", "16px");
  await expect(modeButton).toHaveCSS("bottom", "16px");

  await page.getByRole("link", { name: "Chart" }).click();
  await expect(frame.locator("h1")).toHaveText("Chart");
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe.viewer-document");
    if (frame === null || frame.contentDocument === null) {
      throw new Error("Document frame not found");
    }
    const frameDocument = frame.contentDocument;
    Object.assign(window, {
      chartDocumentBeforeSourceDialog: frameDocument,
      chartCanvasBeforeSourceDialog: frameDocument.querySelector(
        "#latency-chart",
      ),
    });
  });

  await modeButton.click();
  const sourceDialog = page.getByRole("dialog", { name: "ソースHTML" });
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog.locator("pre")).toContainText("<h1>Chart</h1>");
  await expect(frame.locator("h1")).toHaveText("Chart");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>(
          "iframe.viewer-document",
        );
        const stored = window as Window & {
          chartDocumentBeforeSourceDialog?: Document;
          chartCanvasBeforeSourceDialog?: Element | null;
        };
        if (frame === null || frame.contentDocument === null) {
          return false;
        }
        return frame.contentDocument === stored.chartDocumentBeforeSourceDialog &&
          frame.contentDocument.querySelector("#latency-chart") ===
            stored.chartCanvasBeforeSourceDialog;
      }),
    )
    .toBe(true);

  const closeButton = sourceDialog.getByRole("button", { name: "Close" });
  await expect(closeButton.locator("svg")).toHaveCount(1);
  await closeButton.click();
  await expect(sourceDialog).toBeHidden();

  await page.getByRole("link", { name: "Diagram" }).click();
  const diagram = frame.locator(".mermaid svg");
  await expect(diagram).toBeVisible();
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe.viewer-document");
    if (frame === null || frame.contentDocument === null) {
      throw new Error("Document frame not found");
    }
    const frameDocument = frame.contentDocument;
    Object.assign(window, {
      diagramDocumentBeforeSourceDialog: frameDocument,
    });
  });

  await modeButton.click();
  await expect(sourceDialog.locator("pre")).toContainText("<h1>Diagram</h1>");
  await expect(frame.locator(".mermaid svg")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>(
          "iframe.viewer-document",
        );
        const stored = window as Window & {
          diagramDocumentBeforeSourceDialog?: Document;
        };
        return frame?.contentDocument === stored.diagramDocumentBeforeSourceDialog;
      }),
    )
    .toBe(true);

  await page.emulateMedia({ media: "print" });
  await expect(sourceDialog).toBeHidden();
});

test("wraps long source HTML lines inside the modal", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "ソースHTMLを表示" }).click();
  const sourceCode = page
    .getByRole("dialog", { name: "ソースHTML" })
    .locator("pre");
  await sourceCode.evaluate((element) => {
    element.textContent = `  <p data-value="${"x".repeat(400)}">\n    content\n  </p>`;
  });

  await expect(sourceCode).toHaveCSS("white-space", "pre-wrap");
  await expect(sourceCode).toHaveCSS("overflow-wrap", "anywhere");
  await expect
    .poll(() =>
      sourceCode.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
});

test("sorts navigation by name or updated date", async ({ page }) => {
  await page.route("**/_spec-html/navigation", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: [
        '<nav aria-label="Documents">',
        '  <a href="./overview.html" title="Overview"><span class="viewer-navigation-title">Overview</span><time datetime="2026-08-16T00:00:00.000Z">2 days ago</time></a>',
        '  <a href="./chart.html" title="Chart"><span class="viewer-navigation-title">Chart</span><time datetime="2026-08-18T00:00:00.000Z">just now</time></a>',
        '  <a href="./diagram.html" title="Diagram"><span class="viewer-navigation-title">Diagram</span><time datetime="2026-08-17T00:00:00.000Z">1 day ago</time></a>',
        "</nav>",
      ].join("\n"),
    });
  });
  await page.goto("/");

  const titles = page.locator(".viewer-navigation-title");
  await expect(titles).toHaveText(["Overview", "Chart", "Diagram"]);

  const sortSwitcher = page.getByRole("group", { name: "Sort by" });
  const nameButton = sortSwitcher.locator('[data-sort-value="name"]');
  const dateButton = sortSwitcher.locator('[data-sort-value="date"]');

  await expect(nameButton).toHaveText("Name ↑");
  await expect(nameButton).toHaveAttribute("aria-label", "Name, ascending");
  await nameButton.click();
  await expect(titles).toHaveText(["Diagram", "Chart", "Overview"]);
  await expect(nameButton).toHaveText("Name ↓");
  await expect(nameButton).toHaveAttribute("aria-label", "Name, descending");

  await nameButton.click();
  await expect(titles).toHaveText(["Overview", "Chart", "Diagram"]);
  await dateButton.click();
  await expect(titles).toHaveText(["Chart", "Diagram", "Overview"]);
  await expect(dateButton).toHaveText("Date ↓");
  await expect(dateButton).toHaveAttribute("aria-label", "Date, descending");
  await expect(dateButton).toHaveAttribute("aria-pressed", "true");
  await expect(nameButton).toHaveAttribute("aria-pressed", "false");

  await dateButton.click();
  await expect(titles).toHaveText(["Overview", "Diagram", "Chart"]);
  await expect(dateButton).toHaveText("Date ↑");
  await expect(dateButton).toHaveAttribute("aria-label", "Date, ascending");

  await nameButton.click();
  await expect(titles).toHaveText(["Overview", "Chart", "Diagram"]);
  await expect(nameButton).toHaveText("Name ↑");
  await expect(nameButton).toHaveAttribute("aria-pressed", "true");
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
  await expect
    .poll(() =>
      frame.locator("#inline-icon").evaluate((element) => ({
        display: getComputedStyle(element).display,
        width: getComputedStyle(element).width,
      })),
    )
    .toEqual({ display: "inline", width: "16px" });
  await expect
    .poll(() =>
      frame.locator("#small-canvas").evaluate((element) =>
        getComputedStyle(element).width,
      ),
    )
    .toBe("120px");

  await page
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name: "Dark" })
    .click();
  await expect
    .poll(() =>
      page.locator(".viewer").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(36, 40, 59)");
  await expect(frame.locator("body")).toHaveCSS(
    "background-color",
    "rgb(36, 40, 59)",
  );
  await expect(frame.locator('aside[data-type="warning"]')).toHaveCSS(
    "background-color",
    "rgb(55, 54, 64)",
  );

  await page.setViewportSize({ width: 375, height: 700 });
  await expect
    .poll(() =>
      frame.locator("body").evaluate((element) =>
        getComputedStyle(element).paddingLeft,
      ),
    )
    .toBe("16px");
});

test("selects and persists light and dark themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const themeSwitcher = page.getByRole("group", { name: "Theme" });
  const lightButton = themeSwitcher.getByRole("button", { name: "Light" });
  const darkButton = themeSwitcher.getByRole("button", { name: "Dark" });
  const frame = page.frameLocator("iframe.viewer-document");

  await expect(themeSwitcher).toBeVisible();
  await expect(
    themeSwitcher.locator("xpath=ancestor::aside[@id='viewer-sidebar']"),
  ).toHaveCount(1);
  await expect(themeSwitcher.getByRole("button")).toHaveCount(2);
  await expect(lightButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await darkButton.click();
  await expect(darkButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".viewer")).toHaveCSS(
    "background-color",
    "rgb(36, 40, 59)",
  );

  await page.reload();
  await expect(darkButton).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".viewer")).toHaveCSS(
    "background-color",
    "rgb(36, 40, 59)",
  );

  await page.getByRole("link", { name: "Chart" }).click();
  await expect
    .poll(() =>
      frame.locator("#latency-chart").evaluate((canvas) => {
        const chartWindow = canvas.ownerDocument.defaultView as Window & {
          Chart?: { defaults: { color: string } };
        };
        return chartWindow.Chart?.defaults.color;
      }),
    )
    .toBe("#a9b1d6");

  await lightButton.click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      frame.locator("#latency-chart").evaluate((canvas) => {
        const chartWindow = canvas.ownerDocument.defaultView as Window & {
          Chart?: { defaults: { color: string } };
        };
        return chartWindow.Chart?.defaults.color;
      }),
    )
    .toBe("#57606a");

  await page.getByRole("link", { name: "Diagram" }).click();
  const actor = frame.locator(".mermaid svg rect.actor").first();
  await expect(actor).toHaveCSS("fill", "rgb(236, 236, 255)");
  await darkButton.click();
  await expect(actor).toHaveCSS("fill", "rgb(41, 46, 66)");
  await lightButton.click();
  await expect(actor).toHaveCSS("fill", "rgb(236, 236, 255)");
});

test("uses print colors and expands the document frame for printing", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", media: "print" });
  await page.goto("/");

  const frame = page.frameLocator("iframe.viewer-document");
  await expect(page.locator(".menu-button")).toBeHidden();
  await expect(page.locator(".viewer-sidebar")).toBeHidden();
  await expect
    .poll(() =>
      frame.locator("body").evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color,
        padding: getComputedStyle(element).padding,
      })),
    )
    .toEqual({
      background: "rgb(255, 255, 255)",
      color: "rgb(36, 41, 47)",
      padding: "0px",
    });

  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await expect(frame.locator("details p")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("iframe.viewer-document").evaluate((element) =>
        Number.parseFloat((element as HTMLIFrameElement).style.height),
      ),
    )
    .toBeGreaterThan(1_200);
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(frame.locator("details p")).toBeHidden();
  await expect(page.locator("iframe.viewer-document")).not.toHaveAttribute(
    "style",
    /height/,
  );
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

  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      "iframe.viewer-document",
    );
    if (frame === null) {
      throw new Error("Document frame not found");
    }
    const visibleCanvasWidths: number[] = [];
    Object.assign(window, { visibleCanvasWidths });
    const sampleCanvasWidth = (): void => {
      const canvas = frame.contentDocument?.querySelector<HTMLCanvasElement>(
        "#latency-chart",
      );
      if (
        canvas !== null &&
        canvas !== undefined &&
        getComputedStyle(frame).visibility === "visible"
      ) {
        visibleCanvasWidths.push(Math.round(canvas.getBoundingClientRect().width));
      }
      if (visibleCanvasWidths.length < 20) {
        requestAnimationFrame(sampleCanvasWidth);
      }
    };
    requestAnimationFrame(sampleCanvasWidth);
  });
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
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as Window & { visibleCanvasWidths?: number[] }
        ).visibleCanvasWidths?.filter((width) => width > 0).length ?? 0;
      }),
    )
    .toBeGreaterThan(10);
  const canvasWidths = await page.evaluate(() => {
    const widths = (
      window as Window & { visibleCanvasWidths?: number[] }
    ).visibleCanvasWidths ?? [];
    const canvas = document
      .querySelector<HTMLIFrameElement>("iframe.viewer-document")
      ?.contentDocument?.querySelector<HTMLCanvasElement>("#latency-chart");
    return {
      final: canvas === null || canvas === undefined
        ? 0
        : Math.round(canvas.getBoundingClientRect().width),
      visible: [...new Set(widths.filter((width) => width > 0))],
    };
  });
  expect(canvasWidths.visible).toEqual([canvasWidths.final]);

  await page.getByRole("link", { name: "Diagram" }).click();
  const diagramFrame = page.frameLocator("iframe.viewer-document");
  await expect(diagramFrame.locator("h1")).toHaveText("Diagram");
  await expect(diagramFrame.locator(".mermaid svg")).toBeVisible();
  await expect
    .poll(() =>
      diagramFrame.locator(".mermaid").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(() =>
      diagramFrame.locator(".mermaid text.messageText").first().evaluate((element) =>
        getComputedStyle(element).fill,
      ),
    )
    .toBe("rgb(51, 51, 51)");
});

test("keeps canvas names and non-JavaScript fallbacks available", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Chart" }).click();
  const canvas = page.frameLocator("iframe.viewer-document").locator("#latency-chart");
  expect(await canvas.ariaSnapshot()).toContain("P95 latency chart");

  const fallbackContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.goto(`${baseURL}/_content/chart.html`);
    await expect(fallbackPage.getByRole("table")).toContainText("180 ms");
    await expect(fallbackPage.locator("figcaption")).toContainText("P95 latency");
    await fallbackPage.goto(`${baseURL}/_content/diagram.html`);
    await expect(fallbackPage.locator("pre.mermaid")).toContainText("Browser->>API: Login");
  } finally {
    await fallbackContext.close();
  }
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
    .toMatchObject({ color: "#a9b1d6", borderColor: "#737aa2" });

  await page.getByRole("link", { name: "Diagram" }).click();
  const actor = frame.locator(".mermaid svg rect.actor").first();
  await expect(actor).toBeVisible();
  await expect
    .poll(() => actor.evaluate((element) => getComputedStyle(element).fill))
    .toBe("rgb(41, 46, 66)");
});

test("uses the operating system theme initially without an Auto option", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const themeSwitcher = page.getByRole("group", { name: "Theme" });
  const darkButton = themeSwitcher.getByRole("button", { name: "Dark" });
  await expect(themeSwitcher.getByRole("button")).toHaveCount(2);
  await expect(darkButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(darkButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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

test("shows a useful message when navigation has no document links", async ({
  page,
}) => {
  await page.route("**/_spec-html/navigation", async (route) => {
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
  await page.route("**/_spec-html/navigation", async (route) => {
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
  await expect(unsafeLink).toHaveAttribute("data-spec-html-blocked", "javascript");
  await expect(unsafeLink).not.toHaveAttribute("href", /.+/);

  await page.unroute("**/_spec-html/navigation");
  await page.route("**/_spec-html/navigation", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<p>not navigation</p>",
    });
  });
  await page.reload();
  await expect(page.locator(".viewer-status")).toHaveText(
    "Navigationを読み込めません",
  );
});

test("keeps the latest document after a slow request is aborted", async ({
  page,
}) => {
  await page.route("**/_spec-html/navigation", async (route) => {
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
  await expect(page.locator(".viewer")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("iframe.viewer-document")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ソースHTMLを表示" }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await expect(frame.locator("h1")).toHaveText("Overview");
  await expect(page.locator(".viewer")).toHaveAttribute("data-state", "ready");
});

test("clears the previous document state when a linked document is missing", async ({
  page,
}) => {
  await page.goto("/");
  const frame = page.frameLocator("iframe.viewer-document");

  await frame.getByRole("link", { name: "Open a missing document" }).click();

  await expect(page.locator(".viewer-status")).toContainText("設計書が見つかりません");
  await expect(page.locator(".viewer-header, .viewer-title")).toHaveCount(0);
  await expect(page).toHaveTitle("Spec HTML");
  await expect(page.locator(".viewer-sidebar a[aria-current='page']")).toHaveCount(0);
});
