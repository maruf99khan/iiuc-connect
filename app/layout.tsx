import type { Metadata, Viewport } from "next";

import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

/** Self-hosted by Next at build time; the variable font keeps this to one small file. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: {
    default: "IIUC Connect",
    template: "%s · IIUC Connect",
  },
  description:
    "A verified alumni and professional network for International Islamic University Chittagong.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
