// src/app/admin/configuracoes/_lib/catalog.ts
//
// O CATÁLOGO — a resposta para "onde eu configuro X?".
//
// Inclui de propósito o que NÃO mora aqui: prazo de casamento se ajusta na tela de
// Casamentos, regra de governança no kanban da Governança. Essas entradas são
// `external` e carregam o caminho em `where`, então o card responde a pergunta mesmo
// levando para outro lugar. Foi decisão explícita não sequestrar essas telas: quem
// mexe no parâmetro está operando, e tirar dali custaria mais do que ganharia.
//
// Manutenção: entrada nova aqui é obrigatória ao criar tela de configuração. Sem isso
// ela volta a ser invisível, que é exatamente o problema que este arquivo resolve.
import {
  Palette, Clock, ScrollText, UtensilsCrossed, MessageSquare, Boxes, Landmark,
  Heart, Sparkles, Wrench, CircleDollarSign, Star, MapPinned, LayoutTemplate,
  Building, Users, Bot, ClipboardList, Blocks, Globe, History, Gauge, UserCog,
  Package, Truck, Coffee, ListChecks, type LucideIcon,
} from "lucide-react";
import { Property, UserRole } from "@/types/aura";
import { isModuleOn } from "@/lib/modules";

export interface SettingsEntry {
  id: string;
  title: string;
  /** O que a pessoa vai mudar ali. Frase curta, sem jargão de código. */
  description: string;
  /** Termos que alguém digitaria procurando — inclui sinônimos e o nome antigo. */
  keywords: string[];
  icon: LucideIcon;
  href: (propertyId: string) => string;
  /** `hub` = tela dentro de /admin/configuracoes · `external` = vive em outro módulo. */
  kind: "hub" | "external";
  /** Caminho legível até o controle, só para `external`. Ex.: "Casamentos › botão Prazos". */
  where?: string;
  /** `cadastro` = lista de itens, não parâmetro · `pessoal` = só afeta quem está logado. */
  tag?: "cadastro" | "pessoal";
  roles: UserRole[];
  /** Esconde quando o módulo está desligado na propriedade. */
  requires?: (p: Property) => boolean;
}

export interface SettingsDomain {
  id: string;
  label: string;
  icon: LucideIcon;
  entries: SettingsEntry[];
}

const ADMIN: UserRole[] = ["super_admin", "admin"];
const ADMIN_MANAGER: UserRole[] = ["super_admin", "admin", "manager"];
const SUPER: UserRole[] = ["super_admin"];
const ALL: UserRole[] = [
  "super_admin", "admin", "manager", "reception", "governance", "maid", "maintenance",
  "technician", "kitchen", "waiter", "porter", "houseman", "marketing", "compras",
];

// A resposta vem do registry, o mesmo que o menu e as rotas leem — aqui era uma
// cópia manual da regra que só concordava com ele por coincidência.
const hasStock = (p: Property) => isModuleOn(p.settings, "estoque");

