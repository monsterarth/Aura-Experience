"use client";

import { ProfileView } from "@/components/admin/profile/ProfileView";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function EquipeProfilePage({ params }: { params: { staffId: string } }) {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>
      <ProfileView staffId={params.staffId} isOwnProfile={false} />
    </div>
  );
}
