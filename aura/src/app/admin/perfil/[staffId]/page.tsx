"use client";

import { use } from "react";
import { useAuth } from "@/context/AuthContext";
import { ProfileView } from "@/components/admin/profile/ProfileView";

export default function StaffProfilePage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = use(params);
  const { userData } = useAuth();
  const isOwnProfile = userData?.id === staffId;

  return <ProfileView staffId={staffId} isOwnProfile={isOwnProfile} />;
}
