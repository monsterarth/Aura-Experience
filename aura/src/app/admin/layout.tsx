// src/app/admin/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import AdminLayoutClient from "./AdminLayoutClient";

export const metadata: Metadata = { title: "Aura Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialTheme = (cookieStore.get('aura-ui-theme')?.value ?? 'dark') as 'dark' | 'light';
  return <AdminLayoutClient initialTheme={initialTheme}>{children}</AdminLayoutClient>;
}
