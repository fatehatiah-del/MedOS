"use client";

import type { PDFDocumentProxy, RenderTask, TextLayer as PdfTextLayer } from "pdfjs-dist";
import { memo, useEffect, useRef } from "react";

/*
 * One page of a lecture PDF. Until it is near the screen it is an empty box of
 * the right size; when asked to draw, it renders its canvas and a text layer
 * (so its text can be selected and read by screen readers), and it releases
 * both again when it scrolls far away. A long PDF never draws all its pages.
 */

export interface PageSize {
  width: number;
  height: number;
}

// Sharper on high-density screens, capped so large pages stay affordable.
const MAX_PIXEL_RATIO = 2;

interface PdfPageProps {
  document: PDFDocumentProxy | null;
  textLayer: typeof PdfTextLayer | null;
  number: number;
  pageCount: number;
  scale: number;
  /** The page's size at scale 1 (an estimate until it has been drawn once). */
  size: PageSize;
  draw: boolean;
  hasText: boolean;
  onSize: (page: number, size: PageSize) => void;
}

function PdfPageView({
  document,
  textLayer: TextLayer,
  number,
  pageCount,
  scale,
  size,
  draw,
  hasText,
  onSize,
}: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draw || !document || !TextLayer) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let layer: PdfTextLayer | null = null;
    const canvasElement = canvas.current;
    const textElement = text.current;
    const boxElement = box.current;

    void (async () => {
      try {
        const page = await document.getPage(number);
        if (cancelled || !canvasElement || !textElement) return;
        const natural = page.getViewport({ scale: 1 });
        onSize(number, { width: natural.width, height: natural.height });
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        canvasElement.width = Math.floor(viewport.width * ratio);
        canvasElement.height = Math.floor(viewport.height * ratio);
        task = page.render({
          canvas: canvasElement,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await task.promise;
        if (cancelled) return;
        boxElement?.setAttribute("data-drawn", "");
        textElement.replaceChildren();
        layer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textElement,
          viewport,
        });
        await layer.render();
      } catch {
        // Cancelled when the page scrolls away; a failed page stays an empty box.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
      boxElement?.removeAttribute("data-drawn");
      // Release the pixels: an undrawn page holds no image memory.
      if (canvasElement) {
        canvasElement.width = 0;
        canvasElement.height = 0;
      }
      textElement?.replaceChildren();
    };
  }, [draw, document, TextLayer, number, scale, onSize]);

  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);

  return (
    <div className="mx-auto w-max max-w-none" data-page-wrapper={number}>
      <div
        ref={box}
        role="group"
        aria-label={`Page ${number} of ${pageCount}`}
        data-page={number}
        className="relative overflow-hidden bg-white shadow-sm ring-1 ring-border"
        style={{ width, height, ["--total-scale-factor" as string]: scale }}
      >
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        <div ref={text} className="pdf-text-layer" />
      </div>
      <p className="mt-1.5 text-center text-[12px] text-fg-subtle">
        {number}
        {hasText ? null : <span> · This page has no selectable text</span>}
      </p>
    </div>
  );
}

export const PdfPage = memo(PdfPageView);
