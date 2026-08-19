import {
  HtmlValidate,
  Parser,
  StaticConfigLoader,
  type AttributeEvent,
  type HtmlElement,
  type Location,
  type Message,
  type MetaAttribute,
  type Source,
  type TagEndEvent,
  type TagStartEvent,
} from "html-validate";
import html5 from "html-validate/elements/html5";
import { lintDocument } from "../lint/document.js";
import {
  createFixProblem,
  type AppliedFix,
  type FixDocumentResult,
  type FixKind,
} from "./diagnostics.js";

interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

interface FixCandidate extends AppliedFix {
  edits: readonly TextEdit[];
  verifyRule?: string;
}

interface AttributeRecord {
  target: HtmlElement;
  key: string;
  value: string | null;
  keyLocation: Location;
  valueLocation: Location | null;
  meta: MetaAttribute | null;
  quote: '"' | "'" | null;
}

interface StartRecord {
  element: HtmlElement;
  tagName: string;
  nameLocation: Location;
}

interface EndRecord {
  target: { tagName: string; nameLocation: Location } | null;
  previous: HtmlElement;
  insertionOffset: number;
}

interface ParsedSurface {
  attributes: readonly AttributeRecord[];
  starts: readonly StartRecord[];
  ends: readonly EndRecord[];
}

const MAX_FIXES = 100;
const HTML_TAGS = Object.freeze(
  Object.keys(html5).filter((tag) => tag !== "*"),
);

const EVENT_ATTRIBUTES = Object.freeze([
  "onabort",
  "onauxclick",
  "onbeforeinput",
  "onbeforematch",
  "onbeforetoggle",
  "onblur",
  "oncancel",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncontextlost",
  "oncontextmenu",
  "oncontextrestored",
  "oncopy",
  "oncuechange",
  "oncut",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onended",
  "onerror",
  "onfocus",
  "onformdata",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onpaste",
  "onpause",
  "onplay",
  "onplaying",
  "onpointercancel",
  "onpointerdown",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointerout",
  "onpointerover",
  "onpointerup",
  "onprogress",
  "onratechange",
  "onreset",
  "onresize",
  "onscroll",
  "onscrollend",
  "onsecuritypolicyviolation",
  "onseeked",
  "onseeking",
  "onselect",
  "onslotchange",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "onvolumechange",
  "onwaiting",
  "onwheel",
]);

const ARIA_ATTRIBUTES = Object.freeze([
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-braillelabel",
  "aria-brailleroledescription",
  "aria-busy",
  "aria-checked",
  "aria-colcount",
  "aria-colindex",
  "aria-colindextext",
  "aria-colspan",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-description",
  "aria-details",
  "aria-disabled",
  "aria-dropeffect",
  "aria-errormessage",
  "aria-expanded",
  "aria-flowto",
  "aria-grabbed",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-keyshortcuts",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-placeholder",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-roledescription",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowindextext",
  "aria-rowspan",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
]);

const ROLE_VALUES = Object.freeze([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "mark",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
]);

const CLOSED_ATTRIBUTE_VALUES: Readonly<Record<string, readonly string[]>> = {
  "aria-atomic": ["true", "false"],
  "aria-busy": ["true", "false"],
  "aria-disabled": ["true", "false"],
  "aria-expanded": ["true", "false"],
  "aria-hidden": ["true", "false"],
  "aria-invalid": ["false", "true", "grammar", "spelling"],
  "aria-live": ["off", "polite", "assertive"],
  "aria-modal": ["true", "false"],
  "aria-multiline": ["true", "false"],
  "aria-multiselectable": ["true", "false"],
  "aria-orientation": ["horizontal", "vertical", "undefined"],
  "aria-pressed": ["true", "false", "mixed", "undefined"],
  "aria-readonly": ["true", "false"],
  "aria-required": ["true", "false"],
  "aria-selected": ["true", "false", "undefined"],
  "aria-sort": ["ascending", "descending", "none", "other"],
  "data-type": ["warning", "danger", "success"],
  role: ROLE_VALUES,
};

