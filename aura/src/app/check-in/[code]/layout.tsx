import { DM_Sans, Instrument_Serif } from "next/font/google";

// Portal do Hóspede usa DM Sans (corpo) + Instrument Serif (display).
// Carregadas só neste segmento de rota, expostas como CSS vars — não
// mexem na fonte global (Inter) do resto do app.
// preload: false — este layout envolve todas as sub-rotas de [code] (mapa,
// breakfast, etc.) que não usam essas fontes; sem isso o Next emite
// <link rel=preload> e o navegador avisa "preloaded but not used". As fontes
// continuam carregando via @font-face quando o portal as usa.
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

export default function CheckInCodeLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className={`${dmSans.variable} ${instrumentSerif.variable}`}>
            {children}
        </div>
    );
}
