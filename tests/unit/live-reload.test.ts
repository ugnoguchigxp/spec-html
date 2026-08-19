import type { FSWatcher } from "node:fs";
import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createLiveReload } from "../../src/server/live-reload.js";

describe("live reload", () => {
  it("watches the canonical long-form content root", async () => {
    let watchedPath = "";
    const close = vi.fn();
    const liveReload = await createLiveReload("C:\\SHORT~1\\specs", {
      realpath: async () => "C:\\Long Workspace\\specs",
      watch: (path) => {
        watchedPath = path;
        return { close } as unknown as FSWatcher;
      },
    });

    expect(watchedPath).toBe("C:\\Long Workspace\\specs");
    liveReload.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("answers HEAD connections without retaining a client", async () => {
    const watcherClose = vi.fn();
    const liveReload = await createLiveReload("/specs", {
      realpath: async (path) => path,
      watch: () => ({ close: watcherClose }) as unknown as FSWatcher,
    });
    const writeHead = vi.fn();
    const end = vi.fn();
    const response = { writeHead, end } as unknown as ServerResponse;

    liveReload.connect({ method: "HEAD" } as never, response);

    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "text/event-stream; charset=utf-8" }),
    );
    expect(end).toHaveBeenCalledOnce();
    liveReload.close();
  });
});
