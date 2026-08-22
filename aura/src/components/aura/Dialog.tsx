"use client";

// O único motor de overlay do admin: modal (desktop centrado), sheet (celular,
// de baixo, arrastável), drawer (painel lateral) e fullscreen (celular, forms
// longos). `presentation="auto"` escolhe pelo viewport. Portal no
// #aura-overlay-root (OverlayProvider), AnimatePresence (entrada E saída),
// pilha de overlays (Esc só no topo), focus trap, scroll-lock via data-attr.
// Para guarda de descarte: `useCloseGuard(onClose, { open, escape: false })`
// e espalhar `guardProps` em `panelProps`.
import React, { useCallback, useEffect, useId, useRef, type CSSProperties, type HTMLAttributes, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, useDragControls, type PanInfo } from "motion/react";
import { ChevronLeft, X } from "lucide-react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { IconButton } from "./Button";
import { v } from "./motion";
import { useFocusTrap, useIsMobile, useMounted } from "./hooks";
import { useHasOverlayProvider, useOverlay, useOverlayRoot } from "./OverlayProvider";

export type DialogPresentation = "auto" | "modal" | "sheet" | "drawer" | "fullscreen";
export type DialogSize = "sm" | "md" | "lg" | "xl";
type Resolved = Exclude<DialogPresentation, "auto">;

const MODAL_W: Record<DialogSize, string> = { sm: "420px", md: "560px", lg: "720px", xl: "960px" };
const DRAWER_W: Record<DialogSize, string> = { sm: "420px", md: "560px", lg: "min(66vw, 1040px)", xl: "min(80vw, 1280px)" };

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  presentation?: DialogPresentation;
  size?: DialogSize;
  /** Lado do drawer (desktop). Definir `side` com presentation="auto" vira drawer no desktop. */
  side?: "right" | "left";
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: IconLike;
  iconTone?: Tone;
  /** Substitui o bloco de títulos (mantém o X). */
  header?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  /** Rodapé em linha também no celular (padrão: empilha, primário em cima). */
  footerRow?: boolean;
  /** Clicar fora fecha. Default true. */
  dismissible?: boolean;
  /** Esc fecha (só o overlay do topo). Default true. */
  closeOnEscape?: boolean;
  /** Arrastar o sheet para baixo fecha. Default true. */
  dragToDismiss?: boolean;
  hideClose?: boolean;
  initialFocus?: RefObject<HTMLElement>;
  /** Espalhado no painel — ex.: `guardProps` do useCloseGuard. */
  panelProps?: HTMLAttributes<HTMLDivElement>;
  bodyPad?: 0 | 12 | 16;
  /** Não envolve children em .ak-dialog__body (use DialogBody/DialogFooter). */
  rawBody?: boolean;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  zIndex?: number;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export function resolvePresentation(p: DialogPresentation, isMobile: boolean, size: DialogSize, side?: "right" | "left"): Resolved {
  if (p === "auto") {
    if (isMobile) return size === "lg" || size === "xl" ? "fullscreen" : "sheet";
    return side ? "drawer" : "modal";
  }
  if (isMobile && p === "drawer") return size === "lg" || size === "xl" ? "fullscreen" : "sheet";
  return p;
}

