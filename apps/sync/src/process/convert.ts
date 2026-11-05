import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jpegsToPdf } from "./jpeg-pdf";

/*
 * Makes the PDF view copy of a PowerPoint lecture, so the browser can show it.
 *
 * MedOS Sync runs on the student's own computer, which has Microsoft
 * PowerPoint; the hosted app cannot convert anything. The stored original is
 * written to a fresh temporary folder, PowerPoint opens that copy read-only
 * and without a window and saves it as PDF, and the folder is removed again.
 * The study folder's file is never opened.
 *
 * Some heavy decks cannot be saved as PDF by PowerPoint. Then PowerPoint
 * exports each shown slide as a picture with its text, and the PDF is made of
 * those pictures; the slide text is used for search instead of the PDF's.
 */

export interface ViewCopy {
  pdf: Uint8Array;
  /** Text per page, when the PDF was made from slide pictures and has none of its own. */
  slideText?: string[];
}

/** PowerPoint bytes in, a PDF view copy out. Throws ConversionError. */
export type PresentationConverter = (bytes: Uint8Array, filename: string) => Promise<ViewCopy>;

export class ConversionError extends Error {
  constructor(
    /** "unavailable": this computer cannot convert (retried on a later sync). */
    readonly code: "unavailable" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

/** A large deck can take a few minutes in PowerPoint. */
const TIMEOUT_MS = 10 * 60 * 1000;

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/pptx-to-pdf.ps1",
);

export const UNAVAILABLE_MESSAGE =
  "MedOS shows PowerPoint lectures as a PDF made with Microsoft PowerPoint, which was not " +
  "available on the computer that synced. The original is kept; it is converted on the next " +
  "sync from a Windows computer with PowerPoint.";

export const FAILED_MESSAGE =
  "PowerPoint could not save this presentation as PDF, so it cannot be shown yet. The " +
  "original is kept and can be downloaded. Run the sync again, or open and re-save the file " +
  "in PowerPoint.";

/** Converts with Microsoft PowerPoint through its COM interface (Windows only). */
export const powerPointConverter: PresentationConverter = async (bytes, filename) => {
  if (process.platform !== "win32") throw new ConversionError("unavailable", UNAVAILABLE_MESSAGE);
  const extension = path.extname(filename).toLowerCase() === ".ppt" ? ".ppt" : ".pptx";
  const dir = await mkdtemp(path.join(tmpdir(), "medos-pptx-"));
  const input = path.join(dir, `lecture${extension}`);
  const output = path.join(dir, "out");
  try {
    await writeFile(input, bytes);
    await mkdir(output);
    const code = await new Promise<number>((resolve) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          SCRIPT,
          input,
          output,
        ],
        { timeout: TIMEOUT_MS, windowsHide: true },
        (error) => {
          if (!error) return resolve(0);
          const exit = (error as { code?: unknown }).code;
          resolve(typeof exit === "number" ? exit : -1);
        },
      );
    });
    if (code === 3) throw new ConversionError("unavailable", UNAVAILABLE_MESSAGE);
    if (code !== 0) throw new ConversionError("failed", FAILED_MESSAGE);
    return await readViewCopy(output);
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError("failed", FAILED_MESSAGE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** The script's output: its PDF, or a PDF assembled from its slide pictures. */
async function readViewCopy(output: string): Promise<ViewCopy> {
  const pdf = path.join(output, "lecture.pdf");
  if (existsSync(pdf)) return { pdf: new Uint8Array(await readFile(pdf)) };
  const slidesDir = path.join(output, "slides");
  const listing = existsSync(slidesDir) ? await readdir(slidesDir) : [];
  const names = listing.filter((name) => /^\d{4}\.jpg$/.test(name)).sort();
  if (names.length === 0) throw new ConversionError("failed", FAILED_MESSAGE);
  const images = await Promise.all(
    names.map(async (name) => new Uint8Array(await readFile(path.join(slidesDir, name)))),
  );
  const { texts } = JSON.parse(
    (await readFile(path.join(output, "slides.json"), "utf8")).replace(/^﻿/, ""),
  ) as { texts?: unknown };
  // PowerShell writes a one-slide array as a bare string.
  const list = Array.isArray(texts) ? texts : [texts];
  const slideText = names.map((_, index) =>
    typeof list[index] === "string" ? (list[index] as string) : "",
  );
  return { pdf: jpegsToPdf(images), slideText };
}
