import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/src/components/AuthGuard";
import { AppShell } from "@/src/components/layout/AppShell";
import { themeInitScript } from "@/src/lib/theme";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin", "latin-ext"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Sightline", template: "%s · Sightline" },
  description:
    "Report sightings of people on the public FBI wanted list and get real-time alerts when a photo matches. Educational project, not affiliated with the FBI.",
  // Imaginile persoanelor sunt hotlink-uri catre fbi.gov, care da 403 daca primeste Referer de pe alt domeniu
  // (tile-urile OSM din MapInner/RouteMapInner isi pun referrerPolicy propriu: OSM cere Referer)
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111312" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme is set before hydration by themeInitScript, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${publicSans.variable} ${plexMono.variable} antialiased`}>
        <AuthGuard>
          <AppShell>{children}</AppShell>
        </AuthGuard>
      </body>
    </html>
  );
}