const loader = new StaticConfigLoader({
  root: true,
  extends: [],
  elements: ["html5"],
  rules: {
    "close-order": "error",
    "no-unknown-elements": "error",
    "no-unknown-attributes": "error",
    "attribute-allowed-values": "error",
    "attr-quotes": "error",
  },
});
const config = Promise.resolve(loader.getConfigFor("spec-html-fixer.html"));
const validator = new HtmlValidate(loader);

/** Fix unambiguous HTML surface typos without formatting or rewriting content. */
export async function fixDocument(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<FixDocumentResult> {
  let output = source;
  const fixes: AppliedFix[] = [];

  for (let iteration = 0; iteration < MAX_FIXES; iteration += 1) {
    const messages = await validateSurface(output, absolutePath);
    const candidate = await findCandidate(output, absolutePath, messages);
    if (candidate === null) {
      const parserError = messages.find(
        (message) => message.ruleId === "parser-error",
      );
      if (parserError !== undefined) {
        return {
          file: relativePath,
          status: "blocked",
          output: null,
          changed: false,
          fixes,
          problems: [
            createFixProblem(
              relativePath,
              parserError.line ?? 1,
              parserError.column ?? 1,
              "FIX001",
              parserError.message,
            ),
          ],
          diagnostics: [],
        };
      }
      const lint = await lintDocument(output, absolutePath, relativePath);
      return {
        file: relativePath,
        status: "ready",
        output,
        changed: output !== source,
        fixes,
        problems: [],
        diagnostics: lint.diagnostics,
      };
    }

    const candidateOutput = applyEdits(output, candidate.edits);
    if (
      !(await candidateImproves(
        output,
        candidateOutput,
        absolutePath,
        candidate,
      ))
    ) {
      const lint = await lintDocument(output, absolutePath, relativePath);
      return {
        file: relativePath,
        status: "ready",
        output,
        changed: output !== source,
        fixes,
        problems: [],
        diagnostics: lint.diagnostics,
      };
    }
    output = candidateOutput;
    fixes.push(stripCandidate(candidate));
  }

  const remainingMessages = await validateSurface(output, absolutePath);
  const remainingCandidate = await findCandidate(
    output,
    absolutePath,
    remainingMessages,
  );
  if (
    remainingCandidate === null &&
    !remainingMessages.some((message) => message.ruleId === "parser-error")
  ) {
    const lint = await lintDocument(output, absolutePath, relativePath);
    return {
      file: relativePath,
      status: "ready",
      output,
      changed: output !== source,
      fixes,
      problems: [],
      diagnostics: lint.diagnostics,
    };
  }

  return {
    file: relativePath,
    status: "blocked",
    output: null,
    changed: false,
    fixes,
    problems: [createFixProblem(relativePath, 1, 1, "FIX002")],
    diagnostics: [],
  };
}

async function findCandidate(
  source: string,
  absolutePath: string,
  messages: readonly Message[],
): Promise<FixCandidate | null> {
  const parserError = messages.find(
    (message) => message.ruleId === "parser-error",
  );
  if (parserError !== undefined) {
    return findQuoteCandidate(source, absolutePath, parserError);
  }

  const parsed = await parseSurface(source, absolutePath);
  return (
    findUnbalancedAttributeQuoteCandidate(source, parsed, messages) ??
    findTagNameCandidate(source, parsed, messages) ??
    findAttributeNameCandidate(source, parsed, messages) ??
    findAttributeValueCandidate(source, parsed, messages) ??
    findClosingTagNameCandidate(source, parsed, messages) ??
    findMissingClosingTagCandidate(source, parsed, messages)
  );
}

function findUnbalancedAttributeQuoteCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  if (!messages.some((message) => message.ruleId === "attr-quotes")) {
    return null;
  }
  for (const attribute of parsed.attributes) {
    if (
      attribute.quote !== null ||
      attribute.valueLocation === null ||
      attribute.value === null ||
      !attribute.value.endsWith('"')
    ) {
      continue;
    }
    return candidate(
      source,
      "attribute-quote",
      [
        {
          start: attribute.valueLocation.offset,
          end: attribute.valueLocation.offset,
          replacement: '"',
        },
      ],
      "",
      '"',
      "attr-quotes",
    );
  }
  return null;
}

function findTagNameCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  for (const message of messages) {
    if (
      message.ruleId !== "no-unknown-elements" ||
      typeof message.context !== "string"
    ) {
      continue;
    }
    const before = message.context.toLowerCase();
    const after = closestUnique(before, HTML_TAGS);
    if (after === null) {
      continue;
    }
    const start = parsed.starts.find(
      (record) =>
        record.tagName === before &&
        Math.abs(record.nameLocation.offset - (message.offset + 1)) <= 1,
    );
    if (start === undefined) {
      continue;
    }
    const edits: TextEdit[] = [locationEdit(start.nameLocation, after)];
    const directEnd = parsed.ends.find(
      (record) =>
        record.target?.tagName === before && record.previous === start.element,
    );
    const possibleEnds = parsed.ends.filter(
      (record) =>
        record.target?.tagName === before &&
        record.target.nameLocation.offset > start.nameLocation.offset,
    );
    const end =
      directEnd ?? (possibleEnds.length === 1 ? possibleEnds[0] : undefined);
    if (end?.target !== null && end?.target !== undefined) {
      const location = end.target.nameLocation;
      edits.push({
        start: location.offset + 1,
        end: location.offset + location.size,
        replacement: after,
      });
    }
    return candidate(
      source,
      "tag-name",
      edits,
      before,
      after,
      "no-unknown-elements",
    );
  }
  return null;
}

function findAttributeNameCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  const unknownOffsets = new Set(
    messages
      .filter((message) => message.ruleId === "no-unknown-attributes")
      .map((message) => message.offset),
  );
  const attributes = [...parsed.attributes].sort(
    (left, right) => left.keyLocation.offset - right.keyLocation.offset,
  );
  for (const attribute of attributes) {
    const key = attribute.key.toLowerCase();
    const candidates = attributeNameCandidates(
      attribute,
      unknownOffsets.has(attribute.keyLocation.offset),
    );
    const replacement = closestUnique(key, candidates);
    if (replacement === null) {
      continue;
    }
    return candidate(
      source,
      "attribute-name",
      [locationEdit(attribute.keyLocation, replacement)],
      key,
      replacement,
      unknownOffsets.has(attribute.keyLocation.offset)
        ? "no-unknown-attributes"
        : undefined,
    );
  }
  return null;
}

function attributeNameCandidates(
  attribute: AttributeRecord,
  reportedUnknown: boolean,
): readonly string[] {
  const key = attribute.key.toLowerCase();
  if (key.startsWith("on")) {
    return EVENT_ATTRIBUTES;
  }
  if (key.startsWith("aria-")) {
    return ARIA_ATTRIBUTES;
  }
  if (key.startsWith("data-")) {
    const value = attribute.value?.toLowerCase();
    return value !== undefined &&
      CLOSED_ATTRIBUTE_VALUES["data-type"]?.includes(value)
      ? ["data-type"]
      : [];
  }
  if (!reportedUnknown) {
    return [];
  }
  return Object.keys(attribute.target.meta?.attributes ?? {});
}

function findAttributeValueCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  for (const message of messages) {
    if (
      message.ruleId !== "attribute-allowed-values" ||
      !isAllowedValueContext(message.context)
    ) {
      continue;
    }
    const attribute = parsed.attributes.find(
      (record) =>
        record.valueLocation !== null &&
        record.valueLocation.offset === message.offset,
    );
    const allowed = message.context.allowed.enum.filter(
      (value): value is string => typeof value === "string",
    );
    const replacement = closestUnique(
      message.context.value.toLowerCase(),
      allowed,
    );
    if (
      attribute?.valueLocation === null ||
      attribute === undefined ||
      replacement === null
    ) {
      continue;
    }
    return candidate(
      source,
      "attribute-value",
      [locationEdit(attribute.valueLocation, replacement)],
      message.context.value,
      replacement,
      "attribute-allowed-values",
    );
  }

  for (const attribute of parsed.attributes) {
    if (attribute.value === null || attribute.valueLocation === null) {
      continue;
    }
    const allowed = CLOSED_ATTRIBUTE_VALUES[attribute.key.toLowerCase()];
    if (
      allowed === undefined ||
      allowed.includes(attribute.value.toLowerCase())
    ) {
      continue;
    }
    const replacement = closestUnique(attribute.value.toLowerCase(), allowed);
    if (replacement === null) {
      continue;
    }
    return candidate(
      source,
      "attribute-value",
      [locationEdit(attribute.valueLocation, replacement)],
      attribute.value,
      replacement,
    );
  }
  return null;
}

function findClosingTagNameCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  if (!messages.some((message) => message.ruleId === "close-order")) {
    return null;
  }
  for (const end of parsed.ends) {
    if (
      end.target === null ||
      end.target.tagName === end.previous.tagName ||
      hasAncestor(end.previous, end.target.tagName) ||
      !isSingleEditTypo(end.target.tagName, end.previous.tagName)
    ) {
      continue;
    }
    const location = end.target.nameLocation;
    const edit = {
      start: location.offset + 1,
      end: location.offset + location.size,
      replacement: end.previous.tagName,
    };
    return candidate(
      source,
      "closing-tag-name",
      [edit],
      end.target.tagName,
      end.previous.tagName,
      "close-order",
    );
  }
  return null;
}

function findMissingClosingTagCandidate(
  source: string,
  parsed: ParsedSurface,
  messages: readonly Message[],
): FixCandidate | null {
  const unclosedOffsets = new Set(
    messages
      .filter(
        (message) =>
          message.ruleId === "close-order" &&
          message.message.startsWith("Unclosed element"),
      )
      .map((message) => message.offset),
  );
  for (const end of parsed.ends) {
    if (
      end.target?.tagName === end.previous.tagName ||
      !unclosedOffsets.has(end.previous.location.offset)
    ) {
      continue;
    }
    const closingTag = `</${end.previous.tagName}>`;
    return candidate(
      source,
      "missing-closing-tag",
      [
        {
          start: end.insertionOffset,
          end: end.insertionOffset,
          replacement: closingTag,
        },
      ],
      "",
      closingTag,
      "close-order",
    );
  }
  return null;
}

async function findQuoteCandidate(
  source: string,
  absolutePath: string,
  parserError: Message,
): Promise<FixCandidate | null> {
  const positions = quoteInsertionPositions(source, parserError.offset);
  const attempts: Array<{ edit: TextEdit; messages: readonly Message[] }> = [];
  for (const position of positions) {
    const edit = { start: position, end: position, replacement: '"' };
    const output = applyEdits(source, [edit]);
    const messages = await validateSurface(output, absolutePath);
    if (messages.some((message) => message.ruleId === "parser-error")) {
      continue;
    }
    attempts.push({ edit, messages });
  }
  if (attempts.length === 0) {
    return null;
  }
  const minimum = Math.min(
    ...attempts.map((attempt) => attempt.messages.length),
  );
  const best = attempts.filter(
    (attempt) => attempt.messages.length === minimum,
  );
  if (best.length !== 1 || best[0] === undefined) {
    return null;
  }
  return candidate(
    source,
    "attribute-quote",
    [best[0].edit],
    "",
    '"',
    "parser-error",
  );
}

