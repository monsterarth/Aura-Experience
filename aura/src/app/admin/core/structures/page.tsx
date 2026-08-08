// Estruturas saíram de /admin/core (área de plataforma/super_admin) para
// /admin/estruturas — são cadastro da pousada, não da plataforma.
// Este stub existe para links antigos e favoritos não caírem em 404.
import { redirect } from "next/navigation";

export default function LegacyStructuresRedirect() {
  redirect("/admin/estruturas");
}
