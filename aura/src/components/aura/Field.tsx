"use client";

// Campos de formulário na identidade: glass + hairline, 16px no celular (sem zoom
// do iOS), 44px de altura no toque, anel de foco roxo. Label sempre visível, acima.
import React, { forwardRef, useEffect, useId, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Spinner } from "./Spinner";

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Field({ label, hint, error, required, htmlFor, children, className, style }: FieldProps) {
  return (
    <div className={`ak-field${className ? ` ${className}` : ""}`} style={style}>
      {label && (
        <label className="ak-field__label" htmlFor={htmlFor}>
          {label}{required && <span className="ak-field__req" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? <div className="ak-field__error" role="alert">{error}</div> : hint ? <div className="ak-field__hint">{hint}</div> : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  fieldSize?: "sm" | "md";
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, fieldSize = "md", className, ...rest }, ref) {
  return <input ref={ref} className={`ak-input${className ? ` ${className}` : ""}`} data-size={fieldSize} aria-invalid={invalid || undefined} {...rest} />;
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  fieldSize?: "sm" | "md";
  wrapStyle?: React.CSSProperties;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, fieldSize = "md", className, wrapStyle, children, ...rest }, ref) {
  return (
    <span className="ak-select-wrap" style={wrapStyle}>
      <select ref={ref} className={`ak-select${className ? ` ${className}` : ""}`} data-size={fieldSize} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
      <span className="ak-select-wrap__chev"><ChevronDown size={14} /></span>
    </span>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Cresce com o conteúdo (até maxRows). */
  autoGrow?: boolean;
  maxRows?: number;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, autoGrow, maxRows = 10, className, onChange, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el); else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  const grow = () => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 20)}px`;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { grow(); }, [rest.value]);
  return <textarea ref={setRef} className={`ak-textarea${className ? ` ${className}` : ""}`} aria-invalid={invalid || undefined} onChange={e => { onChange?.(e); grow(); }} {...rest} />;
});

export interface SwitchProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Rótulo acessível (obrigatório se não houver texto visível ao lado). */
  label?: string;
  size?: "sm" | "md";
  /** Texto visível ao lado (vira linha clicável). */
  children?: React.ReactNode;
  hint?: React.ReactNode;
  id?: string;
}

export function Switch({ checked, onChange, disabled, loading, label, size = "md", children, hint, id }: SwitchProps) {
  const autoId = useId();
  const sid = id ?? autoId;
  const interactive = !!onChange && !disabled && !loading;
  const knob = <span className="ak-switch__knob">{loading ? <Spinner size={10} color="#9b6dff" /> : checked && size === "md" ? <Check size={11} strokeWidth={3} /> : null}</span>;
  // Sem onChange é decorativo (quem controla o clique é a linha inteira — SettingRow):
  // vira <span>, não <button>, para não aninhar botão em botão.
  const control = onChange ? (
    <button
      type="button"
      role="switch"
      id={sid}
      aria-checked={checked}
      aria-label={children ? undefined : label}
      aria-busy={loading || undefined}
      disabled={!interactive}
      onClick={() => onChange(!checked)}
      className="ak-switch"
      data-on={checked || undefined}
      data-size={size}
    >
      {knob}
    </button>
  ) : (
    <span role="switch" aria-checked={checked} aria-label={label} aria-busy={loading || undefined} className="ak-switch" data-on={checked || undefined} data-size={size} style={disabled ? { opacity: 0.55 } : undefined}>
      {knob}
    </span>
  );
  if (!children) return control;
  return (
    <label className="ak-switch-row" htmlFor={sid}>
      {control}
      <span className="ak-switch-row__text">
        {children}
        {hint && <div className="ak-switch-row__hint">{hint}</div>}
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, disabled, children, label, id }: { checked: boolean; onChange?: (next: boolean) => void; disabled?: boolean; children?: React.ReactNode; label?: string; id?: string }) {
  const autoId = useId();
  const cid = id ?? autoId;
  return (
    <label className="ak-check" htmlFor={cid} data-on={checked || undefined} data-disabled={disabled || undefined}>
      <input id={cid} type="checkbox" checked={checked} disabled={disabled} aria-label={children ? undefined : label} onChange={e => onChange?.(e.target.checked)} />
      <span className="ak-check__box" aria-hidden>{checked && <Check size={13} strokeWidth={3} />}</span>
      {children && <span>{children}</span>}
    </label>
  );
}

/** Linha de campos: 1 coluna no celular, `cols` a partir de 640px. */
export function FieldRow({ cols = 2, children, style, className }: { cols?: 2 | 3 | 4; children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`ak-fieldrow${className ? ` ${className}` : ""}`} data-cols={String(cols)} style={style}>{children}</div>;
}
