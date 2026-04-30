"use client";

import { useAuth } from "@/context/AuthContext";
import { SettingsView } from "@/components/admin/profile/SettingsView";
import { Loader2 } from "lucide-react";

export default function ProfileSettingsPage() {
  const { userData, userDataReady, refreshUserData } = useAuth();

  if (!userDataReady) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!userData) return null;

  return <SettingsView userData={userData} onRefresh={refreshUserData} />;
}
