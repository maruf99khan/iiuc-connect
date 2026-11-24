import type { MetadataRoute } from "next";

/**
 * Makes the app installable ("Add to Home screen"). There is deliberately no
 * service worker: caching signed-in pages on a shared phone would keep a
 * member's data after they sign out. The app needs a connection to work.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IIUC Connect",
    short_name: "IIUC Connect",
    description:
      "A verified alumni and professional network for International Islamic University Chittagong.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f5132",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
