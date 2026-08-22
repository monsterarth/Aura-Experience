// Modal de autorização de gerente para operações sensíveis.
//
// A credencial NÃO é validada aqui nem em nenhum client do Supabase: ela vai
// junto da própria requisição da operação e é conferida no servidor. Isso
// preserva a sessão de quem está operando — validar no browser deslogaria a
// recepcionista e logaria o gerente no lugar dela.
//
// A senha vive só no state deste componente e é descartada ao fechar.
"use client";

import { Dialog } from "@/components/aura";

import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";

export interface ManagerOverride { email: string; password: string }

export function ManagerApprovalModal({
  title,
  description,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  /** O que exatamente será feito, em uma linha — o gerente precisa saber o que autoriza. */
  description: string;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (override: ManagerOverride) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    onConfirm({ email: email.trim(), password });
  };

  return (
    <Dialog open onClose={() => { if (!submitting) onCancel(); }} presentation="auto" size="md" rawBody hideClose>
      <form onSubmit={submit}
        className="bg-background border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "100%", overflowY: "auto" }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="text-amber-500" size={20} />
            </div>
            <div>
              <h3 className="font-black text-foreground leading-tight">{title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Esta operação exige autorização de um gerente.
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={submitting}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground">
            {description}
          </div>

          <div>
            <label className="field-label">E-mail do gerente</label>
            <input type="email" autoFocus autoComplete="off" required value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={submitting}
              className="field-input" placeholder="gerente@..." />
          </div>
          <div>
            <label className="field-label">Senha</label>
            <input type="password" autoComplete="new-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={submitting}
              className="field-input" placeholder="••••••••" />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            A sessão atual não muda — o gerente só autoriza esta ação, que fica registrada
            no log de auditoria com os dois nomes.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-border bg-secondary/30">
          <button type="button" onClick={onCancel} disabled={submitting}
            className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting || !email.trim() || !password}
            className="px-6 py-2.5 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Autorizar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
