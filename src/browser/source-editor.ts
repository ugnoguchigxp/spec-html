import type { ViewerElements } from "./types.js";

const INDENT = "  ";

export interface SourceEditorController {
  clear(): void;
  focus(): void;
  getValue(): string;
  setValue(value: string): void;
}

interface SourceEditorOptions {
  onChange: () => void;
  onSave: () => void;
}

export function installSourceEditor(
  elements: ViewerElements,
  options: SourceEditorOptions,
): SourceEditorController {
  const textarea = elements.sourceDialogTextarea;
  let renderedLineCount = 0;

  const updateLineNumbers = (): void => {
    const lineCount = countLines(textarea.value);
    if (lineCount === renderedLineCount) {
      return;
    }
    elements.sourceDialogLineNumbers.textContent = Array.from(
      { length: lineCount },
      (_, index) => String(index + 1),
    ).join("\n");
    renderedLineCount = lineCount;
  };

  const updatePosition = (): void => {
    const { column, line } = positionAt(textarea.value, textarea.selectionStart);
    elements.sourceDialogPosition.textContent = `Ln ${line}, Col ${column}`;
  };

  const updateChrome = (): void => {
    updateLineNumbers();
    updatePosition();
  };

  const reportChange = (): void => {
    updateChrome();
    options.onChange();
  };

  textarea.addEventListener("input", reportChange);
  textarea.addEventListener("scroll", () => {
    elements.sourceDialogGutter.scrollTop = textarea.scrollTop;
  });
  for (const eventName of ["click", "keyup", "select"] as const) {
    textarea.addEventListener(eventName, updatePosition);
  }
  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      options.onSave();
      return;
    }
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    event.preventDefault();
    replaceIndent(textarea, event.shiftKey);
    reportChange();
  });

  updateChrome();

  return {
    clear(): void {
      textarea.value = "";
      textarea.scrollTop = 0;
      elements.sourceDialogGutter.scrollTop = 0;
      renderedLineCount = 0;
      updateChrome();
    },
    focus(): void {
      textarea.focus();
    },
    getValue(): string {
      return textarea.value;
    },
    setValue(value: string): void {
      textarea.value = value;
      textarea.scrollTop = 0;
      elements.sourceDialogGutter.scrollTop = 0;
      textarea.setSelectionRange(0, 0);
      renderedLineCount = 0;
      updateChrome();
    },
  };
}

function countLines(value: string): number {
  let count = 1;
  for (const character of value) {
    if (character === "\n") {
      count += 1;
    }
  }
  return count;
}

function positionAt(
  value: string,
  offset: number,
): { column: number; line: number } {
  const beforeCursor = value.slice(0, offset);
  const lastLineBreak = beforeCursor.lastIndexOf("\n");
  return {
    column: offset - lastLineBreak,
    line: countLines(beforeCursor),
  };
}

function replaceIndent(textarea: HTMLTextAreaElement, outdent: boolean): void {
  const { selectionEnd, selectionStart, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const selected = value.slice(lineStart, selectionEnd);

  if (!outdent && !selected.includes("\n") && selectionStart === selectionEnd) {
    textarea.setRangeText(INDENT, selectionStart, selectionEnd, "end");
    return;
  }

  const lines = selected.split("\n");
  let removedBeforeSelection = 0;
  let totalDifference = 0;
  const replacement = lines
    .map((line, index) => {
      if (!outdent) {
        totalDifference += INDENT.length;
        return `${INDENT}${line}`;
      }
      const removable = line.startsWith(INDENT)
        ? INDENT.length
        : line.startsWith("\t") || line.startsWith(" ")
          ? 1
          : 0;
      if (index === 0) {
        removedBeforeSelection = Math.min(
          removable,
          selectionStart - lineStart,
        );
      }
      totalDifference -= removable;
      return line.slice(removable);
    })
    .join("\n");

  textarea.setRangeText(replacement, lineStart, selectionEnd, "select");
  const nextStart = outdent
    ? Math.max(lineStart, selectionStart - removedBeforeSelection)
    : selectionStart + INDENT.length;
  textarea.setSelectionRange(nextStart, selectionEnd + totalDifference);
}
