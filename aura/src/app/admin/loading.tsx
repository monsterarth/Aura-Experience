// Fallback de carregamento de rota de todo o admin: header + KPIs + lista com
// shimmer (sem hooks — roda no servidor). Páginas pesadas podem ter o seu.
import { PageSkeleton } from "@/components/aura/Skeleton";

export default function AdminLoading() {
  return <PageSkeleton />;
}
