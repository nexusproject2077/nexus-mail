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
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
    protocol_handlers: [{ protocol: "mailto", url: "/compose?to=%s" }],
  };
}
