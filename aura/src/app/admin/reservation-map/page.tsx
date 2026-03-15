// src/app/admin/reservation-map/page.tsx
// Wrapper com ssr: false para eliminar hydration mismatches nessa página
// (calendário dinâmico com datas, drag-and-drop e realtime — não precisa de SSR)
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ReservationMapClient = dynamic(
    () => import("./ReservationMapClient"),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="animate-spin text-primary" size={48} />
            </div>
        ),
    }
);

export default function ReservationMapPage() {
    return <ReservationMapClient />;
}
