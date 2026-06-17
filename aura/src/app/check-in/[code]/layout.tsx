import { DM_Sans, Instrument_Serif } from "next/font/google";

// Portal do Hóspede usa DM Sans (corpo) + Instrument Serif (display).
// Carregadas só neste segmento de rota, expostas como CSS vars — não
// mexem na fonte global (Inter) do resto do app.
const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-portal-body",
    display: "swap",
});

const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-portal-display",
    display: "swap",
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
