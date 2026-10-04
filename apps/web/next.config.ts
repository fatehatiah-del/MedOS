import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source and are compiled by the app.
  transpilePackages: [
    "@medos/database",
    "@medos/fsrs",
    "@medos/parsers",
    "@medos/shared",
    "@medos/storage",
    "@medos/ui",
  ],
  // Loaded by Node at runtime rather than bundled: PGlite reads its WebAssembly
  // and data files from its own package directory.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  async headers() {
    return [
      {
        // All study data is private: never allow indexing, on any host.
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
