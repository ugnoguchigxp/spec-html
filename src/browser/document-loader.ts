export class DocumentHttpError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch document: HTTP ${status}`);
    this.name = "DocumentHttpError";
  }
}

export async function fetchDocument(
  url: URL,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new DocumentHttpError(response.status);
  }
  return response.text();
}
