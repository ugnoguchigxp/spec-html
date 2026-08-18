import open from "open";

export async function openViewer(url: string): Promise<void> {
  await open(url, { wait: false });
}
