"use client";

import React, { forwardRef, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Spinner } from "./Spinner";

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string;
  onChange: (value: string) => void;
  /** Atraso (ms) entre digitar e chamar onChange. 0 = imediato. */
  debounce?: number;
  loading?: boolean;
  fullWidth?: boolean;
  wrapStyle?: React.CSSProperties;
  wrapClassName?: string;
}

/** Busca: ícone, limpar (44px no toque), 16px no celular, debounce opcional. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, debounce = 0, loading, fullWidth, wrapStyle, wrapClassName, placeholder = "Buscar…", ...rest },
  ref,
) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setLocal(value); }, [value]);
  const emit = (v: string) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    if (debounce > 0) timer.current = setTimeout(() => onChange(v), debounce);
    else onChange(v);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className={`ak-search${wrapClassName ? ` ${wrapClassName}` : ""}`} data-full={fullWidth || undefined} style={wrapStyle}>
      {loading ? <Spinner size={14} /> : <Search size={14} style={{ color: "var(--t-muted)", flexShrink: 0 }} />}
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        className="ak-search__input"
        value={local}
        placeholder={placeholder}
        onChange={e => emit(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape" && local) { e.preventDefault(); emit(""); } }}
        {...rest}
      />
      {local && (
        <button type="button" className="ak-iconbtn" data-size="sm" aria-label="Limpar busca" onClick={() => emit("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
});
