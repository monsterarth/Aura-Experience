"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional title rendered in the header. */
  title?: React.ReactNode;
  /** Optional subtitle/description under the title. */
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky footer (e.g. action buttons). Already padded + safe-area aware. */
  footer?: React.ReactNode;
  /** Max width on desktop (md+). Defaults to `md:max-w-lg`. */
  maxWidthClass?: string;
  /** Extra classes on the panel. */
  className?: string;
  /** Hide the default close (X) button in the header. */
  hideCloseButton?: boolean;
}

/**
 * Adaptive dialog: a bottom sheet on phones (< md) and a centered modal on
 * larger screens. Styled with the admin theme tokens (bg-card / border-border)
 * so it follows light/dark automatically.
 *
 * Replaces the various inline overlay/drawer implementations across admin pages.
 */
export function ResponsiveModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClass = "md:max-w-lg",
  className,
  hideCloseButton = false,
}: ResponsiveModalProps) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-sm md:items-center md:justify-center"
      style={{ animation: "sheet-fadein .2s ease" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-2xl",
          "max-h-[92dvh] rounded-t-[28px] border-b-0",
          "md:max-h-[85vh] md:w-auto md:rounded-2xl md:border-b",
          maxWidthClass,
          className,
        )}
        style={{ animation: "sheet-slideup .28s cubic-bezier(.32,.72,0,1)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="mx-auto mt-3 h-1 w-9 flex-shrink-0 rounded-full bg-border md:hidden" />

        {(title || !hideCloseButton) && (
          <div className="flex flex-shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 md:pt-5">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-lg font-bold text-foreground">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable body */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </div>

        {footer && (
          <div className="safe-bottom flex-shrink-0 border-t border-border bg-card px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
