import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const description =
  "Software white-label para pousadas e hotéis boutique. Gestão de estadias, comunicação, concierge e experiência do hóspede em uma plataforma.";

export const metadata: Metadata = {
  title: { default: "Aura", template: "%s | Aura" },
  description,
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
