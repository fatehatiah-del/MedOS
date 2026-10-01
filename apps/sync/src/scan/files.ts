/** What MedOS can register from the source folder, with the media type recorded for each. */
export const SUPPORTED_EXTENSIONS: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".html": "text/html",
  ".htm": "text/html",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

export function isSupportedExtension(extension: string): boolean {
  return Object.hasOwn(SUPPORTED_EXTENSIONS, extension);
}

export function mimeTypeFor(extension: string): string {
  return SUPPORTED_EXTENSIONS[extension] ?? "application/octet-stream";
}

const SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);
const TEMPORARY_EXTENSIONS = new Set([".tmp", ".temp", ".crdownload", ".part", ".partial"]);

/**
 * Why a file is not study material at all (operating-system and editor
 * leftovers), or null if it should be considered. These are skipped quietly
 * and counted, never registered.
 */
export function junkReason(name: string, extension: string): string | null {
  const lower = name.toLowerCase();
  if (SYSTEM_FILES.has(lower)) return "operating-system file";
  if (lower.startsWith("~$")) return "Office lock file";
  if (lower.startsWith(".")) return "hidden file";
  if (TEMPORARY_EXTENSIONS.has(extension)) return "temporary or incomplete download";
  return null;
}
