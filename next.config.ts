import type { NextConfig } from "next";

// Repository name — used as the base path for the GitHub Pages project site
// served at https://<owner>.github.io/nexus-mail/.
const repoName = "nexus-mail";
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Emit a fully static site into `out/` so it can be hosted on GitHub Pages
  // (no Node server, no Jekyll).
  output: "export",

  // GitHub Pages serves a project site under /<repo>, so prefix routes and
  // assets in production builds. Local `next dev` stays at the root.
  basePath: isProd ? `/${repoName}` : "",
  assetPrefix: isProd ? `/${repoName}/` : "",

  // The static export has no image optimization server.
  images: {
    unoptimized: true,
  },

  // Emit `foo/index.html` instead of `foo.html` so Pages resolves routes
  // without a server-side rewrite.
  trailingSlash: true,
};

export default nextConfig;
