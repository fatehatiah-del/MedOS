import { DOMParser, type Element } from "@xmldom/xmldom";

import { LIMITS, ParseError } from "../errors";

/*
 * Minimal, safe XML access for Office documents.
 *
 * Documents with a DTD are refused outright, so entity expansion ("billion
 * laughs") and external entities can never apply. Elements are matched by
 * namespace and local name, not by prefix, so any valid prefix works.
 */

export const NS = {
  /** WordprocessingML, transitional and strict. */
  w: [
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",
  ],
  r: [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "http://purl.oclc.org/ooxml/officeDocument/relationships",
  ],
  a: [
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "http://purl.oclc.org/ooxml/drawingml/main",
  ],
  wp: [
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing",
  ],
  mc: ["http://schemas.openxmlformats.org/markup-compatibility/2006"],
  pr: ["http://schemas.openxmlformats.org/package/2006/relationships"],
  dc: ["http://purl.org/dc/elements/1.1/"],
  v: ["urn:schemas-microsoft-com:vml"],
} as const;

export type Namespace = keyof typeof NS;

export function parseXml(bytes: Uint8Array, part: string): Element {
  if (bytes.byteLength > LIMITS.maxXmlBytes) {
    throw new ParseError("too-large", "This document is too large or complex to import.");
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new ParseError(
      "unsafe-docx",
      "This document contains constructs MedOS does not read, for safety.",
    );
  }
  let failed = false;
  const document = new DOMParser({
    onError: (level) => {
      if (level === "fatalError") failed = true;
    },
  }).parseFromString(text, "application/xml");
  const root = document.documentElement;
  if (failed || !root) {
    throw new ParseError(
      "damaged-docx",
      `This Word document is damaged (${part} could not be read).`,
    );
  }
  return root;
}

export function is(node: unknown, ns: Namespace, localName: string): node is Element {
  const element = node as Element | null;
  return (
    element !== null &&
    element.nodeType === 1 &&
    element.localName === localName &&
    (NS[ns] as readonly string[]).includes(element.namespaceURI ?? "")
  );
}

export function childElements(element: Element): Element[] {
  const found: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) found.push(node as Element);
  }
  return found;
}

export function children(element: Element, ns: Namespace, localName: string): Element[] {
  return childElements(element).filter((child) => is(child, ns, localName));
}

export function child(
  element: Element | null | undefined,
  ns: Namespace,
  localName: string,
): Element | null {
  if (!element) return null;
  return childElements(element).find((candidate) => is(candidate, ns, localName)) ?? null;
}

/** All descendants with this name, in document order. */
export function descendants(element: Element, ns: Namespace, localName: string): Element[] {
  const found: Element[] = [];
  const visit = (node: Element) => {
    for (const next of childElements(node)) {
      if (is(next, ns, localName)) found.push(next);
      visit(next);
    }
  };
  visit(element);
  return found;
}

/** An attribute in one of the namespace's URIs, e.g. w:val. */
export function attr(
  element: Element | null | undefined,
  ns: Namespace,
  localName: string,
): string | null {
  if (!element) return null;
  for (const uri of NS[ns]) {
    if (element.hasAttributeNS(uri, localName)) return element.getAttributeNS(uri, localName);
  }
  return null;
}

/** An attribute without a namespace, e.g. Id on a relationship. */
export function plainAttr(element: Element, name: string): string | null {
  return element.hasAttribute(name) ? element.getAttribute(name) : null;
}

/** Word's on/off properties: present means on unless w:val says 0, false or off. */
export function isOn(element: Element | null): boolean {
  if (!element) return false;
  const value = attr(element, "w", "val");
  return value === null || !["0", "false", "off", "none"].includes(value.toLowerCase());
}
