import type { MetadataRoute } from "next";

// MedOS is private: disallow all crawling.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