export const SETTINGS_DOMAINS: SettingsDomain[] = [
  {
    id: "marca", label: "Identidade & Marca", icon: Palette,
    entries: [
      {
        id: "marca-visual", title: "Marca e cores", kind: "hub", roles: ADMIN,
        description: "Nome, slogan, logos e a paleta que o hóspede vê no portal.",
        keywords: ["logo", "cor", "cores", "tema", "paleta", "identidade", "slogan", "marca", "visual", "fonte", "arredondamento"],
        icon: Palette, href: () => "/admin/configuracoes/marca",
      },
    ],
  },
  {
    id: "operacao", label: "Operação & Hospedagem", icon: Clock,
    entries: [
      {
        id: "horarios", title: "Horários e recepção", kind: "hub", roles: ADMIN_MANAGER,
        description: "Check-in, check-out, expediente da recepção e as mensagens de chegada fora do horário.",
        keywords: ["check-in", "checkin", "check-out", "checkout", "horário", "horario", "recepção", "recepcao", "expediente", "chegada", "antecipado"],
        icon: Clock, href: () => "/admin/configuracoes/operacao",
      },
      {
        id: "pets", title: "Política de pets", kind: "hub", roles: ADMIN_MANAGER,
        description: "Aceita pets, peso mínimo e máximo, quantidade e o aviso mostrado no pré-check-in.",
        keywords: ["pet", "pets", "cachorro", "animal", "peso", "aviso", "quantidade", "máximo", "dois"],
        icon: ScrollText, href: () => "/admin/configuracoes/operacao",
      },
      {
        id: "politicas", title: "Políticas e termos", kind: "hub", roles: ADMIN,
        description: "Política geral, privacidade (LGPD) e pet — nos três idiomas do portal.",
        keywords: ["política", "politica", "termo", "privacidade", "lgpd", "regulamento", "contrato"],
        icon: ScrollText, href: () => "/admin/configuracoes/politicas",
      },
      {
        id: "gov-regras", title: "Regras de governança", kind: "external", roles: ADMIN_MANAGER,
        description: "Quando cada faxina é gerada sozinha: saída, dia de entrada, diária, troca de roupa.",
        keywords: ["governança", "governanca", "faxina", "camareira", "regra", "automático", "automatico", "arrumação", "arrumacao", "rotina"],
        icon: Sparkles, href: () => "/admin/governance/kanban?config=regras", where: "Governança › Regras (abre direto)",
      },
      {
        id: "gov-checklists", title: "Checklists de faxina", kind: "external", roles: ADMIN_MANAGER, tag: "cadastro",
        description: "Os itens que a camareira confere em cada tipo de serviço.",
        keywords: ["checklist", "conferência", "conferencia", "faxina", "camareira", "itens", "vistoria"],
        icon: ListChecks, href: () => "/admin/governance/kanban?config=checklists", where: "Governança › Checklists (abre direto)",
      },
      {
        id: "manut-regras", title: "Manutenção preventiva", kind: "external", roles: ADMIN_MANAGER,
        description: "Periodicidade das ordens que nascem sozinhas e quem recebe.",
        keywords: ["manutenção", "manutencao", "preventiva", "periodicidade", "recorrente", "técnico", "tecnico", "regra"],
        icon: Wrench, href: () => "/admin/maintenance/kanban?config=regras", where: "Manutenção › Regras (abre direto)",
      },
    ],
  },
  {
    id: "comercial", label: "Comercial", icon: CircleDollarSign,
    entries: [
      {
        id: "tarifario", title: "Comercial do tarifário", kind: "hub", roles: ["super_admin", "admin", "manager", "reception"],
        description: "Taxa de pet, flutuações de ocupação e os textos do orçamento (WhatsApp + proposta pública). Descontos e promoções vivem em Comercial › Marketing.",
        keywords: ["tarifa", "tarifário", "tarifario", "preço", "preco", "taxa", "pet", "template", "mensagem", "whatsapp", "orçamento", "orcamento", "flutuação", "flutuacao", "incluso"],
        icon: CircleDollarSign, href: () => "/admin/configuracoes/comercial",
      },
      {
        id: "casamentos-prazos", title: "Prazos de casamento", kind: "external", roles: ADMIN_MANAGER,
        description: "Follow-up, validade e renovação das negociações com noivos.",
        keywords: ["casamento", "noivos", "lead", "prazo", "validade", "follow-up", "followup", "renovação", "expira"],
        icon: Heart, href: () => "/admin/casamentos?config=prazos", where: "Casamentos › Prazos (abre direto)",
      },
    ],
  },
  {
    id: "gastronomia", label: "Gastronomia", icon: UtensilsCrossed,
    entries: [
      {
        id: "fb-config", title: "Restaurante e café da manhã", kind: "hub", roles: ["super_admin", "admin", "manager", "kitchen"],
        description: "Modalidade do café (buffet ou entrega), janela de pedidos, horários e salão.",
        keywords: ["café", "cafe", "restaurante", "buffet", "delivery", "entrega", "salão", "salao", "f&b", "gastronomia", "refeição"],
        icon: UtensilsCrossed, href: () => "/admin/configuracoes/gastronomia",
      },
      {
        id: "fb-menu", title: "Cardápio e mensagens do café", kind: "external", roles: ["super_admin", "admin", "manager", "kitchen"], tag: "cadastro",
        description: "Itens, categorias, sabores, ficha técnica — e o texto de boas-vindas do café no portal.",
        keywords: ["cardápio", "cardapio", "menu", "prato", "item", "sabor", "ficha técnica", "boas-vindas", "instrução"],
        icon: Coffee, href: () => "/admin/food-and-beverage/menu?config=cafe", where: "Gastronomia › mensagens do café (abre direto)",
      },
    ],
  },
  {
    id: "estoque", label: "Estoque & Patrimônio", icon: Boxes,
    entries: [
      {
        id: "estoque-config", title: "Parâmetros do estoque", kind: "external", roles: ["super_admin", "admin", "manager", "compras"],
        requires: hasStock,
        description: "Estoque principal, local de consumo, dias sem giro, alerta de validade e perda automática.",
        keywords: ["estoque", "principal", "sem giro", "validade", "alerta", "perda", "consumo", "transferência", "parâmetro"],
        icon: Boxes, href: () => "/admin/estoque/configuracoes?tab=parametros", where: "Config. Estoque › aba Parâmetros",
      },
      {
        id: "estoque-cadastros", title: "Categorias, locais e cabanas do estoque", kind: "external", tag: "cadastro",
        roles: ["super_admin", "admin", "manager", "compras"], requires: hasStock,
        description: "Onde o material fica guardado e como é classificado.",
        keywords: ["categoria", "local", "locais", "almoxarifado", "cabana", "vínculo", "estoque"],
        icon: Package, href: () => "/admin/estoque/configuracoes", where: "Config. Estoque › abas Categorias/Locais/Cabanas",
      },
      {
        id: "fornecedores", title: "Fornecedores", kind: "external", tag: "cadastro",
        roles: ["super_admin", "admin", "manager", "compras"], requires: hasStock,
        description: "Quem fornece, com CNPJ, contato e condição de pagamento.",
        keywords: ["fornecedor", "cnpj", "compra", "pagamento", "contato"],
        icon: Truck, href: () => "/admin/estoque/fornecedores",
      },
      {
        id: "patrimonio-etiquetas", title: "Etiquetas de patrimônio", kind: "external",
        roles: ["super_admin", "admin", "manager", "compras"], requires: hasStock,
        description: "Tamanho, logo e QR das plaquetas. Depende do domínio próprio estar configurado.",
        keywords: ["etiqueta", "plaqueta", "qr", "patrimônio", "patrimonio", "ativo", "impressão", "impressao"],
        icon: Landmark, href: () => "/admin/patrimonio/etiquetas", where: "Patrimônio › Etiquetas",
      },
    ],
  },
  {
    id: "comunicacao", label: "Comunicação", icon: MessageSquare,
    entries: [
      {
        id: "integracoes", title: "WhatsApp, Evolution e Chatwoot", kind: "hub", roles: ADMIN,
        description: "Número, credenciais das integrações e o domínio próprio da pousada.",
        keywords: ["whatsapp", "evolution", "chatwoot", "api", "chave", "token", "integração", "integracao", "domínio", "dominio", "inbox"],
        icon: MessageSquare, href: () => "/admin/configuracoes/integracoes",
      },
      {
        id: "automacoes", title: "Automações e templates", kind: "external", roles: ADMIN,
        description: "Quais mensagens saem sozinhas (48h antes, boas-vindas, pós-checkout) e o texto de cada uma.",
        keywords: ["automação", "automacao", "template", "mensagem", "gatilho", "nps", "boas-vindas", "lembrete", "disparo"],
        icon: Bot, href: () => "/admin/comunicacao/automations/settings",
      },
    ],
  },
  {
    id: "avaliacoes", label: "Avaliações", icon: Star,
    entries: [
      {
        id: "pesquisas", title: "Pesquisas e NPS", kind: "external", roles: ADMIN_MANAGER, tag: "cadastro",
        description: "Perguntas, categorias de BI, recompensa e qual pesquisa é a padrão.",
        keywords: ["pesquisa", "nps", "avaliação", "avaliacao", "pergunta", "survey", "recompensa"],
        icon: ClipboardList, href: () => "/admin/surveys",
      },
      {
        id: "area-reviews", title: "Avaliações de área (público)", kind: "external", roles: ADMIN_MANAGER,
        description: "Modera as avaliações das estruturas e decide se aparecem para os hóspedes.",
        keywords: ["avaliação de área", "estrutura", "moderação", "moderacao", "público", "publico", "review"],
        icon: Star, href: () => "/admin/surveys/area-reviews", where: "não está no menu — só por este link",
      },
    ],
  },
  {
    id: "espaco", label: "Mapa & Espaço físico", icon: MapPinned,
    entries: [
      {
        id: "resort-map", title: "Mapa do resort", kind: "external", roles: ADMIN_MANAGER,
        description: "Imagem ilustrada, calibração, pontos de interesse e posição de cabanas e estruturas.",
        keywords: ["mapa", "resort", "gps", "calibração", "poi", "ponto de interesse", "satélite", "pin"],
        icon: MapPinned, href: () => "/admin/resort-map",
      },
      {
        id: "estruturas", title: "Estruturas", kind: "external", roles: ADMIN_MANAGER, tag: "cadastro",
        description: "Áreas agendáveis e informativas, horários de funcionamento e regras de governança.",
        keywords: ["estrutura", "área", "area", "agendamento", "sauna", "piscina", "quiosque", "horário"],
        icon: LayoutTemplate, href: () => "/admin/estruturas",
      },
      {
        id: "cabanas", title: "Cabanas", kind: "external", roles: ["super_admin", "admin", "manager", "governance"], tag: "cadastro",
        description: "Categorias, capacidade, leitos e o Wi-Fi de cada cabana.",
        keywords: ["cabana", "quarto", "categoria", "wifi", "wi-fi", "cama", "leito", "capacidade"],
        icon: Building, href: () => "/admin/cabins",
      },
    ],
  },
  {
    id: "pessoas", label: "Pessoas", icon: Users,
    entries: [
      {
        id: "equipe", title: "Equipe e permissões", kind: "external", roles: ADMIN_MANAGER, tag: "cadastro",
        description: "Quem tem acesso, com qual cargo e quais acessos adicionais.",
        keywords: ["equipe", "staff", "funcionário", "funcionario", "cargo", "permissão", "permissao", "acesso", "senha"],
        icon: UserCog, href: () => "/admin/staff",
      },
      {
        id: "preferencias", title: "Minhas preferências", kind: "external", roles: ALL, tag: "pessoal",
        description: "Tema claro ou escuro e sidebar recolhida. Só afeta você, não a pousada.",
        keywords: ["tema", "claro", "escuro", "dark", "sidebar", "preferência", "preferencia", "senha", "pessoal"],
        icon: Palette, href: () => "/admin/perfil/configuracoes",
      },
    ],
  },
  {
    id: "plataforma", label: "Plataforma", icon: Blocks,
    entries: [
      {
        id: "modulos", title: "Módulos contratados", kind: "hub", roles: SUPER,
        description: "Liga e desliga blocos do sistema, como Compras & Estoque.",
        keywords: ["módulo", "modulo", "estoque", "ligar", "desligar", "plano", "contratado"],
        icon: Blocks, href: () => "/admin/configuracoes/modulos",
      },
      {
        id: "propriedades", title: "Propriedades", kind: "external", roles: SUPER,
        description: "Criar, trocar e excluir pousadas do sistema.",
        keywords: ["propriedade", "pousada", "workspace", "tenant", "criar", "excluir"],
        icon: Globe, href: () => "/admin/core/properties",
      },
      {
        id: "changelog", title: "Changelog", kind: "external", roles: SUPER,
        description: "As versões publicadas e o que entrou em cada uma.",
        keywords: ["changelog", "versão", "versao", "release", "novidade"],
        icon: History, href: () => "/admin/changelog",
      },
      {
        id: "painel-plataforma", title: "Painel da plataforma", kind: "external", roles: SUPER,
        description: "Visão entre propriedades e auditoria global.",
        keywords: ["plataforma", "painel", "auditoria", "cross", "global"],
        icon: Gauge, href: () => "/admin/core/dashboard",
      },
    ],
  },
];

