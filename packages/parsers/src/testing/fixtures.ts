import { zipSync } from "fflate";

/*
 * Synthetic source files for tests: small DOCX, HTML quiz and PDF documents
 * built from scratch in code. No real course material is ever used as a
 * fixture; the content here is invented to exercise structure only.
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

const encoder = new TextEncoder();

export const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  superscript?: boolean;
}

/** A text run. Tabs in the text become <w:tab/>. */
export function run(text: string, options: RunOptions = {}): string {
  const props = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.superscript ? '<w:vertAlign w:val="superscript"/>' : "",
  ].join("");
  const parts = text
    .split("\t")
    .map((part) => (part ? `<w:t xml:space="preserve">${escapeXml(part)}</w:t>` : ""))
    .join("<w:tab/>");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${parts}</w:r>`;
}

export interface ParagraphOptions {
  style?: string;
  /** Word list numbering: numId 1 is bulleted, 2 is numbered (see NUMBERING). */
  list?: { numId: number; level?: number };
}

/** A paragraph from runs (strings are plain runs). */
export function paragraph(
  content: string | readonly string[],
  options: ParagraphOptions = {},
): string {
  const runs = typeof content === "string" ? run(content) : content.join("");
  const props = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options.list
      ? `<w:numPr><w:ilvl w:val="${options.list.level ?? 0}"/><w:numId w:val="${options.list.numId}"/></w:numPr>`
      : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
}

export const heading = (text: string, level = 1, extraRuns: readonly string[] = []) =>
  paragraph([run(text), ...extraRuns], { style: `Heading${level}` });

/** A paragraph holding one inline image, by relationship id. */
export function imageParagraph(relationshipId: string, alt = ""): string {
  return (
    `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture" descr="${escapeXml(alt)}"/>` +
    `<a:graphic><a:graphicData><a:blip r:embed="${relationshipId}"/></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`
  );
}

export interface CellOptions {
  span?: number;
}

