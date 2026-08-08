// Ver a nota em ../page.tsx — rota antiga mantida só como redirecionamento.
import { redirect } from "next/navigation";

export default function LegacyBookingsRedirect() {
  redirect("/admin/estruturas/bookings");
}