function canSee(entry: SettingsEntry, role: UserRole | undefined, secondary: UserRole[], property: Property | null): boolean {
  if (!role) return false;
  if (entry.requires && property && !entry.requires(property)) return false;
  if (role === "super_admin") return true;
  return entry.roles.includes(role) || secondary.some((r) => entry.roles.includes(r));
}

function matches(entry: SettingsEntry, domainLabel: string, q: string): boolean {
  if (!q) return true;
  const haystack = [entry.title, entry.description, entry.where ?? "", domainLabel, ...entry.keywords]
    .join(" ")
    .toLowerCase();
  // Cada termo precisa aparecer: "prazo casamento" acha, "prazo pizza" não.
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => haystack.includes(t));
}

/** Domínios visíveis ao cargo, já filtrados pela busca. Domínio sem entrada some. */
export function filterDomains(opts: {
  role?: UserRole;
  secondaryRoles?: UserRole[];
  property: Property | null;
  query?: string;
}): SettingsDomain[] {
  const { role, secondaryRoles = [], property, query = "" } = opts;
  return SETTINGS_DOMAINS
    .map((d) => ({ ...d, entries: d.entries.filter((e) => canSee(e, role, secondaryRoles, property) && matches(e, d.label, query)) }))
    .filter((d) => d.entries.length > 0);
}
