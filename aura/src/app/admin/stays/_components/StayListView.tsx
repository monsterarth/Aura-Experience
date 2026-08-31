"use client";

// Modo lista das abas Ativas e Futuras: uma tabela no desktop, cards no celular
// (o DataList do kit resolve os dois com a mesma fonte de dados).
import React, { useMemo } from "react";
import { ArrowUpRight, Ban, Copy, DollarSign, Dog, LogIn, LogOut, MessageCircle, Receipt, ShieldAlert, Users } from "lucide-react";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { DataList, Pill, type Column, type RowAction } from "@/components/aura";
import { accountChips, isAccountOpen, openChips } from "@/lib/stay-account";
import { activeStatusInfo, futureStatusInfo, fmtDay, isDocPending, titleCase, type StayRow } from "./stay-utils";
import { formatBRL } from "@/lib/money";

export interface StayListViewProps {
  rows: StayRow[];
  mode: "ativas" | "futuras";
  onOpen: (s: StayRow) => void;
  onWhatsapp: (s: StayRow) => void;
  onCheckIn?: (s: StayRow) => void;
  onCheckOut?: (s: StayRow) => void;
  onAccount?: (s: StayRow) => void;
  onCancel?: (s: StayRow) => void;
  onCopyLink?: (code: string) => void;
}

const microLabel: React.CSSProperties = { fontSize: 10, color: T.muted2, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 };

function guestCount(s: StayRow): number {
  const c = s.counts ?? {};
  return (c.adults ?? 0) + (c.children ?? 0) + (c.babies ?? 0);
}

function pendingTotal(s: StayRow): number {
  return (s.folioItems ?? [])
    .filter((f: any) => f.status === "pending")
    .reduce((acc: number, f: any) => acc + (f.totalPrice ?? 0), 0);
}

export function StayListView({ rows, mode, onOpen, onWhatsapp, onCheckIn, onCheckOut, onAccount, onCancel, onCopyLink }: StayListViewProps) {
  const columns: Column<StayRow>[] = useMemo(() => {
    const base: Column<StayRow>[] = [
      {
        id: "cabin", header: "Cabana", width: 170, mobile: "meta",
        cell: s => <Pill tone={s.cabinId ? "brand" : "amber"} size="md" label={s.cabinName || "Sem cabana"} />,
      },
      {
        id: "guest", header: "Hóspede", priority: 1, mobile: "title",
        cell: s => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, color: T.text }}>
            {titleCase(s.guestName) || "Hóspede desconhecido"}
            {s.internalUse && <Pill tone="amber" label="Uso da casa" />}
          </span>
        ),
      },
      {
        id: "period", header: "Período", nowrap: true, mobile: "subtitle",
        cell: s => <span style={{ color: T.muted, fontSize: 12, fontWeight: 600 }}>{fmtDay(s.checkIn, "dd/MM")} → {fmtDay(s.checkOut, "dd/MM")}</span>,
      },
      {
        id: "status", header: mode === "ativas" ? "Status" : "Previsão", mobile: "trailing", nowrap: true,
        cell: s => {
          if (mode === "ativas" && isAccountOpen(s)) {
            const pend = openChips(accountChips(s));
            return (
              <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.orange }}>Saiu {fmtDay(s.checkOutActual ?? s.checkOut, "dd/MM")} · conta aberta</span>
                {pend.length > 0 && <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{pend.map(c => c.label.toLowerCase()).join(" · ")}</span>}
              </span>
            );
          }
          const info = mode === "ativas" ? activeStatusInfo(s.checkOut) : futureStatusInfo(s.checkIn, s.expectedArrivalTime);
          const t = toneOf(info.tone);
          return <span style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{info.label}</span>;
        },
      },
      {
        id: "flags", header: "Selos", align: "center", priority: 2, mobile: "trailing",
        cell: s => {
          const items: React.ReactNode[] = [];
          if (isDocPending(s)) items.push(<ShieldAlert key="doc" size={14} color={T.red} aria-label="Documento pendente" />);
          if (s.hasPet) items.push(<Dog key="pet" size={14} color={T.orange} aria-label="Pet" />);
          if (s.groupId) items.push(<Users key="grp" size={14} color={T.blue} aria-label="Grupo" />);
          return items.length ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{items}</span> : null;
        },
      },
    ];

    if (mode === "futuras") {
      base.push({
        id: "pre", header: "Pré-check-in", align: "center", priority: 3, mobileLabel: "Pré-check-in",
        cell: s => (s.status === "pre_checkin_done"
          ? <Pill tone="green" label="Pronto" />
          : <Pill tone="amber" label="Pendente" />),
      });
    }

    base.push(
      {
        id: "people", header: "Pessoas", align: "center", priority: 3, mobileLabel: "Pessoas",
        cell: s => <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{guestCount(s) || "—"}</span>,
      },
      {
        id: "account", header: "Conta", align: "center", priority: 3, mobileLabel: "Conta",
        cell: s => {
          const total = pendingTotal(s);
          return total > 0
            ? <Pill tone="orange" icon={DollarSign} label={formatBRL(total)} />
            : <span style={microLabel}>Sem saldo</span>;
        },
      },
    );

    return base;
  }, [mode]);

  const actions = (s: StayRow): RowAction<StayRow>[] => {
    const list: RowAction<StayRow>[] = [
      { id: "open", label: "Abrir ficha", icon: ArrowUpRight, onClick: onOpen },
      { id: "wa", label: "WhatsApp", icon: MessageCircle, onClick: onWhatsapp },
    ];
    if (mode === "futuras" && s.status === "pending" && onCopyLink) {
      list.push({ id: "link", label: "Copiar link do check-in", icon: Copy, onClick: r => onCopyLink(r.accessCode) });
    }
    if (mode === "futuras" && onCheckIn) list.push({ id: "in", label: "Fazer check-in", icon: LogIn, onClick: onCheckIn, tone: "green" });
    if (mode === "ativas" && onAccount) list.push({ id: "acct", label: "Abrir a conta", icon: Receipt, onClick: onAccount, tone: "orange" });
    if (mode === "ativas" && onCheckOut && !isAccountOpen(s)) list.push({ id: "out", label: "Fazer check-out", icon: LogOut, onClick: onCheckOut, tone: "brand" });
    if (mode === "futuras" && onCancel) list.push({ id: "cancel", label: "Cancelar reserva", icon: Ban, onClick: onCancel, danger: true });
    return list;
  };

  return (
    <DataList<StayRow>
      rows={rows}
      columns={columns}
      rowKey={s => s.id}
      onRowClick={onOpen}
      rowActions={actions}
      actionsLabel="Ações da estadia"
      live
    />
  );
}
