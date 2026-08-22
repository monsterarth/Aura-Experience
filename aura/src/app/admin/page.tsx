import { redirect } from "next/navigation";

// /admin manda para o despachante por cargo (ROLE_HOME) — antes jogava todo
// mundo em /admin/stays, contradizendo o login e o "voltar ao início".
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
