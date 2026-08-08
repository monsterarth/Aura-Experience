// /admin/comercial virou duas páginas (reservas + casamentos) — este redirect
// preserva links antigos e o deep-link ?tab=.
import { redirect } from "next/navigation";

export default function ComercialRedirect({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/admin/comercial/reservas${suffix ? `?${suffix}` : ""}`);
}
