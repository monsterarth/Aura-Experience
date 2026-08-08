// O mapa do resort saiu de /admin/core (área de plataforma/super_admin) para
// /admin/resort-map — ele é configuração da pousada, não da plataforma.
// Stub mantido para links antigos e favoritos não caírem em 404.
import { redirect } from "next/navigation";

export default function LegacyResortMapRedirect() {
  redirect("/admin/resort-map");
}
