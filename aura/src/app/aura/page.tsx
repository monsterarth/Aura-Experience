// src/app/aura/page.tsx
//
// Home institucional do Aura — pública e estável (não sofre o redirect da raiz,
// que manda usuários logados para a home do cargo por causa do start_url do PWA).
// Tudo aqui é dado real: versão publicada, changelog ao vivo, contadores de
// produção e o catálogo de módulos como ele existe hoje, com selo de maturidade.
// Os mocks das telas (admin, camareira, portal, mapa) vivem em ./_mocks e
// reproduzem em HTML/CSS a identidade real de cada superfície.
//
// Fonte da verdade comercial: docs/PRODUTO.md. A spec desta página: docs/HOME-REVAMP.md.
import type { Metadata } from "next";
import React from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BedDouble,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  Car,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Coffee,
  Compass,
  Globe,
  HeartHandshake,
  History,
  Layers,
  MapPin,
  MessageSquare,
  Moon,
  Navigation,
  Package,
  Palette,
  Phone,
  Plug,
  QrCode,
  Quote,
  Scale,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sunrise,
  Sunset,
  Users,
  UtensilsCrossed,
  Wrench,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  getLatestChangelogEntries,
  getLatestPublishedVersion,
} from "@/services/changelog-service";
import { getPlatformStats } from "@/services/platform-stats-service";
import { AdminDashboardMock } from "./_mocks/AdminDashboardMock";
import { MaidAppMock } from "./_mocks/MaidAppMock";
import {
  GuestPortalMock,
  SKIN_ALVORADA,
  SKIN_ENGENHO,
  SKIN_LUME,
} from "./_mocks/GuestPortalMock";
import { ExploreListMock, IllustratedMapMock } from "./_mocks/ExploreMocks";
import { ChangelogText } from "@/components/ui/ChangelogText";

export const metadata: Metadata = {
  title: "Aura — Plataforma Operacional para Pousadas e Hotéis Boutique",
  description:
    "O sistema completo para pousadas e hotéis boutique de 10 a 40 unidades: recepção, portal do hóspede, governança, comercial, estoque e equipe num só lugar — em produção, todo dia, e white label.",
};

// Renderiza por request (os fetches do supabaseAdmin são no-store): versão,
// changelog e contadores sempre ao vivo.
export const dynamic = "force-dynamic";

// CTA único: WhatsApp direto do fundador (o contato do pitch). Antes a home
// mandava o lead para mailto:contato@aura.software — domínio de TERCEIRO.
const WHATSAPP =
  "https://wa.me/5531991096590?text=" +
  encodeURIComponent("Olá! Vim pelo site do Aura e gostaria de conhecer a plataforma.");

/* ─── catálogo de módulos — com selo de maturidade (docs/PRODUTO.md §2) ─── */

type Maturity = "producao" | "implantacao";

const modules: {
  icon: React.ElementType;
  title: string;
  description: string;
  tags: string[];
  maturity: Maturity;
}[] = [
  {
    icon: BedDouble,
    title: "Recepção & Estadias",
    description:
      "Mapa de reservas, check-in e check-out, fólio com diárias lançadas automaticamente e ficha FNRH digital.",
    tags: ["Mapa de reservas", "Fólio", "FNRH"],
    maturity: "producao",
  },
  {
    icon: Briefcase,
    title: "Comercial & CRM",
    description:
      "Funil de orçamentos com follow-up, proposta enviada ao cliente por link público e baixa automática por prazo vencido.",
    tags: ["Funil", "Proposta online", "Follow-up"],
    maturity: "producao",
  },
  {
    icon: Calculator,
    title: "Tarifário",
    description:
      "Tabelas de preço por temporada, flutuações automáticas por período e cálculo em cascata pela ocupação da cabana.",
    tags: ["Tabelas", "Flutuações", "Calendário"],
    maturity: "producao",
  },
  {
    icon: Users,
    title: "Governança",
    description:
      "Faxina gerada por regra a cada check-out, controle de DND, kanban da governanta e app da camareira.",
    tags: ["Faxinas", "DND", "Kanban"],
    maturity: "producao",
  },
  {
    icon: Boxes,
    title: "Estoque & Compras",
    description:
      "Produtos com saldo por local, ciclo de compras com fornecedores e lançamento da nota pelo XML da NF-e.",
    tags: ["Inventário", "Compras", "XML da NF-e"],
    maturity: "producao",
  },
  {
    icon: Coffee,
    title: "Café da Manhã",
    description:
      "O hóspede monta a própria cesta pelo portal até a noite anterior e escolhe o horário de entrega na cabana — a cozinha recebe o pedido pronto.",
    tags: ["Cesta no portal", "Cardápio próprio", "Entrega por horário"],
    maturity: "producao",
  },
  {
    icon: HeartHandshake,
    title: "Casamentos",
    description:
      "Pipeline do casamento com fornecedores, parcelas e as cabanas do evento, com status atualizado sozinho pela data. Site dos noivos com a identidade do casal.",
    tags: ["Fornecedores", "Parcelas", "Cabanas do evento"],
    maturity: "producao",
  },
  {
    icon: ClipboardList,
    title: "Equipe & Acessos",
    description:
      "Cadastro por cargo, com o acesso e o app de cada pessoa definidos pela função. Ponto batido no próprio celular, recém em operação.",
    tags: ["Cargos e acessos", "App por função", "Ponto"],
    maturity: "producao",
  },
  {
    icon: MessageSquare,
    title: "Comunicação",
    description:
      "Régua de mensagens de WhatsApp por estadia, templates em três idiomas e fila de envio auditada.",
    tags: ["WhatsApp", "Régua", "Templates"],
    maturity: "producao",
  },
  {
    icon: Star,
    title: "Pesquisas & Reviews",
    description:
      "Pesquisa de satisfação no portal, reviews por área da propriedade e IA que responde perguntas sobre os comentários.",
    tags: ["Survey 2.0", "Reviews", "IA"],
    maturity: "producao",
  },
  {
    icon: Wrench,
    title: "Manutenção",
    description:
      "Qualquer pessoa abre um chamado com foto — inclusive o hóspede, pelo portal. A demanda cai num pool sem dono até alguém assumir e executar pelo app em campo.",
    tags: ["Chamado com foto", "Pool de demandas", "App do técnico"],
    maturity: "implantacao",
  },
  {
    icon: QrCode,
    title: "Patrimônio",
    description:
      "Ficha de cada ativo com plaqueta QR permanente, depreciação mensal automática e inventário físico por local.",
    tags: ["Plaqueta QR", "Depreciação", "Inventário"],
    maturity: "implantacao",
  },
  {
    icon: Car,
    title: "Guarita & Estacionamento",
    description:
      "Cadastro de placas, tarifa do dia definida pela gestão, fechamento de turno somado e app do porteiro com o pátio em tempo real.",
    tags: ["Placas", "Tarifa do dia", "App do porteiro"],
    maturity: "implantacao",
  },
  {
    icon: UtensilsCrossed,
    title: "Salão & Restaurante",
    description:
      "Salão do café com mapa de mesas, KDS na cozinha, cardápio digital e pedidos pelo app do garçom.",
    tags: ["Salão", "KDS", "Cardápio QR"],
    maturity: "implantacao",
  },
];

