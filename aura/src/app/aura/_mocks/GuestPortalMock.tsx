// Mock fiel do Portal do Hóspede 2.0 (tema "camaleão" do portal real — hero em
// gradiente da marca, jornada do dia, ações rápidas 2×2 e tab bar).
// Parametrizado por `skin`, e a pele muda MAIS do que cor: raio dos cards
// (pontudo × arredondado), tipografia (serifada × sans geométrica), ornamento
// e o próprio claro/escuro. A mesma tela vestindo identidades opostas é a
// demonstração do white label. Só markup + hover CSS.
import React from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Coffee,
  Compass,
  Home,
  Map,
  ShoppingBag,
  Sparkles,
  Sun,
  User,
} from "lucide-react";

export interface PortalSkin {
  /** Nome fictício da pousada (marca white label). */
  name: string;
  monogram: string;
  /** Raio de borda por elemento — é aqui que nasce o "pontudo × redondo". */
  rHero: number;
  rCard: number;
  rTile: number;
  rChip: number;
  /** Tipografia da marca: serifada (clássica) ou sans (geométrica). */
  displaySerif: boolean;
  /** Nome da marca em caixa alta com tracking largo (visual "clean"). */
  displayUpper?: boolean;
  /** Filete dourado com losango sob o nome da acomodação (visual "vintage"). */
  ornament?: boolean;
  /** Gradiente do hero (default: brand → brandDeep). */
  heroFrom?: string;
  heroTo?: string;
  /** Sombra do frame do phone (quente, neutra ou escura conforme a pele). */
  frameShadow: string;
  brand: string;
  brandDeep: string;
  brandSoft: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  gold: string;
  goldSoft: string;
  green: string;
  greenSoft: string;
  clay: string;
  claySoft: string;
}

/** Baseline quente — a "pele" padrão do portal real (theme.ts): arredondada. */
export const SKIN_ALVORADA: PortalSkin = {
  name: "Pousada Alvorada",
  monogram: "A",
  rHero: 24,
  rCard: 16,
  rTile: 10,
  rChip: 999,
  displaySerif: true,
  frameShadow: "0 24px 48px -20px rgba(63,44,20,.35)",
  brand: "#8A5A2B",
  brandDeep: "#6E4621",
  brandSoft: "#EAD9C2",
  bg: "#EFE7DA",
  surface: "#FBF7F0",
  surfaceAlt: "#F3EADC",
  ink: "#2B2620",
  inkSoft: "#5C5347",
  muted: "#938775",
  line: "#E3D8C6",
  gold: "#C9962F",
  goldSoft: "#F2E2BD",
  green: "#3F7D74",
  greenSoft: "#D2E5E0",
  clay: "#B5562F",
  claySoft: "#F3DBCD",
};

/** Vintage: tema ESCURO, serifada, cantos retos, dourado envelhecido. */
export const SKIN_ENGENHO: PortalSkin = {
  name: "Velho Engenho",
  monogram: "V",
  rHero: 2,
  rCard: 0,
  rTile: 0,
  rChip: 0,
  displaySerif: true,
  ornament: true,
  heroFrom: "#6B4A1F",
  heroTo: "#392713",
  frameShadow: "0 24px 48px -18px rgba(0,0,0,.7)",
  brand: "#C08A3E",
  brandDeep: "#8E6226",
  brandSoft: "rgba(192,138,62,0.16)",
  bg: "#191410",
  surface: "#221B14",
  surfaceAlt: "#2B2218",
  ink: "#F1E8D9",
  inkSoft: "#CFC2A8",
  muted: "#9A8C72",
  line: "#3B3123",
  gold: "#D4AF37",
  goldSoft: "rgba(212,175,55,0.14)",
  green: "#8FA98B",
  greenSoft: "rgba(143,169,139,0.14)",
  clay: "#C06A45",
  claySoft: "rgba(192,106,69,0.16)",
};

