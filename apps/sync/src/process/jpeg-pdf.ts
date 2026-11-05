/*
 * A minimal PDF made of JPEG images, one per page, each filling its page.
 * Used when PowerPoint cannot save a deck as PDF but can export its slides as
 * pictures. The JPEG bytes are embedded unchanged (DCTDecode); nothing else is
 * in the file.
 */

/** Width and height of a baseline or progressive JPEG, from its SOF marker. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number; components: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG image.");
  let offset = 2;
  while (offset + 10 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Damaged JPEG image.");
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      const components = bytes[offset + 9] ?? 3;
      if (width > 0 && height > 0) return { width, height, components };
      break;
    }
    offset += 2 + length;
  }
  throw new Error("Damaged JPEG image.");
}

/** Builds a PDF with one page per JPEG, sized `pageWidth` points wide at the image's ratio. */
export function jpegsToPdf(images: readonly Uint8Array[], pageWidth = 720): Uint8Array {
  if (images.length === 0) throw new Error("No slides to put in the PDF.");
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.byteLength;
  };
  const object = (number: number, body: string) => {
    offsets[number] = length;
    push(`${number} 0 obj\n${body}\nendobj\n`);
  };

  // 1: catalog, 2: page tree, then per page: page, image, contents.
  const pageNumbers = images.map((_, index) => 3 + index * 3);
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${images.length} >>`,
  );
  images.forEach((image, index) => {
    const { width, height, components } = jpegSize(image);
    const colorSpace =
      components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const pageHeight = Math.round((pageWidth * height) / width);
    const page = pageNumbers[index] ?? 0;
    const draw = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`,
    );
    offsets[page + 1] = length;
    push(
      `${page + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.byteLength} >>\nstream\n`,
    );
    push(image);
    push("\nendstream\nendobj\n");
    object(page + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  });

  const count = 3 + images.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let number = 1; number < count; number += 1) {
    table += `${String(offsets[number] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
