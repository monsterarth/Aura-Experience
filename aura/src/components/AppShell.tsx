"use client";
import PullToRefresh from "./PullToRefresh";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <PullToRefresh>{children}</PullToRefresh>;
}
