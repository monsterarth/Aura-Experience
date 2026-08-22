"use client";

// Troca skeleton → conteúdo sem flash: o skeleton só aparece se o load passar de
// `delayMs` e, uma vez visível, fica ao menos `minMs`. Conteúdo entra com fade 150ms.
import React from "react";
import { useDelayedFlag } from "./hooks";
import { ErrorState } from "./EmptyState";

export interface LoadableProps {
  loading: boolean;
  skeleton: React.ReactNode;
  error?: string | null;
  onRetry?: () => void;
  /** Quando true (e não está carregando), mostra `empty` no lugar do conteúdo. */
  isEmpty?: boolean;
  empty?: React.ReactNode;
  delayMs?: number;
  minMs?: number;
  children: React.ReactNode;
}

export function Loadable({ loading, skeleton, error, onRetry, isEmpty, empty, delayMs = 120, minMs = 300, children }: LoadableProps) {
  const showSkeleton = useDelayedFlag(loading, { delay: delayMs, min: minMs });
  if (loading || showSkeleton) return <div aria-busy="true">{showSkeleton ? skeleton : null}</div>;
  if (error) return <ErrorState description={error} onRetry={onRetry} />;
  if (isEmpty && empty) return <div className="ak-fade-in">{empty}</div>;
  return <div className="ak-fade-in">{children}</div>;
}
