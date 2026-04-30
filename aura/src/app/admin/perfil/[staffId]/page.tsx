"use client";

import { useAuth } from "@/context/AuthContext";
import { ProfileView } from "@/components/admin/profile/ProfileView";

export default function StaffProfilePage({ params }: { params: { staffId: string } }) {
  const { staffId } = params;
  const { userData } = useAuth();
  const isOwnProfile = userData?.id === staffId;

  return <ProfileView staffId={staffId} isOwnProfile={isOwnProfile} />;
}
