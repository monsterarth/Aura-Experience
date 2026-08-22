// src/app/admin/reservation-map/page.tsx
// Wrapper com ssr: false para eliminar hydration mismatches nessa página
// (calendário dinâmico com datas, drag-and-drop e realtime — não precisa de SSR)
import dynamic from "next/dynamic";
import { PageShell, PageSkeleton } from "@/components/aura";

const ReservationMapClient = dynamic(
    () => import("./ReservationMapClient"),
    {
        ssr: false,
        loading: () => (
            <PageShell maxWidth="full"><PageSkeleton kpis={0} rows={8} /></PageShell>
        ),
    }
);

export default function ReservationMapPage() {
    return <ReservationMapClient />;
}
