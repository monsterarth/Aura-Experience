"use client";

import React from "react";
import { Calendar, FileText, Settings, Users } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Card } from "@/components/aura";
import { renderIcon, type IconLike } from "@/components/aura/icon";

const ACTIONS: { label: string; desc: string; href: string; icon: IconLike; tone: Tone }[] = [
  { label: "Gerenciar equipe", desc: "Adicionar e editar funcionários", href: "/admin/staff", icon: Users, tone: "brand" },
  { label: "Ver escalas", desc: "Gestão de turnos e folgas", href: "/admin/escalas", icon: Calendar, tone: "blue" },
  { label: "Logs de auditoria", desc: "Histórico de ações", href: "/admin/logs", icon: FileText, tone: "neutral" },
  { label: "Configurações", desc: "Ajustes da propriedade", href: "/admin/configuracoes", icon: Settings, tone: "green" },
];

/** Atalhos do painel (2 colunas no celular, 4 no desktop). */
export function QuickActions() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ACTIONS.map(a => {
        const t = toneOf(a.tone);
        return (
          <Card key={a.href} href={a.href} interactive pad={16} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: t.bg, border: `1px solid ${t.border}`, color: t.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {renderIcon(a.icon, 15)}
            </span>
            <span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.text }}>{a.label}</span>
              <span style={{ display: "block", fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{a.desc}</span>
            </span>
          </Card>
        );
      })}
    </div>
  );
}
