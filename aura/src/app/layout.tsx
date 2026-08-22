import type { Metadata, Viewport } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Inter continua sendo a fonte do corpo fora do admin (landing, login antigo…).
// DM Sans é a fonte da identidade Aura: o admin (`.aura-admin-root`) e os apps
// de campo leem `var(--font-dm-sans)` — antes os apps baixavam a fonte por
// @import em <style> (bloqueava render e falhava offline no PWA).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], axes: ["opsz"], variable: "--font-dm-sans", display: "swap" });

const description =
  "Software white-label para pousadas e hotéis boutique. Gestão de estadias, comunicação, concierge e experiência do hóspede em uma plataforma.";

export const metadata: Metadata = {
  title: { default: "Aura", template: "%s | Aura" },
  description,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aura",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Aura — Gestão Inteligente para Pousadas",
    description,
    url: "https://aaura.app.br",
    siteName: "Aura",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Aura",
    description,
  },
};

// viewportFit: cover — sem isso todo env(safe-area-inset-*) vale 0 e os apps de
// campo (que já usam) ficavam colados no notch/home indicator.
// O bloqueio de zoom (maximumScale/userScalable) sai junto com os inputs ≥16px
// no celular (Onda 0d do revamp) — o zoom automático do iOS vem do input pequeno,
// não da falta do bloqueio.
export const viewport: Viewport = {
  themeColor: "#9b6dff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${dmSans.variable}`}>
      <body className={inter.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
