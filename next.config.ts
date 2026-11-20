import type { NextConfig } from "next";

// GitHub Pages: the deploy workflow sets GITHUB_PAGES_BASE (e.g. "/smu-bid-planner") for a static export.
// Without it this is a normal build (next dev / next start).
const pagesBase = process.env.GITHUB_PAGES_BASE ?? "";
const staticExport = pagesBase !== "";

const nextConfig: NextConfig = {
  // Partial prerendering can't run in a static export; the planner renders client-side either way.
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  ...(staticExport ? { output: "export", basePath: pagesBase, images: { unoptimized: true } } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: pagesBase,
  },
};

export default nextConfig;