// No roadmap declarado — antecipa a pergunta do contador em vez de ser
// atropelado por ela. É o caminho para largar o PMS de faturamento.
const roadmap = [
  { title: "Financeiro", desc: "Caixa diário, contas a pagar e receber, RevPAR e ADR." },
  { title: "Emissão fiscal", desc: "NFS-e da hospedagem e NFC-e do consumo, direto do sistema." },
  { title: "Motor de reservas", desc: "Reserva direta com pagamento no próprio site da pousada." },
];

/* ─── integrações que existem hoje (docs/PRODUTO.md §9) ─── */
const integrations = [
  {
    name: "HUNIT / Hsystem",
    desc: "Channel manager: a reserva do canal entra por categoria e o sistema encaixa sozinho numa cabana livre. Já são 2.324 sincronizações registradas em produção.",
    tag: "modo sombra",
  },
  {
    name: "XML da NF-e",
    desc: "A nota do fornecedor entra pelo arquivo (ou pelo .zip do contador): casa o fornecedor pelo CNPJ e o produto pelo de-para, e lança a compra em rascunho.",
    tag: "em produção",
  },
  {
    name: "WhatsApp",
    desc: "Régua de mensagens por estadia e atendimento, com a sessão vigiada e reiniciada sozinha quando cai.",
    tag: "em produção",
  },
  {
    name: "Chatwoot",
    desc: "Central de atendimento com a ficha do hóspede sincronizada — quem responde já sabe quem está do outro lado.",
    tag: "em produção",
  },
  {
    name: "IA (Gemini)",
    desc: "Pergunta livre sobre os comentários dos hóspedes: “do que mais reclamaram este mês?”, respondido só com o que foi coletado.",
    tag: "em produção",
  },
];

/* ─── comparativo com o PMS tradicional do segmento (docs/PRODUTO.md §7).
   Inclui as linhas onde o PMS ganha HOJE — a concessão honesta é o que faz a
   tabela sobreviver ao comprador técnico (Stay Inn). ─── */
const comparison: { label: string; pms: string; aura: string }[] = [
  { label: "Recepção, reservas e mapa", pms: "sim", aura: "sim" },
  { label: "Governança", pms: "tela dentro do sistema web", aura: "app por cargo, para a equipe de chão" },
  { label: "Manutenção", pms: "não", aura: "chamado com foto e app (em implantação)" },
  { label: "Eventos e casamentos", pms: "não", aura: "pipeline, parcelas e cabanas do evento" },
  { label: "Concierge do quarto", pms: "não", aura: "pedidos e serviços pelo portal" },
  { label: "Compras, estoque e patrimônio", pms: "estoque acoplado ao PDV", aura: "ciclo completo, com XML da nota" },
  { label: "RH e ponto", pms: "só login de funcionário", aura: "cargos e ponto (escala em implantação)" },
  { label: "Jornada do hóspede", pms: "termina no check-in", aura: "portal por toda a estadia, PT/EN/ES" },
  { label: "Distribuição em OTA", pms: "channel manager próprio", aura: "via channel manager (modo sombra)" },
  { label: "Motor de reservas no site", pms: "sim", aura: "no roadmap" },
  { label: "Pagamento e emissão fiscal", pms: "sim", aura: "no roadmap" },
];