function quoteInsertionPositions(
  source: string,
  errorOffset: number,
): number[] {
  const start = source.lastIndexOf("<", errorOffset);
  if (start < 0) {
    return [];
  }
  const foundEnd = source.indexOf(">", errorOffset);
  const end = foundEnd < 0 ? source.length : foundEnd;
  const fragment = source.slice(start, end + 1);
  const positions = new Set<number>();

  const attribute = /\s+[A-Za-z_:][A-Za-z\d:_.-]*\s*=/g;
  for (const match of fragment.matchAll(attribute)) {
    if (match.index !== undefined) {
      positions.add(start + match.index);
    }
  }

  const unquoted = /=\s*[^\s"'`=<>]/g;
  for (const match of fragment.matchAll(unquoted)) {
    if (match.index !== undefined) {
      positions.add(start + match.index + match[0].length - 1);
    }
  }
  positions.add(end);
  return [...positions].sort((left, right) => left - right);
}

async function candidateImproves(
  before: string,
  after: string,
  absolutePath: string,
  fix: FixCandidate,
): Promise<boolean> {
  if (before === after) {
    return false;
  }
  const [beforeMessages, afterMessages] = await Promise.all([
    validateSurface(before, absolutePath),
    validateSurface(after, absolutePath),
  ]);
  if (afterMessages.some((message) => message.ruleId === "parser-error")) {
    return false;
  }
  if (fix.verifyRule === undefined) {
    return true;
  }
  return (
    countRule(afterMessages, fix.verifyRule) <
    countRule(beforeMessages, fix.verifyRule)
  );
}

async function validateSurface(
  source: string,
  absolutePath: string,
): Promise<Message[]> {
  const report = await validator.validateString(source, absolutePath);
  return report.results.flatMap((result) => result.messages);
}

async function parseSurface(
  source: string,
  absolutePath: string,
): Promise<ParsedSurface> {
  const parser = new Parser(await config);
  const attributes: AttributeRecord[] = [];
  const starts: StartRecord[] = [];
  const ends: EndRecord[] = [];

  parser.on("tag:start", (_event: string, data: TagStartEvent) => {
    starts.push({
      element: data.target,
      tagName: data.target.tagName,
      nameLocation: data.target.location,
    });
  });
  parser.on("attr", (_event: string, data: AttributeEvent) => {
    attributes.push({
      target: data.target,
      key: data.key,
      value: typeof data.value === "string" ? data.value : null,
      keyLocation: data.keyLocation,
      valueLocation: data.valueLocation,
      meta: data.meta,
      quote: data.quote,
    });
  });
  parser.on("tag:end", (_event: string, data: TagEndEvent) => {
    ends.push({
      target:
        data.target === null
          ? null
          : {
              tagName: data.target.tagName,
              nameLocation: data.target.location,
            },
      previous: data.previous,
      insertionOffset:
        data.target === null
          ? data.location.offset
          : Math.max(0, data.target.location.offset - 1),
    });
  });

  const input: Source = {
    data: source,
    filename: absolutePath,
    line: 1,
    column: 1,
    offset: 0,
  };
  parser.parseHtml(input);
  return { attributes, starts, ends };
}

function candidate(
  source: string,
  kind: FixKind,
  edits: readonly TextEdit[],
  before: string,
  after: string,
  verifyRule?: string,
): FixCandidate {
  const first = [...edits].sort((left, right) => left.start - right.start)[0];
  const location = locationAt(source, first?.start ?? 0);
  return {
    kind,
    line: location.line,
    column: location.column,
    before,
    after,
    edits,
    ...(verifyRule === undefined ? {} : { verifyRule }),
  };
}

function applyEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start);
  let previousStart = source.length + 1;
  let output = source;
  for (const edit of sorted) {
    if (
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > source.length ||
      edit.end > previousStart
    ) {
      throw new Error("Fixer generated an invalid or overlapping source edit");
    }
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
    previousStart = edit.start;
  }
  return output;
}

function locationEdit(location: Location, replacement: string): TextEdit {
  return {
    start: location.offset,
    end: location.offset + location.size,
    replacement,
  };
}

function stripCandidate(value: FixCandidate): AppliedFix {
  return {
    kind: value.kind,
    line: value.line,
    column: value.column,
    before: value.before,
    after: value.after,
  };
}

function closestUnique(
  value: string,
  candidates: readonly string[],
): string | null {
  const matches = [
    ...new Set(candidates.map((candidate) => candidate.toLowerCase())),
  ].filter((candidate) => isSingleEditTypo(value.toLowerCase(), candidate));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function isSingleEditTypo(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) {
    return false;
  }
  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        differences.push(index);
      }
    }
    if (differences.length === 1) {
      return true;
    }
    if (differences.length !== 2) {
      return false;
    }
    const [first, second] = differences;
    return (
      first !== undefined &&
      second === first + 1 &&
      left[first] === right[second] &&
      left[second] === right[first]
    );
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) {
      return false;
    }
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function hasAncestor(element: HtmlElement, tagName: string): boolean {
  let current = element.parent;
  while (current !== null) {
    if (current.tagName === tagName) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function countRule(messages: readonly Message[], ruleId: string): number {
  return messages.filter((message) => message.ruleId === ruleId).length;
}

function locationAt(
  source: string,
  offset: number,
): { line: number; column: number } {
  const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function isAllowedValueContext(value: unknown): value is {
  value: string;
  allowed: { enum: unknown[] };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "allowed" in value &&
    typeof value.allowed === "object" &&
    value.allowed !== null &&
    "enum" in value.allowed &&
    Array.isArray(value.allowed.enum)
  );
}
