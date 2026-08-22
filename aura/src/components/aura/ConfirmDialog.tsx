"use client";

// Substitui confirm()/prompt()/alert() nativos por diálogos na identidade.
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Excluir produto?", tone: "danger", confirmLabel: "Excluir" }))) return;
// Sem ConfirmProvider (portal do hóspede, apps) cai no window.confirm — nunca quebra.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Info } from "lucide-react";
import type { Tone } from "@/lib/admin-tokens";
import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { Field, Input, Textarea } from "./Field";
import type { IconLike } from "./icon";

export interface ConfirmOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" foca Cancelar e pinta Confirmar de vermelho. */
  tone?: "primary" | "danger";
  /** Exige digitar este texto para habilitar Confirmar (ações irreversíveis). */
  requireText?: string;
  icon?: IconLike;
}
export interface PromptOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "number" | "textarea" | "email" | "tel";
  required?: boolean;
  validate?: (value: string) => string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconLike;
}
export interface AlertOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  okLabel?: string;
  tone?: Tone;
  icon?: IconLike;
}

type Item =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (value: string | null) => void }
  | { kind: "alert"; opts: AlertOptions; resolve: () => void };

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
}

const Ctx = createContext<ConfirmCtx | null>(null);

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const current = queue[0] ?? null;
  // Mantém o último item durante a animação de saída.
  const lastRef = useRef<Item | null>(null);
  if (current) lastRef.current = current;

  const push = useCallback((item: Item) => setQueue(q => [...q, item]), []);
  const pop = useCallback(() => setQueue(q => q.slice(1)), []);

  const value = useMemo<ConfirmCtx>(() => ({
    confirm: opts => new Promise<boolean>(resolve => push({ kind: "confirm", opts, resolve })),
    prompt: opts => new Promise<string | null>(resolve => push({ kind: "prompt", opts, resolve })),
    alert: opts => new Promise<void>(resolve => push({ kind: "alert", opts, resolve })),
  }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmView item={current} shown={lastRef.current} onDone={pop} />
    </Ctx.Provider>
  );
}

function ConfirmView({ item, shown, onDone }: { item: Item | null; shown: Item | null; onDone: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const it = item ?? shown;

  useEffect(() => {
    setErr(null); setBusy(false);
    setText(item?.kind === "prompt" ? item.opts.defaultValue ?? "" : "");
  }, [item]);

  if (!it) return null;
  const open = item !== null;

  const cancel = () => {
    if (it.kind === "confirm") it.resolve(false);
    else if (it.kind === "prompt") it.resolve(null);
    else it.resolve();
    onDone();
  };
  const ok = () => {
    if (it.kind === "confirm") { it.resolve(true); onDone(); return; }
    if (it.kind === "alert") { it.resolve(); onDone(); return; }
    const val = text;
    if (it.opts.required && !val.trim()) { setErr("Preencha para continuar."); return; }
    const e = it.opts.validate?.(val);
    if (e) { setErr(e); return; }
    it.resolve(val); onDone();
  };

  const danger = it.kind === "confirm" && it.opts.tone === "danger";
  const requireText = it.kind === "confirm" ? it.opts.requireText : undefined;
  const canConfirm = !requireText || text.trim() === requireText;
  const icon: IconLike = it.opts.icon ?? (it.kind === "alert" ? Info : danger ? AlertTriangle : HelpCircle);
  const iconTone: Tone = it.kind === "alert" ? (it.opts.tone ?? "brand") : danger ? "red" : "brand";
  const confirmLabel = it.kind === "alert" ? (it.opts.okLabel ?? "OK") : (it.opts.confirmLabel ?? "Confirmar");
  const cancelLabel = it.kind === "alert" ? null : (it.opts.cancelLabel ?? "Cancelar");
  const initialFocus = it.kind === "prompt" ? (it.opts.inputType === "textarea" ? taRef : inputRef) : danger ? cancelRef : confirmRef;

  return (
    <Dialog
      open={open}
      onClose={cancel}
      presentation="auto"
      size="sm"
      title={it.opts.title}
      icon={icon}
      iconTone={iconTone}
      initialFocus={initialFocus as React.RefObject<HTMLElement>}
      footer={
        <>
          {cancelLabel && <Button ref={cancelRef} variant="secondary" onClick={cancel}>{cancelLabel}</Button>}
          <Button ref={confirmRef} variant={danger ? "danger-solid" : "primary"} onClick={ok} disabled={!canConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {it.opts.description && <div style={{ fontSize: 13, color: "var(--t-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{it.opts.description}</div>}
      {it.kind === "prompt" && (
        <form onSubmit={e => { e.preventDefault(); ok(); }} style={{ marginTop: it.opts.description ? 14 : 0 }}>
          <Field label={it.opts.label} error={err}>
            {it.opts.inputType === "textarea" ? (
              <Textarea ref={taRef} value={text} onChange={e => { setText(e.target.value); setErr(null); }} placeholder={it.opts.placeholder} rows={3} />
            ) : (
              <Input ref={inputRef} type={it.opts.inputType ?? "text"} value={text} onChange={e => { setText(e.target.value); setErr(null); }} placeholder={it.opts.placeholder} />
            )}
          </Field>
          <button type="submit" hidden aria-hidden />
        </form>
      )}
      {requireText && (
        <div style={{ marginTop: 14 }}>
          <Field label={`Digite ${requireText} para confirmar`}>
            <Input value={text} onChange={e => setText(e.target.value)} placeholder={requireText} autoComplete="off" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function fallbackText(title: React.ReactNode, description?: React.ReactNode) {
  const t = textOf(title);
  const d = textOf(description);
  return d ? `${t}\n\n${d}` : t;
}

/** Confirmação na identidade; sem provider cai no window.confirm. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(Ctx);
  return useCallback((opts: ConfirmOptions) => {
    if (ctx) return ctx.confirm(opts);
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(fallbackText(opts.title, opts.description)) : false);
  }, [ctx]);
}

export function usePrompt(): (opts: PromptOptions) => Promise<string | null> {
  const ctx = useContext(Ctx);
  return useCallback((opts: PromptOptions) => {
    if (ctx) return ctx.prompt(opts);
    return Promise.resolve(typeof window !== "undefined" ? window.prompt(fallbackText(opts.title, opts.description), opts.defaultValue ?? "") : null);
  }, [ctx]);
}

export function useAlert(): (opts: AlertOptions) => Promise<void> {
  const ctx = useContext(Ctx);
  return useCallback((opts: AlertOptions) => {
    if (ctx) return ctx.alert(opts);
    if (typeof window !== "undefined") window.alert(fallbackText(opts.title, opts.description));
    return Promise.resolve();
  }, [ctx]);
}

export function useHasConfirmProvider(): boolean {
  return useContext(Ctx) !== null;
}
