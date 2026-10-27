import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus Mail",
    short_name: "Nexus Mail",
    description: "Messagerie Nexus Mail",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }],
    protocol_handlers: [{ protocol: "mailto", url: "/compose?to=%s" }],
  };
}
