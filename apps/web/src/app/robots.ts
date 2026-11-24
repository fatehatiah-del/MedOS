import type { MetadataRoute } from "next";

// Only the welcome page may be crawled; everything else in MedOS is private.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/welcome/", "/brand/"], disallow: "/" },
  };
}