/* ─── planos sob medida (sem preço — docs/PRODUTO.md §8) ─── */
const plans = [
  {
    name: "Essencial",
    tagline: "O núcleo que faz a pousada girar",
    items: ["Recepção e estadias", "Portal do hóspede + pré-check-in", "Comunicação por WhatsApp", "Pesquisas e reviews"],
  },
  {
    name: "Operação",
    tagline: "A operação inteira, no chão e no bolso",
    items: ["Tudo do Essencial", "Governança e apps de campo", "Manutenção", "Estoque, compras e patrimônio"],
    featured: true,
  },
  {
    name: "Completo",
    tagline: "Da venda ao pós-estadia, ponta a ponta",
    items: ["Tudo da Operação", "Comercial e tarifário", "Casamentos e eventos", "Channel manager (modo sombra) e RH/ponto"],
  },
];

/* ─── o case: Fazenda do Rosa (autorizado — docs/PRODUTO.md §4.4).
   Números medidos em produção na Fazenda (04/09/2026), defensáveis pela fonte. ─── */
const caseStats = [
  { value: "NPS 76", label: "9,2/10 · 84% de promotores em 54 respostas", icon: Star },
  { value: "216", label: "estadias chegaram com a placa informada antes de chegar", icon: BadgeCheck },
  { value: "504", label: "agendamentos feitos pelo próprio hóspede", icon: QrCode },
  { value: "43", label: "pessoas usando o sistema em 30 dias", icon: Users },
];

const fieldApps = [
  { icon: ClipboardList, name: "Governanta", desc: "coordena faxinas e bloqueios" },
  { icon: Sparkles, name: "Camareira", desc: "executa e conclui as tarefas do dia" },
  { icon: UtensilsCrossed, name: "Garçom", desc: "lança pedidos do café e do salão" },
  { icon: Package, name: "Houseman", desc: "recebe entregas e tarefas de apoio" },
  { icon: Wrench, name: "Manutenção", desc: "executa chamados direto em campo" },
  { icon: BarChart3, name: "Diretoria", desc: "acompanha os números do dia" },
];

const dailyRoutine = [
  {
    icon: Moon,
    period: "Madrugada",
    items: [
      "Diárias da noite lançadas no fólio de cada estadia",
      "Presença do café da manhã montada para o salão",
      "Funil comercial e casamentos atualizados pela data",
      "Alertas de validade do estoque por lote",
    ],
  },
  {
    icon: Sunrise,
    period: "Manhã",
    items: [
      "Régua de comunicação dispara as mensagens do dia no WhatsApp",
      "Boas-vindas, pré-chegada, aniversários e pós-estadia — no idioma do hóspede",
    ],
  },
  {
    icon: Sunset,
    period: "Fim de tarde",
    items: [
      "Faxinas do dia seguinte geradas pelas regras de governança",
      "Preventivas de manutenção agendadas para as equipes",
    ],
  },
  {
    icon: CalendarDays,
    period: "Todo dia 1º",
    items: ["Depreciação mensal do patrimônio lançada ativo a ativo"],
  },
];

const valueProps = [
  {
    icon: Building2,
    title: "Multi-propriedade",
    desc: "Arquitetura multi-propriedade, com tema e domínio próprios para cada pousada.",
  },
  {
    icon: Palette,
    title: "100% White Label",
    desc: "O hóspede não vê 'Aura' — vê a marca da pousada em cores, fontes e texturas.",
  },
  {
    icon: QrCode,
    title: "Sem app para instalar",
    desc: "Equipe e hóspedes usam pelo navegador: QR code ou link direto, inclusive como PWA.",
  },
  {
    icon: ShieldCheck,
    title: "Sessão e trilha de auditoria",
    desc: "Cada sessão é validada no servidor e toda ação fica registrada — quem fez, o quê e quando.",
  },
  {
    icon: Activity,
    title: "Tempo real",
    desc: "Mudou na recepção, aparece no celular da governanta — sincronização ao vivo em tudo.",
  },
  {
    icon: MapPin,
    title: "Nascido na operação",
    desc: "Construído e testado todos os dias dentro de uma pousada real — não num escritório.",
  },
];

const changelogColors: Record<string, { bg: string; border: string; text: string }> = {
  feature:     { bg: "rgba(0,191,255,0.08)",   border: "rgba(0,191,255,0.25)",   text: "#00BFFF" },
  improvement: { bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)", text: "#a78bfa" },
  fix:         { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)",  text: "#10b981" },
};

const fmt = new Intl.NumberFormat("pt-BR");

