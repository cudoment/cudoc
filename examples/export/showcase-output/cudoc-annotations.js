"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/annotations/model.ts
  var ANNOTATION_CONTEXT = "http://www.w3.org/ns/anno.jsonld";
  var EMBEDDED_DATA_ID = "cudoc-annotations-data";
  var FRAGMENT_KEY = "cudoc-notes";
  var LIMITS = {
    fileBytes: 2 * 1024 * 1024,
    fragmentChars: 64 * 1024,
    decodedBytes: 1024 * 1024,
    items: 500,
    body: 10 * 1024,
    exact: 2048,
    context: 64,
    name: 200,
    id: 200,
    hash: 128,
    selector: 300,
    date: 40
  };
  var AnnotationFormatError = class extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "AnnotationFormatError");
    }
  };
  var fail = (message) => {
    throw new AnnotationFormatError(`annotations: ${message}`);
  };
  var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  var text = (value, max, field) => {
    if (typeof value !== "string") fail(`${field} must be a string`);
    if (value.length > max) fail(`${field} is longer than ${max}`);
    return value;
  };
  var optionalText = (value, max, field) => value === void 0 || value === null ? void 0 : text(value, max, field);
  var oneOf = (value, allowed, field) => {
    if (typeof value !== "string" || !allowed.includes(value))
      fail(`${field} must be one of ${allowed.join(", ")}`);
    return value;
  };
  var offset = (value, field) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647)
      fail(`${field} must be a non-negative integer`);
    return value;
  };
  var date = (value, field) => {
    const raw = text(value, LIMITS.date, field);
    if (Number.isNaN(Date.parse(raw))) fail(`${field} must be an ISO 8601 date`);
    return raw;
  };
  var hasContext = (value) => value === ANNOTATION_CONTEXT || Array.isArray(value) && value.includes(ANNOTATION_CONTEXT);
  function parseSelector(input) {
    if (!isRecord(input)) fail("selector must be an object");
    const record = input;
    switch (record.type) {
      case "TextQuoteSelector": {
        const selector = {
          type: "TextQuoteSelector",
          exact: text(record.exact, LIMITS.exact, "selector.exact")
        };
        const prefix = optionalText(
          record.prefix,
          LIMITS.context,
          "selector.prefix"
        );
        const suffix = optionalText(
          record.suffix,
          LIMITS.context,
          "selector.suffix"
        );
        if (prefix !== void 0) selector.prefix = prefix;
        if (suffix !== void 0) selector.suffix = suffix;
        return selector;
      }
      case "TextPositionSelector": {
        const start2 = offset(record.start, "selector.start");
        const end = offset(record.end, "selector.end");
        if (end < start2) fail("selector.end must not precede selector.start");
        return { type: "TextPositionSelector", start: start2, end };
      }
      case "CssSelector":
        return {
          type: "CssSelector",
          value: text(record.value, LIMITS.selector, "selector.value")
        };
      default:
        return void 0;
    }
  }
  function parseBody(input) {
    if (!isRecord(input)) fail("body must be an object");
    const record = input;
    if (record.type !== "TextualBody") fail("body.type must be TextualBody");
    if (record.format !== void 0 && record.format !== "text/plain")
      fail("body.format must be text/plain");
    return {
      type: "TextualBody",
      value: text(record.value, LIMITS.body, "body.value"),
      format: "text/plain",
      purpose: oneOf(
        record.purpose ?? "commenting",
        ["commenting", "replying"],
        "body.purpose"
      )
    };
  }
  function parseExtension(input, source) {
    if (!isRecord(input)) fail("cudoc must be an object");
    const record = input;
    const document2 = text(record.document ?? source, LIMITS.id, "cudoc.document");
    const extension = {
      document: document2,
      astHash: text(record.astHash ?? "", LIMITS.hash, "cudoc.astHash"),
      sourceHash: text(record.sourceHash ?? "", LIMITS.hash, "cudoc.sourceHash"),
      block: text(record.block ?? "", LIMITS.selector, "cudoc.block"),
      heading: text(record.heading ?? "", LIMITS.selector, "cudoc.heading"),
      scope: oneOf(record.scope ?? "text", ["text", "block"], "cudoc.scope"),
      state: oneOf(record.state ?? "open", ["open", "resolved"], "cudoc.state")
    };
    const parent = optionalText(record.parent, LIMITS.id, "cudoc.parent");
    if (parent !== void 0) extension.parent = parent;
    return extension;
  }
  function parseAnnotation(input) {
    if (!isRecord(input)) fail("an annotation must be an object");
    const record = input;
    if (record.type !== "Annotation") fail("type must be Annotation");
    if (!isRecord(record.target)) fail("target must be an object");
    const target = record.target;
    const source = text(target.source, LIMITS.id, "target.source");
    const rawSelectors = Array.isArray(target.selector) ? target.selector : target.selector === void 0 ? [] : [target.selector];
    const selectors = rawSelectors.map(parseSelector).filter((s) => s !== void 0);
    if (!selectors.some((s) => s.type === "TextQuoteSelector"))
      fail("target.selector must include a TextQuoteSelector");
    const bodies = Array.isArray(record.body) ? record.body : record.body === void 0 ? [] : [record.body];
    const created = date(record.created, "created");
    const annotation = {
      "@context": ANNOTATION_CONTEXT,
      type: "Annotation",
      id: text(record.id, LIMITS.id, "id"),
      created,
      modified: record.modified === void 0 ? created : date(record.modified, "modified"),
      motivation: oneOf(
        record.motivation ?? "commenting",
        ["commenting", "highlighting", "replying"],
        "motivation"
      ),
      body: bodies.map(parseBody),
      target: { source, selector: selectors },
      cudoc: parseExtension(record.cudoc ?? {}, source)
    };
    if (!annotation.id) fail("id must not be empty");
    if (isRecord(record.creator)) {
      const name = text(
        record.creator.name,
        LIMITS.name,
        "creator.name"
      );
      if (name) annotation.creator = { type: "Person", name };
    }
    return annotation;
  }
  function parseCollection(input, generator = "unknown") {
    if (!isRecord(input)) fail("the file must hold a JSON object");
    const record = input;
    if (!hasContext(record["@context"]))
      fail(`@context must include ${ANNOTATION_CONTEXT}`);
    if (record.type === "Annotation")
      return collection([parseAnnotation(record)], generator);
    if (record.type !== "AnnotationCollection")
      fail("type must be AnnotationCollection");
    const items = record.items;
    if (!Array.isArray(items)) fail("items must be an array");
    const list = items;
    if (list.length > LIMITS.items)
      fail(`a file holds at most ${LIMITS.items} notes`);
    return collection(
      list.map(parseAnnotation),
      typeof record.generator === "string" && record.generator.length <= LIMITS.name ? record.generator : generator
    );
  }
  function collection(items, generator) {
    return {
      "@context": ANNOTATION_CONTEXT,
      type: "AnnotationCollection",
      generator,
      total: items.length,
      items: [...items]
    };
  }
  function mergeAnnotations(...lists) {
    const byId = /* @__PURE__ */ new Map();
    for (const list of lists)
      for (const item of list) {
        const current = byId.get(item.id);
        if (!current || current.modified <= item.modified) byId.set(item.id, item);
      }
    return [...byId.values()].sort(
      (a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)
    );
  }
  function threads(items) {
    const ids = new Set(items.map((item) => item.id));
    const roots = items.filter(
      (item) => !item.cudoc.parent || !ids.has(item.cudoc.parent)
    );
    return roots.map((root) => ({
      root,
      replies: items.filter((item) => item.cudoc.parent === root.id)
    }));
  }

  // src/annotations/core.ts
  var CONTEXT_LENGTH = 32;
  var MARKDOWN_INLINE = /* @__PURE__ */ new Set(["*", "_", "`", "~", "\\", "[", "]"]);
  function normalizeText(raw, mode = "plain") {
    const text2 = [];
    const offsets = [];
    let pendingSpace = -1;
    let lineStart = true;
    let index = 0;
    const push = (char, at) => {
      if (pendingSpace >= 0 && text2.length) {
        text2.push(" ");
        offsets.push(pendingSpace);
      }
      pendingSpace = -1;
      text2.push(char);
      offsets.push(at);
    };
    while (index < raw.length) {
      const char = raw[index];
      if (/\s/.test(char)) {
        if (pendingSpace < 0) pendingSpace = index;
        if (char === "\n") lineStart = true;
        index += 1;
        continue;
      }
      if (mode === "markdown") {
        if (lineStart) {
          const rest = raw.slice(index, index + 12);
          const marker = /^(?:[>#|]+|[-+*]|\d{1,9}\.)(?=\s|$)/.exec(rest);
          if (marker) {
            index += marker[0].length;
            continue;
          }
        }
        if (MARKDOWN_INLINE.has(char)) {
          if (char === "]" && raw[index + 1] === "(") {
            const close = raw.indexOf(")", index + 2);
            index = close < 0 ? raw.length : close + 1;
            lineStart = false;
            continue;
          }
          index += 1;
          continue;
        }
      }
      lineStart = false;
      push(char, index);
      index += 1;
    }
    offsets.push(raw.length);
    return { text: text2.join(""), offsets };
  }
  var commonPrefix = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
    return n;
  };
  var commonSuffix = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n])
      n += 1;
    return n;
  };
  function findQuote(raw, quote, window2 = [0, raw.length], mode = "plain") {
    const needle = normalizeText(quote.exact).text;
    if (!needle) return void 0;
    const haystack = normalizeText(raw, mode);
    const prefix = normalizeText(quote.prefix ?? "").text;
    const suffix = normalizeText(quote.suffix ?? "").text;
    const [from, to] = window2;
    let lo = 0;
    while (lo < haystack.text.length && haystack.offsets[lo] < from) lo += 1;
    let hi = haystack.text.length;
    while (hi > lo && haystack.offsets[hi - 1] >= to) hi -= 1;
    let best;
    let at = haystack.text.indexOf(needle, lo);
    while (at >= 0 && at + needle.length <= hi) {
      const score = commonSuffix(prefix, haystack.text.slice(0, at).trimEnd()) + commonPrefix(suffix, haystack.text.slice(at + needle.length).trimStart());
      if (!best || score > best.score)
        best = {
          start: haystack.offsets[at],
          end: haystack.offsets[at + needle.length - 1] + 1,
          score
        };
      at = haystack.text.indexOf(needle, at + 1);
    }
    return best;
  }
  var jsonForScript = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

  // src/browser/dom-text.ts
  var SKIP = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  var BOUNDARY = /* @__PURE__ */ new Set([
    "P",
    "LI",
    "TR",
    "TD",
    "TH",
    "PRE",
    "BLOCKQUOTE",
    "DIV",
    "SECTION",
    "ASIDE",
    "TABLE",
    "UL",
    "OL",
    "DL",
    "DT",
    "DD",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BR",
    "HR",
    "FIGURE",
    "FIGCAPTION",
    "DETAILS",
    "SUMMARY",
    "FOOTER"
  ]);
  function buildTextIndex(root, exclude) {
    const parts = [];
    const nodes = [];
    let length = 0;
    const separator = () => {
      if (parts.length && parts[parts.length - 1] !== "\n") {
        parts.push("\n");
        length += 1;
      }
    };
    const collect = (element) => {
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const node = child;
          nodes.push({ node, start: length });
          parts.push(node.data);
          length += node.data.length;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child;
          if (SKIP.has(el.tagName) || exclude(el)) continue;
          const boundary = BOUNDARY.has(el.tagName);
          if (boundary) separator();
          collect(el);
          if (boundary) separator();
        }
      }
    };
    collect(root);
    return { root, text: parts.join(""), nodes };
  }
  function offsetOf(index, node, offset2) {
    if (node.nodeType === Node.TEXT_NODE) {
      const entry = index.nodes.find((n) => n.node === node);
      return entry ? entry.start + Math.min(offset2, entry.node.data.length) : -1;
    }
    const children = Array.from(node.childNodes);
    for (let i = offset2; i < children.length; i += 1) {
      const found = firstTextIn(index, children[i]);
      if (found) return found.start;
    }
    for (let i = Math.min(offset2, children.length) - 1; i >= 0; i -= 1) {
      const found = lastTextIn(index, children[i]);
      if (found) return found.start + found.node.data.length;
    }
    return -1;
  }
  var firstTextIn = (index, node) => index.nodes.find((n) => node === n.node || node.contains(n.node));
  var lastTextIn = (index, node) => {
    for (let i = index.nodes.length - 1; i >= 0; i -= 1) {
      const entry = index.nodes[i];
      if (node === entry.node || node.contains(entry.node)) return entry;
    }
    return void 0;
  };
  function locate(index, offset2, end = false) {
    for (let i = 0; i < index.nodes.length; i += 1) {
      const entry = index.nodes[i];
      const stop = entry.start + entry.node.data.length;
      if (end ? offset2 <= stop && offset2 > entry.start : offset2 < stop) {
        return { node: entry.node, offset: Math.max(0, offset2 - entry.start) };
      }
      if (!end && offset2 === stop && i === index.nodes.length - 1)
        return { node: entry.node, offset: entry.node.data.length };
    }
    const next = index.nodes.find((n) => n.start >= offset2);
    return next ? { node: next.node, offset: 0 } : void 0;
  }
  function rangeFromOffsets(index, start2, end) {
    const from = locate(index, start2);
    const to = locate(index, end, true);
    if (!from || !to) return void 0;
    try {
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range.collapsed ? void 0 : range;
    } catch {
      return void 0;
    }
  }
  function elementSpan(index, element) {
    const first = firstTextIn(index, element);
    const last = lastTextIn(index, element);
    return first && last ? [first.start, last.start + last.node.data.length] : void 0;
  }
  var HEADINGS = "h1, h2, h3, h4, h5, h6";
  function sectionSpan(index, headingId) {
    if (!headingId) return void 0;
    const headings = Array.from(index.root.querySelectorAll(HEADINGS));
    const at = headings.findIndex((h2) => h2.id === headingId);
    if (at < 0) return void 0;
    const heading = headings[at];
    const depth = Number(heading.tagName.slice(1));
    const start2 = elementSpan(index, heading)?.[0];
    if (start2 === void 0) return void 0;
    for (const next of headings.slice(at + 1))
      if (Number(next.tagName.slice(1)) <= depth) {
        const end = elementSpan(index, next)?.[0];
        return [start2, end ?? index.text.length];
      }
    return [start2, index.text.length];
  }
  var closestBlock = (node) => {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement ?? null;
    return element?.closest("[data-cudoc-block]") ?? null;
  };
  function blockAt(index, offset2) {
    const at = locate(index, offset2);
    return at ? closestBlock(at.node) : null;
  }
  var selectorOf = (a, type) => a.target.selector.find((s) => s.type === type);
  function resolveTarget(a, index) {
    const block = a.cudoc.block ? index.root.querySelector(
      `[data-cudoc-block="${cssEscape(a.cudoc.block)}"]`
    ) : null;
    const blockSpan = block ? elementSpan(index, block) : void 0;
    if (a.cudoc.scope === "block" && block && blockSpan)
      return {
        kind: "block",
        confidence: "exact",
        start: blockSpan[0],
        end: blockSpan[1],
        element: block
      };
    const quote = selectorOf(a, "TextQuoteSelector");
    if (quote) {
      const windows = [];
      if (blockSpan) windows.push([blockSpan[0], blockSpan[1], "exact"]);
      const section = sectionSpan(index, a.cudoc.heading);
      if (section) windows.push([section[0], section[1], "moved"]);
      windows.push([0, index.text.length, "moved"]);
      for (const [from, to, confidence] of windows) {
        const match = findQuote(index.text, quote, [from, to]);
        if (match)
          return {
            kind: a.cudoc.scope === "block" ? "block" : "text",
            confidence,
            start: match.start,
            end: match.end,
            element: blockAt(index, match.start)
          };
      }
      const position = selectorOf(a, "TextPositionSelector");
      if (position && position.end <= index.text.length && normalizeText(index.text.slice(position.start, position.end)).text === normalizeText(quote.exact).text)
        return {
          kind: "text",
          confidence: "moved",
          start: position.start,
          end: position.end,
          element: blockAt(index, position.start)
        };
    }
    return { kind: "orphan" };
  }
  function headingBefore(index, offset2) {
    let id = "";
    for (const heading of Array.from(index.root.querySelectorAll(HEADINGS))) {
      const span = elementSpan(index, heading);
      if (span && span[0] <= offset2 && heading.id) id = heading.id;
      else if (span && span[0] > offset2) break;
    }
    return id;
  }
  function describeSpan(index, start2, end, block, withContext = true) {
    const exact = index.text.slice(start2, end);
    if (!exact.trim()) return void 0;
    const quote = { type: "TextQuoteSelector", exact };
    if (withContext) {
      quote.prefix = index.text.slice(Math.max(0, start2 - CONTEXT_LENGTH), start2);
      quote.suffix = index.text.slice(end, end + CONTEXT_LENGTH);
    }
    const blockId = block?.getAttribute("data-cudoc-block") ?? "";
    const selectors = [
      quote,
      { type: "TextPositionSelector", start: start2, end }
    ];
    if (blockId)
      selectors.push({
        type: "CssSelector",
        value: `[data-cudoc-block="${blockId}"]`
      });
    return {
      selectors,
      block: blockId,
      heading: headingBefore(index, start2),
      start: start2,
      end
    };
  }
  function describeSelection(index, selection) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return void 0;
    const range = selection.getRangeAt(0);
    if (!index.root.contains(range.startContainer) || !index.root.contains(range.endContainer))
      return void 0;
    const start2 = offsetOf(index, range.startContainer, range.startOffset);
    const end = offsetOf(index, range.endContainer, range.endOffset);
    if (start2 < 0 || end < 0 || end <= start2) return void 0;
    return describeSpan(index, start2, end, closestBlock(range.startContainer));
  }
  function describeBlock(index, block) {
    const span = elementSpan(index, block);
    return span ? describeSpan(index, span[0], span[1], block, false) : void 0;
  }
  var cssEscape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");

  // src/browser/store.ts
  function readEmbedded(doc = document) {
    const block = doc.getElementById(EMBEDDED_DATA_ID);
    if (!block) return [];
    return parseText(block.textContent ?? "").items;
  }
  function parseText(text2) {
    if (text2.length > LIMITS.fileBytes)
      throw new Error(
        `annotations: a file holds at most ${LIMITS.fileBytes} bytes`
      );
    return parseCollection(JSON.parse(text2));
  }
  function readAnnotatedHtml(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const block = parsed.getElementById(EMBEDDED_DATA_ID);
    if (!block) throw new Error("annotations: this page carries no notes");
    return parseText(block.textContent ?? "");
  }
  var base64url = (bytes) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  var fromBase64url = (text2) => {
    const padded = text2.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  };
  async function pipe(bytes, stream, limit) {
    const source = new Blob([bytes]).stream().pipeThrough(
      stream
    );
    const reader = source.getReader();
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`annotations: a token decodes to at most ${limit} bytes`);
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
  async function encodeToken(items, generator) {
    const bytes = new TextEncoder().encode(
      JSON.stringify(collection(items, generator))
    );
    if (typeof CompressionStream === "function") {
      const deflated = await pipe(
        bytes,
        new CompressionStream("deflate-raw"),
        LIMITS.decodedBytes
      );
      return `z.${base64url(deflated)}`;
    }
    return `j.${base64url(bytes)}`;
  }
  async function decodeToken(token) {
    if (token.length > LIMITS.fragmentChars)
      throw new Error(
        `annotations: a token holds at most ${LIMITS.fragmentChars} characters`
      );
    const [kind, payload] = [token.slice(0, 2), token.slice(2)];
    if (!payload || kind !== "z." && kind !== "j.")
      throw new Error("annotations: unrecognized token");
    let bytes = fromBase64url(payload);
    if (kind === "z.") {
      if (typeof DecompressionStream !== "function")
        throw new Error(
          "annotations: this browser cannot read a compressed token"
        );
      bytes = await pipe(
        bytes,
        new DecompressionStream("deflate-raw"),
        LIMITS.decodedBytes
      );
    } else if (bytes.length > LIMITS.decodedBytes)
      throw new Error(
        `annotations: a token decodes to at most ${LIMITS.decodedBytes} bytes`
      );
    return parseText(new TextDecoder().decode(bytes));
  }
  function tokenFromLocation(loc = location) {
    const fragment = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash;
    for (const part of fragment.split("&")) {
      const [key, value] = part.split("=", 2);
      if (key === FRAGMENT_KEY && value) return decodeURIComponent(value);
    }
    return void 0;
  }
  function clearTokenFromLocation() {
    const fragment = location.hash.replace(/^#/, "");
    const kept = fragment.split("&").filter((part) => part && !part.startsWith(`${FRAGMENT_KEY}=`)).join("&");
    try {
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${location.search}${kept ? `#${kept}` : ""}`
      );
    } catch {
    }
  }
  var storageKey = (site, documentId) => `cudoc-annotations:${site}:${documentId}`;
  function readLocal(key) {
    try {
      const text2 = localStorage.getItem(key);
      return text2 ? parseText(text2).items : [];
    } catch {
      return [];
    }
  }
  function writeLocal(key, items, generator) {
    try {
      if (items.length)
        localStorage.setItem(key, JSON.stringify(collection(items, generator)));
      else localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  function storageAvailable() {
    try {
      const probe = "cudoc-annotations:probe";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function embeddedCopy(items, generator, uiId, doc = document) {
    const root = doc.documentElement.cloneNode(true);
    root.querySelector(`#${uiId}`)?.remove();
    root.querySelector(`#${EMBEDDED_DATA_ID}`)?.remove();
    for (const marked of Array.from(root.querySelectorAll(".cudoc-ann-marked")))
      marked.classList.remove("cudoc-ann-marked");
    const block = doc.createElement("script");
    block.type = "application/json";
    block.id = EMBEDDED_DATA_ID;
    block.textContent = jsonForScript(collection(items, generator));
    (root.querySelector("body") ?? root).append(block);
    return `<!doctype html>
${root.outerHTML}`;
  }

  // src/browser/ui.ts
  var UI_ID = "cudoc-annotations";
  var LANGS = ["en", "ko"];
  var STRINGS = {
    ko: {
      toggle: "\uBA54\uBAA8",
      panelTitle: "\uBA54\uBAA8",
      note: "\uBA54\uBAA8",
      noteOn: "\uBA54\uBAA8 \uB300\uC0C1",
      writeNote: "\uBA54\uBAA8\uB97C \uC785\uB825\uD558\uC138\uC694\u2026",
      blockNote: "\uC774 \uBE14\uB85D \uC804\uCCB4\uC5D0 \uBA54\uBAA8",
      author: "\uC791\uC131\uC790 \uC774\uB984",
      authorHint: "\uC120\uD0DD \uC0AC\uD56D\uC774\uBA70 \uBA54\uBAA8 \uD30C\uC77C\uC5D0 \uAE30\uB85D\uB429\uB2C8\uB2E4.",
      body: "\uBA54\uBAA8 \uB0B4\uC6A9",
      save: "\uC800\uC7A5",
      cancel: "\uCDE8\uC18C",
      copyToken: "\uACF5\uC720 \uD1A0\uD070 \uBCF5\uC0AC",
      tokenWarning: "\uD1A0\uD070\uC5D0\uB294 \uBA54\uBAA8 \uBCF8\uBB38\uACFC \uC774\uB984\uC774 \uADF8\uB300\uB85C \uB4E4\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
      tokenReady: "\uC544\uB798 \uD1A0\uD070\uC744 \uBCF5\uC0AC\uD574 \uC804\uB2EC\uD558\uC138\uC694. \uBC1B\uB294 \uCABD\uC740 \uC790\uAE30 \uC0AC\uBCF8\uC758 \uC8FC\uC18C \uB05D\uC5D0 \uBD99\uC5EC \uC5F4\uAC70\uB098 cudoc-export annotations --token \uC5D0 \uB118\uAE38 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      tokenCopied: "\uD1A0\uD070\uC744 \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.",
      tokenTooLong: "\uD1A0\uD070\uC774 \uB9E4\uC6B0 \uAE41\uB2C8\uB2E4. \uB300\uC2E0 JSON \uD30C\uC77C\uC744 \uC804\uB2EC\uD558\uB294 \uCABD\uC774 \uC548\uC804\uD569\uB2C8\uB2E4.",
      clearStorage: "\uC800\uC7A5\uB41C \uBA54\uBAA8 \uBAA8\uB450 \uC9C0\uC6B0\uAE30",
      cleared: "\uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC800\uC7A5\uB41C \uBA54\uBAA8\uB97C \uC9C0\uC6E0\uC2B5\uB2C8\uB2E4. \uD30C\uC77C\uB85C \uB0B4\uB824\uBC1B\uC740 \uBA54\uBAA8\uB294 \uADF8\uB300\uB85C\uC785\uB2C8\uB2E4.",
      more: "\uB354 \uBCF4\uAE30",
      download: "\uBA54\uBAA8 \uB0B4\uB824\uBC1B\uAE30 (JSON)",
      saveCopy: "\uBA54\uBAA8 \uB0B4\uC7A5 \uC0AC\uBCF8 \uC800\uC7A5",
      saveCopyHint: "\uC0AC\uBCF8\uC740 \uC6D0\uBCF8\uACFC \uAC19\uC740 \uD3F4\uB354\uC5D0 \uB450\uC5B4\uC57C \uC2A4\uD0C0\uC77C\uACFC \uBA54\uBAA8 \uAE30\uB2A5\uC774 \uC5F4\uB9BD\uB2C8\uB2E4.",
      importFile: "\uBA54\uBAA8 \uBD88\uB7EC\uC624\uAE30 (.json, .html)",
      imported: (n) => `\uBA54\uBAA8 ${n}\uAC1C\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.`,
      importFailed: (why) => `\uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${why}`,
      storageOff: "\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 \uB85C\uCEEC \uD30C\uC77C\uC758 \uC800\uC7A5\uC744 \uD5C8\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uB5A0\uB098\uAE30 \uC804\uC5D0 \uBA54\uBAA8\uB97C \uB0B4\uB824\uBC1B\uC73C\uC138\uC694.",
      empty: "\uC544\uC9C1 \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE00\uC790\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uBE14\uB85D \uC67C\uCABD\uC758 + \uB97C \uB204\uB974\uC138\uC694.",
      others: (n) => `\uB2E4\uB978 \uBB38\uC11C\uC758 \uBA54\uBAA8 ${n}\uAC1C\uB294 \uC774 \uD398\uC774\uC9C0\uC5D0 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC9C0\uB9CC \uB0B4\uB824\uBC1B\uAE30\uC5D0\uB294 \uD3EC\uD568\uB429\uB2C8\uB2E4.`,
      stale: "\uC774 \uBA54\uBAA8\uB294 \uBB38\uC11C\uC758 \uB2E4\uB978 \uBC84\uC804\uC5D0\uC11C \uC791\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      staleBanner: "\uBA54\uBAA8 \uC77C\uBD80\uAC00 \uC774 \uBB38\uC11C\uC758 \uB2E4\uB978 \uBC84\uC804\uC5D0\uC11C \uC791\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC704\uCE58\uAC00 \uC5B4\uAE0B\uB0AC\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      orphan: "\uC704\uCE58\uB97C \uCC3E\uC9C0 \uBABB\uD568",
      moved: "\uC704\uCE58 \uBD88\uD655\uC2E4",
      block: "\uBE14\uB85D",
      resolved: "\uD574\uACB0\uB428",
      open: "\uC5F4\uB9BC",
      resolve: "\uD574\uACB0",
      reopen: "\uB2E4\uC2DC \uC5F4\uAE30",
      edit: "\uC218\uC815",
      remove: "\uC0AD\uC81C",
      reply: "\uB2F5\uAE00",
      goTo: "\uC774\uB3D9",
      tokenPrompt: (n) => `\uC774 \uC8FC\uC18C\uC5D0\uB294 \uAC80\uC99D\uB418\uC9C0 \uC54A\uC740 \uBA54\uBAA8 ${n}\uAC1C\uAC00 \uB4E4\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uBD88\uB7EC\uC62C\uAE4C\uC694?`,
      tokenSource: "\uCD9C\uCC98: \uB9C1\uD06C, \uAC80\uC99D\uB418\uC9C0 \uC54A\uC74C",
      accept: "\uBD88\uB7EC\uC624\uAE30",
      reject: "\uBB34\uC2DC",
      tokenInvalid: (why) => `\uC8FC\uC18C\uC758 \uBA54\uBAA8\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${why}`,
      close: "\uB2EB\uAE30",
      quote: "\uC778\uC6A9",
      language: "\uC5B8\uC5B4",
      layout: "\uD328\uB110 \uBC30\uCE58",
      layoutPush: "\uBCF8\uBB38\uC744 \uC881\uD798",
      layoutOverlay: "\uBCF8\uBB38 \uC704\uC5D0 \uACB9\uCE68"
    },
    en: {
      toggle: "Notes",
      panelTitle: "Notes",
      note: "Note",
      noteOn: "Note on",
      writeNote: "Write a note\u2026",
      blockNote: "Note on this whole block",
      author: "Your name",
      authorHint: "Optional; written into the notes file.",
      body: "Note text",
      save: "Save",
      cancel: "Cancel",
      copyToken: "Copy share token",
      tokenWarning: "The token carries the note text and names as they are.",
      tokenReady: "Copy the token below and pass it on. The recipient appends it to the address of their own copy, or gives it to cudoc-export annotations --token.",
      tokenCopied: "Token copied.",
      tokenTooLong: "The token is very long. A JSON file is the safer way to hand these over.",
      clearStorage: "Clear all stored notes",
      cleared: "Cleared the notes this browser stored. Downloaded files are untouched.",
      more: "More",
      download: "Download notes (JSON)",
      saveCopy: "Save a copy with notes",
      saveCopyHint: "Keep the copy in the same folder as the original so its styles and notes load.",
      importFile: "Load notes (.json, .html)",
      imported: (n) => `Loaded ${n} notes.`,
      importFailed: (why) => `Could not load: ${why}`,
      storageOff: "This browser does not let a local file store anything. Download your notes before leaving.",
      empty: "No notes yet. Select text, or press + beside a block.",
      others: (n) => `${n} notes on other documents are not shown here but are included in the download.`,
      stale: "This note was written on a different version of the document.",
      staleBanner: "Some notes were written on a different version of this document; their positions may be off.",
      orphan: "Not found",
      moved: "Position uncertain",
      block: "Block",
      resolved: "Resolved",
      open: "Open",
      resolve: "Resolve",
      reopen: "Reopen",
      edit: "Edit",
      remove: "Delete",
      reply: "Reply",
      goTo: "Go to",
      tokenPrompt: (n) => `This address carries ${n} unverified notes. Load them?`,
      tokenSource: "Source: link, unverified",
      accept: "Load",
      reject: "Ignore",
      tokenInvalid: (why) => `Could not read the notes in the address: ${why}`,
      close: "Close",
      quote: "Quote",
      language: "Language",
      layout: "Panel placement",
      layoutPush: "Narrow the page",
      layoutOverlay: "Cover the page"
    }
  };
  var LANGUAGE_NAMES = { en: "English", ko: "\uD55C\uAD6D\uC5B4" };
  function h(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    if (props.className) element.className = props.className;
    if (props.title) element.title = props.title;
    if (props.type) element.setAttribute("type", props.type);
    if (props.hidden) element.hidden = true;
    for (const [name, value] of Object.entries(props.attrs ?? {}))
      element.setAttribute(name, value);
    if (props.text !== void 0) element.textContent = props.text;
    for (const child of children)
      element.append(
        typeof child === "string" ? document.createTextNode(child) : child
      );
    return element;
  }
  var ICONS = {
    bubble: ["M4 4h16v11H9l-5 4z"],
    plus: ["M12 5v14", "M5 12h14"],
    close: ["M6 6l12 12", "M18 6L6 18"],
    push: ["M3 5h18v14H3z", "M15 5v14"],
    overlay: ["M3 5h12v10H3z", "M9 9h12v10H9z"],
    link: [
      "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5",
      "M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5"
    ],
    trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
    download: ["M12 4v12", "M7 11l5 5 5-5", "M4 20h16"],
    copy: ["M6 3h9l4 4v14H6z", "M15 3v4h4", "M9 13h6", "M9 17h6"],
    upload: ["M12 20V8", "M7 13l5-5 5 5", "M4 4h16"],
    goto: ["M5 12h14", "M13 6l6 6-6 6"],
    reply: ["M9 17l-5-5 5-5", "M4 12h9a6 6 0 0 1 6 6v1"],
    edit: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
    check: ["M5 12l5 5L20 7"],
    reopen: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"]
  };
  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ICONS[name]) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  var PUSH_CLASS = "cudoc-ann-push";
  var COMPOSER_WIDTH = 352;
  var Ui = class {
    constructor(t, lang, layout, handlers) {
      __publicField(this, "t", t);
      __publicField(this, "handlers", handlers);
      __publicField(this, "root");
      __publicField(this, "panel");
      __publicField(this, "list");
      __publicField(this, "toggle");
      __publicField(this, "count");
      __publicField(this, "noteButton");
      __publicField(this, "blockButton");
      __publicField(this, "message");
      __publicField(this, "banner");
      __publicField(this, "tokenBar");
      __publicField(this, "tokenBox");
      __publicField(this, "authorInput");
      __publicField(this, "layoutButton");
      __publicField(this, "composerRoot");
      __publicField(this, "composerText");
      __publicField(this, "composerEyebrow");
      __publicField(this, "composerQuote");
      __publicField(this, "composerSave");
      __publicField(this, "messageTimer");
      __publicField(this, "opened", false);
      __publicField(this, "layout");
      this.layout = layout;
      const button = (text2, className, onClick, options = {}) => {
        const el = h("button", {
          className: `cudoc-ann-button ${className}`,
          type: "button",
          title: options.title
        });
        if (options.icon) el.append(icon(options.icon));
        el.append(document.createTextNode(text2));
        el.addEventListener("click", onClick);
        return el;
      };
      const iconButton = (name, label, className, onClick) => {
        const el = h("button", {
          className: `cudoc-ann-button cudoc-ann-icon ${className}`,
          type: "button",
          title: label,
          attrs: { "aria-label": label }
        });
        el.append(icon(name));
        el.addEventListener("click", onClick);
        return el;
      };
      this.count = h("span", { className: "cudoc-ann-count", hidden: true });
      this.toggle = h(
        "button",
        {
          className: "cudoc-ann-toggle",
          type: "button",
          title: t.toggle,
          attrs: {
            "aria-label": t.toggle,
            "aria-expanded": "false",
            "aria-controls": `${UI_ID}-panel`
          }
        },
        [icon("bubble"), this.count]
      );
      this.toggle.addEventListener("click", () => this.setOpen(!this.opened));
      this.authorInput = h("input", {
        className: "cudoc-ann-author",
        type: "text",
        attrs: {
          id: `${UI_ID}-author`,
          placeholder: t.author,
          maxlength: "200",
          autocomplete: "name"
        }
      });
      this.authorInput.addEventListener(
        "input",
        () => handlers.onAuthor(this.authorInput.value.trim())
      );
      const authorField = h("div", { className: "cudoc-ann-field" }, [
        h("label", { text: t.author, attrs: { for: `${UI_ID}-author` } }),
        this.authorInput,
        h("small", { text: t.authorHint })
      ]);
      const fileInput = h("input", {
        type: "file",
        className: "cudoc-ann-file",
        attrs: { accept: ".json,.html,application/json,text/html" }
      });
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) handlers.onImport(file);
        fileInput.value = "";
      });
      const importLabel = h(
        "label",
        { className: "cudoc-ann-button cudoc-ann-import" },
        [icon("upload"), t.importFile, fileInput]
      );
      this.tokenBox = h("div", { className: "cudoc-ann-token", hidden: true });
      const actions = h("div", { className: "cudoc-ann-actions" }, [
        button(t.copyToken, "cudoc-ann-tokenbutton", handlers.onToken, {
          icon: "link",
          title: t.tokenWarning
        }),
        button(t.clearStorage, "cudoc-ann-clear", handlers.onClearStorage, {
          icon: "trash"
        })
      ]);
      const more = h("details", { className: "cudoc-ann-more" }, [
        h("summary", { text: t.more }),
        h("div", { className: "cudoc-ann-actions" }, [
          button(t.download, "cudoc-ann-download", handlers.onDownload, {
            icon: "download"
          }),
          button(t.saveCopy, "cudoc-ann-copy", handlers.onSaveCopy, {
            icon: "copy",
            title: t.saveCopyHint
          }),
          importLabel
        ])
      ]);
      const languageSelect = h("select", {
        className: "cudoc-ann-lang",
        attrs: { "aria-label": t.language, title: t.language }
      });
      for (const code of LANGS) {
        const option = h("option", { text: LANGUAGE_NAMES[code] });
        option.value = code;
        option.selected = code === lang;
        languageSelect.append(option);
      }
      languageSelect.addEventListener(
        "change",
        () => handlers.onLanguage(languageSelect.value)
      );
      this.layoutButton = iconButton("push", t.layout, "cudoc-ann-layout", () => {
        this.setLayout(this.layout === "push" ? "overlay" : "push");
        handlers.onLayout(this.layout);
      });
      const close = iconButton(
        "close",
        t.close,
        "cudoc-ann-close",
        () => this.setOpen(false)
      );
      this.banner = h("p", { className: "cudoc-ann-banner", hidden: true });
      this.list = h("ol", { className: "cudoc-ann-list" });
      this.panel = h(
        "section",
        {
          className: "cudoc-ann-panel",
          hidden: true,
          attrs: { id: `${UI_ID}-panel`, "aria-label": t.panelTitle }
        },
        [
          h("div", { className: "cudoc-ann-head" }, [
            h("h2", { className: "cudoc-ann-title", text: t.panelTitle }),
            h("div", { className: "cudoc-ann-tools" }, [
              languageSelect,
              this.layoutButton,
              close
            ])
          ]),
          authorField,
          actions,
          more,
          this.tokenBox,
          this.banner,
          this.list
        ]
      );
      this.noteButton = h(
        "button",
        {
          className: "cudoc-ann-button cudoc-ann-float",
          type: "button",
          hidden: true
        },
        [icon("bubble"), t.note]
      );
      this.blockButton = h(
        "button",
        {
          className: "cudoc-ann-button cudoc-ann-icon cudoc-ann-gutter",
          type: "button",
          title: t.blockNote,
          hidden: true,
          attrs: { "aria-label": t.blockNote }
        },
        [icon("plus")]
      );
      this.message = h("p", {
        className: "cudoc-ann-message",
        hidden: true,
        attrs: { role: "status" }
      });
      this.tokenBar = h("div", {
        className: "cudoc-ann-tokenbar",
        hidden: true,
        attrs: { role: "dialog" }
      });
      this.composerText = h("textarea", {
        className: "cudoc-ann-text",
        attrs: {
          rows: "4",
          "aria-label": t.body,
          placeholder: t.writeNote,
          maxlength: "10240"
        }
      });
      this.composerEyebrow = h("p", {
        className: "cudoc-ann-eyebrow",
        text: t.noteOn
      });
      this.composerQuote = h("blockquote", { className: "cudoc-ann-quote" });
      this.composerRoot = h(
        "div",
        {
          className: "cudoc-ann-composer",
          hidden: true,
          attrs: { role: "dialog", "aria-label": t.note }
        },
        [
          this.composerEyebrow,
          this.composerQuote,
          this.composerText,
          h("div", { className: "cudoc-ann-row cudoc-ann-end" }, [
            button(t.cancel, "cudoc-ann-cancel", () => this.closeComposer()),
            button(t.save, "cudoc-ann-primary", () => this.saveComposer())
          ])
        ]
      );
      this.composerText.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.closeComposer();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
          this.saveComposer();
      });
      this.root = h("div", { className: "cudoc-ann", attrs: { id: UI_ID } }, [
        this.tokenBar,
        this.toggle,
        this.panel,
        this.noteButton,
        this.blockButton,
        this.composerRoot,
        this.message
      ]);
      this.root.addEventListener("dragover", (event) => event.preventDefault());
      this.root.addEventListener("drop", (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (file) handlers.onImport(file);
      });
      this.setLayout(layout);
    }
    get isOpen() {
      return this.opened;
    }
    setOpen(open) {
      this.opened = open;
      this.panel.hidden = !open;
      this.toggle.setAttribute("aria-expanded", String(open));
      this.applyLayout();
      this.hideNoteButton();
      this.hideBlockButton();
    }
    get composerOpen() {
      return !this.composerRoot.hidden;
    }
    /** The right edge floating pieces may reach: the open panel's left side. */
    rightLimit() {
      return this.opened && this.layout === "overlay" ? this.panel.getBoundingClientRect().left : window.innerWidth;
    }
    /** Push mode makes the page narrower while the panel is open. */
    setLayout(layout) {
      this.layout = layout;
      const t = this.t;
      const label = `${t.layout}: ${layout === "push" ? t.layoutPush : t.layoutOverlay}`;
      this.layoutButton.replaceChildren(
        icon(layout === "push" ? "push" : "overlay")
      );
      this.layoutButton.title = label;
      this.layoutButton.setAttribute("aria-label", label);
      this.applyLayout();
    }
    applyLayout() {
      document.documentElement.classList.toggle(
        PUSH_CLASS,
        this.opened && this.layout === "push"
      );
    }
    /** Removes the layer and its effect on the page, before a rebuild. */
    destroy() {
      document.documentElement.classList.remove(PUSH_CLASS);
      this.root.remove();
    }
    /** The floating button next to a selection. */
    showNoteButton(rect, onClick) {
      this.noteButton.hidden = false;
      this.noteButton.style.left = `${Math.max(8, Math.min(rect.right, this.rightLimit() - 104))}px`;
      this.noteButton.style.top = `${rect.bottom + 6}px`;
      this.noteButton.onclick = onClick;
    }
    hideNoteButton() {
      this.noteButton.hidden = true;
    }
    /**
     * The "+" in the gutter of the hovered block, centred on its first line of
     * text rather than on the box edge, so it reads as belonging to the text.
     */
    showBlockButton(block, onClick) {
      const rect = block.getBoundingClientRect();
      const probe = block.matches("tr") ? block.querySelector("th, td") ?? block : block;
      const style = getComputedStyle(probe);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 24;
      const inset = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0);
      this.blockButton.hidden = false;
      const size = this.blockButton.offsetHeight || 24;
      this.blockButton.style.left = `${Math.max(4, rect.left - size - 8)}px`;
      this.blockButton.style.top = `${rect.top + inset + (line - size) / 2}px`;
      this.blockButton.onclick = onClick;
    }
    hideBlockButton() {
      this.blockButton.hidden = true;
    }
    /** Whether a point lies on the gutter button. */
    onBlockButton(x, y) {
      if (this.blockButton.hidden) return false;
      const rect = this.blockButton.getBoundingClientRect();
      return x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4;
    }
    get composer() {
      return {
        open: (rect, initial, onSave, label) => {
          this.composerSave = onSave;
          this.composerText.value = initial;
          this.composerQuote.textContent = label ?? "";
          this.composerQuote.hidden = !label;
          this.composerEyebrow.hidden = !label;
          this.composerRoot.hidden = false;
          this.composerRoot.style.left = `${Math.max(8, Math.min(rect.left, this.rightLimit() - COMPOSER_WIDTH - 8))}px`;
          this.composerRoot.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 240))}px`;
          this.composerText.focus();
        },
        close: () => this.closeComposer()
      };
    }
    saveComposer() {
      const body = this.composerText.value.trim();
      const save = this.composerSave;
      this.closeComposer();
      if (save) save(body);
    }
    closeComposer() {
      this.composerRoot.hidden = true;
      this.composerSave = void 0;
      this.hideNoteButton();
      this.hideBlockButton();
      document.getSelection()?.removeAllRanges();
    }
    notify(text2) {
      this.message.textContent = text2;
      this.message.hidden = false;
      if (this.messageTimer) window.clearTimeout(this.messageTimer);
      this.messageTimer = window.setTimeout(() => {
        this.message.hidden = true;
      }, 4e3);
    }
    /** A token to copy by hand, shown until the panel is next re-rendered. */
    showToken(text2, hint) {
      this.tokenBox.replaceChildren(
        h("p", { text: hint }),
        h("textarea", {
          className: "cudoc-ann-tokentext",
          attrs: { readonly: "", rows: "3", "aria-label": this.t.copyToken },
          text: text2
        })
      );
      this.tokenBox.hidden = false;
      this.setOpen(true);
    }
    /** The bar asking whether to load notes found in the address. */
    confirmToken(count, onAccept, onReject) {
      const accept = h("button", {
        className: "cudoc-ann-button cudoc-ann-primary",
        type: "button",
        text: this.t.accept
      });
      const reject = h("button", {
        className: "cudoc-ann-button",
        type: "button",
        text: this.t.reject
      });
      accept.addEventListener("click", () => {
        this.tokenBar.hidden = true;
        onAccept();
      });
      reject.addEventListener("click", () => {
        this.tokenBar.hidden = true;
        onReject();
      });
      this.tokenBar.replaceChildren(
        h("p", { text: this.t.tokenPrompt(count) }),
        h("p", { className: "cudoc-ann-source", text: this.t.tokenSource }),
        h("div", { className: "cudoc-ann-row" }, [accept, reject])
      );
      this.tokenBar.hidden = false;
    }
    render(view) {
      const t = this.t;
      this.count.hidden = view.notes.length === 0;
      this.count.textContent = String(view.notes.length);
      this.toggle.setAttribute(
        "aria-label",
        view.notes.length ? `${t.toggle} (${view.notes.length})` : t.toggle
      );
      if (document.activeElement !== this.authorInput && this.authorInput.value !== view.author)
        this.authorInput.value = view.author;
      this.tokenBox.hidden = true;
      const banners = [];
      if (!view.storage) banners.push(t.storageOff);
      if (view.stale) banners.push(t.staleBanner);
      this.banner.hidden = banners.length === 0;
      this.banner.textContent = banners.join(" ");
      const items = [];
      if (!view.notes.length)
        items.push(h("li", { className: "cudoc-ann-empty", text: t.empty }));
      for (const entry of view.notes)
        items.push(this.renderNote(entry, view.active));
      if (view.others)
        items.push(
          h("li", { className: "cudoc-ann-others", text: t.others(view.others) })
        );
      this.list.replaceChildren(...items);
    }
    renderNote(entry, active) {
      const t = this.t;
      const { note, anchor, replies } = entry;
      const state = note.cudoc.state;
      const quote = note.target.selector.find(
        (s) => s.type === "TextQuoteSelector"
      );
      const pill = (text2, tone) => h("span", {
        className: `cudoc-ann-pill${tone ? ` cudoc-ann-pill-${tone}` : ""}`,
        text: text2
      });
      const badges = h("span", { className: "cudoc-ann-badges" }, [
        state === "resolved" ? pill(t.resolved) : pill(t.open, "open")
      ]);
      if (note.cudoc.scope === "block") badges.append(pill(t.block));
      if (anchor.kind === "orphan") badges.append(pill(t.orphan, "warn"));
      else if (anchor.confidence === "moved") badges.append(pill(t.moved, "warn"));
      const item = h("li", {
        className: `cudoc-ann-item${note.id === active ? " cudoc-ann-active" : ""}${state === "resolved" ? " cudoc-ann-resolved" : ""}`,
        attrs: { "data-id": note.id }
      });
      item.append(
        h("div", { className: "cudoc-ann-meta" }, [
          badges,
          h("span", {
            className: "cudoc-ann-who",
            text: describeAuthor(note),
            title: describeAuthor(note)
          })
        ])
      );
      if (entry.stale)
        item.append(h("p", { className: "cudoc-ann-stale", text: t.stale }));
      if (quote && quote.type === "TextQuoteSelector")
        item.append(
          h("blockquote", {
            className: "cudoc-ann-excerpt",
            text: excerpt(quote.exact),
            title: t.quote
          })
        );
      item.append(h("p", { className: "cudoc-ann-body", text: bodyOf(note) }));
      for (const reply of replies)
        item.append(
          h("div", { className: "cudoc-ann-reply" }, [
            h("span", {
              className: "cudoc-ann-who",
              text: describeAuthor(reply)
            }),
            h("p", { className: "cudoc-ann-body", text: bodyOf(reply) })
          ])
        );
      const action = (name, label, onClick) => {
        const button = h("button", {
          className: "cudoc-ann-button cudoc-ann-icon cudoc-ann-ghost",
          type: "button",
          title: label,
          attrs: { "aria-label": label }
        });
        button.append(icon(name));
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onClick();
        });
        return button;
      };
      const tools = h("div", { className: "cudoc-ann-tools cudoc-ann-itemtools" });
      if (anchor.kind !== "orphan")
        tools.append(
          action("goto", t.goTo, () => this.handlers.onSelect(note.id))
        );
      tools.append(
        action(
          "reply",
          t.reply,
          () => this.inlineEditor(
            item,
            "",
            (body) => this.handlers.onReply(note.id, body)
          )
        ),
        action(
          "edit",
          t.edit,
          () => this.inlineEditor(
            item,
            bodyOf(note),
            (body) => this.handlers.onEdit(note.id, body)
          )
        ),
        state === "resolved" ? action("reopen", t.reopen, () => this.handlers.onToggleState(note.id)) : action(
          "check",
          t.resolve,
          () => this.handlers.onToggleState(note.id)
        ),
        action("trash", t.remove, () => this.handlers.onDelete(note.id))
      );
      item.append(tools);
      item.addEventListener("click", () => {
        if (anchor.kind !== "orphan") this.handlers.onSelect(note.id);
      });
      return item;
    }
    /** A textarea inside a list item, for edits and replies. */
    inlineEditor(item, initial, onSave) {
      item.querySelector(".cudoc-ann-inline")?.remove();
      const text2 = h("textarea", {
        className: "cudoc-ann-text",
        attrs: {
          rows: "3",
          "aria-label": this.t.body,
          placeholder: this.t.writeNote,
          maxlength: "10240"
        }
      });
      text2.value = initial;
      const save = h("button", {
        className: "cudoc-ann-button cudoc-ann-primary",
        type: "button",
        text: this.t.save
      });
      const cancel = h("button", {
        className: "cudoc-ann-button",
        type: "button",
        text: this.t.cancel
      });
      const editor = h("div", { className: "cudoc-ann-inline" }, [
        text2,
        h("div", { className: "cudoc-ann-row cudoc-ann-end" }, [cancel, save])
      ]);
      editor.addEventListener("click", (event) => event.stopPropagation());
      save.addEventListener("click", () => {
        const body = text2.value.trim();
        editor.remove();
        if (body) onSave(body);
      });
      cancel.addEventListener("click", () => editor.remove());
      item.append(editor);
      text2.focus();
    }
  };
  var bodyOf = (note) => note.body.map((b) => b.value).join("\n");
  var describeAuthor = (note) => {
    const when = `${note.modified.slice(0, 16).replace("T", " ")}Z`;
    return note.creator ? `${note.creator.name} \xB7 ${when}` : when;
  };
  var excerpt = (raw) => {
    const text2 = raw.replace(/\s+/g, " ").trim();
    return text2.length > 120 ? `${text2.slice(0, 117).trimEnd()}\u2026` : text2;
  };

  // src/browser/cudoc-annotations.ts
  var AUTHOR_KEY = "cudoc-annotations:author";
  var LANG_KEY = "cudoc-annotations:lang";
  var LAYOUT_KEY = "cudoc-annotations:layout";
  var LAYOUTS = ["push", "overlay"];
  var TOKEN_WARN_CHARS = 16 * 1024;
  var GUTTER_REACH = 48;
  function readPreference(key, allowed, fallback) {
    try {
      const value = localStorage.getItem(key);
      return allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  function writePreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function start() {
    const main = document.querySelector("main[data-cudoc-document]");
    if (!main) return;
    const documentId = main.dataset.cudocDocument ?? "";
    const astHash = main.dataset.cudocAstHash ?? "";
    const sourceHash = main.dataset.cudocSourceHash ?? "";
    const site = main.dataset.cudocSite ?? "";
    const generator = main.dataset.cudocGenerator ?? "cudoc-export";
    let lang = readPreference(LANG_KEY, LANGS, "en");
    let layout = readPreference(LAYOUT_KEY, LAYOUTS, "push");
    let t = STRINGS[lang];
    const key = storageKey(site, documentId);
    const storage = storageAvailable();
    const fileStem = documentId.split("/").pop() || "notes";
    let items = [];
    let anchors = /* @__PURE__ */ new Map();
    let active;
    let author = "";
    try {
      author = localStorage.getItem(AUTHOR_KEY) ?? "";
    } catch {
      author = "";
    }
    const index = buildTextIndex(
      main,
      (el) => el.tagName === "FOOTER" || el.id === UI_ID
    );
    const roots = () => items.filter((a) => a.cudoc.document === documentId && !a.cudoc.parent);
    const highlightsSupported = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
    const paint = () => {
      for (const el of Array.from(main.querySelectorAll(".cudoc-ann-marked")))
        el.classList.remove("cudoc-ann-marked");
      if (highlightsSupported) {
        const open = new Highlight();
        const resolved = new Highlight();
        const current = new Highlight();
        for (const note of roots()) {
          const anchor = anchors.get(note.id);
          if (!anchor || anchor.kind === "orphan") continue;
          const range = rangeFromOffsets(index, anchor.start, anchor.end);
          if (!range) continue;
          if (note.id === active) current.add(range);
          else if (note.cudoc.state === "resolved") resolved.add(range);
          else open.add(range);
        }
        CSS.highlights.set("cudoc-note", open);
        CSS.highlights.set("cudoc-note-resolved", resolved);
        CSS.highlights.set("cudoc-note-active", current);
        return;
      }
      for (const note of roots()) {
        const anchor = anchors.get(note.id);
        if (anchor && anchor.kind !== "orphan" && anchor.element)
          anchor.element.classList.add("cudoc-ann-marked");
      }
    };
    const persist = () => {
      if (storage) writeLocal(key, items, generator);
    };
    const view = () => {
      const byThread = threads(
        items.filter((a) => a.cudoc.document === documentId)
      );
      return byThread.map(({ root, replies }) => ({
        note: root,
        replies,
        anchor: anchors.get(root.id) ?? { kind: "orphan" },
        stale: root.cudoc.astHash !== "" && root.cudoc.astHash !== astHash
      }));
    };
    const refresh = () => {
      anchors = new Map(
        roots().map((note) => [note.id, resolveTarget(note, index)])
      );
      paint();
      const notes = view();
      ui.render({
        notes,
        others: items.filter((a) => a.cudoc.document !== documentId).length,
        stale: notes.some((n) => n.stale),
        storage,
        author,
        active
      });
      persist();
    };
    const now = () => (/* @__PURE__ */ new Date()).toISOString();
    const newId = () => `urn:uuid:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`}`;
    const add = (described, body, scope) => {
      const created = now();
      const note = {
        "@context": ANNOTATION_CONTEXT,
        type: "Annotation",
        id: newId(),
        created,
        modified: created,
        motivation: body ? "commenting" : "highlighting",
        body: body ? [
          {
            type: "TextualBody",
            value: body,
            format: "text/plain",
            purpose: "commenting"
          }
        ] : [],
        target: { source: documentId, selector: described.selectors },
        cudoc: {
          document: documentId,
          astHash,
          sourceHash,
          block: described.block,
          heading: described.heading,
          scope,
          state: "open"
        }
      };
      if (author) note.creator = { type: "Person", name: author };
      items = mergeAnnotations(items, [note]);
      active = note.id;
      refresh();
      return note;
    };
    const find = (id) => items.find((a) => a.id === id);
    const handlers = {
      onAuthor: (name) => {
        author = name.slice(0, LIMITS.name);
        try {
          if (author) localStorage.setItem(AUTHOR_KEY, author);
          else localStorage.removeItem(AUTHOR_KEY);
        } catch {
        }
      },
      onDownload: () => {
        download(
          `${fileStem}.annotations.json`,
          new Blob([JSON.stringify(collection(items, generator), null, 2)], {
            type: "application/json"
          })
        );
      },
      onSaveCopy: () => {
        download(
          `${fileStem}.annotated.html`,
          new Blob([embeddedCopy(items, generator, UI_ID)], {
            type: "text/html"
          })
        );
        ui.notify(t.saveCopyHint);
      },
      onToken: async () => {
        const token = await encodeToken(items, generator);
        const text2 = location.protocol === "file:" ? `#cudoc-notes=${token}` : `${location.href.split("#")[0]}#cudoc-notes=${token}`;
        ui.showToken(
          text2,
          `${t.tokenReady} ${t.tokenWarning}${text2.length > TOKEN_WARN_CHARS ? ` ${t.tokenTooLong}` : ""}`
        );
        try {
          await navigator.clipboard.writeText(text2);
          ui.notify(t.tokenCopied);
        } catch {
        }
      },
      onImport: async (file) => {
        try {
          const text2 = await file.text();
          const loaded = file.name.toLowerCase().endsWith(".html") || text2.trimStart().startsWith("<") ? readAnnotatedHtml(text2) : parseText(text2);
          items = mergeAnnotations(items, loaded.items);
          refresh();
          ui.notify(t.imported(loaded.items.length));
        } catch (error) {
          ui.notify(
            t.importFailed(
              error instanceof Error ? error.message : String(error)
            )
          );
        }
      },
      onClearStorage: () => {
        try {
          localStorage.removeItem(key);
        } catch {
        }
        ui.notify(t.cleared);
      },
      onSelect: (id) => {
        active = id;
        refresh();
        const anchor = anchors.get(id);
        if (anchor && anchor.kind !== "orphan") {
          const range = rangeFromOffsets(index, anchor.start, anchor.end);
          const target = range?.startContainer.parentElement ?? anchor.element;
          target?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      },
      onEdit: (id, body) => {
        const note = find(id);
        if (!note || !body) return;
        note.body = [
          {
            type: "TextualBody",
            value: body,
            format: "text/plain",
            purpose: note.cudoc.parent ? "replying" : "commenting"
          }
        ];
        if (note.motivation === "highlighting") note.motivation = "commenting";
        note.modified = now();
        refresh();
      },
      onDelete: (id) => {
        items = items.filter((a) => a.id !== id && a.cudoc.parent !== id);
        if (active === id) active = void 0;
        refresh();
      },
      onToggleState: (id) => {
        const note = find(id);
        if (!note) return;
        note.cudoc.state = note.cudoc.state === "resolved" ? "open" : "resolved";
        note.modified = now();
        refresh();
      },
      onReply: (id, body) => {
        reply(id, body);
      },
      onLanguage: (next) => {
        if (next === lang) return;
        lang = next;
        t = STRINGS[lang];
        writePreference(LANG_KEY, lang);
        remount();
      },
      onLayout: (next) => {
        layout = next;
        writePreference(LAYOUT_KEY, layout);
      }
    };
    let ui = new Ui(t, lang, layout, handlers);
    const remount = () => {
      const open = ui.isOpen;
      ui.destroy();
      ui = new Ui(t, lang, layout, handlers);
      document.body.append(ui.root);
      ui.setOpen(open);
      refresh();
    };
    const reply = (id, body) => {
      const root = find(id);
      if (!root || !body) return void 0;
      const created = now();
      const note = {
        "@context": ANNOTATION_CONTEXT,
        type: "Annotation",
        id: newId(),
        created,
        modified: created,
        motivation: "replying",
        body: [
          {
            type: "TextualBody",
            value: body,
            format: "text/plain",
            purpose: "replying"
          }
        ],
        target: root.target,
        cudoc: { ...root.cudoc, state: "open", parent: root.id }
      };
      if (author) note.creator = { type: "Person", name: author };
      items = mergeAnnotations(items, [note]);
      refresh();
      return note;
    };
    document.body.append(ui.root);
    let pending;
    const onSelection = () => {
      const described = ui.composerOpen ? void 0 : describeSelection(index, document.getSelection());
      if (!described) {
        pending = void 0;
        ui.hideNoteButton();
        return;
      }
      pending = described;
      const range = document.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        ui.hideNoteButton();
        return;
      }
      ui.showNoteButton(rect, () => {
        const target = pending;
        if (!target) return;
        const rect2 = range.getBoundingClientRect();
        ui.hideNoteButton();
        ui.composer.open(
          rect2,
          "",
          (body) => add(target, body, "text"),
          target.selectors[0]?.type === "TextQuoteSelector" ? excerptOf(target) : void 0
        );
      });
    };
    document.addEventListener("mouseup", (event) => {
      if (ui.root.contains(event.target)) return;
      setTimeout(onSelection, 0);
    });
    document.addEventListener("keyup", (event) => {
      if (event.shiftKey || event.key.startsWith("Arrow"))
        setTimeout(onSelection, 0);
    });
    let hovered;
    const leaveBlock = () => {
      hovered = void 0;
      ui.hideBlockButton();
    };
    main.addEventListener("mouseover", (event) => {
      const block = closestBlock(event.target);
      if (!block || block === hovered) return;
      hovered = block;
      ui.showBlockButton(block, () => {
        const described = describeBlock(index, block);
        if (!described) return;
        ui.hideBlockButton();
        ui.composer.open(
          block.getBoundingClientRect(),
          "",
          (body) => add(described, body, "block"),
          excerptOf(described)
        );
      });
    });
    document.addEventListener("mousemove", (event) => {
      if (!hovered) return;
      if (ui.onBlockButton(event.clientX, event.clientY)) return;
      const rect = hovered.getBoundingClientRect();
      const near = event.clientX >= rect.left - GUTTER_REACH && event.clientX <= rect.right && event.clientY >= rect.top - 12 && event.clientY <= rect.bottom + 12;
      if (!near) leaveBlock();
    });
    window.addEventListener(
      "scroll",
      () => {
        leaveBlock();
        if (pending) onSelection();
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      leaveBlock();
      ui.hideNoteButton();
    });
    main.addEventListener("click", (event) => {
      if (!anchors.size) return;
      const offset2 = offsetAtPoint(index, event.clientX, event.clientY);
      if (offset2 < 0) return;
      const hit = roots().find((note) => {
        const anchor = anchors.get(note.id);
        return anchor && anchor.kind !== "orphan" && anchor.start <= offset2 && offset2 < anchor.end;
      });
      if (hit) {
        active = hit.id;
        ui.setOpen(true);
        refresh();
      }
    });
    window.addEventListener("beforeprint", () => {
      if (highlightsSupported) CSS.highlights.clear();
    });
    window.addEventListener("afterprint", paint);
    items = mergeAnnotations(readEmbedded(), readLocal(key));
    refresh();
    const offerToken = () => {
      const token = tokenFromLocation();
      if (!token) return;
      decodeToken(token).then((loaded) => {
        ui.confirmToken(
          loaded.items.length,
          () => {
            items = mergeAnnotations(items, loaded.items);
            refresh();
            ui.setOpen(true);
            clearTokenFromLocation();
          },
          () => clearTokenFromLocation()
        );
      }).catch((error) => {
        ui.notify(
          t.tokenInvalid(
            error instanceof Error ? error.message : String(error)
          )
        );
        clearTokenFromLocation();
      });
    };
    offerToken();
    window.addEventListener("hashchange", offerToken);
    window.cudocAnnotations = {
      create: (exact, body) => {
        const at = index.text.indexOf(exact);
        if (at < 0) return void 0;
        const described = describeSpan(
          index,
          at,
          at + exact.length,
          blockAt(index, at)
        );
        return described ? add(described, body, "text") : void 0;
      },
      createOnBlock: (blockId, body) => {
        const block = main.querySelector(
          `[data-cudoc-block="${CSS.escape(blockId)}"]`
        );
        const described = block ? describeBlock(index, block) : void 0;
        return described ? add(described, body, "block") : void 0;
      },
      reply,
      list: () => items.map((a) => structuredClone(a)),
      anchors: () => Object.fromEntries(
        [...anchors].map(([id, anchor]) => [
          id,
          anchor.kind === "orphan" ? "orphan" : anchor.confidence === "moved" ? "moved" : anchor.kind
        ])
      ),
      load: (text2) => {
        const loaded = text2.trimStart().startsWith("<") ? readAnnotatedHtml(text2) : parseText(text2);
        items = mergeAnnotations(items, loaded.items);
        refresh();
        return loaded.items.length;
      },
      collection: () => collection(items, generator),
      embeddedCopy: () => embeddedCopy(items, generator, UI_ID),
      token: () => encodeToken(items, generator)
    };
  }
  var excerptOf = (described) => {
    const quote = described.selectors.find((s) => s.type === "TextQuoteSelector");
    const text2 = (quote && quote.type === "TextQuoteSelector" ? quote.exact : "").replace(/\s+/g, " ").trim();
    return text2.length > 120 ? `${text2.slice(0, 117).trimEnd()}\u2026` : text2;
  };
  function offsetAtPoint(index, x, y) {
    const doc = document;
    if (typeof doc.caretPositionFromPoint === "function") {
      const position = doc.caretPositionFromPoint(x, y);
      return position ? offsetOf(index, position.offsetNode, position.offset) : -1;
    }
    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(x, y);
      return range ? offsetOf(index, range.startContainer, range.startOffset) : -1;
    }
    return -1;
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
