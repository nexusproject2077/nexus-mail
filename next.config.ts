import type { NextConfig } from "next";

// Repository name — used as the base path for the GitHub Pages project site
// served at https://<owner>.github.io/nexus-mail/.
const repoName = "nexus-mail";
const isProd = process.env.NODE_ENV === "production";

// Base path resolution:
//  - GitHub Pages (default prod build): serve under /<repo>.
//  - Self-hosted / Docker: set NEXT_PUBLIC_BASE_PATH="" to serve at the root.
//  - `next dev`: always root.
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : isProd
      ? `/${repoName}`
      : "";

const nextConfig: NextConfig = {
  // Emit a fully static site into `out/` so it can be hosted on GitHub Pages
  // (no Node server, no Jekyll) or served by any static file server.
  output: "export",

  // Prefix routes and assets to match where the app is served from.
  basePath,
  assetPrefix: basePath ? `${basePath}/` : "",

  // The static export has no image optimization server.
  images: {
    unoptimized: true,
  },

  // Emit `foo/index.html` instead of `foo.html` so Pages resolves routes
  // without a server-side rewrite.
  trailingSlash: true,
};

export default nextConfig;
