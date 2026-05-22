import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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

export const viewport: Viewport = {
  themeColor: "#9b6dff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