/* ─── selo de maturidade ───────────────────────────────────────── */
function MaturityBadge({ maturity }: { maturity: Maturity }) {
  if (maturity === "producao") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/25 text-[#10b981]">
        <BadgeCheck size={11} /> Em produção
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[#f59e0b]">
      <Clock size={11} /> Novo · em implantação
    </span>
  );
}

/* ─── page ────────────────────────────────────────────────────── */

export default async function AuraHomePage() {
  const [liveChangelog, version, stats] = await Promise.all([
    getLatestChangelogEntries(6, ["feature"]).catch(() => []),
    getLatestPublishedVersion().catch(() => null),
    getPlatformStats(),
  ]);

  const liveStats = [
    { label: "Estadias gerenciadas", value: stats.stays },
    { label: "Hóspedes atendidos", value: stats.guests },
    { label: "Faxinas coordenadas", value: stats.housekeepingTasks },
    { label: "Agendamentos pelo portal", value: stats.portalBookings },
    { label: "Mensagens de WhatsApp", value: stats.messagesSent },
    { label: "Avaliações de hóspedes", value: stats.surveyResponses },
  ].filter((s): s is { label: string; value: number } => typeof s.value === "number" && s.value > 0);

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-[#00BFFF]/30 overflow-x-hidden">
      {/* ══════════ NAVBAR ══════════ */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 max-w-7xl mx-auto border-b border-white/5 backdrop-blur-md bg-[#141414]/80">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 drop-shadow-[0_0_12px_rgba(224,255,255,0.3)]">
            <Image src="/logo_transp.PNG" alt="Aura Logo" fill className="object-contain" priority />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xl font-black uppercase tracking-widest text-[#E0FFFF]">Aura</span>
            <span className="text-[8px] font-bold text-[#E6E6FA]/50 uppercase tracking-[0.25em] font-mono">Software</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-7 text-sm font-light text-gray-400">
          <a href="#case" className="hover:text-[#E0FFFF] transition-colors">Case</a>
          <a href="#modulos" className="hover:text-[#E0FFFF] transition-colors">Módulos</a>
          <a href="#integracoes" className="hover:text-[#E0FFFF] transition-colors">Integrações</a>
          <a href="#hospede" className="hover:text-[#E0FFFF] transition-colors">Portal do Hóspede</a>
          <a href="#planos" className="hover:text-[#E0FFFF] transition-colors">Planos</a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full text-[#00BFFF] hover:text-white transition-colors"
          >
            <Phone size={14} /> Falar com a gente
          </a>
          <Link
            href="/admin/login"
            className="text-sm font-medium px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[#E0FFFF]"
          >
            Acesso Restrito
          </Link>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section className="relative pt-24 pb-24 px-6 max-w-7xl mx-auto">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#00BFFF] rounded-full blur-[180px] opacity-10 pointer-events-none" />

        <div className="relative flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-8">
            <Activity size={12} className="animate-pulse" />
            <span>{version ? `Em produção · v${version}` : "Sistema ativo e em produção"}</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-6 leading-[0.95]">
            A plataforma completa
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] via-[#E0FFFF] to-[#B0E0E6]">
              para pousadas e hotéis boutique.
            </span>
          </h1>

          <p className="max-w-2xl text-lg md:text-xl text-gray-400 font-light mb-10 leading-relaxed">
            Da reserva ao pós-estadia — recepção, hóspede, governança, comercial,
            estoque e equipe num sistema só. Em produção numa pousada de 24 unidades,
            todo dia.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-semibold transition-all shadow-[0_0_30px_rgba(0,191,255,0.35)] text-sm"
            >
              Agendar uma demonstração
              <ArrowRight size={16} />
            </a>
            <a
              href="#modulos"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[#E0FFFF] font-medium transition-all text-sm"
            >
              Ver todos os módulos
              <ChevronRight size={16} />
            </a>
          </div>
        </div>

        <div className="relative mt-20 max-w-5xl mx-auto">
          <div className="absolute -inset-4 bg-gradient-to-b from-[#9b6dff]/5 to-transparent rounded-3xl pointer-events-none" />
          <AdminDashboardMock />
        </div>
      </section>

      {/* ══════════ LIVE STATS — números reais de produção ══════════ */}
      {liveStats.length > 0 && (
        <section className="border-y border-white/5 bg-[#111111]">
          <div className="max-w-7xl mx-auto px-6 py-10">
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Números reais — direto do banco de produção
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-8">
              {liveStats.map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <span className="text-3xl md:text-4xl font-black text-[#00BFFF] tracking-tight tabular-nums">
                    {fmt.format(value)}
                  </span>
                  <span className="text-[11px] text-gray-500 mt-1.5 font-medium uppercase tracking-wider leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════ CASE — Fazenda do Rosa ══════════ */}
      <section id="case" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="relative rounded-3xl border border-white/8 bg-gradient-to-br from-[#14231f] via-[#161616] to-[#141414] p-8 md:p-14 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#10b981] blur-[160px] opacity-[0.06] pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] text-xs font-medium mb-6">
                <BadgeCheck size={12} />
                <span>Em produção desde março de 2026</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 leading-tight">
                Fazenda do Rosa
              </h2>
              <p className="text-gray-400 font-light leading-relaxed text-lg mb-6">
                Pousada boutique de <span className="text-white font-medium">24 unidades</span>, em Minas
                Gerais. Roda a operação inteira no Aura todos os dias — recepção, governança, café,
                comercial, estoque e o portal do hóspede.
              </p>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/3 border border-white/5">
                <Quote size={18} className="text-[#10b981] shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300 font-light leading-relaxed">
                  Antes do Aura, esses números não existiam — a operação rodava na percepção. Foi a
                  primeira vez que a experiência do hóspede virou parte da operação.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {caseStats.map(({ value, label, icon: Icon }) => (
                <div key={value} className="p-5 rounded-2xl bg-[#1a1a1a] border border-white/5 flex flex-col gap-2">
                  <Icon size={18} className="text-[#10b981]" />
                  <span className="text-2xl md:text-3xl font-black text-white tracking-tight">{value}</span>
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{label}</span>
                </div>
              ))}
              <p className="col-span-2 text-[11px] text-gray-600 leading-relaxed">
                As avaliações saíram de 5 para 17 por mês entre abril e agosto — a experiência do
                hóspede virou dado, pela primeira vez.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CAMALEÃO — white label ══════════ */}
      <section id="camaleao" className="relative px-6 pb-28 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-5">
            <Palette size={12} />
            <span>White Label</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Camaleão{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-[#E0FFFF] to-[#4ec9d4]">
              por natureza.
            </span>
          </h2>
          <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
            A mesma tela, o mesmo hóspede, o mesmo código — e duas pousadas que não se parecem em
            nada. Cores, tipografia, cantos e até o claro/escuro pertencem à marca de cada propriedade.
          </p>
        </div>

        <div className="relative rounded-3xl border border-white/10 overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="relative bg-[#16110B] px-8 py-14 flex flex-col items-center gap-7">
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.05]"
                style={{ backgroundImage: "radial-gradient(circle, #D4AF37 1px, transparent 1px)", backgroundSize: "26px 26px" }}
              />
              <div className="relative transition-transform duration-300 hover:-translate-y-1.5">
                <GuestPortalMock skin={SKIN_ENGENHO} />
              </div>
              <div className="relative text-center">
                <p className="text-base font-bold text-[#F1E8D9] font-serif">Velho Engenho</p>
                <p className="text-[11px] text-[#9A8C72] mt-1 uppercase tracking-wider">
                  Vintage · serifada · cantos retos · tema escuro
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {["#C08A3E", "#D4AF37", "#8FA98B", "#191410"].map((c) => (
                    <span key={c} className="w-4 h-4 rounded-full border border-white/25" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="relative bg-[#F3F1EA] px-8 py-14 flex flex-col items-center gap-7">
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.5]"
                style={{ backgroundImage: "radial-gradient(circle, #D8D6CE 1px, transparent 1px)", backgroundSize: "26px 26px" }}
              />
              <div className="relative transition-transform duration-300 hover:-translate-y-1.5">
                <GuestPortalMock skin={SKIN_LUME} />
              </div>
              <div className="relative text-center">
                <p className="text-base font-bold text-[#191A1C] uppercase tracking-[0.2em]">Casa Lume</p>
                <p className="text-[11px] text-[#84878E] mt-1 uppercase tracking-wider">
                  Clean · sans geométrica · cantos vivos · tema claro
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {["#266B63", "#A98D4B", "#4C8A63", "#FFFFFF"].map((c) => (
                    <span key={c} className="w-4 h-4 rounded-full border border-black/15" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-[#141414] border border-white/25 shadow-[0_10px_36px_rgba(0,0,0,0.65)] flex items-center justify-center">
              <div className="relative w-10 h-10 md:w-11 md:h-11 drop-shadow-[0_0_10px_rgba(224,255,255,0.3)]">
                <Image src="/logo_transp.PNG" alt="Aura" fill className="object-contain" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-gray-500">
          <Globe size={12} />
          <span>Tema aplicado a partir do painel admin — o hóspede nunca vê &ldquo;Aura&rdquo;, vê a marca da pousada</span>
        </div>
      </section>

      {/* ══════════ MÓDULOS — com selo de maturidade ══════════ */}
      <section id="modulos" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-5">
            <Layers size={12} />
            <span>Cada área da operação, um módulo</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Contrate só o que{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
              a sua operação usa.
            </span>
          </h2>
          <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
            Cada módulo liga e desliga por propriedade. O selo diz o que já roda em produção todo dia
            e o que é novo, entrando agora — sem letra miúda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map(({ icon: Icon, title, description, tags, maturity }) => (
            <div
              key={title}
              className="group p-7 rounded-2xl bg-[#1a1a1a] border border-white/5 hover:border-[#00BFFF]/30 transition-all duration-300 hover:bg-[#1e1e1e]"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-[#00BFFF]/10 border border-[#00BFFF]/20 flex items-center justify-center text-[#00BFFF] group-hover:bg-[#00BFFF]/20 transition-colors">
                  <Icon size={20} />
                </div>
                <MaturityBadge maturity={maturity} />
              </div>
              <h3 className="text-lg font-bold mb-2 text-white">{title}</h3>
              <p className="text-gray-400 font-light leading-relaxed text-sm mb-5">{description}</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-white/5 border border-white/8 text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* roadmap declarado */}
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Compass size={14} className="text-gray-500" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">No roadmap</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {roadmap.map(({ title, desc }) => (
              <div key={title}>
                <p className="text-sm font-bold text-gray-300 mb-1">{title}</p>
                <p className="text-xs text-gray-500 font-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ INTEGRAÇÕES & CONVIVÊNCIA ══════════ */}
      <section id="integracoes" className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-5">
              <Plug size={12} />
              <span>Integrações & convivência</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
              Instala junto,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
                sem tocar no que já roda.
              </span>
            </h2>
            <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
              No modo sombra, o Aura espelha as reservas do seu channel manager sem confirmar na fila —
              o sistema atual continua recebendo tudo, intacto. A operação e o hóspede migram primeiro;
              a virada do resto acontece quando você mandar.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map(({ name, desc, tag }) => (
              <div key={name} className="p-6 rounded-2xl bg-[#1a1a1a] border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-bold text-white">{name}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF]">
                    {tag}
                  </span>
                </div>
                <p className="text-sm text-gray-400 font-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-gray-500 font-light leading-relaxed text-center max-w-3xl mx-auto">
            <span className="text-gray-300 font-medium">O que ainda não integra, e está no roadmap:</span>{" "}
            conexão direta com OTAs (Booking, Airbnb), meio de pagamento, emissão fiscal e API pública
            para parceiros. Dizemos o que existe hoje — e o que vem.
          </p>
        </div>
      </section>

      {/* ══════════ APPS DE CAMPO ══════════ */}
      <section id="apps" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa] text-xs font-medium mb-6">
              <Smartphone size={12} />
              <span>Apps de Campo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              A operação no bolso{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a78bfa] to-[#E0FFFF]">
                de cada equipe.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-8 text-lg">
              Cada função abre o sistema já na sua tela de trabalho, direto do navegador do celular —
              sem instalar nada. A tarefa criada na recepção aparece no bolso de quem executa, na hora.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {fieldApps.map(({ icon: Icon, name, desc }) => (
                <div key={name} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/3 border border-white/5">
                  <div className="w-9 h-9 rounded-lg bg-[#a78bfa]/10 flex items-center justify-center shrink-0 text-[#a78bfa]">
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-none mb-1">{name}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center md:justify-end">
            <MaidAppMock />
            <div className="absolute inset-0 bg-[#9b6dff] blur-[80px] opacity-5 pointer-events-none rounded-full" />
          </div>
        </div>
      </section>

      {/* ══════════ PORTAL DO HÓSPEDE ══════════ */}
      <section id="hospede" className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="relative flex justify-center md:justify-start order-2 md:order-1">
            <GuestPortalMock skin={SKIN_ALVORADA} />
            <div className="absolute inset-0 bg-[#C9962F] blur-[80px] opacity-[0.07] pointer-events-none rounded-full" />
          </div>

          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] text-xs font-medium mb-6">
              <QrCode size={12} />
              <span>Portal do Hóspede</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              A experiência do hóspede{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#E0FFFF]">
                reimaginada.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-6 text-lg">
              O hóspede escaneia o QR Code e o portal abre com a cara da pousada — cores, fontes e
              textura da marca. Sem baixar nada, no idioma dele.
            </p>
            <ul className="space-y-3 mb-6">
              {[
                "Check-in digital: ficha preenchida pelo hóspede antes de chegar",
                "Jornada do dia montada sozinha: café, passeios, check-out",
                "Café da manhã pedido da cabana, em uma tela só",
                "Chave, Wi-Fi e recepção sempre a um toque",
                "Pesquisa de satisfação durante e após a estadia",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <Check size={15} className="text-[#10b981] mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-500 font-light leading-relaxed border-l-2 border-[#10b981]/30 pl-4">
              A camada que o mercado internacional vende separada e cara — check-in digital, concierge,
              agendamento — o Aura entrega embutida, com a marca da pousada.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════ ABA EXPLORAR ══════════ */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] text-xs font-medium mb-5">
            <Compass size={12} />
            <span>Aba Explorar</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            A pousada inteira{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#E0FFFF]">
              na mão do hóspede.
            </span>
          </h2>
          <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
            Um mapa ilustrado da propriedade — a arte da sua pousada, não um mapa genérico — com GPS ao
            vivo, tudo o que existe em cada canto e o que está aberto agora.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-14 lg:gap-12 items-center">
          <div className="lg:col-span-7 flex flex-col sm:flex-row items-center sm:items-start justify-center gap-8 sm:gap-6">
            <div className="shrink-0 sm:mt-10 transition-transform duration-300 hover:-translate-y-2">
              <ExploreListMock />
              <p className="text-center text-[11px] text-gray-500 mt-3 uppercase tracking-wider">Diretório de áreas</p>
            </div>
            <div className="shrink-0 transition-transform duration-300 hover:-translate-y-2">
              <IllustratedMapMock />
              <p className="text-center text-[11px] text-gray-500 mt-3 uppercase tracking-wider">Mapa em tela cheia</p>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="space-y-4 mb-8">
              {[
                { icon: MapPin, color: "#10b981", title: "O mapa ilustrado da sua propriedade", desc: "A pousada desenhada como ela é — trilhas, praia, cada chalé no lugar certo. O hóspede toca num ponto e vê o que é, o horário e como chegar." },
                { icon: Navigation, color: "#3b82f6", title: "GPS ao vivo dentro da propriedade", desc: "O ponto azul mostra onde o hóspede está agora, sobre a ilustração. Nada de se perder procurando o restaurante ou o próprio chalé." },
                { icon: Activity, color: "#f59e0b", title: "Aberto agora e lotação em tempo real", desc: "Cada área mostra se está aberta e quantos lugares restam — atualizado a cada 30 segundos, direto da operação." },
                { icon: CalendarDays, color: "#a78bfa", title: "Reserva de experiências e eventos", desc: "Jacuzzi, quiosque, passeio ou o evento da noite: o hóspede escolhe o horário e reserva do próprio celular." },
              ].map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="flex gap-4 p-4 rounded-2xl bg-white/3 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a`, border: `1px solid ${color}33`, color }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white mb-1">{title}</p>
                    <p className="text-sm text-gray-400 font-light leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-2xl bg-[#10b981]/5 border border-[#10b981]/15">
              <Sparkles size={16} className="text-[#10b981] shrink-0 mt-0.5" />
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                <span className="text-white font-semibold">A ilustração é da propriedade, não do Aura.</span>{" "}
                Cada pousada sobe a arte do seu mapa e marca os pontos pelo painel — o hóspede reconhece o lugar onde está.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ AUTOMAÇÃO ══════════ */}
      <section id="automacao" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="relative rounded-3xl border border-white/8 bg-gradient-to-br from-[#1a1a2e] via-[#1a1a1a] to-[#141414] p-10 md:p-16 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#00BFFF] blur-[150px] opacity-5 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#a78bfa] blur-[120px] opacity-5 pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-6">
              <Zap size={12} />
              <span>Rotina Automática</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 max-w-3xl">
              A pousada acorda com o dia{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#a78bfa]">
                já organizado.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed text-lg mb-10 max-w-3xl">
              Estas rotinas rodam sozinhas em produção, todos os dias — ninguém precisa lembrar de nada.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {dailyRoutine.map(({ icon: Icon, period, items }) => (
                <div key={period} className="p-5 rounded-2xl bg-white/3 border border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[#00BFFF]/10 flex items-center justify-center text-[#00BFFF]">
                      <Icon size={16} />
                    </div>
                    <p className="text-sm font-bold text-white uppercase tracking-wider">{period}</p>
                  </div>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-gray-400 font-light">
                        <Check size={13} className="text-[#00BFFF] mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 p-5 rounded-2xl bg-[#a78bfa]/5 border border-[#a78bfa]/15">
              <div className="w-9 h-9 rounded-lg bg-[#a78bfa]/15 flex items-center justify-center shrink-0 text-[#a78bfa]">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">E IA onde ela ajuda de verdade</p>
                <p className="text-sm text-gray-400 font-light leading-relaxed">
                  Pergunte às avaliações: &ldquo;do que os hóspedes mais reclamaram neste mês?&rdquo; — a IA
                  responde com base apenas nos comentários reais coletados nas pesquisas. Sem inventar nada.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ COMPARATIVO ══════════ */}
      <section className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-5">
              <Scale size={12} />
              <span>Aura × PMS tradicional</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
              Onde os outros{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
                param.
              </span>
            </h2>
            <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
              O PMS do segmento cuida da recepção. O Aura cuida da operação inteira e do hóspede — os
              domínios que o sistema tradicional simplesmente não tem.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-white/[0.03] border-b border-white/8 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <div className="px-4 py-3" />
              <div className="px-4 py-3 text-center">PMS tradicional</div>
              <div className="px-4 py-3 text-center text-[#00BFFF]">Aura</div>
            </div>
            {comparison.map(({ label, pms, aura }, i) => (
              <div
                key={label}
                className={`grid grid-cols-[1.4fr_1fr_1fr] items-center text-sm ${i % 2 ? "bg-white/[0.015]" : ""}`}
              >
                <div className="px-4 py-3.5 font-medium text-gray-300">{label}</div>
                <div className="px-4 py-3.5 text-center text-gray-500 font-light text-xs">
                  {pms === "não" ? <span className="text-gray-700">—</span> : pms === "sim" ? <Check size={15} className="inline text-gray-500" /> : pms}
                </div>
                <div className="px-4 py-3.5 text-center font-light text-xs border-l border-white/5">
                  {aura === "sim" ? (
                    <Check size={15} className="inline text-[#10b981]" />
                  ) : aura === "no roadmap" ? (
                    <span className="text-[#f59e0b]/70">no roadmap</span>
                  ) : (
                    <span className="text-gray-300">{aura}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PLANOS SOB MEDIDA ══════════ */}
      <section id="planos" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-5">
            <Layers size={12} />
            <span>Planos sob medida</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Do essencial{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
              ao completo.
            </span>
          </h2>
          <p className="max-w-2xl mx-auto text-gray-400 font-light text-lg">
            Começa pelo núcleo e cresce por módulo, no ritmo da operação. O plano é montado com você —
            só o que a sua pousada usa.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map(({ name, tagline, items, featured }) => (
            <div
              key={name}
              className={`p-7 rounded-2xl border flex flex-col ${
                featured ? "bg-[#00BFFF]/[0.06] border-[#00BFFF]/30" : "bg-[#1a1a1a] border-white/5"
              }`}
            >
              <p className="text-lg font-black uppercase tracking-wide text-white">{name}</p>
              <p className="text-sm text-gray-400 font-light mb-6">{tagline}</p>
              <ul className="space-y-2.5 flex-1">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-300 font-light">
                    <Check size={14} className={`mt-0.5 shrink-0 ${featured ? "text-[#00BFFF]" : "text-[#10b981]"}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-8">
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-semibold transition-all shadow-[0_0_30px_rgba(0,191,255,0.3)] text-sm"
          >
            <Phone size={16} /> Montar o plano da sua pousada
          </a>
        </div>
      </section>

      {/* ══════════ POR QUE AURA ══════════ */}
      <section id="valores" className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
              Por que{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">Aura?</span>
            </h2>
            <p className="max-w-xl mx-auto text-gray-400 font-light text-lg">
              Uma plataforma construída do zero para o contexto de pousadas e hotéis boutique brasileiros.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {valueProps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group p-6 rounded-2xl bg-[#1a1a1a] border border-white/5 hover:border-[#00BFFF]/20 transition-all hover:bg-[#1e1e1e]">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[#E0FFFF] group-hover:text-[#00BFFF] group-hover:bg-[#00BFFF]/10 transition-colors">
                  <Icon size={18} />
                </div>
                <h3 className="text-base font-bold mb-2 text-white">{title}</h3>
                <p className="text-sm text-gray-500 font-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CHANGELOG STRIP — ao vivo do banco ══════════ */}
      {liveChangelog.length > 0 && (
        <section className="py-5 border-b border-white/5 overflow-hidden bg-[#111111]">
          <div className="flex items-center gap-3 px-6 max-w-7xl mx-auto mb-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600 shrink-0">
              <History size={11} />
              <span>Atualizações Recentes</span>
            </div>
            <div className="flex-1 h-px bg-white/5" />
            <Link href="/changelog" className="text-[11px] text-[#00BFFF] hover:text-white transition-colors flex items-center gap-1 shrink-0 font-medium">
              Ver histórico completo <ChevronRight size={11} />
            </Link>
          </div>

          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#111111] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#111111] to-transparent z-10 pointer-events-none" />
            <div className="animate-marquee">
              {[...liveChangelog, ...liveChangelog].map((entry, i) => {
                const c = changelogColors[entry.type] ?? changelogColors.feature;
                return (
                  <div key={i} className="inline-flex items-center gap-2 mx-4 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}>
                      v{entry.version}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      <ChangelogText text={entry.text} />
                    </span>
                    <span className="text-gray-700 mx-1 select-none">·</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══════════ FINAL CTA ══════════ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="absolute inset-0 bg-[#00BFFF] blur-[200px] opacity-5 pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-8">
              <Sparkles size={12} />
              <span>Pronto para transformar sua operação?</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-6">
              Torne a experiência{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] via-[#E0FFFF] to-[#B0E0E6]">
                inesquecível.
              </span>
            </h2>
            <p className="text-gray-400 font-light text-lg mb-10 max-w-2xl mx-auto">
              Fale com a gente para uma demonstração com os módulos mais relevantes para a sua propriedade.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-semibold transition-all shadow-[0_0_40px_rgba(0,191,255,0.3)] text-sm"
              >
                <Phone size={16} /> Falar no WhatsApp
              </a>
              <Link
                href="/admin/login"
                className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[#E0FFFF] font-medium transition-all text-sm"
              >
                Acesso Restrito
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-10">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 drop-shadow-[0_0_8px_rgba(224,255,255,0.2)]">
                <Image src="/logo_transp.PNG" alt="Aura Logo" fill className="object-contain" />
              </div>
              <div>
                <span className="text-lg font-black uppercase tracking-widest text-[#E0FFFF]">Aura</span>
                <span className="block text-[8px] font-bold text-[#E6E6FA]/40 uppercase tracking-[0.25em] font-mono">Software</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Produto</p>
                <div className="space-y-2">
                  <a href="#case" className="block hover:text-gray-300 transition-colors">Case</a>
                  <a href="#modulos" className="block hover:text-gray-300 transition-colors">Módulos</a>
                  <a href="#integracoes" className="block hover:text-gray-300 transition-colors">Integrações</a>
                  <a href="#hospede" className="block hover:text-gray-300 transition-colors">Portal do Hóspede</a>
                  <a href="#planos" className="block hover:text-gray-300 transition-colors">Planos</a>
                  <Link href="/changelog" className="block hover:text-gray-300 transition-colors">Changelog</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Empresa</p>
                <div className="space-y-2">
                  <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="block hover:text-gray-300 transition-colors">Contato</a>
                  <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="block hover:text-gray-300 transition-colors">Demonstração</a>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Acesso</p>
                <div className="space-y-2">
                  <Link href="/admin/login" className="block hover:text-gray-300 transition-colors">Admin</Link>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <p>© {new Date().getFullYear()} Aura Software. Todos os direitos reservados.</p>
            <div className="flex items-center gap-4">
              <Link href="/termos" className="hover:text-gray-300 transition-colors">Termos de uso</Link>
              <span className="font-light">Construído para continuidade, integração e visão.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
