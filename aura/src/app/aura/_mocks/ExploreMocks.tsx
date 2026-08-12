// Mocks da aba EXPLORAR do Portal do Hóspede — o diferencial do app.
//
// `ExploreListMock`  → a tela Explorar: prévia do mapa, chips Áreas/Eventos,
//                      cartão da estadia, filtro de categoria e o diretório de
//                      áreas com horário, ocupação ao vivo e agendamento.
// `IllustratedMapMock` → o mapa em tela cheia.
//
// O mapa é a ILUSTRAÇÃO REAL usada em produção (public/mapa-ilustrado-demo.jpg)
// e cada pin está na sua coordenada real do banco (fração da imagem, como o
// IllustratedMap do portal posiciona). Só os nomes dos locais são fictícios —
// a arte e a geografia são as de verdade.
import React from "react";
import Image from "next/image";
import { ArrowRight, Calendar, LocateFixed, Maximize2, Ticket, Users } from "lucide-react";
import { SKIN_ALVORADA as S } from "./GuestPortalMock";

const MAP_SRC = "/mapa-ilustrado-demo.jpg";
/** Proporção da arte (1100 × 1969) — trava o quadro para o pin cair no lugar. */
const MAP_ASPECT = "1100 / 1969";

interface Poi {
  emoji: string;
  name: string;
  status: string;
  color: string;
  /** Fração da imagem — valores reais de `structures.mapPin` em produção. */
  x: number;
  y: number;
  tip?: "up" | "down";
  align?: "center" | "start" | "end";
}

const POIS: Poi[] = [
  { emoji: "⛱️", name: "Serviço de praia", status: "Aberto · 9h–17h", color: "#9b6dff", x: 0.316, y: 0.445, tip: "down", align: "start" },
  { emoji: "🍽", name: "Restaurante Horizonte", status: "Aberto agora", color: "#9b6dff", x: 0.350, y: 0.511, tip: "down", align: "start" },
  { emoji: "🍖", name: "Quiosque do Fogo", status: "Reservável no app", color: "#9b6dff", x: 0.456, y: 0.634 },
  { emoji: "♨️", name: "Jacuzzis", status: "4 de 6 lugares", color: "#9b6dff", x: 0.525, y: 0.640, align: "end" },
  { emoji: "🛝", name: "Parquinho", status: "Aberto agora", color: "#9b6dff", x: 0.534, y: 0.671, align: "end" },
  { emoji: "🪪", name: "Portaria", status: "Acesso principal", color: "#2d97fb", x: 0.529, y: 0.779, align: "end" },
  { emoji: "ℹ️", name: "Recepção", status: "Aberta 24h", color: "#0060fa", x: 0.460, y: 0.810 },
  { emoji: "☕", name: "Café da manhã", status: "Amanhã · 8h–10h30", color: "#7f5834", x: 0.358, y: 0.796, align: "start" },
  { emoji: "💆", name: "Spa", status: "Agende uma massagem", color: "#d581c5", x: 0.330, y: 0.784, tip: "down", align: "start" },
];

/** Chalés — coordenadas reais de `cabins.mapPin`. */
const CABINS: { n: string; x: number; y: number }[] = [
  { n: "28", x: 0.788, y: 0.510 },
  { n: "26", x: 0.604, y: 0.582 },
  { n: "13", x: 0.695, y: 0.587 },
  { n: "11", x: 0.678, y: 0.610 },
  { n: "22", x: 0.542, y: 0.618 },
  { n: "09", x: 0.660, y: 0.628 },
  { n: "05", x: 0.604, y: 0.666 },
  { n: "03", x: 0.571, y: 0.700 },
  { n: "01", x: 0.539, y: 0.732 },
];

const OWN_CABIN = { x: 0.626, y: 0.653 };
const USER = { x: 0.497, y: 0.723 };

const pct = (v: number) => `${v * 100}%`;

function tipClasses(p: Poi) {
  const vertical = p.tip === "down" ? "top-8" : "-top-11";
  const horizontal =
    p.align === "start"
      ? "left-0"
      : p.align === "end"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";
  return `${vertical} ${horizontal}`;
}

/* ── mapa em tela cheia ─────────────────────────────────────── */