export function Dialog({
  open, onClose, presentation = "auto", size = "md", side, title, subtitle, icon, iconTone = "brand", header, headerActions,
  footer, footerRow, dismissible = true, closeOnEscape = true, dragToDismiss = true, hideClose = false, initialFocus, panelProps,
  bodyPad = 16, rawBody = false, className, bodyClassName, style, zIndex, ariaLabel, children,
}: DialogProps) {
  const mounted = useMounted();
  const isMobile = useIsMobile();
  const root = useOverlayRoot();
  const hasProvider = useHasOverlayProvider();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dragControls = useDragControls();
  const resolved = resolvePresentation(presentation, isMobile, size, side);

  useOverlay({ open, onClose, closeOnEscape });
  useFocusTrap(panelRef, open, initialFocus);

  // Sem OverlayProvider (fora do admin): Esc local.
  useEffect(() => {
    if (!open || hasProvider || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, hasProvider, closeOnEscape, onClose]);

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  }, [onClose]);

  const target = root ?? (mounted && typeof document !== "undefined" ? document.body : null);
  if (!target) return null;

  const isSheet = resolved === "sheet";
  const isFull = resolved === "fullscreen";
  const variants = resolved === "modal" ? v.modal : isSheet ? v.sheet : isFull ? v.fullscreen : side === "left" ? v.drawerLeft : v.drawerRight;
  const widthVar = resolved === "modal" ? MODAL_W[size] : resolved === "drawer" ? DRAWER_W[size] : undefined;
  const t = toneOf(iconTone);
  const showHeader = !!(title || header || headerActions || !hideClose);
  const startDrag = isSheet && dragToDismiss ? (e: React.PointerEvent) => dragControls.start(e) : undefined;

  const node = (
    <AnimatePresence>
      {open && (
        <div className="ak-layer" style={zIndex ? { zIndex } : undefined} data-presentation={resolved}>
          <m.div className="ak-overlay" key="overlay" {...v.fade} onClick={dismissible ? onClose : undefined} aria-hidden />
          <m.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title ? ariaLabel : undefined}
            tabIndex={-1}
            className={`ak-dialog ak-focus${className ? ` ${className}` : ""}`}
            data-presentation={resolved}
            data-size={size}
            data-side={resolved === "drawer" ? side ?? "right" : undefined}
            style={{ ...(widthVar ? ({ "--ak-dialog-w": widthVar } as CSSProperties) : {}), ...style }}
            {...variants}
            drag={isSheet && dragToDismiss ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={onDragEnd}
            {...(panelProps as object)}
          >
            {isSheet && <div className="ak-dialog__handle" onPointerDown={startDrag} aria-hidden />}
            {showHeader && (
              <div className="ak-dialog__header" onPointerDown={startDrag}>
                {isFull && !hideClose && <IconButton icon={ChevronLeft} label="Voltar" size="lg" onClick={onClose} />}
                {icon && !isFull && (
                  <span className="ak-dialog__tile" style={{ background: t.bg, borderColor: t.border, color: t.color }}>{renderIcon(icon, 16)}</span>
                )}
                {header ?? (
                  <div className="ak-dialog__titles">
                    {title && <h2 className="ak-dialog__title" id={titleId}>{title}</h2>}
                    {subtitle && <div className="ak-dialog__subtitle">{subtitle}</div>}
                  </div>
                )}
                {(headerActions || (!hideClose && !isFull)) && (
                  <div className="ak-dialog__hactions">
                    {headerActions}
                    {!hideClose && !isFull && <IconButton icon={X} label="Fechar" size={isMobile ? "lg" : "md"} onClick={onClose} />}
                  </div>
                )}
              </div>
            )}
            {rawBody ? children : (
              <div className={`ak-dialog__body${bodyClassName ? ` ${bodyClassName}` : ""}`} data-pad={String(bodyPad)}>{children}</div>
            )}
            {footer && <div className="ak-dialog__footer" data-row={footerRow || undefined}>{footer}</div>}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(node, target);
}

/** Corpo rolável — para layouts com `rawBody`. */
export function DialogBody({ children, pad = 16, className, style }: { children: React.ReactNode; pad?: 0 | 12 | 16; className?: string; style?: CSSProperties }) {
  return <div className={`ak-dialog__body${className ? ` ${className}` : ""}`} data-pad={String(pad)} style={style}>{children}</div>;
}

export function DialogFooter({ children, row, className }: { children: React.ReactNode; row?: boolean; className?: string }) {
  return <div className={`ak-dialog__footer${className ? ` ${className}` : ""}`} data-row={row || undefined}>{children}</div>;
}
