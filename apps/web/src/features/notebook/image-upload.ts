import { NOTEBOOK_IMAGE_MAX_BYTES } from "./document";

/*
 * Images going into a notebook. Large photos and screenshots are made smaller
 * in the browser first (at most 2400 px on the long side), so notes stay fast
 * to open and an upload stays well within what the server accepts. GIFs are
 * sent as they are, so animations keep moving.
 */

const MAX_SIDE = 2400;
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const NOTEBOOK_IMAGE_ACCEPT = ACCEPTED.join(",");

export const isImageFile = (file: File) => file.type.startsWith("image/");

async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // The server decides; it will say if the type is not accepted.
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_ABOVE_BYTES && ACCEPTED.includes(file.type)) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG keeps diagrams and screenshots crisp; photos are smaller as WebP.
  const type =
    file.type === "image/png" && file.size <= SHRINK_ABOVE_BYTES ? "image/png" : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  return blob && blob.size < file.size ? blob : file;
}

export interface UploadedImage {
  src: string;
  alt: string;
}

/** Sends one image to MedOS and answers with the address the notebook shows it from. */
export async function uploadNotebookImage(file: File): Promise<UploadedImage> {
  const body = await shrink(file);
  if (body.size > NOTEBOOK_IMAGE_MAX_BYTES) {
    throw new Error("This image is too large (10 MB at most).");
  }
  const form = new FormData();
  form.append("image", body, file.name || "image");
  let response: Response;
  try {
    response = await fetch("/api/notebook-images", { method: "POST", body: form });
  } catch {
    throw new Error("The image could not be sent. Check the connection and try again.");
  }
  const answer = (await response.json().catch(() => null)) as {
    src?: string;
    error?: string;
  } | null;
  if (!response.ok || !answer?.src) {
    throw new Error(answer?.error ?? "The image could not be added.");
  }
  const alt = (file.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 200);
  return { src: answer.src, alt };
}