export function IllustratedMapMock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-[300px] max-w-full rounded-[28px] overflow-hidden border shadow-2xl ${className}`}
      style={{ background: S.surface, borderColor: S.line, boxShadow: "0 26px 52px -22px rgba(63,44,20,.5)" }}
    >
      {/* barra do mapa: alternância ilustrado × satélite (a do app real) */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ borderColor: S.line, background: S.surface }}
      >
        <span className="text-[11px] font-extrabold" style={{ color: S.ink }}>
          Mapa da pousada
        </span>
        <div
          className="flex items-center gap-0.5 rounded-full p-0.5"
          style={{ background: S.surfaceAlt }}
        >
          <span
            className="text-[8.5px] font-bold px-2 py-[3px] rounded-full"
            style={{ background: S.brand, color: "#fff" }}
          >
            Ilustrado
          </span>
          <span className="text-[8.5px] font-bold px-2 py-[3px]" style={{ color: S.muted }}>
            Satélite
          </span>
        </div>
      </div>

      {/* área do mapa — proporção travada na da arte real */}
      <div className="relative w-full" style={{ aspectRatio: MAP_ASPECT }}>
        <Image
          src={MAP_SRC}
          alt="Mapa ilustrado da propriedade"
          fill
          sizes="300px"
          className="object-cover"
        />

        {/* chalés */}
        {CABINS.map(({ n, x, y }) => (
          <div
            key={n}
            className="group absolute z-10"
            style={{ left: pct(x), top: pct(y), transform: "translate(-50%,-50%)" }}
          >
            <div className="w-[18px] h-[18px] rounded-full bg-[#d97706] border-2 border-white/70 shadow-md flex items-center justify-center text-[8px] opacity-80 transition-transform duration-150 group-hover:scale-125 group-hover:opacity-100">
              🏠
            </div>
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-6 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30">
              <div className="whitespace-nowrap rounded-md bg-[#2B2620]/95 px-1.5 py-0.5 text-[8.5px] font-bold text-white shadow-lg">
                Chalé {n}
              </div>
            </div>
          </div>
        ))}

        {/* seu chalé — selo âmbar com haste, igual ao do app */}
        <div
          className="absolute z-20 flex flex-col items-center"
          style={{ left: pct(OWN_CABIN.x), top: pct(OWN_CABIN.y), transform: "translate(-50%,-100%)" }}
        >
          <div className="flex items-center gap-1 bg-[#f59e0b] text-white text-[9px] font-bold px-2 py-[2px] rounded-full shadow-lg outline outline-2 outline-white whitespace-nowrap">
            🏠 Seu chalé
          </div>
          <div className="w-0.5 h-1.5 bg-[#f59e0b]" />
          <div className="w-[7px] h-[7px] rounded-full bg-[#f59e0b] border-2 border-white" />
        </div>

        {/* pontos de interesse */}
        {POIS.map((p) => (
          <div
            key={p.name}
            className="group absolute z-10"
            style={{ left: pct(p.x), top: pct(p.y), transform: "translate(-50%,-50%)" }}
          >
            <div
              className="w-[25px] h-[25px] rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[11px] transition-transform duration-150 group-hover:scale-125"
              style={{ backgroundColor: p.color }}
            >
              {p.emoji}
            </div>
            <div
              className={`pointer-events-none absolute ${tipClasses(p)} opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30`}
            >
              <div className="whitespace-nowrap rounded-lg bg-[#2B2620]/95 px-2 py-1 shadow-xl">
                <p className="text-[9.5px] font-bold text-white leading-none">{p.name}</p>
                <p className="text-[8.5px] font-semibold leading-none mt-1" style={{ color: "#8ED1C4" }}>
                  {p.status}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* hóspede — GPS ao vivo */}
        <div
          className="absolute z-20"
          style={{ left: pct(USER.x), top: pct(USER.y), transform: "translate(-50%,-50%)" }}
        >
          <span className="absolute -inset-1.5 rounded-full bg-[#3b82f6]/30 animate-ping" />
          <span className="relative block w-3 h-3 rounded-full bg-[#3b82f6] border-2 border-white shadow-md" />
        </div>

        {/* "Me localizar" — o botão de GPS do mapa real */}
        <div className="absolute bottom-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 shadow-lg">
          <LocateFixed size={11} style={{ color: "#2563eb" }} />
          <span className="text-[9.5px] font-bold text-[#1f2937]">Me localizar</span>
        </div>
      </div>
    </div>
  );
}

/* ── a tela Explorar (lista) ────────────────────────────────── */

function AreaRow({
  emoji,
  name,
  meta,
  badge,
  badgeTone,
  occupancy,
}: {
  emoji: string;
  name: string;
  meta: string;
  badge: string;
  badgeTone: "green" | "gold" | "muted";
  occupancy?: { current: number; capacity: number };
}) {
  const tone =
    badgeTone === "green"
      ? { c: S.green, bg: S.greenSoft }
      : badgeTone === "gold"
      ? { c: S.gold, bg: S.goldSoft }
      : { c: S.muted, bg: S.surfaceAlt };
  const ratio = occupancy ? occupancy.current / occupancy.capacity : 0;
  const barColor = ratio < 0.5 ? "#22c55e" : ratio < 0.85 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="rounded-2xl border p-2.5 transition-transform duration-150 hover:-translate-y-[1px]"
      style={{ background: S.surface, borderColor: S.line, boxShadow: "0 2px 8px -4px rgba(63,44,20,0.18)" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px] shrink-0"
          style={{ background: S.surfaceAlt }}
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10.5px] font-bold truncate" style={{ color: S.ink }}>
              {name}
            </p>
            <span
              className="text-[7.5px] font-extrabold uppercase tracking-wide px-1.5 py-[2px] rounded-full shrink-0"
              style={{ background: tone.bg, color: tone.c }}
            >
              {badge}
            </span>
          </div>
          <p className="text-[8.5px] mt-0.5" style={{ color: S.muted }}>
            {meta}
          </p>
        </div>
      </div>
      {occupancy && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="inline-flex items-center gap-1 text-[8px] font-bold" style={{ color: S.inkSoft }}>
              <Users size={8} /> Ocupação
            </span>
            <span className="text-[8px] font-mono" style={{ color: S.muted }}>
              {occupancy.current}/{occupancy.capacity}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: S.surfaceAlt }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(ratio * 100)}%`, background: barColor }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ExploreListMock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-[262px] max-w-full rounded-[26px] overflow-hidden border shadow-2xl ${className}`}
      style={{ background: S.bg, borderColor: S.line, boxShadow: "0 26px 52px -24px rgba(63,44,20,.45)" }}
    >
      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-[17px] font-extrabold tracking-tight leading-none" style={{ color: S.ink }}>
            Explorar
          </p>
          <p className="text-[9px] mt-1" style={{ color: S.muted }}>
            Tudo o que a pousada tem para você
          </p>
        </div>

        {/* prévia do mapa — toque abre em tela cheia */}
        <div
          className="relative h-[104px] rounded-2xl overflow-hidden border"
          style={{ borderColor: S.line }}
        >
          <Image
            src={MAP_SRC}
            alt="Prévia do mapa da pousada"
            fill
            sizes="262px"
            className="object-cover"
            style={{ objectPosition: "center 62%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#281E0F]/70 to-transparent" />
          <span className="absolute left-2.5 bottom-2 text-[9.5px] font-extrabold text-white">
            Toque para abrir o mapa
          </span>
          <span
            className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[8.5px] font-bold"
            style={{ color: S.brandDeep }}
          >
            <Maximize2 size={8} style={{ color: S.brand }} /> Ampliar
          </span>
        </div>

        {/* chips Áreas / Eventos */}
        <div className="flex gap-1.5">
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: S.brand, color: "#fff" }}
          >
            <Calendar size={9} /> Áreas
          </span>
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold px-2.5 py-1 rounded-full border"
            style={{ background: S.surface, color: S.muted, borderColor: S.line }}
          >
            <Ticket size={9} /> Eventos
          </span>
        </div>

        {/* cartão da estadia + "Como chegar" */}
        <div
          className="rounded-2xl p-2.5 text-white"
          style={{ background: `linear-gradient(140deg, ${S.brand}, ${S.brandDeep})` }}
        >
          <p className="text-[7.5px] font-extrabold uppercase tracking-[0.14em] opacity-80">
            Sua estadia
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[12.5px] font-extrabold font-serif">Chalé Ipê</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-[3px] text-[8.5px] font-bold">
              Como chegar <ArrowRight size={8} />
            </span>
          </div>
        </div>

        {/* filtro de categoria */}
        <div className="flex gap-1 flex-wrap">
          {["Todos", "Alimentação", "Lazer", "Bem-estar"].map((c, i) => (
            <span
              key={c}
              className="text-[7.5px] font-extrabold uppercase tracking-wide px-2 py-[3px] rounded-full border"
              style={
                i === 0
                  ? { background: S.brandSoft, color: S.brandDeep, borderColor: S.brandSoft }
                  : { background: S.surface, color: S.muted, borderColor: S.line }
              }
            >
              {c}
            </span>
          ))}
        </div>

        {/* diretório de áreas */}
        <div className="space-y-1.5">
          <AreaRow
            emoji="🍽"
            name="Restaurante Horizonte"
            meta="Almoço e jantar · 12h–22h"
            badge="Aberto"
            badgeTone="green"
          />
          <AreaRow
            emoji="♨️"
            name="Jacuzzis"
            meta="Disponível para agendar"
            badge="Agendar"
            badgeTone="gold"
            occupancy={{ current: 4, capacity: 6 }}
          />
          <AreaRow
            emoji="💆"
            name="Spa"
            meta="Massagens com hora marcada"
            badge="Recepção"
            badgeTone="muted"
          />
        </div>
      </div>
    </div>
  );
}
