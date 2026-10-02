"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@medos/ui";
import { Maximize2 } from "lucide-react";

/**
 * An image from the Study Guide, shown at reading width, that opens full size
 * in a dialog. The image is fetched from MedOS's private image address, which
 * checks the session and ownership on every request.
 */
export function FigureImage({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <Dialog>
      <DialogTrigger
        className="group relative block w-full overflow-hidden rounded-lg border border-border bg-white"
        aria-label={`View full size: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private images are not optimised: the optimiser would fetch them without the user's session. */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="mx-auto h-auto max-h-[36rem] w-auto max-w-full object-contain"
        />
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg border border-border bg-surface/90 text-fg-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2 className="size-4" />
        </span>
      </DialogTrigger>
      <DialogContent
        closeLabel="Close image"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(72rem,calc(100vw-2rem))] overflow-auto"
      >
        <DialogTitle>{caption || "Image"}</DialogTitle>
        <DialogDescription className="sr-only">
          The image at full size. Press Escape to return to the Study Guide.
        </DialogDescription>
        <div className="mt-4 rounded-lg bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
          <img src={src} alt={alt} className="mx-auto h-auto max-w-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
