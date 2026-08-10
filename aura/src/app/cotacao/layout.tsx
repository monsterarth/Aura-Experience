import { DM_Sans, Instrument_Serif } from "next/font/google";

// A proposta pública usa a mesma dupla do Portal do Hóspede (DM Sans corpo +
// Instrument Serif display). Este layout existe porque as fontes são
// declaradas por SEGMENTO de rota: /feedback consome as mesmas vars sem ter
// layout próprio e cai no fallback do sistema — o erro que não se repete aqui.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-portal-body",
  display: "swap",
  preload: false,
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-portal-display",
  display: "swap",
  preload: false,
});

export default function CotacaoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${dmSans.variable} ${instrumentSerif.variable}`}>
      {children}
    </div>
  );
}
