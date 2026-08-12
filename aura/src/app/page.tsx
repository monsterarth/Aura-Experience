import { redirect } from "next/navigation";

// A home institucional vive em /aura — uma URL que não sofre redirecionamento.
// Quem chega na raiz: logado é levado à home do cargo pelo middleware (start_url
// do PWA); deslogado cai aqui e segue para a página institucional.
export default function RootPage() {
  redirect("/aura");
}
