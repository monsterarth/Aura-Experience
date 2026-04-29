"use client";

import { useAuth } from "@/context/AuthContext";
import { ProfileView } from "@/components/admin/profile/ProfileView";
import { Loader2 } from "lucide-react";

export default function MyProfilePage() {
  const { userData, userDataReady } = useAuth();

  if (!userDataReady) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#4ec9d4" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!userData) return null;

  return <ProfileView staffId={userData.id} isOwnProfile={true} />;
}