/** A table from rows of cells; each cell is the XML of its paragraphs. */
export function table(
  rows: readonly (readonly (string | { xml: string; span?: number })[])[],
  options: { headerRow?: boolean } = {},
): string {
  const body = rows
    .map((cells, index) => {
      const rowProps = options.headerRow && index === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      const xml = cells
        .map((cell) => {
          const { xml: content, span } =
            typeof cell === "string" ? { xml: cell, span: undefined } : cell;
          const props = span ? `<w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>` : "";
          return `<w:tc>${props}${content}</w:tc>`;
        })
        .join("");
      return `<w:tr>${rowProps}${xml}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${body}</w:tbl>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/></w:style>
  <w:style w:type="paragraph" w:styleId="Kopf1"><w:name w:val="Kopf 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
</w:styles>`;

/** numId 1: bullets; numId 2: decimal numbers; numId 3: numbers with lettered sub-items. */
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="30"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="upperLetter"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
  <w:num w:numId="3"><w:abstractNumId w:val="30"/></w:num>
</w:numbering>`;

export interface DocxOptions {
  /** Images by relationship id, stored under word/media. */
  images?: Record<string, { name: string; bytes: Uint8Array }>;
  /** Relationships pointing outside the package. */
  externalImages?: Record<string, string>;
  title?: string;
  /** Extra package parts, e.g. "word/vbaProject.bin". */
  extraParts?: Record<string, Uint8Array | string>;
  /** Replace document.xml entirely (for malformed-input tests). */
  rawDocument?: string;
}

/** A complete, valid DOCX package whose body is the given XML. */
export function buildDocx(bodyXml: string, options: DocxOptions = {}): Uint8Array {
  const document =
    options.rawDocument ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:a="${A}" xmlns:wp="${WP}"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;

  const relationships = [
    `<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdNumbering" Type="${R}/numbering" Target="numbering.xml"/>`,
    ...Object.entries(options.images ?? {}).map(
      ([id, image]) => `<Relationship Id="${id}" Type="${R}/image" Target="media/${image.name}"/>`,
    ),
    ...Object.entries(options.externalImages ?? {}).map(
      ([id, url]) =>
        `<Relationship Id="${id}" Type="${R}/image" Target="${escapeXml(url)}" TargetMode="External"/>`,
    ),
  ].join("");

  const parts: Record<string, Uint8Array> = {
    "[Content_Types].xml": encoder.encode(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    "_rels/.rels": encoder.encode(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": encoder.encode(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
    ),
    "word/document.xml": encoder.encode(document),
    "word/styles.xml": encoder.encode(STYLES),
    "word/numbering.xml": encoder.encode(NUMBERING),
    "docProps/core.xml": encoder.encode(
      `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(options.title ?? "")}</dc:title></cp:coreProperties>`,
    ),
  };
  for (const image of Object.values(options.images ?? {}))
    parts[`word/media/${image.name}`] = image.bytes;
  for (const [name, value] of Object.entries(options.extraParts ?? {})) {
    parts[name] = typeof value === "string" ? encoder.encode(value) : value;
  }
  return zipSync(parts);
}

/** A valid 1×1 PNG. `variant` changes its bytes, giving a distinct image (and hash). */
export function pngBytes(variant = 0): Uint8Array {
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  // Extra bytes after IEND are ignored by readers but make the content distinct.
  return new Uint8Array(
    Buffer.concat([base, Buffer.from(Array.from({ length: variant }, () => 0))]),
  );
}

/** An HTML quiz page in the common "JSON data block" layout, with a script that must never run. */
export function buildQuizHtml(data: unknown, extraHtml = ""): Uint8Array {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return encoder.encode(`<!DOCTYPE html>
<html><head><title>Quiz</title>
<script>globalThis.__medosQuizScriptRan = true;</script>
</head>
<body onload="globalThis.__medosQuizScriptRan = true">
<img src="x" onerror="globalThis.__medosQuizScriptRan = true">
${extraHtml}
<script id="quiz-data" type="application/json">${json}</script>
<script>document.body.innerHTML = "<p>rendered by the quiz</p>";</script>
</body></html>`);
}

/**
 * A minimal, valid PDF with one page per entry, each showing its text, and an
 * optional document title. Offsets in the cross-reference table are exact.
 */
export function buildPdf(
  pages: readonly string[],
  info: { title?: string; author?: string } = {},
): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, index) => {
    const pageId = pageIds[index]!;
    const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const infoId = objects.length;
  const infoEntries = [
    info.title ? `/Title (${info.title})` : "",
    info.author ? `/Author (${info.author})` : "",
    "/CreationDate (D:20260928091500+02'00')",
  ].join(" ");
  objects[infoId] = `<< ${infoEntries} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(body);
}

/** A small synthetic study guide covering every structure the parser recognises. */
export function sampleStudyGuide(): Uint8Array {
  const body = [
    paragraph("Receptor Basics — Study Guide", { style: "Title" }),
    paragraph("CONTENTS"),
    heading("1 Learning Objectives"),
    paragraph("Describe receptor families.", { list: { numId: 1 } }),
    paragraph("Compare agonists and antagonists.", { list: { numId: 1 } }),
    heading("2 Receptors", 1, [run("  S12", {})]),
    paragraph([
      run("A "),
      run("receptor", { bold: true }),
      run(" binds a "),
      run("ligand", { italic: true }),
      run("."),
    ]),
    paragraph("• Typed bullet one"),
    paragraph("• Typed bullet two"),
    table(
      [
        [paragraph([run("Family", { bold: true })]), paragraph([run("Speed", { bold: true })])],
        [paragraph("Ion channel"), paragraph("Milliseconds")],
        [paragraph("Nuclear"), paragraph("Hours")],
      ],
      { headerRow: true },
    ),
    table([[paragraph("⚠ EXAM TRAP") + paragraph("Affinity is not efficacy.")]]),
    table([[paragraph("Step one")], [paragraph("↓")], [paragraph("Step two")]]),
    imageParagraph("rIdImg1", "Receptor diagram"),
    paragraph([run("Figure 1. ", { bold: true }), run("Receptor families")]),
    heading("Summary", 2),
    paragraph("1.\tFirst point.", {}),
    paragraph("2.\tSecond point.", {}),
  ].join("");
  return buildDocx(body, { images: { rIdImg1: { name: "image1.png", bytes: pngBytes() } } });
}

/** A small synthetic question bank: numbered questions with choices and an answers section. */
export function sampleQuestionBank(): Uint8Array {
  const body = [
    paragraph("Practice Questions", { style: "Title" }),
    paragraph([run("1. Which receptor is fastest?", { bold: true })]),
    paragraph("    A. Nuclear receptor"),
    paragraph("    B. Ion channel"),
    paragraph([run("2. Explain affinity.", { bold: true })]),
    heading("Answers & explanations"),
    paragraph([run("1. B — Ion channel. ", { bold: true }), run("They open within milliseconds.")]),
    paragraph("    ✗ A: Nuclear receptors act over hours."),
    paragraph([run("2. ", { bold: true }), run("Affinity is how tightly a drug binds.")]),
  ].join("");
  return buildDocx(body);
}

/** A small synthetic quiz with two questions. */
export function sampleQuiz(): Uint8Array {
  return buildQuizHtml({
    title: "Sample Quiz",
    questions: [
      {
        topic: "Receptors",
        type: "mechanism",
        stem: "Which receptor is **fastest**?",
        options: ["Nuclear", "Ion channel", "Kinase-linked"],
        answer: 1,
        explain: "Ion channels open in **milliseconds**.",
        wrong: { "0": "Nuclear receptors act over hours." },
        source: "S3",
      },
      {
        topic: "Binding",
        type: "vignette",
        stem: "A drug has a low KD. What does that mean?",
        options: ["High affinity", "Low affinity"],
        answer: "A",
      },
    ],
  });
}
