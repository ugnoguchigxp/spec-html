import {
  NodeType,
  Parser,
  StaticConfigLoader,
  type DOMNode,
  type DoctypeEvent,
  type HtmlElement,
  type Location,
  type Source,
  type TagEndEvent,
  type TagReadyEvent,
  type TagStartEvent,
} from "html-validate";
import { normalizeDetail } from "../lint/diagnostics.js";
import { messageOf } from "../shared/error-message.js";
import {
  createFormatProblem,
  sortAndDedupeFormatProblems,
  type FormatChange,
  type FormatInputKind,
  type FormatProblem,
} from "./diagnostics.js";

export interface SourceRange {
  start: number;
  end: number;
}

export interface ElementSourceRecord {
  element: HtmlElement;
  startTag: SourceRange;
  content: SourceRange | null;
  endTag: SourceRange | null;
}

export interface ParsedHtmlSource {
  root: HtmlElement;
  elements: ReadonlyMap<HtmlElement, ElementSourceRecord>;
  doctypes: readonly Location[];
  problems: readonly FormatProblem[];
}

export interface NormalizedEnvelope {
  kind: FormatInputKind;
  source: string;
  changes: readonly FormatChange[];
  problems: readonly FormatProblem[];
}

interface MutableElementRecord {
  element: HtmlElement;
  start: Location;
  ready?: Location;
  explicit: boolean;
  endTag?: SourceRange;
}

interface ParseErrorLike {
  location?: Location;
  message?: string;
}

const loader = new StaticConfigLoader({
  root: true,
  extends: [],
  elements: ["html5"],
  rules: {},
});
const config = Promise.resolve(loader.getConfigFor("spec-html-formatter.html"));
const HTML_VALIDATE_DIRECTIVE =
  /html-validate-(?:enable|disable(?:-next|-block)?)/i;
const ALLOWED_WRAPPER_ATTRIBUTES = new Set(["lang", "dir"]);

export async function parseHtmlSource(
  source: string,
  filename: string,
  displayFile = filename,
): Promise<ParsedHtmlSource> {
  const parser = new Parser(await config);
  const mutable = new Map<HtmlElement, MutableElementRecord>();
  const doctypes: Location[] = [];
  const problems: FormatProblem[] = [];

  parser.on("tag:start", (_event: string, data: TagStartEvent) => {
    mutable.set(data.target, {
      element: data.target,
      start: data.location,
      explicit: false,
    });
  });
  parser.on("tag:ready", (_event: string, data: TagReadyEvent) => {
    const record = mutable.get(data.target);
    if (record === undefined) {
      return;
    }
    record.ready = data.location;
    record.explicit =
      data.location.offset >= record.start.offset + record.start.size;
  });
  parser.on("tag:end", (_event: string, data: TagEndEvent) => {
    if (data.target === null || data.target.tagName !== data.previous.tagName) {
      return;
    }
    const record = mutable.get(data.previous);
    if (record === undefined) {
      return;
    }
    record.endTag = {
      start: Math.max(0, data.target.location.offset - 1),
      end: data.location.offset + data.location.size,
    };
  });
  parser.on("doctype", (_event: string, data: DoctypeEvent) => {
    doctypes.push(data.location);
  });
  parser.on("parse:error", (_event: string, data: unknown) => {
    const error = parseErrorLike(data);
    const location = error.location;
    problems.push(
      createFormatProblem(
        displayFile,
        location?.line ?? 1,
        location?.column ?? 1,
        "FMT001",
        error.message,
      ),
    );
  });

  let root: HtmlElement;
  try {
    const input: Source = {
      data: source,
      filename,
      line: 1,
      column: 1,
      offset: 0,
    };
    root = parser.parseHtml(input);
  } catch (error: unknown) {
    const parsed = parseErrorLike(error);
    const location = parsed.location;
    problems.push(
      createFormatProblem(
        displayFile,
        location?.line ?? 1,
        location?.column ?? 1,
        "FMT001",
        parsed.message ?? messageOf(error),
      ),
    );
    root = new Parser(await config).parseHtml("");
  }

  const elements = new Map<HtmlElement, ElementSourceRecord>();
  for (const record of mutable.values()) {
    if (!record.explicit || record.ready === undefined) {
      continue;
    }
    const startTag = {
      start: record.start.offset,
      end: record.ready.offset + record.ready.size,
    };
    const content =
      record.endTag === undefined
        ? null
        : { start: startTag.end, end: record.endTag.start };
    elements.set(record.element, {
      element: record.element,
      startTag,
      content,
      endTag: record.endTag ?? null,
    });
  }

  return {
    root,
    elements,
    doctypes,
    problems: sortAndDedupeFormatProblems(problems),
  };
}

