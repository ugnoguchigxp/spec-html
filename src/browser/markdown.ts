/** Load the Markdown compiler only when the viewer opens a Markdown document. */
export async function renderMarkdownDocument(
  source: string,
  language: string,
): Promise<string> {
  const { compileMarkdown } = await import("../markdown/compiler.js");
  return compileMarkdown(source, { language }).fragment;
}
