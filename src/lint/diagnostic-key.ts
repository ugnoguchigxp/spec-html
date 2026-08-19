export function diagnosticStableKey(diagnostic: {
  readonly file: string;
  readonly rule: string;
  readonly detail?: string;
}): string {
  return `${diagnostic.file}\0${diagnostic.rule}\0${diagnostic.detail ?? ""}`;
}