/** Clean: tema CLARO, sans geométrica em caixa alta, cantos vivos, sálvia. */
export const SKIN_LUME: PortalSkin = {
  name: "Casa Lume",
  monogram: "L",
  rHero: 6,
  rCard: 4,
  rTile: 3,
  rChip: 4,
  displaySerif: false,
  displayUpper: true,
  frameShadow: "0 24px 48px -22px rgba(40,45,42,.28)",
  brand: "#266B63",
  brandDeep: "#1B4F49",
  brandSoft: "#DDEBE7",
  bg: "#F5F4F0",
  surface: "#FFFFFF",
  surfaceAlt: "#ECEBE5",
  ink: "#191A1C",
  inkSoft: "#4C4E52",
  muted: "#90939A",
  line: "#E3E2DC",
  gold: "#A98D4B",
  goldSoft: "#EFE9D9",
  green: "#4C8A63",
  greenSoft: "#E0EEE5",
  clay: "#A46A54",
  claySoft: "#F0E1D9",
};

const TABS = [
  { icon: Home, label: "Início", active: true },
  { icon: Compass, label: "Explorar", active: false },
  { icon: ShoppingBag, label: "Pedidos", active: false },
  { icon: User, label: "Estadia", active: false },
];

export function GuestPortalMock({
  skin,
  mini = false,
}: {
  skin: PortalSkin;
  mini?: boolean;
}) {
  const s = skin;
  const heroFrom = s.heroFrom ?? s.brand;
  const heroTo = s.heroTo ?? s.brandDeep;
  const displayFont = s.displaySerif ? "font-serif" : "font-sans";
  const nameClass = s.displayUpper
    ? `${displayFont} uppercase font-bold ${mini ? "text-[8.5px] tracking-[0.18em]" : "text-[10.5px] tracking-[0.22em]"}`
    : `${displayFont} ${mini ? "text-[11px]" : "text-[13.5px]"}`;

  return (
    <div
      className={`${mini ? "w-56 rounded-[22px]" : "w-72 rounded-[28px]"} overflow-hidden border`}
      style={{ background: s.bg, borderColor: s.line, boxShadow: s.frameShadow }}
    >
      <div className={mini ? "p-2.5 space-y-2.5" : "p-3.5 space-y-3"}>
        {/* hero — gradiente da marca com textura de pontos e progresso da estadia */}
        <div
          className={`relative overflow-hidden text-white ${mini ? "p-3" : "p-4"}`}
          style={{
            background: `linear-gradient(150deg, ${heroFrom} 0%, ${heroTo} 100%)`,
            borderRadius: s.rHero,
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.13] pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 1.5px 1.5px, #fff 1px, transparent 0)",
              backgroundSize: "13px 13px",
            }}
          />
          <div className="relative">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`${mini ? "w-4 h-4 text-[8px]" : "w-5 h-5 text-[9px]"} bg-white/20 flex items-center justify-center font-black shrink-0`}
                  style={{ borderRadius: s.rChip === 999 ? 999 : s.rTile }}
                >
                  {s.monogram}
                </span>
                <span className={`${nameClass} truncate`}>{s.name}</span>
              </div>
              <span
                className="inline-flex items-center gap-1 bg-white/[0.16] px-2 py-0.5 shrink-0"
                style={{ borderRadius: s.rChip }}
              >
                <Sun size={mini ? 9 : 11} />
                <span className={`font-bold ${mini ? "text-[8px]" : "text-[10px]"}`}>24°</span>
              </span>
            </div>
            <p className={`opacity-80 font-semibold ${mini ? "text-[8px]" : "text-[10px]"}`}>
              Boa tarde, Ana
            </p>
            <p
              className={`${displayFont} font-extrabold tracking-tight leading-tight ${mini ? "text-[15px]" : "text-[20px]"}`}
            >
              Chalé Ipê
            </p>
            {/* ornamento vintage: filete + losango dourado */}
            {s.ornament && (
              <div className="flex items-center gap-1.5 mt-1" style={{ color: s.gold }}>
                <span className="h-px w-7" style={{ background: `${s.gold}66` }} />
                <span className={mini ? "text-[6px]" : "text-[7px]"}>◆</span>
                <span className="h-px w-7" style={{ background: `${s.gold}66` }} />
              </div>
            )}
            <p className={`opacity-80 ${mini ? "text-[7.5px] mb-2 mt-0.5" : "text-[9px] mb-2.5 mt-0.5"}`}>
              12 – 16 ago
            </p>
            {/* progresso das noites */}
            <div className="flex gap-1 items-center">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1"
                  style={{
                    background: i < 2 ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.32)",
                    borderRadius: s.rChip === 0 ? 0 : 999,
                  }}
                />
              ))}
            </div>
            <div className={`flex items-center justify-between opacity-90 ${mini ? "text-[7px] mt-1" : "text-[8.5px] mt-1.5"}`}>
              <span className="font-semibold">Noite 2 de 4</span>
              <span>Check-out 16 ago · 12:00</span>
            </div>
          </div>
        </div>

        {/* jornada do dia — só na versão cheia */}
        {!mini && (
          <div>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span
                className={`text-[8.5px] font-extrabold uppercase tracking-[0.12em] ${displayFont}`}
                style={{ color: s.inkSoft }}
              >
                Sua jornada hoje
              </span>
              <span
                className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5"
                style={{ background: s.brandSoft, color: s.brand, borderRadius: s.rChip }}
              >
                <Sparkles size={8} /> Aura
              </span>
            </div>
            <div
              className="border p-2.5 flex gap-2.5 transition-transform duration-150 hover:-translate-y-[1px]"
              style={{
                background: s.surface,
                borderColor: s.line,
                borderRadius: s.rCard,
                boxShadow: "0 2px 8px -4px rgba(0,0,0,0.15)",
              }}
            >
              <div
                className="w-8 h-8 flex items-center justify-center shrink-0"
                style={{ background: s.brandSoft, color: s.brand, borderRadius: s.rTile }}
              >
                <Coffee size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[7.5px] font-extrabold uppercase tracking-wider" style={{ color: s.brand }}>
                  Café
                </p>
                <p className={`text-[10.5px] font-bold leading-tight ${displayFont}`} style={{ color: s.ink }}>
                  Cesta de café confirmada
                </p>
                <p className="text-[8.5px] mt-0.5" style={{ color: s.inkSoft }}>
                  Entrega no chalé às 08:30
                </p>
                <span
                  className="inline-flex items-center gap-1 mt-1.5 text-[8.5px] font-bold px-2 py-1"
                  style={{ background: s.surfaceAlt, color: s.displaySerif ? s.brandDeep : s.brand, borderRadius: s.rChip === 999 ? 8 : s.rChip }}
                >
                  Editar cesta <ArrowRight size={8} style={{ color: s.brand }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ações rápidas 2×2 (as quatro do portal real) */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Coffee, label: "Café da manhã", sub: "Personalize até 20h", tile: s.brandSoft, c: s.brand },
            { icon: CalendarDays, label: "Agenda", sub: "Reserve experiências", tile: s.greenSoft, c: s.green },
            { icon: Bell, label: "Concierge", sub: "Peça o que precisar", tile: s.goldSoft, c: s.gold },
            { icon: Map, label: "Mapa", sub: "Explore a pousada", tile: s.claySoft, c: s.clay },
          ].map(({ icon: Icon, label, sub, tile, c }) => (
            <div
              key={label}
              className={`border transition-transform duration-150 hover:-translate-y-[1px] ${mini ? "p-2" : "p-2.5"}`}
              style={{
                background: s.surface,
                borderColor: s.line,
                borderRadius: s.rCard,
                boxShadow: "0 2px 8px -4px rgba(0,0,0,0.12)",
              }}
            >
              <div
                className={`${mini ? "w-6 h-6 mb-1.5" : "w-7 h-7 mb-2"} flex items-center justify-center`}
                style={{ background: tile, color: c, borderRadius: s.rTile }}
              >
                <Icon size={mini ? 12 : 14} />
              </div>
              <p
                className={`font-bold leading-none ${displayFont} ${mini ? "text-[8.5px]" : "text-[10px]"}`}
                style={{ color: s.ink }}
              >
                {label}
              </p>
              {!mini && (
                <p className="text-[7.5px] mt-1" style={{ color: s.muted }}>
                  {sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* tab bar do portal (4 abas reais) */}
      <div
        className={`flex justify-around border-t ${mini ? "px-1 py-1.5" : "px-2 py-2"}`}
        style={{ background: s.surface, borderColor: s.line }}
      >
        {TABS.map(({ icon: Icon, label, active }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <Icon
              size={mini ? 12 : 15}
              style={{ color: active ? s.brand : s.muted }}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span
              className={`${mini ? "text-[6px]" : "text-[7.5px]"} font-bold`}
              style={{ color: active ? s.brand : s.muted }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