export async function normalizeEnvelope(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<NormalizedEnvelope> {
  const parsed = await parseHtmlSource(source, absolutePath, relativePath);
  if (parsed.problems.length > 0) {
    return {
      kind: "fragment",
      source,
      changes: [],
      problems: parsed.problems,
    };
  }

  const records = [...parsed.elements.values()];
  const htmlRecords = records.filter((record) => record.element.is("html"));
  if (htmlRecords.length === 0) {
    const documentOnlyElement = [...parsed.elements.values()].find(
      (record) => record.element.is("head") || record.element.is("body"),
    );
    if (parsed.doctypes.length > 0 || documentOnlyElement !== undefined) {
      return blockedEnvelope(
        source,
        relativePath,
        documentOnlyElement?.element.location ?? parsed.doctypes[0],
        "DOCTYPE、head、bodyを使う場合はhtml wrapperも明示する",
      );
    }
    return { kind: "fragment", source, changes: [], problems: [] };
  }
  if (htmlRecords.length !== 1 || parsed.doctypes.length > 1) {
    return blockedEnvelope(
      source,
      relativePath,
      htmlRecords[0]?.element.location,
      "htmlまたはDOCTYPEが複数ある",
    );
  }
  const headRecords = records.filter((record) => record.element.is("head"));
  const bodyRecords = records.filter((record) => record.element.is("body"));
  if (headRecords.length > 1 || bodyRecords.length > 1) {
    const duplicate = headRecords[1] ?? bodyRecords[1];
    return blockedEnvelope(
      source,
      relativePath,
      duplicate?.element.location,
      "headまたはbodyが複数ある",
    );
  }

  const [htmlRecord] = htmlRecords;
  if (
    htmlRecord === undefined ||
    htmlRecord.content === null ||
    htmlRecord.endTag === null ||
    htmlRecord.element.parent !== parsed.root
  ) {
    return blockedEnvelope(
      source,
      relativePath,
      htmlRecord?.element.location,
      "htmlの開始tagと終了tagを明示する",
    );
  }
  const html = htmlRecord.element;
  const body = html.childElements.find((element) => element.is("body"));
  const bodyRecord = body === undefined ? undefined : parsed.elements.get(body);
  if (
    body === undefined ||
    bodyRecord === undefined ||
    bodyRecord.content === null ||
    bodyRecord.endTag === null
  ) {
    return blockedEnvelope(
      source,
      relativePath,
      body?.location ?? html.location,
      "bodyの開始tagと終了tagを明示する",
    );
  }

  const problems: FormatProblem[] = [];
  const misplacedDoctype = parsed.doctypes.find(
    (doctype) => doctype.offset >= htmlRecord.startTag.start,
  );
  if (misplacedDoctype !== undefined) {
    problems.push(
      createFormatProblem(
        relativePath,
        misplacedDoctype.line,
        misplacedDoctype.column,
        "FMT004",
        "DOCTYPEがhtml開始tagより後にある",
      ),
    );
  }
  problems.push(...wrapperAttributeProblems(html, relativePath));
  problems.push(...wrapperAttributeProblems(body, relativePath));
  const head = html.childElements.find((element) => element.is("head"));
  const article = singleRootArticle(body);
  const articleRecord =
    article === null ? undefined : parsed.elements.get(article);
  if (article === null) {
    problems.push(
      ...untransferableWrapperAttributeProblems(html, relativePath),
    );
    problems.push(
      ...untransferableWrapperAttributeProblems(body, relativePath),
    );
  } else if (
    articleRecord === undefined ||
    articleRecord.startTag.start < bodyRecord.content.start ||
    (articleRecord.endTag?.end ?? articleRecord.startTag.end) >
      bodyRecord.content.end
  ) {
    problems.push(
      createFormatProblem(
        relativePath,
        article.location.line,
        article.location.column,
        "FMT004",
        "root articleのsource rangeがbody外にある",
      ),
    );
  }
  if (head !== undefined) {
    problems.push(...attributeProblems(head, relativePath, new Set()));
    if (hasMeaningfulDirectText(head)) {
      problems.push(
        createFormatProblem(
          relativePath,
          head.location.line,
          head.location.column,
          "FMT002",
          "head直下のtext",
        ),
      );
    }
    for (const element of head.childElements) {
      if (!element.is("title") && !element.is("meta")) {
        problems.push(
          createFormatProblem(
            relativePath,
            element.location.line,
            element.location.column,
            "FMT002",
            `<${element.tagName}>`,
          ),
        );
      }
    }
  }
  const beforeBody = source.slice(
    htmlRecord.startTag.end,
    bodyRecord.startTag.start,
  );
  const afterBody = source.slice(
    bodyRecord.endTag.end,
    htmlRecord.endTag.start,
  );
  const before = source.slice(0, htmlRecord.startTag.start);
  const after = source.slice(htmlRecord.endTag.end);
  if (HTML_VALIDATE_DIRECTIVE.test(beforeBody)) {
    problems.push(
      createFormatProblem(
        relativePath,
        head?.location.line ?? html.location.line,
        head?.location.column ?? html.location.column,
        "FMT002",
        "head内のHTML Validate directive",
      ),
    );
  }
  if (
    HTML_VALIDATE_DIRECTIVE.test(before) ||
    HTML_VALIDATE_DIRECTIVE.test(afterBody) ||
    HTML_VALIDATE_DIRECTIVE.test(after)
  ) {
    problems.push(
      createFormatProblem(
        relativePath,
        html.location.line,
        html.location.column,
        "FMT004",
        "削除されるdocument envelope内のHTML Validate directive",
      ),
    );
  }

  const unexpectedChildren = html.childElements.filter(
    (element) => !element.is("head") && !element.is("body"),
  );
  for (const element of unexpectedChildren) {
    problems.push(
      createFormatProblem(
        relativePath,
        element.location.line,
        element.location.column,
        "FMT004",
        `<${element.tagName}>がhtml直下にある`,
      ),
    );
  }
  if (hasMeaningfulDirectText(html)) {
    problems.push(
      createFormatProblem(
        relativePath,
        html.location.line,
        html.location.column,
        "FMT004",
        "headまたはbody外にtextがある",
      ),
    );
  }

  if (!isDocumentTrivia(before, true) || !isDocumentTrivia(after, false)) {
    problems.push(
      createFormatProblem(
        relativePath,
        1,
        1,
        "FMT004",
        "html外にDOCTYPE、comment、空白以外がある",
      ),
    );
  }
  if (!isDocumentTrivia(afterBody, false)) {
    problems.push(
      createFormatProblem(
        relativePath,
        body.location.line,
        body.location.column,
        "FMT004",
        "body終了後かつhtml終了前にcomment、空白以外がある",
      ),
    );
  }
  if (problems.length > 0) {
    return {
      kind: "document",
      source,
      changes: [],
      problems: sortAndDedupeFormatProblems(problems),
    };
  }

  let fragment = source.slice(bodyRecord.content.start, bodyRecord.content.end);
  const changes: FormatChange[] = [{ kind: "document-envelope-removed" }];
  if (head !== undefined) {
    const titles = head.childElements.filter((element) => element.is("title"));
    const metas = head.childElements.filter((element) => element.is("meta"));
    const headRecord = parsed.elements.get(head);
    const haveComment =
      headRecord?.content !== null &&
      headRecord?.content !== undefined &&
      source
        .slice(headRecord.content.start, headRecord.content.end)
        .includes("<!--");
    if (titles.length > 0 || metas.length > 0 || haveComment) {
      const title = titles[0]?.textContent.trim();
      const detail = normalizeDetail(
        [
          ...(title ? [`title=${title}`] : []),
          ...(metas.length > 0 ? [`meta=${metas.length}`] : []),
          ...(haveComment ? ["comment"] : []),
        ].join(" "),
      );
      changes.push({
        kind: "head-metadata-removed",
        ...(detail ? { detail } : {}),
      });
    }
  }

  if (article !== null && articleRecord !== undefined) {
    const copied: string[] = [];
    for (const name of ["lang", "dir"] as const) {
      if (article.hasAttribute(name)) {
        continue;
      }
      const attribute = body.hasAttribute(name)
        ? attributeSource(source, body, name)
        : attributeSource(source, html, name);
      if (attribute === null) {
        continue;
      }
      const relativeOffset =
        articleRecord.startTag.end - bodyRecord.content.start - 1;
      const slashOffset = fragment[relativeOffset - 1] === "/" ? 1 : 0;
      const insertAt = relativeOffset - slashOffset;
      fragment = `${fragment.slice(0, insertAt)} ${attribute}${fragment.slice(insertAt)}`;
      copied.push(name);
    }
    if (copied.length > 0) {
      changes.push({
        kind: "envelope-attribute-copied",
        detail: copied.join(","),
      });
    }
  }

  return { kind: "document", source: fragment, changes, problems: [] };
}

function wrapperAttributeProblems(
  element: HtmlElement,
  file: string,
): FormatProblem[] {
  return attributeProblems(element, file, ALLOWED_WRAPPER_ATTRIBUTES);
}

function untransferableWrapperAttributeProblems(
  element: HtmlElement,
  file: string,
): FormatProblem[] {
  return element.attributes
    .filter((attribute) =>
      ALLOWED_WRAPPER_ATTRIBUTES.has(attribute.key.toLowerCase()),
    )
    .map((attribute) =>
      createFormatProblem(
        file,
        attribute.keyLocation.line,
        attribute.keyLocation.column,
        "FMT003",
        `<${element.tagName}>の${attribute.key}をroot articleへ移せない`,
      ),
    );
}

function attributeProblems(
  element: HtmlElement,
  file: string,
  allowed: ReadonlySet<string>,
): FormatProblem[] {
  const seen = new Set<string>();
  const problems: FormatProblem[] = [];
  for (const attribute of element.attributes) {
    const key = attribute.key.toLowerCase();
    if (!allowed.has(key) || seen.has(key)) {
      problems.push(
        createFormatProblem(
          file,
          attribute.keyLocation.line,
          attribute.keyLocation.column,
          "FMT003",
          `<${element.tagName}>の${attribute.key}`,
        ),
      );
    }
    seen.add(key);
  }
  return problems;
}

function singleRootArticle(body: HtmlElement): HtmlElement | null {
  if (body.childElements.length !== 1 || hasMeaningfulDirectText(body)) {
    return null;
  }
  const [article] = body.childElements;
  return article?.is("article") ? article : null;
}

function hasMeaningfulDirectText(element: HtmlElement): boolean {
  return element.childNodes.some(
    (node: DOMNode) =>
      node.nodeType === NodeType.TEXT_NODE &&
      node.textContent.trim().length > 0,
  );
}

function isDocumentTrivia(value: string, allowDoctype: boolean): boolean {
  let rest = value;
  let consumedDoctype = false;
  while (rest.length > 0) {
    const whitespace = /^\s+/.exec(rest)?.[0];
    if (whitespace !== undefined) {
      rest = rest.slice(whitespace.length);
      continue;
    }
    const comment = /^<!--[\s\S]*?-->/.exec(rest)?.[0];
    if (comment !== undefined) {
      rest = rest.slice(comment.length);
      continue;
    }
    if (allowDoctype && !consumedDoctype) {
      const doctype = /^<!doctype(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(rest)?.[0];
      if (doctype !== undefined) {
        consumedDoctype = true;
        rest = rest.slice(doctype.length);
        continue;
      }
    }
    return false;
  }
  return true;
}

function blockedEnvelope(
  source: string,
  file: string,
  location: Location | undefined,
  detail: string,
): NormalizedEnvelope {
  return {
    kind: "document",
    source,
    changes: [],
    problems: [
      createFormatProblem(
        file,
        location?.line ?? 1,
        location?.column ?? 1,
        "FMT004",
        detail,
      ),
    ],
  };
}

function parseErrorLike(value: unknown): ParseErrorLike {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const location =
    "location" in value && isLocation(value.location)
      ? value.location
      : undefined;
  const message =
    "message" in value && typeof value.message === "string"
      ? value.message
      : undefined;
  return {
    ...(location === undefined ? {} : { location }),
    ...(message === undefined ? {} : { message }),
  };
}

function isLocation(value: unknown): value is Location {
  return (
    typeof value === "object" &&
    value !== null &&
    "line" in value &&
    typeof value.line === "number" &&
    "column" in value &&
    typeof value.column === "number" &&
    "offset" in value &&
    typeof value.offset === "number" &&
    "size" in value &&
    typeof value.size === "number" &&
    "filename" in value &&
    typeof value.filename === "string"
  );
}

function attributeSource(
  source: string,
  element: HtmlElement,
  name: string,
): string | null {
  const attribute = element.getAttribute(name);
  if (attribute === null) {
    return null;
  }
  const start = attribute.keyLocation.offset;
  let end = start + attribute.keyLocation.size;
  while (/\s/.test(source[end] ?? "")) {
    end += 1;
  }
  if (source[end] !== "=") {
    return source.slice(start, start + attribute.keyLocation.size);
  }
  end += 1;
  while (/\s/.test(source[end] ?? "")) {
    end += 1;
  }
  const quote = source[end];
  if (quote === '"' || quote === "'") {
    end = source.indexOf(quote, end + 1) + 1;
  } else {
    while (!/[\s/>]/.test(source[end] ?? ">")) {
      end += 1;
    }
  }
  return source.slice(start, end);
}
