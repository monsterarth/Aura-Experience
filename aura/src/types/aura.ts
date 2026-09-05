// src/types/aura.ts

export type Timestamp = string;

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'director'   // Diretoria / Proprietário (app mobile de gestão estratégica)
  | 'manager'    // Gestão (Gestão de Equipe e Escalas)
  | 'reception'
  | 'governance' // Governanta / Gestor do setor
  | 'maid'       // Camareira (Operacional Mobile)
  | 'maintenance'// Coordenador de Manutenção
  | 'technician' // Manutenção (Operacional Mobile)
  | 'kitchen'    // Gestor de Cozinha
  | 'waiter'     // Garçom (Operacional Mobile)
  | 'porter'     // Porteiro (Operacional Mobile)
  | 'houseman'   // Mensageiro (Operacional Mobile)
  | 'marketing'  // Marketing
  | 'compras';   // Compras (cargo: gere o módulo de estoque/compras; acesso restrito)

export interface PropertyTheme {
  colors: {
    // Marca principal
    primary: string;
    onPrimary: string;

    // Secundária / Apoio
    secondary: string;
    onSecondary: string;

    // Detalhes
    accent: string;

    // Superfícies
    background: string;
    surface: string;

    // Texto
    textMain: string;
    textMuted: string;

    // Feedback
    success: string;
    error: string;
  };
  typography: {
    fontFamilyHeading: string;
    fontFamilyBody: string;
    baseSize: number;
  };
  shape: {
    radius: '0rem' | '0.25rem' | '0.5rem' | '1rem' | '9999px';
  };
}

/**
 * Texto trilíngue guardado dentro de um jsonb (ex.: properties.settings.petPolicyText).
 * Não confundir com o padrão de COLUNAS `name` / `name_en` / `name_es` das tabelas.
 * Helpers em src/lib/multilang.ts.
 */
export interface MultiLangObj {
  pt: string;
  en: string;
  es: string;
}

// --- ENTIDADE PROPRIEDADE ---
export interface Property {
  id: string;
  name: string;
  slug: string;
  /** Logo simplificada (marca/símbolo). Usada no app, no portal e em espaços pequenos. */
  logoUrl?: string;
  theme: PropertyTheme;
  settings: {
    hasBreakfast: boolean;
    hasKDS: boolean;
    // Flags de módulo — leitura SÓ por `isModuleOn` (src/lib/modules.ts), que
    // resolve default e pai. Ausente = desligado. As propriedades que existiam
    // em 04/09/2026 receberam valor explícito (migrations/modules_backfill_flags.sql);
    // propriedade nova nasce sem as chaves até o preset da fatia 8 gravá-las.
    hasStock?: boolean;          // Compras & Estoque (+ patrimônio)
    hasGuarita?: boolean;        // Guarita & Estacionamento
    hasHsystem?: boolean;        // Hsystem (canais)
    hasRH?: boolean;             // Gente — escala e ausências
    hasTimeclock?: boolean;      // Ponto (feature de Gente)
    hasWeddingSite?: boolean;    // site dos noivos — lido à mão em wedding-site-service até a chave `casamentos` nascer
    checkInTime?: string;        // horário padrão de check-in (HH:MM) — política da propriedade, default ao criar estadias
    checkOutTime?: string;       // horário padrão de check-out (HH:MM)
    weddingLead?: WeddingLeadSettings;  // prazos padrão das negociações de casamento
    crmChannels?: CrmChannel[];         // canais de origem de lead (padrão + editável)
    crmQuoteLead?: WeddingLeadSettings; // prazos padrão dos orçamentos de reserva
    whatsappEnabled: boolean;
    whatsappNumber?: string;
    whatsappConfig?: {
      // Evolution API (WhatsApp automations)
      apiUrl: string;
      apiKey: string;
      instanceName?: string;
      instances?: Array<{
        instanceName: string;
        label?: string;
      }>;
      // Chatwoot (inbox embed + contact sync API)
      chatwootUrl?: string;        // base URL — used for iframe and API calls
      chatwootAccountId?: string;
      chatwootApiToken?: string;
      chatwootInboxId?: number;
    };
    petPolicyText?: Record<string, string>;
    generalPolicyText?: Record<string, string>;
    privacyPolicyText?: Record<string, string>;

    // Pets. Editados em Configurações → Operacional.
    petPolicyAlert?: Record<string, string>;
    /** false → a seção de pets some do pré-check-in. */
    acceptsPets?: boolean;
    petMinWeight?: number;
    /** Peso fora da faixa BLOQUEIA o pet no formulário. */
    petMaxWeight?: number;
    /**
     * Quantos pets a propriedade aceita na POLÍTICA PET (padrão 1). Passar deste
     * número não bloqueia: vira pedido de exceção. Bloquear faria o hóspede omitir
     * o segundo pet — que é o bug original.
     */
    maxPets?: number;

    // POLÍTICA PET EXCEÇÃO — a segunda camada. Quem passa dos limites acima não é
    // recusado no formulário: pede exceção, aceita o texto mais duro e fica em
    // análise. Ver docs/PET-POLICY.md.
    /** false → não há exceção nesta propriedade: passar da base bloqueia. */
    acceptsPetExceptions?: boolean;
    /** Tetos absolutos: acima deles nem vira pedido. Ausente/null = sem teto. */
    petExceptionMaxPets?: number | null;
    petExceptionMaxWeight?: number | null;
    /** Texto da POLÍTICA PET EXCEÇÃO, aceito no lugar da base quando há exceção. */
    petExceptionPolicyText?: Record<string, string>;
    /** Aviso de "em análise" mostrado ao hóspede no momento do pedido. */
    petExceptionAlert?: Record<string, string>;
    /**
     * Janelas de alta temporada em que a política prevê recusa ("MM-DD").
     * Critério INTERNO: aparece para quem decide, nunca no texto do hóspede.
     */
    petExceptionBlackout?: { from: string; to: string }[];

    // Avaliações de área (mapa): visibilidade pública opt-in (padrão privado/só equipe).
    // Quando public=true, reviews passam por moderação antes de aparecer aos hóspedes.
    areaReviews?: { public?: boolean };

    // NOVO: Configurações do Módulo de F&B
    fbSettings?: FBSettings;

    // Domínio personalizado para o portal do hóspede (ex: aura.fazendadorosa.com.br)
    customDomain?: string;

    /**
     * Logo COMPLETA (marca + nome escrito), para peças onde há largura e o
     * símbolo sozinho não identifica a pousada — etiqueta de patrimônio grande,
     * cabeçalho de relatório impresso. A `logoUrl` de cima continua sendo a
     * simplificada, para espaços pequenos.
     */
    logoFullUrl?: string;

    // Configuração do Mapa Interativo do Resort (camada espacial sobre as Structures)
    mapConfig?: {
      illustratedImageUrl?: string;                                       // imagem ilustrada do resort (canvas)
      bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }; // fallback p/ GPS→pixel
      gcps?: Array<{ lat: number; lng: number; px: number; py: number }>; // ground control points (calibração affine)
      satelliteEnabled?: boolean;                                         // habilita o modo satélite (Leaflet)
      center?: { lat: number; lng: number };                             // centro inicial do mapa satélite
      defaultZoom?: number;                                               // zoom inicial do mapa satélite
    };
  };
  createdAt: Timestamp;
}

// --- ENTIDADE HÓSPEDE ---
export interface Guest {
  id: string;
  propertyId: string;
  fullName: string;
  nationality: string; // ISO 3166-1 alpha-2 (ex: 'BR')
  nationalityName?: string; // Nome legível (ex: 'Brasil')
  residenceCountry?: string; // ISO 3166-1 alpha-2 — país de residência (pode diferir da nacionalidade)
  email: string;
  phone: string;
  document: {
    type: string; // FNRH ID
    number: string;
  };
  birthDate: string;
  gender: string; // FNRH ID
  raca?: string; // FNRH ID
  occupation: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    ibgeCityId?: string; // FNRH requirement
  };
  allergies: string[];
  preferredLanguage?: 'pt' | 'en' | 'es';
  chatwootContactId?: string; // ID do contato no Chatwoot (cache para evitar search repetida)
  /** Quando a ficha nasceu. NULL em fichas antigas sem audit de criação (migration guests_created_at). */
  createdAt?: Timestamp | null;
  updatedAt: Timestamp;
}

// --- LAYOUT DE LEITOS ---
export type BedType = 'single' | 'double' | 'extra' | 'sofa_bed';

export interface CabinBed {
  id: string;
  type: BedType;
  label: string;
}

export interface CabinArea {
  id: string;
  name: string;
  type: 'room' | 'suite' | 'living_room';
  configs: CabinBed[][]; // Cada array interno é uma variante de montagem alternativa
}

/**
 * Categoria de cabana — entidade canônica por propriedade.
 *
 * Fonte única da verdade para "que tipo de unidade é esta": as cabanas apontam
 * para ela por `categoryId` e as tabelas de preço do Tarifário indexam por esse
 * mesmo id. Antes disso a categoria era texto livre digitado em cada cabana, o
 * que gerava grafias divergentes ("Jardim - 2 Dormitórios" × "Jardim 2
 * Dormitórios") e quebrava o cruzamento preço × disponibilidade.
 */
export interface CabinCategory {
  id: string;
  propertyId: string;
  /** Nome operacional — compõe o `name` da cabana ("01 - Praia - 2 Dormitórios"). */
  name: string;
  /** Nome comercial curto usado em orçamentos e WhatsApp (ex.: "Praia 2"). */
  shortName?: string | null;
  /** Link da categoria no site, usado no template de orçamento. */
  siteUrl?: string | null;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /** Virtual: quantas cabanas usam esta categoria (preenchido em listagens). */
  cabinCount?: number;
}

// --- ENTIDADE CABANA ---
export interface Cabin {
  id: string;
  propertyId: string;
  number: string;     // Ex: "01"
  /** FK para `cabin_categories` — fonte da verdade da categoria. */
  categoryId?: string | null;
  /** Nome da categoria, desnormalizado a partir de `categoryId` (leitura/exibição). */
  category: string;   // Ex: "Praia - 2 Dormitórios"
  name: string;       // Gerado: "01 - Praia - 2 Dormitórios"
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  /** false = fora de operação (some das listagens operacionais). Diferente de `ignoreInOccupancy`, que só tira da taxa. */
  active?: boolean;
  ignoreInOccupancy?: boolean; // true → não conta na taxa de ocupação (extra / uso da casa)
  allowedSetups?: string[];
  layout?: CabinArea[];
  currentStayId?: string;
  wifi?: {
    ssid: string;
    password?: string;
  };
  equipment?: {
    id: string;
    type: string;
    model: string;
    manualUrl?: string;
  }[];
  housekeepingItems?: { id: string; label: string }[];
  // Posição no Mapa Interativo do Resort
  mapPin?: { lat: number; lng: number; pixelX?: number; pixelY?: number };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type StructureVisibility =
  | 'admin_only'        // apenas recepção agenda (ex: sala de massagem)
  | 'guest_request'     // hóspede solicita, recepção aprova
  | 'guest_auto_approve'// hóspede reserva e aprova automaticamente
  | 'map_only';         // local informativo no mapa, sem agendamento (restaurante, praia, guarita…)

export interface Structure {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;        // tradução do nome (i18n inline)
  name_es?: string;
  category: string; // e.g. 'spa', 'sport', 'leisure', 'service'
  description: string;
  description_en?: string; // tradução da descrição (i18n inline)
  description_es?: string;
  visibility: StructureVisibility;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  operatingHours: {
    openTime: string; // HH:mm format
    closeTime: string; // HH:mm format
    slotDurationMinutes: number;
    slotIntervalMinutes: number;
  };
  imageUrl?: string;
  units?: { id: string; name: string; imageUrl?: string }[];
  // Estado operacional POR UNIDADE, indexado pelo id da unidade. Unidade ausente do mapa
  // conta como disponível — só a que saiu de operação ganha chave. Persiste até alguém
  // devolver à operação (não reseta à meia-noite, ao contrário de releasedForDate).
  unitStatus?: Record<string, StructureUnitState>;
  bookingType: 'fixed_slots' | 'free_time';
  requiresTurnover: boolean; // Does it require housekeeping after use?
  // Liberação diária: estrutura fica bloqueada por padrão a cada dia (ex: jacuzzi que
  // precisa ser limpa/aquecida) até a recepção liberar. Liberada apenas quando
  // releasedForDate === data de hoje — reseta sozinha à meia-noite, sem cron.
  requiresDailyRelease?: boolean;
  releasedForDate?: string; // YYYY-MM-DD para a qual a recepção liberou o uso
  housekeepingChecklist?: { id: string; label: string }[];
  messageTemplatePendingId?: string;
  messageTemplateConfirmedId?: string;
  messageTemplateCancelledId?: string;
  // --- Camada de Mapa Interativo (opcional; só aparece no mapa quando configurado) ---
  showOnMap?: boolean;                                                  // exibe esta estrutura no mapa do hóspede
  isBreakfastVenue?: boolean;                                           // marca como salão do café: operatingHours = horário do café, mapPin = "como chegar"
  mapPin?: { lat: number; lng: number; pixelX?: number; pixelY?: number }; // posição GPS + pixel na imagem ilustrada
  pinColor?: string;                                                    // cor (hex) do pin na UI
  pinIcon?: string;                                                     // emoji ou nome de ícone do pin
  amenities?: string[];                                                 // comodidades da área
  photos?: string[];                                                   // galeria de fotos da área
  createdAt?: Timestamp;
}

// Uma unidade fora de operação (ex: jacuzzi com a bomba queimada). Diferente da liberação
// diária: aquela é preparo do dia e volta a bloquear sozinha; esta vale até ser revogada.
export interface StructureUnitState {
  status: 'maintenance';
  note?: string;      // motivo, mostrado ao staff e (resumido) ao hóspede
  since?: string;     // ISO — quando saiu de operação
  byName?: string;    // quem marcou
}

export interface TimeSlot {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  available: boolean;
  bookingId?: string; // If booked
}

export interface StructureBooking {
  id: string;
  structureId: string;
  propertyId: string;
  stayId?: string;
  guestId?: string;
  guestName?: string; // Optional for manual admin blocks
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  // 'expired' = pedido pendente que passou da data sem resposta da recepção.
  // Status terminal, aplicado pelo cron — nunca dispara mensagem ao hóspede.
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'expired';
  source: 'admin' | 'guest';
  type: 'booking' | 'maintenance_block';
  unitId?: string; // If the structure has multiple units
  notes?: string;
  createdAt?: Timestamp;
}

// Avaliação de uma área/estrutura feita pelo hóspede (mapa interativo)
export interface StructureReview {
  id: string;
  propertyId: string;
  structureId: string;
  stayId?: string;
  guestId?: string;
  guestName?: string;
  rating: number;   // 1-5
  comment?: string;
  status?: 'pending' | 'approved' | 'hidden'; // moderação (Fase E); público só vê 'approved'
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Agregado de avaliações por estrutura (média + contagem)
export interface StructureRatingAggregate {
  structureId: string;
  rating: number;       // média
  reviewCount: number;
}

// Ponto de interesse no mapa — marcador leve sem fluxo de agendamento/limpeza.
// Usado para portões, locais de foto, trilhas, estacionamento e lugares externos
// (restaurantes, bares, mercados fora da propriedade).
export interface MapPoi {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  description?: string;
  /** Pin no mapa: lat/lng para mapa satélite; pixelX/pixelY para mapa ilustrado. */
  mapPin?: { lat?: number; lng?: number; pixelX?: number; pixelY?: number };
  pinIcon?: string;    // emoji
  pinColor?: string;   // hex, default '#6b7280'
  /** Categorias: gate | photo_spot | trail | parking | restaurant | bar | market | other */
  category: string;
  photos?: string[];
  /** URL externo (site do restaurante, link do Google Maps etc.) */
  externalLink?: string;
  /** Instagram: @usuario ou URL completa do perfil. */
  instagram?: string;
  showOnMap: boolean;
  createdAt?: string;
}

// ==========================================
// MÓDULO DE GOVERNANÇA E CONSUMO
// ==========================================

// --- CONSUMO (Conta/Folio da Estadia) ---
// Sub-coleção: properties/{propertyId}/stays/{stayId}/folio
export interface FolioItem {
  id: string;
  status: 'pending' | 'paid';
  description: string; // Ex: "Água com Gás", "Heineken"
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: 'minibar' | 'restaurant' | 'services' | 'lodging' | 'payment' | 'other';
  /** debit = cobrança (diária, consumo) · credit = pagamento. Ausente = debit (legado). */
  type?: 'debit' | 'credit';
  /** Noite a que a diária se refere (YYYY-MM-DD) — só category 'lodging'. */
  refDate?: string | null;
  addedBy: string; // ID de quem lançou (ex: ID da camareira ou "SYSTEM")
  createdAt: Timestamp;
}

// --- TAREFAS DE GOVERNANÇA (Housekeeping) ---
// Coleção: properties/{propertyId}/housekeeping_tasks
export interface HousekeepingTask {
  id: string;
  propertyId: string;
  cabinId?: string; // Para Cabanas
  structureId?: string; // Para Estruturas (Spas, Quadras, etc)
  unitId?: string; // Para uma unidade específica da estrutura
  stayId?: string; // Para limpezas diárias vinculadas a uma estadia ativa
  type: 'turnover' | 'daily' | 'linen_change' | 'inspection_checkin' | 'inspection_checkout' | 'custom';
  status: 'pending' | 'in_progress' | 'waiting_conference' | 'completed' | 'cancelled' | 'paused' | 'skipped' | 'awaiting_checkout';
  paused_until?: string; // ISO timestamp — DND
  skippedAt?: string;   // ISO timestamp — when it was skipped (DND)
  guestName?: string;   // Denormalized guest name at time of skip

  // Controle de Pessoal
  assignedTo?: string[]; // Múltiplas camareiras
  conferredBy?: string; // ID da governanta que aprovou (se turnover)

  // Controle de Tempo (Cronômetro)
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  pausedAt?: Timestamp;           // ISO timestamp do último pause
  totalPausedDuration?: number;   // Tempo total pausado em segundos (acumulado)

  // Checklist Copiado do Padrão da Propriedade no momento da criação
  checklist: {
    id: string;
    label: string;
    checked: boolean;
  }[];

  routineId?: string; // ID da rotina legada que gerou esta tarefa (se aplicável)
  ruleId?: string;    // ID da regra de automação que gerou esta tarefa (novo sistema)
  customLocation?: string; // Local livre (ex: "Recepção", "Banheiro Social")
  needsConference?: boolean; // Para tarefas custom: exige conferência da governanta antes de concluir
  keyLocation?: 'reception' | 'cabin' | 'unknown';
  cabinChecked?: boolean;         // true após a camareira concluir a conferência (frigobar + chave + achados + empréstimos)
  cabinCheckedBy?: string;        // staff.id de quem conferiu — vem da sessão no servidor, nunca do cliente
  cabinCheckedAt?: Timestamp;     // quando a conferência de saída foi concluída
  observations?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- REGRAS DE AUTOMAÇÃO DE GOVERNANÇA ---
// Tabela: housekeeping_rules
export type HousekeepingRuleTrigger =
  | 'on_checkout'        // Checkout de qualquer cabana → cria tarefa
  | 'on_checkin_day'     // Check-in previsto para hoje → cria inspeção antes da entrada
  | 'active_stay_daily'  // Cabana com hóspede ativo → cria tarefa diariamente
  | 'stay_duration_days' // N dias de estadia contínua → cria tarefa mid-stay
  | 'fixed_interval_days'  // A cada N dias (independente de estadia) → cria tarefa
  | 'on_checkout_day';    // Checkout previsto para amanhã → cria pré-faxina de troca já delegável

export interface HousekeepingRule {
  id: string;
  propertyId: string;
  trigger: HousekeepingRuleTrigger;
  taskType: 'turnover' | 'daily' | 'linen_change' | 'inspection_checkin' | 'inspection_checkout' | 'custom';
  intervalDays?: number; // Para 'stay_duration_days' e 'fixed_interval_days'
  cabinId?: string;       // Só para 'fixed_interval_days'
  structureId?: string;   // Só para 'fixed_interval_days'
  customLocation?: string; // Só para 'fixed_interval_days'
  checklist: { id: string; label: string; checked: boolean }[];
  assignedTo: string[];
  observations?: string;
  active: boolean;
  lastTriggeredAt?: string; // Para 'fixed_interval_days'
  createdAt: string;
  updatedAt: string;
}

// --- TEMPLATES DE CHECKLIST ---
// Coleção: properties/{propertyId}/checklists
export interface ChecklistTemplate {
  id: string;
  propertyId: string;
  title: string; // Ex: "Limpeza Padrão - Praia 2 Dormitórios"
  type: 'turnover' | 'daily' | 'linen_change' | 'inspection_checkin' | 'inspection_checkout' | 'custom';
  items: {
    id: string; // Gerado via UUID
    label: string;
    required: boolean;
  }[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}


// ==========================================
// MÓDULO DE FEEDBACK & NPS (Pesquisa de Satisfação)
// ==========================================

export type SurveyQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'nps'           // 0 a 10
  | 'rating'        // 1 a 5 estrelas
  | 'short_text'
  | 'long_text';

export interface SurveyQuestion {
  id: string; // ID único para controle no React (Frontend)
  position: number;
  text: string;
  text_en?: string;
  text_es?: string;
  description: string;
  description_en?: string;
  description_es?: string;
  type: SurveyQuestionType;
  categoryId: string;
  categoryName: string;
  options?: string[];
  options_en?: string[];
  options_es?: string[];
}


// ==========================================
// MÓDULO DE MANUTENÇÃO
// ==========================================

export interface MaintenanceChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  assignedTo?: string[]; // IDs of technicians assigned to this specific step
}

export interface MaintenanceTask {
  id: string;
  propertyId: string;
  cabinId?: string; // If applicable to a cabin
  structureId?: string; // If applicable to a structure
  unitId?: string; // If applicable to a specific unit of a structure
  customLocation?: string; // Free-form location (e.g., "Recepção", "Área da Piscina")
  stayId?: string; // If applicable during a specific stay

  /** Ativo de patrimônio ao qual esta tarefa se refere (ficha + custo acumulado). */
  assetId?: string | null;
  /** Origem do chamado. 'qr' = plaqueta pública do patrimônio, sem login. */
  reportSource?: 'qr' | 'staff' | 'guest';
  /** Custo do reparo (R$) — alimenta o custo acumulado de manutenção do ativo. */
  cost?: number | null;

  blocksCabin?: boolean; // Determines if this task blocks the cabin from being rented
  expectedStart?: string; // ISO String (start date/time of the block)
  expectedEnd?: string; // ISO String (end date/time of the block)

  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'waiting_conference' | 'completed' | 'cancelled' | 'paused';
  pausedUntil?: string;    // ISO timestamp — DND pause
  previousStatus?: string; // Status before DND pause

  assignedTo: string[]; // General assignees for the card

  imageUrl?: string; // Image attached when reporting the issue

  isRecurring: boolean;
  recurrenceRule?: string; // E.g., 'daily', 'weekly', 'monthly'
  lastRecurrenceCreated?: Timestamp; // Helps Cron avoid duplicates
  recurrenceSourceId?: string; // Links cloned task back to the MaintenanceRule that generated it

  checklist: MaintenanceChecklistItem[];

  completion?: {
    resolved: boolean;
    needsCleaning: boolean;
    photoUrl?: string; // Vercel blob URL
    notes?: string;
  };

  conferredBy?: string; // ID of the coordinator who approved/closed the task

  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MaintenanceRule {
  id: string;
  propertyId: string;
  name: string;
  description?: string;
  trigger: 'fixed_interval';
  interval: number;
  intervalUnit: 'days' | 'weeks' | 'months';
  cabinId?: string;
  structureId?: string;
  unitId?: string;
  customLocation?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  checklist: MaintenanceChecklistItem[];
  assignedTo: string[];
  active: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyReward {
  hasReward: boolean;
  type: 'discount' | 'freebie' | 'points' | 'other' | '';
  description: string;
  description_en?: string;
  description_es?: string;
}

// --- PESQUISA CURADA (Survey 2.0) ---
// Config do fluxo moderno de feedback, guardada em survey_templates.config
// quando version === 'curated'. i18n inline no padrão field/field_en/field_es.
export interface SurveyChip {
  id: string;
  label: string;
  label_en?: string;
  label_es?: string;
}

export interface SurveyCuratedConfig {
  overall: { enabled: boolean };                       // passo das faces (1–5)
  categories: { id: string; label: string; label_en?: string; label_es?: string; icon?: string }[]; // estrelas; label PT é a chave em metrics.categoryRatings
  minCategories?: number;                              // "avalie ao menos N"
  highlights: { positive: SurveyChip[]; improve?: SurveyChip[]; otherPositive?: boolean; otherImprove?: boolean }; // otherX = chip "Outro" (texto livre)
  recommend: { enabled: boolean };                     // 3 opções (no/maybe/yes)
  comment: { enabled: boolean; prompt?: string; prompt_en?: string; prompt_es?: string };
  review: { googlePlaceId?: string; google?: string; booking?: string }; // promotor → writereview
  recovery?: { message?: string; message_en?: string; message_es?: string };               // tela do detrator
  thankYou?: { title?: string; title_en?: string; title_es?: string; subtitle?: string; subtitle_en?: string; subtitle_es?: string };
}

// --- TEMPLATE DA PESQUISA ---
// Coleção: properties/{propertyId}/survey_templates
export interface SurveyTemplate {
  id: string;
  propertyId: string;
  title: string;
  title_en?: string;
  title_es?: string;
  isDefault: boolean; // Indica se esta é a pesquisa enviada no check-out
  questions: SurveyQuestion[];
  reward: SurveyReward;
  // Survey 2.0: 'curated' usa `config` (fluxo moderno); 'builder'/undefined = legado (questions[]).
  version?: 'builder' | 'curated';
  config?: SurveyCuratedConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- CATEGORIAS DAS PESQUISAS ---
export interface SurveyCategoryItem {
  id: string;
  propertyId: string;
  name: string;
  createdAt: Timestamp;
}

// --- RESPOSTAS DOS HÓSPEDES ---
// Coleção: properties/{propertyId}/survey_responses
export interface SurveyResponse {
  id: string;
  propertyId: string;
  stayId: string;
  guestId: string;
  templateId: string;

  // Respostas brutas
  answers: {
    questionId: string;
    value: any; // Pode ser number (NPS/Rating), string, ou array de strings
  }[];

  // Métricas pré-calculadas para Dashboards rápidos (Evita re-calcular no Frontend)
  metrics: {
    npsScore?: number; // 0-10 (Se houver pergunta NPS; no curado é derivado de `recommend`)
    averageRating?: number; // 1-5 (Média de todas as perguntas de Rating)
    categoryRatings: Record<string, number>; // Ex: { governance: 4.5, reception: 5 }
    isDetractor: boolean; // Flag automática (NPS <= 6 ou Rating <= 2) para disparar alertas
    // Survey 2.0 (curado) — campos ricos para evolução futura do dashboard
    recommend?: 'no' | 'maybe' | 'yes';
    overall?: number;       // impressão geral 1-5 (faces)
    highlights?: string[];  // labels dos chips escolhidos (união — mantido p/ compatibilidade)
    highlightsPositive?: string[]; // "o que mais gostou" (só respostas novas)
    highlightsImprove?: string[];  // "o que podemos melhorar" (só respostas novas)
    commentShared?: boolean; // intenção de publicar no Google (best-effort)
  };

  createdAt: Timestamp;
}

// Resposta + contexto da estadia, montado no servidor (não existe no banco).
// O painel mostra a cabana e ordena por check-out — o id da reserva não diz
// nada para quem lê o card.
export interface SurveyResponseWithStay extends SurveyResponse {
  cabinName?: string;
  guestName?: string;
  checkIn?: Timestamp;
  checkOut?: Timestamp;
}

/** Um pet da estadia. A faixa de peso aceita é por propriedade (`petMinWeight`/`petMaxWeight`). */
export interface PetDetails {
  name: string;
  breed?: string;
  species: 'Cachorro' | 'Gato' | 'Outro';
  weight: number;
}

/**
 * Pedido de exceção à Política Pet. A direção não opera a plataforma — ela manda
 * fazer — então `authorizedBy` é texto livre (quem mandou) ao lado de `decidedBy`
 * (o usuário logado que registrou). Ver docs/PET-POLICY.md.
 */
export interface PetException {
  status: 'pending' | 'approved' | 'refused';
  /** Por que saiu da política base, congelado no momento do pedido. */
  reasons: string[];
  requestedAt: Timestamp;
  decidedAt?: Timestamp | null;
  decidedBy?: string | null;
  authorizedBy?: string | null;
  note?: string | null;
}

// --- ENTIDADE ESTADIA ---
export interface Stay {
  id: string;
  propertyId: string;
  groupId?: string | null;
  guestId: string | null;
  cabinId: string | null;
  cabinHistory?: { cabinId: string; from: string; to: string }[];
  accessCode: string;

  cabinConfigs?: {
    cabinId: string | null;
    name: string;
    adults: number;
    children: number;
    babies: number;
  }[];


  // Datas e Logística
  checkIn: Timestamp;
  checkOut: Timestamp;
  expectedArrivalTime?: string;
  vehiclePlate?: string;
  roomSetup: 'double' | 'twin' | 'triple' | 'other';
  roomSetupNotes?: string;
  areaConfigs?: { areaId: string; configIndex: number }[];
  bedAssignments?: { bedId: string; areaId: string; guestId: string }[];

  // Composição
  counts: {
    adults: number;
    children: number;
    babies: number;
  };

  // Lista de Acompanhantes (ADICIONADO)
  additionalGuests?: {
    id: string;
    fullName: string;
    document: string;
    type: 'adult' | 'child' | 'free';
    birthDate?: string; // YYYY-MM-DD opcional — usado para aniversariantes e faixa etária
  }[];

  // FNRH
  travelReason: string; // FNRH ID
  transportation: string; // FNRH ID

  lastCity: string;
  nextCity: string;

  // Extras
  /**
   * true quando há ao menos um pet. Derivado de `pets` na escrita (ver `writePets`
   * em `@/lib/pets`), mas continua sendo a coluna que as patinhas leem na lista de
   * estadias, no mapa da propriedade, na governança e no gate da política no portal.
   */
  hasPet: boolean;
  /** Legado: espelho de `pets[0]`. Ler sempre via `readPets`, nunca direto. */
  petDetails?: PetDetails;
  /**
   * Fonte da verdade dos pets. A propriedade declara quantos aceita em
   * `settings.maxPets`, mas passar do limite nunca bloqueia o pré-check-in — o
   * formulário avisa e registra assim mesmo (informação omitida é pior).
   */
  pets?: PetDetails[];
  /**
   * Pedido de exceção à Política Pet, quando os pets declarados passam da base.
   * Nasce `pending` no pré-check-in e só a recepção fecha. Ver docs/PET-POLICY.md.
   */
  petException?: PetException | null;
  /** Quando o hóspede aceitou a política pet (base ou exceção) no pré-check-in. */
  petPolicyAcceptedAt?: Timestamp | null;

  // Reserva interna / uso da casa
  internalUse?: boolean;   // true → ocupação interna (manutenção, família, bloqueio), não é cliente
  internalLabel?: string;  // rótulo livre quando não há hóspede (ex: "Manutenção cabana 5")

  // ── Origem externa (channel manager / motor) ──
  /** Canal de origem — slug de `settings.crmChannels` (site/booking/airbnb/...) ou nome do portal. */
  source?: string | null;
  /** locatorId da reserva no HUNIT (Hsystem). Presente = estadia importada. */
  externalId?: string | null;
  /** roomLocatorId do quarto no HUNIT — reserva multi-quarto vira N estadias no mesmo groupId. */
  externalRoomId?: string | null;

  // Status
  status: 'pending' | 'pre_checkin_done' | 'active' | 'finished' | 'cancelled' | 'archived';
  automationFlags: {
    enabled?: boolean;     // interruptor mestre: false → nenhuma comunicação automática de WhatsApp
    send48h: boolean;
    send24h: boolean;
    preCheckinSent: boolean;
    remindersCount: number;
    termsAccepted?: boolean;
  };

  housekeepingItems?: { id: string; label: string }[];
  hasOpenFolio?: boolean;
  billClosedAt?: string;
  // ── Financeiro (fase 1): elo com o orçamento do Tarifário ──
  /** rate_quotes.id que originou a estadia (sem FK). */
  rateQuoteId?: string | null;
  /** Valor da diária média — o cron lança 1 débito por noite no fólio. */
  nightlyRate?: number | null;
  /** Total da hospedagem (arredondamento acerta na última noite). */
  lodgingTotal?: number | null;
  /** true = cron não lança diárias desta estadia. */
  lodgingPaused?: boolean;
  /** Valor por noite: { "YYYY-MM-DD": 890 }. Valor 0 = noite não cobrada. */
  nightlyOverrides?: Record<string, number>;          // Timestamp do encerramento manual da conta (zeriza aba pendente)
  lostItemsDescription?: string;
  lostItemsPhoto?: string;
  lostItemsReportedAt?: string;
  lostItemsReportedBy?: string;
  loanedItems?: string;           // Lista de objetos emprestados (preenchida pela recepção no checkout)
  loanedItemsChecked?: boolean;   // true após a camareira confirmar devolução
  loanedItemsCheckedAt?: string;
  /** Desfecho do empréstimo. `loanedItemsChecked` continua espelhado para o app de campo. */
  loanedItemsStatus?: LoanedItemsStatus;
  /** Destino do objeto esquecido — sem isto a descrição ficava pendurada para sempre. */
  lostItemsResolution?: LostItemsResolution;
  lostItemsResolvedAt?: string;
  lostItemsResolvedBy?: string;

  cestaBreakfastEnabled?: boolean;

  // DND — Não Perturbe
  dnd_enabled?: boolean;
  dnd_until?: string; // ISO timestamp

  // Integração Chatwoot
  chatwootConvId?: number; // ID da conversa proativa no Chatwoot

  // Chave da acomodação no momento do check-out
  keyLocation?: 'reception' | 'cabin' | 'unknown';
  /** Ciclo da chave até ela estar localizada (ou cobrada). NULL = sem registro. */
  keyStatus?: KeyStatus;
  keyStatusAt?: string;
  keyStatusBy?: string;

  createdAt: Timestamp;
}

/**
 * A conta só fecha quando o ciclo fecha: pagamento quitado, chave localizada,
 * empréstimos devolvidos ou pagos e nenhum objeto esquecido em aberto. Os três
 * estados abaixo são os que o banco guarda; o saldo vem do fólio.
 */
export type KeyStatus = 'reception' | 'awaiting_conference' | 'found' | 'missing' | 'returned' | 'charged';
export type LoanedItemsStatus = 'pending' | 'returned' | 'missing' | 'charged';
export type LostItemsResolution = 'returned' | 'discarded' | 'stored';

// ==========================================
// MÓDULO DE AUTOMAÇÃO E MENSAGERIA
// ==========================================

export type AutomationTriggerEvent =
  | 'pre_checkin_48h'
  | 'pre_checkin_24h'
  | 'welcome_checkin'
  | 'pre_checkout'
  | 'checkout_thanks'
  | 'nps_survey'
  | 'structure_booking_confirmed'
  // Desfecho do pedido de exceção à Política Pet. Decidido em 03/09: o hóspede
  // passa a ser avisado por WhatsApp — antes a decisão era registrada e o contato
  // acontecia por fora.
  | 'pet_exception_approved'
  | 'pet_exception_refused'
  | 'custom_scheduled';

// --- REGRAS DE AUTOMAÇÃO (Ligadas/Desligadas pela Pousada) ---
// Coleção: properties/{propertyId}/automation_rules
export interface AutomationRule {
  /**
   * Chave da LINHA, não o gatilho — hoje `${propertyId}__${triggerEvent}`.
   * O tipo dizia `id: AutomationTriggerEvent`, e era essa mentira que sustentava
   * a regra ser global: com o nome do gatilho como PK só cabiam 7 linhas no banco
   * inteiro, e uma pousada sobrescrevia a outra.
   */
  id: string;
  propertyId: string;
  /** O evento que dispara. É por aqui que se traduz rótulo e se compara regra. */
  triggerEvent: AutomationTriggerEvent;
  active: boolean;
  templateId: string; // Qual texto enviar
  delayMinutes: number; // Ex: Enviar 120 minutos (2h) após o gatilho
  updatedAt: Timestamp;
}

// --- TEMPLATES DE MENSAGENS DINÂMICAS ---
// Coleção: properties/{propertyId}/message_templates
export interface MessageTemplate {
  id: string;
  propertyId: string;
  name: string; // Ex: "Boas Vindas Padrão"
  body: string;      // PT — obrigatório, padrão de fallback
  body_en?: string;  // EN — opcional
  body_es?: string;  // ES — opcional
  variables: string[]; // Controle interno de quais variáveis o texto exige
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- MENSAGERIA E FILA (Message Queue) ---
// Coleção: properties/{propertyId}/messages
export interface WhatsAppMessage {
  id: string;
  propertyId: string;
  stayId?: string;       // Agora opcional (pois podemos falar com contatos sem reserva)
  contactId?: string;    // NOVO: Elo com a agenda
  to?: string;           // Destinatário (quando enviamos)
  from?: string;         // Remetente (quando recebemos do webhook)
  body: string;
  originalBody?: string | null;
  mediaUrl?: string | null;
  reaction?: string;
  statusApi?: number;
  direction: 'inbound' | 'outbound'; // NOVO: Define se recebemos ou enviamos

  // Controle de Fila e Automação
  isAutomated: boolean;
  triggerEvent?: AutomationTriggerEvent;
  scheduledFor?: Timestamp;

  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
  attempts: number;
  lastAttemptAt?: Timestamp;
  errorMessage?: string;

  createdAt: Timestamp;
  auditLogId?: string;
}

// --- AUDITORIA ---
export interface AuditLog {
  id: string;
  propertyId: string;
  userId: string;
  userName: string;
  action:
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'MESSAGE_SENT' | 'MESSAGE_FAILED' | 'MESSAGE_RESENT' | 'MESSAGE_MANUAL_SEND'
  | 'CHECKIN' | 'CHECKOUT' | 'PRE_CHECKIN'
  | 'USER_CREATE' | 'USER_UPDATE'
  | 'CREATE_STAY' | 'COMPLETE_STAY' | 'STAY_GROUP_CREATE'
  | 'CABIN_CREATED' | 'CABIN_UPDATED' | 'CABIN_DELETED'
  | 'CONTACT_UPDATED' | 'CONTACT_DELETED' | 'CONTACT_PHONE_MIGRATED'
  | 'STRUCTURE_CREATED' | 'STRUCTURE_UPDATED' | 'STRUCTURE_DELETED'
  | 'STRUCTURE_RELEASED' | 'STRUCTURE_BLOCKED'
  | 'STRUCTURE_UNIT_MAINTENANCE' | 'STRUCTURE_UNIT_RESTORED'
  | 'STRUCTURE_BOOKING_CREATED' | 'STRUCTURE_BOOKING_STATUS_CHANGED'
  | 'EVENT_CREATED' | 'EVENT_UPDATED' | 'EVENT_DELETED' | 'EVENT_PUBLISHED'
  | 'CONCIERGE_REQUESTED' | 'CONCIERGE_DELIVERED' | 'CONCIERGE_RETURNED' | 'CONCIERGE_LOST'
  | 'FB_ORDER_CREATED' | 'FB_ORDER_STATUS_CHANGED'
  | 'TEMPLATE_SAVED' | 'TEMPLATE_DELETED'
  | 'AUTOMATION_SAVED' | 'AUTOMATION_TOGGLED'
  | 'BREAKFAST_OPENED' | 'BREAKFAST_CHECKIN' | 'BREAKFAST_GUEST_LEFT'
  | 'REASSIGN_GUEST'
  | 'CRON_DAILY_AUTOMATIONS' | 'CRON_DAILY_HOUSEKEEPING' | 'CRON_BREAKFAST_ATTENDANCE'
  | 'CRON_HOUSEKEEPING_ROUTINES' | 'CRON_MAINTENANCE' | 'CRON_PROCESS_MESSAGES'
  | 'CRON_EVENING_REVALIDATION'
  | 'STOCK_ENTRY' | 'STOCK_EXIT' | 'STOCK_TRANSFER' | 'STOCK_ADJUSTMENT' | 'STOCK_LOSS'
  | 'PURCHASE_CREATED' | 'PURCHASE_RECEIVED' | 'PURCHASE_CANCELLED' | 'PURCHASE_IMPORTED'
  | 'SUPPLIER_CREATED' | 'SUPPLIER_UPDATED' | 'SUPPLIER_DELETED'
  | 'ASSET_CREATED' | 'ASSET_UPDATED' | 'ASSET_DISPOSED' | 'ASSET_DELETED'
  | 'ASSET_REINSTATED' | 'ASSET_MOVED' | 'ASSET_CUSTODY_CHANGED' | 'ASSET_PUBLIC_REPORT'
  | 'ASSET_INVENTORY_OPENED' | 'ASSET_INVENTORY_CLOSED'
  | 'INVENTORY_OPENED' | 'INVENTORY_CLOSED'
  | 'CRON_STOCK_LOW' | 'CRON_STOCK_EXPIRY' | 'CRON_ASSET_DEPRECIATION'
  | 'STRUCTURE_REVIEW_LOW'
  | 'RATE_TABLE_DELETED' | 'RATE_SIT_IMPORTED'
  | 'RATE_TABLE_ARCHIVED' | 'RATE_TABLE_RESTORED'
  | 'RATE_FLUCTUATION_SAVED' | 'RATE_FLUCTUATION_DELETED'
  | 'RATE_QUOTE_LINKED' | 'CRON_DAILY_LODGING'
  | 'LODGING_PAUSED' | 'LODGING_RESUMED' | 'LODGING_NIGHT_OVERRIDDEN'
  | 'WEDDING_AUTO_COMPLETED' | 'WEDDING_LOST' | 'WEDDING_FOLLOW_UP'
  | 'CRON_CRM_STATUS'
  | 'HSYSTEM_CREATED' | 'HSYSTEM_UPDATED' | 'HSYSTEM_CANCELLED'
  | 'HSYSTEM_NEEDS_ATTENTION' | 'HSYSTEM_FAILED'
  | 'PARKING_ENTRY' | 'PARKING_EXIT' | 'PARKING_RATE_SET'
  | 'PARKING_SHIFT_CLOSED' | 'VEHICLE_STATUS_SET'
  /* Ponto: só o que MEXE no passado é auditado. A batida normal já é o próprio
     registro — auditá-la duplicaria o dado e afogaria o log em ruído. */
  | 'TIMECLOCK_MANUAL' | 'TIMECLOCK_ADJUSTED' | 'TIMECLOCK_DELETED'
  | 'TIMECLOCK_SOURCE_SET';
  entity: 'STAY' | 'GUEST' | 'CABIN' | 'USER' | 'PROPERTY' | 'MESSAGE' | 'STOCK' | 'STRUCTURE' | 'STRUCTURE_BOOKING' | 'STRUCTURE_REVIEW' | 'MAINTENANCE' | 'EVENT' | 'CONCIERGE' | 'FB_ORDER' | 'CONTACT' | 'AUTOMATION' | 'BREAKFAST' | 'CRON' | 'SUPPLIER' | 'ASSET' | 'ASSET_INVENTORY' | 'PURCHASE' | 'INVENTORY' | 'RATE_TABLE' | 'RATE_QUOTE' | 'RATE_FLUCTUATION' | 'RATE_SETTINGS' | 'WEDDING' | 'PARKING' | 'TIMECLOCK';
  entityId: string;
  oldData?: any;
  newData?: any;
  timestamp: Timestamp;
  details: string;
}

// ==========================================
// MÓDULO DE AGENDA / WHATSAPP (CRM)
// ==========================================
export interface Contact {
  id: string; // O ID será OBRIGATORIAMENTE o número formatado (ex: 554899999999)
  propertyId: string;
  name: string;
  phone: string;
  isGuest: boolean; // True se for hóspede, False se for contato avulso (ex: Zé do Gás)
  guestId?: string; // O elo de ligação com a coleção Guests (se isGuest for true)
  tags?: string[]; // Ex: ["VIP", "Fornecedor", "Problema"]
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- STAFF ---
/** Densidade da lista de estadias: cartão completo, cartão enxuto ou tabela. */
export type StaysViewMode = 'card' | 'compact' | 'list';

export interface Staff {
  id: string;
  propertyId: string | null;
  fullName: string;
  email: string;
  role: UserRole;
  active: boolean;
  profilePictureUrl?: string;
  birthDate?: string;
  phone?: string;
  bio?: string;
  messengerName?: string;
  messengerColor?: string;
  createdAt: Timestamp;
  scheduleType?: ScheduleType;
  scheduleConfig?: ScheduleConfig | null;
  hireDate?: string; // YYYY-MM-DD
  uiTheme?: 'dark' | 'light';
  sidebarDefaultCollapsed?: boolean;
  /** Modo da lista de estadias por aba — o PC da recepção é compartilhado, então a escolha vive no usuário, não no navegador. */
  staysViewAtivas?: StaysViewMode;
  staysViewFuturas?: StaysViewMode;
  secondaryRoles?: UserRole[];
  /**
   * Placa do carro do colaborador (módulo Guarita). É o que faz o carro da
   * equipe se identificar sozinho na portaria em vez de virar "visita".
   * Normalizada sem hífen: ABC1D23.
   */
  vehiclePlate?: string;
  /**
   * De onde vem o ponto desta pessoa (módulo Ponto). Exclusivo por decisão:
   * ou bate no Aura, ou bate no relógio, ou não bate. Ver `TimeSource`.
   */
  timeSource?: TimeSource;
}

// --- PONTO ---
/**
 * Origem do ponto de um funcionário. Estados MUTUAMENTE EXCLUSIVOS:
 * - `none` (padrão) — não registra ponto.
 * - `aura` — bate pelo próprio sistema (botão no topo do admin).
 * - `rep`  — bate no relógio biométrico; o Aura recebe por importação do AFD.
 */
export type TimeSource = 'none' | 'aura' | 'rep';

/** Como a batida nasceu. Fica na BATIDA, não só no cadastro: trocar o modo de
 *  alguém não pode reescrever o passado. */
export type TimeClockSource = 'aura' | 'rep' | 'manual';

export interface TimeClockEvent {
  id: string;
  staffId: string;
  propertyId: string | null;
  /** Momento efetivo — é o que conta horas, e é o que o ajuste altera. */
  ts: string;
  kind: 'in' | 'out';
  source: TimeClockSource;
  ip?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoAccuracy?: number | null;
  note?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  /** Preenchido no primeiro ajuste; guarda o valor com que a batida nasceu. */
  originalTs?: string | null;
  editedBy?: string | null;
  editedByName?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletedByName?: string | null;
  deleteReason?: string | null;
  /** Fase 2 — identidade da batida no relógio (idempotência do import). */
  repSerial?: string | null;
  nsr?: number | null;
}

/** Um par entrada→saída derivado da sequência de batidas. Nunca é gravado. */
export interface WorkSession {
  start: TimeClockEvent;
  /** Ausente enquanto a pessoa não bateu a saída. */
  end?: TimeClockEvent;
  /** Duração em minutos; `null` enquanto a jornada está aberta. */
  minutes: number | null;
  /**
   * - `closed`    — par completo.
   * - `open`      — entrou e ainda não saiu (jornada de hoje, normal).
   * - `dangling`  — entrou e nunca saiu, e o dia já virou: pendência a resolver.
   * - `orphanOut` — saída sem entrada correspondente.
   */
  status: 'closed' | 'open' | 'dangling' | 'orphanOut';
}

/** Um dia de trabalho, agrupado pela data LOCAL em que a jornada começou. */
export interface TimeClockDay {
  /** YYYY-MM-DD no fuso de quem lê — a agregação acontece no cliente. */
  date: string;
  sessions: WorkSession[];
  /** Soma das jornadas fechadas, em minutos. Jornada aberta não entra. */
  minutes: number;
  hasOpen: boolean;
  hasPending: boolean;
}

// --- ESCALAS DE TRABALHO ---
export interface StaffSchedule {
  id: string;
  staffId: string;
  propertyId: string;
  dayOfWeek: number; // 0=Dom, 1=Seg, ..., 6=Sáb
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StaffScheduleOverride {
  id: string;
  staffId: string;
  propertyId: string;
  date: string;           // YYYY-MM-DD
  startTime?: string | null; // null = folga
  endTime?: string | null;
  reason?: string;        // ex: "Folga", "Troca de turno"
  createdBy?: string;
  createdAt: Timestamp;
}

export type ScheduleType = '5x2' | '12x36' | '6x1' | 'custom';

export interface ScheduleConfig {
  scheduleType: ScheduleType;
  startTime: string;           // HH:mm
  endTime: string;             // HH:mm
  cycleReferenceDate?: string; // YYYY-MM-DD — fallback quando não há checkpoints
  fixedDayOff?: number | null; // 0=Dom...6=Sáb — folga fixa semanal, null=nenhuma
  weekdayTimeOverrides?: Partial<Record<number, { startTime: string; endTime: string }>>; // horário diferente por dia da semana
  sundayOffCycle?: boolean;    // 6x1: trabalha 3 domingos, folga o 4º — ciclo baseado na data de referência
  
  // Histórico de configurações passadas
  history?: Array<{
    endDate: string; // Último dia em que essa configuração foi válida (YYYY-MM-DD)
    scheduleType: ScheduleType;
    startTime: string;
    endTime: string;
    cycleReferenceDate?: string;
    fixedDayOff?: number | null;
    weekdayTimeOverrides?: Partial<Record<number, { startTime: string; endTime: string }>>;
    sundayOffCycle?: boolean;
  }>;
}

export interface ScheduleCheckpoint {
  id: string;
  staffId: string;
  propertyId: string;
  effectiveDate: string;  // YYYY-MM-DD — a partir de quando este checkpoint vale
  referenceDate: string;  // YYYY-MM-DD — data âncora de trabalho para cálculo
  note?: string;          // ex: "Rodízio com João", "Retorno de férias"
  createdBy?: string;
  createdAt: Timestamp;
}

// ==========================================
// MÓDULO DE F&B (Restaurante e Café da Manhã)
// ==========================================

export interface FBSettings {
  restaurant: {
    enabled: boolean;
    name: string;
    operatingHours: {
      dayOfWeek: number; // 0 (Dom) a 6 (Sáb)
      openTime: string; // HH:mm
      closeTime: string; // HH:mm
      isClosed?: boolean;
    }[];
  };
  breakfast: {
    enabled: boolean;
    modality: 'delivery' | 'buffet' | 'both';
    name: string;
    buffetHours?: {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
    }[];
    delivery?: {
      orderWindowStart: string; // Horário início dos pedidos no dia anterior (ex: 18:00)
      orderWindowEnd: string; // Horário limite dos pedidos (ex: 22:00)
      deliveryTimes: string[]; // Lista de horários para entrega (ex: ["08:30", "09:30", "10:30"])
      welcomeMessage?: string; // Título/Mensagem de boas vindas do Wizard (PT)
      welcomeMessage_en?: string;
      welcomeMessage_es?: string;
      instructions?: string; // Instruções do Passo a Passo (PT)
      instructions_en?: string;
      instructions_es?: string;
    };
    dailyMode?: 'delivery' | 'buffet'; // Override operacional definido pela recepção (só relevante quando modality === 'both')
  };
}

export type FBCategoryType = 'breakfast' | 'restaurant' | 'both';

export interface FBCategory {
  id: string;
  propertyId: string;
  name: string;       // PT — padrão/fallback
  name_en?: string;
  name_es?: string;
  type: FBCategoryType;
  selectionTarget?: 'individual' | 'group_portion' | 'group_unit';
  maxPerGuest?: number;
  alaCarte?: boolean;  // Se true, aparece no pedido a-la-carte do buffet
  order?: number;
  imageUrl?: string;
  createdAt: Timestamp;
}

export interface FBIngredient {
  name: string;
  cost: number;
  quantity?: string; // Para controle futuro
  productId?: string | null;   // vínculo com produto do estoque (Fase 3 — ficha técnica)
  consumptionQty?: number;     // quantidade consumida por porção (na unidade do produto)
  unit?: string;               // unidade de consumo (referência)
}

export interface FBFlavor {
  name: string;       // PT — padrão/fallback
  name_en?: string;
  name_es?: string;
  imageUrl?: string;
  ingredients?: FBIngredient[];
}

export interface FBMenuItem {
  id: string;
  propertyId: string;
  categoryId: string;
  name: string;            // PT — padrão/fallback
  name_en?: string;
  name_es?: string;
  description?: string;    // PT
  description_en?: string;
  description_es?: string;
  price: number;
  ingredients: FBIngredient[];
  flavors?: FBFlavor[];
  active: boolean;
  order?: number;
  imageUrl?: string | null;
  createdAt: Timestamp;
}

export interface FBOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  flavor?: string;
  guestName?: string;
}

export interface FBOrder {
  id: string;
  propertyId: string;
  stayId?: string | null;
  type: 'breakfast' | 'restaurant';
  modality: 'delivery' | 'buffet' | 'table';
  status: 'pending' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled';
  items: FBOrderItem[];
  totalPrice: number;
  deliveryTime?: string; // e.g., "08:30"
  deliveryDate?: string; // YYYY-MM-DD
  tableId?: string;
  attendanceId?: string;
  requestedBy?: 'guest' | 'waiter';
  guestName?: string;   // denormalizado do attendance para relatórios
  cabinName?: string;   // idem
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// MÓDULO CAFÉ SALÃO (Buffet)
// ==========================================

export interface BreakfastSession {
  id: string;
  propertyId: string;
  date: string; // YYYY-MM-DD
  status: 'open' | 'closed';
  openedAt?: Timestamp;
  closedAt?: Timestamp;
  openedBy?: string;
  createdAt: Timestamp;
}

export interface BreakfastAttendance {
  id: string;
  propertyId: string;
  sessionId: string;
  stayId: string;
  guestName: string;
  cabinName: string;
  additionalGuests?: string[]; // nomes dos acompanhantes
  status: 'expected' | 'arrived' | 'seated' | 'left' | 'absent' | 'inactive';
  tableId?: string | null;
  arrivedAt?: Timestamp;
  seatedAt?: Timestamp;
  leftAt?: Timestamp;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp;
}

export interface BreakfastTable {
  id: string;
  propertyId: string;
  sessionId: string;
  name: string;
  status: 'open' | 'closed';
  createdAt: Timestamp;
  closedAt?: Timestamp;
  createdBy?: string;
}

export interface BreakfastVisitor {
  id: string;
  propertyId: string;
  sessionId: string;
  tableId: string;
  name: string;
  createdAt: Timestamp;
}

// ==========================================
// MÓDULO DE EVENTOS
// ==========================================

export type EventType = 'local' | 'external' | 'private';
export type EventCategory =
  | 'entertainment'
  | 'gastronomy'
  | 'sports'
  | 'culture'
  | 'nightlife'
  | 'corporate'
  | 'wedding'
  | 'birthday'
  | 'other';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'finished';

// ==========================================
// MÓDULO DE BUGS / PROBLEMAS DO SISTEMA
// ==========================================

export interface SystemBug {
  id: string;
  stayId?: string;
  propertyId: string;
  description: string;
  browser_info?: string;
  imageUrl?: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: Timestamp;
}

// ==========================================
// MÓDULO DE CONCIERGE
// ==========================================

export type ConciergeCategory = 'consumption' | 'loan';
export type ConciergeRequestStatus = 'pending' | 'in_progress' | 'delivered' | 'returned' | 'lost' | 'not_delivered';

export interface ConciergeGroup {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  icon?: string;
  color?: string;
  order?: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConciergeItem {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  description?: string;
  description_en?: string;
  description_es?: string;
  category: ConciergeCategory;
  price: number;
  loss_price?: number;
  included_qty: number;
  stock_qty?: number | null;
  image_url?: string;
  active: boolean;
  deleted?: boolean;
  availableForGuest: boolean;
  availableForMaid: boolean;
  order?: number;
  groupId?: string;
  group?: ConciergeGroup;
  productId?: string | null;     // DEPRECADO (Fase 3): vínculo 1:1 antigo. Mantido p/ migração/rollback — leitura agora usa stockComponents.
  deductFromStock?: boolean;     // toggle "Baixar do estoque" (Fase 4) — liga a ficha técnica
  stockComponents?: ConciergeStockComponent[];  // ficha técnica: produtos baixados a cada unidade entregue
  stockAvailable?: boolean;      // VIRTUAL (não persiste): item tem insumo suficiente p/ ≥1 unidade? Preenchido na leitura.
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Linha da ficha técnica de um item de Concierge: um produto do estoque + quanto se consome por unidade. */
export interface ConciergeStockComponent {
  productId: string;
  consumptionQty: number;   // qtd consumida por 1 unidade do item (na unidade do produto)
  unit?: string;            // unidade do produto (denormalizada p/ exibição)
  name?: string;            // nome do produto (denormalizado p/ exibição)
  locationId?: string | null;  // "Baixar de" — local de estoque; null/ausente = PADRÃO (defaultSaleLocationId)
}

// (Frigobar aposentado na Fase 3B — itens migrados para Concierge, grupo "Frigobar".)

export interface ConciergeRequest {
  id: string;
  propertyId: string;
  stayId?: string;
  cabinId?: string;
  itemId: string;
  quantity: number;
  status: ConciergeRequestStatus;
  requestedBy: 'guest' | 'maid';
  assignedTo?: string;
  assignedName?: string;
  total_price?: number;
  notes?: string;
  notDeliveredReason?: string;
  urgent?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined fields
  item?: ConciergeItem;
  cabinName?: string;
}

export interface Event {
  id: string;
  propertyId: string;
  title: string;
  titleEn?: string;
  titleEs?: string;
  description?: string;
  descriptionEn?: string;
  descriptionEs?: string;
  type: EventType;
  category: EventCategory;
  status: EventStatus;
  visibility: 'all_guests' | 'public';
  featured: boolean;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
  startTime?: string;  // HH:mm
  endTime?: string;    // HH:mm
  location?: string;
  locationUrl?: string;
  price?: number;
  priceDescription?: string;
  maxCapacity?: number;
  imageUrl?: string;
  externalUrl?: string;
  privateEventId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ImpersonatingState {
  staff: Staff;
  originalUserData: Staff;
}

// ==========================================
// MÓDULO DE CASAMENTOS
// ==========================================

/**
 * `cancelled` e `lost` são coisas diferentes, de propósito:
 * cancelled = contrato fechado que caiu · lost = negociação que nunca fechou.
 * Juntar os dois inviabiliza ler taxa de conversão e receita perdida.
 */
export type WeddingStatus = 'tentative' | 'confirmed' | 'completed' | 'cancelled' | 'lost';

/**
 * Prazos padrão de uma negociação de casamento, por propriedade.
 * Servem só de ponto de partida: cada negociação carrega os próprios prazos e
 * pode ser esticada individualmente.
 */
export interface WeddingLeadSettings {
  /** Dias até o próximo contato com o casal. */
  followUpDays: number;
  /** Dias sem retorno até a negociação ser dada como perdida. */
  expiryDays: number;
  /** Quantos dias o "Registrar follow-up" empurra a validade. */
  renewDays: number;
}

export const DEFAULT_WEDDING_LEAD: WeddingLeadSettings = {
  followUpDays: 7,
  expiryDays: 45,
  renewDays: 45,
};

/** Motivos de perda oferecidos na tela (o campo aceita texto livre também). */
export const WEDDING_LOST_REASONS = [
  'Preço acima do orçamento',
  'Data indisponível',
  'Escolheu outro local',
  'Adiou o casamento',
  'Desistiu do evento',
  'Sem retorno do casal',
] as const;

export interface WeddingVendor {
  id: string;
  weddingId: string;
  category: string;
  name: string;
  contact?: string;
  confirmed: boolean;
  notes?: string;
  createdAt: Timestamp;
}

export interface WeddingCabinAssignment {
  id: string;
  weddingId: string;
  cabinId?: string;
  cabinName: string;
  guestDescription: string;
}

/**
 * Parcela real do contrato (tabela wedding_installments). Vencida e não paga
 * vira cobrança na fila de alarmes do funil de casamentos (linha virtual —
 * concluir lá = marcar paga aqui).
 */
export interface WeddingInstallment {
  id: string;
  weddingId: string;
  label: string;
  value: number;
  paid: boolean;
  paidAt?: Timestamp | null;
  /** Vencimento (YYYY-MM-DD) — NULL até ser combinado; não se inventa data. */
  dueDate?: string | null;
  sortOrder?: number;
  createdAt?: Timestamp;
}

/**
 * Personalização do site dos noivos — editada pelo casal no painel (código
 * dos noivos) ou pela recepção. Ausente/campo vazio = herda a identidade da
 * propriedade (tema camaleão padrão).
 */
export interface WeddingSiteConfig {
  /** Foto de capa (URL do storage — sobe pela rota /api/upload com coupleCode). */
  coverPhotoUrl?: string | null;
  /** Mensagem de boas-vindas escrita pelo casal (texto livre, um idioma só). */
  welcomeMessage?: string | null;
  /** Overrides de cor sobre o tema da propriedade (hex). */
  colors?: {
    primary?: string | null;
    background?: string | null;
    surface?: string | null;
  } | null;
}

export interface Wedding {
  id: string;
  propertyId: string;
  // Couple
  bride: string;
  brideShort?: string;
  groom: string;
  groomShort?: string;
  coupleWebsite?: string;
  /** WhatsApp do casal, só dígitos — mesmo formato de `contacts.id`. */
  couplePhone?: string | null;
  coupleEmail?: string | null;
  /** Canal de origem do lead — slug de `settings.crmChannels`. */
  source?: string | null;
  // Event
  weddingDate: string;       // YYYY-MM-DD
  ceremonyDetails?: string;  // e.g. "18h00 · Jardim das Oliveiras"
  receptionDetails?: string;
  guestCount: number;
  coordinator?: string;
  status: WeddingStatus;
  /** Por que a negociação foi perdida — só quando status = 'lost'. */
  lostReason?: string | null;
  lostAt?: Timestamp | null;
  /** Próximo contato com o casal (YYYY-MM-DD). Só sinaliza; não arquiva nada. */
  followUpAt?: string | null;
  /** Validade da negociação (YYYY-MM-DD): vencida vira 'lost' automaticamente. */
  expiresAt?: string | null;
  // Stay
  checkin: string;
  checkout: string;
  // Exclusivity
  exclusivity: boolean;
  cabinsOccupied?: number;
  // Financial
  contractTotal: number;
  /** @deprecated Parcelas viraram `wedding_installments` — campo congelado (só leitura de dados antigos). */
  depositValue?: number;
  /** @deprecated Ver depositValue. */
  depositPaid?: boolean;
  /** @deprecated Ver depositValue. */
  secondInstallmentValue?: number;
  /** @deprecated Ver depositValue. */
  secondInstallmentPaid?: boolean;
  // Site dos noivos (simulador de convidados)
  /** Código de 6 dígitos dos CONVIDADOS (vai no convite) — acesso ao simulador. */
  guestCode?: string | null;
  /** Código de 6 dígitos dos NOIVOS — painel do casal (ocupação + personalização). */
  coupleCode?: string | null;
  /** Tabela do tarifário que precifica a janela do evento (única, todas as noites). */
  rateTableId?: string | null;
  /** Quantas noites o convidado pode estender antes/depois da janela (por lado). */
  maxExtendNights?: number;
  /** Site público ligado — só com status 'confirmed' + tabela + datas. */
  siteEnabled?: boolean;
  siteConfig?: WeddingSiteConfig | null;
  // Notes
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  vendors?: WeddingVendor[];
  cabinAssignments?: WeddingCabinAssignment[];
  installments?: WeddingInstallment[];
}

// ==========================================
// MÓDULO SOCIAL — SCRAPS & REACTIONS
// ==========================================

export interface StaffScrap {
  id: string;
  fromStaffId: string;
  toStaffId: string;
  propertyId: string;
  message: string;
  parentId?: string | null;
  createdAt: Timestamp;
  fromStaff?: Pick<Staff, 'id' | 'fullName' | 'role' | 'profilePictureUrl' | 'messengerColor'>;
  reactions?: StaffScrapReaction[];
  replies?: StaffScrap[];
}

export interface StaffScrapReaction {
  id: string;
  scrapId: string;
  staffId: string;
  emoji: string;
  createdAt: Timestamp;
}

// --- CHANGELOG ---

export type ChangelogStatus    = 'draft' | 'published';
export type ChangelogEntryType = 'feature' | 'improvement' | 'fix';

export interface Changelog {
  id:        string;
  version:   string;
  label:     string;
  date:      string;
  status:    ChangelogStatus;
  highlight: string | null;
  createdAt: string;
  updatedAt: string;
  entries?:  ChangelogEntry[];
}

export interface ChangelogEntry {
  id:          string;
  changelogId: string;
  type:        ChangelogEntryType;
  text:        string;
  sortOrder:   number;
  createdAt:   string;
}

// ==========================================
// MÓDULO ESTOQUE / PATRIMÔNIO — Fase 0 (Fundação)
// ==========================================

export type StockCategoryScope = 'consumable' | 'asset' | 'both';
export type StockLocationType   = 'warehouse' | 'kitchen' | 'bar' | 'laundry' | 'cabin' | 'staff' | 'other';
/**
 * Política de controle de saldo do local:
 * - 'stock': estoque de verdade — transferências mantêm saldo (padrão).
 * - 'consume_all': ponto de consumo — transferência para cá vira SAÍDA (consumo do setor).
 * - 'consume_categories': misto — só as categorias em consumeCategoryIds viram saída.
 * Isenções (nunca convertem): categoria appliesTo 'asset' e produto neverConsume.
 */
export type StockLocationPolicy = 'stock' | 'consume_all' | 'consume_categories';
export type StockUnit           = 'un' | 'kg' | 'g' | 'L' | 'ml' | 'cx' | 'pct' | 'par' | 'rolo';
export type StockMovementType   = 'entry' | 'exit' | 'transfer' | 'adjustment' | 'loss';
export type StockLossType       = 'expiry' | 'damage' | 'handling' | 'other';
export type StockReferenceType  = 'purchase' | 'consumption' | 'manual' | 'inventory' | 'concierge' | 'minibar' | 'fb' | 'restock';

export interface StockCategory {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  icon?: string;            // emoji
  color?: string;
  appliesTo: StockCategoryScope;
  /** Reposição: local padrão de baixa dos produtos desta categoria (null = "nenhum", sem baixa automática). */
  deductLocationId?: string | null;
  order?: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockLocation {
  id: string;
  propertyId: string;
  name: string;
  type: StockLocationType;
  cabinId?: string | null;
  policy: StockLocationPolicy;
  /** Só faz sentido quando policy === 'consume_categories'. */
  consumeCategoryIds?: string[] | null;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockProduct {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  categoryId?: string | null;
  sku?: string;
  unit: StockUnit;
  barcode?: string;
  imageUrl?: string;
  trackExpiry: boolean;
  /** Bem durável (ex.: toalha de rosto) — nunca converte em consumo ao entrar num ponto de consumo. */
  neverConsume?: boolean;
  /** Aparece no catálogo de reposição da camareira/governanta. */
  maidRequestable?: boolean;
  /** Fonte de baixa: 'default' segue a categoria; 'none' não baixa; 'location' usa deductLocationId. */
  deductMode?: 'default' | 'none' | 'location';
  deductLocationId?: string | null;
  minStock: number;
  maxStock?: number | null;
  averageCost: number;        // custo médio ponderado
  lastPurchaseCost?: number | null;
  active: boolean;
  deleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  category?: StockCategory;
  totalQuantity?: number;     // soma dos saldos (calculado)
}

export interface StockBalance {
  id: string;
  propertyId: string;
  productId: string;
  locationId: string;
  quantity: number;
  updatedAt: Timestamp;
}

export interface StockMovement {
  id: string;
  propertyId: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  // Detalhe do local do tipo 'staff' (rastreabilidade; não gera saldo próprio):
  // qual colaborador recebeu / devolveu.
  fromStaffId?: string | null;
  toStaffId?: string | null;
  batchId?: string | null;        // usado a partir da Fase 2
  batchRef?: string | null;       // agrupa as movimentações lançadas em lote
  lossType?: StockLossType | null;
  referenceType: StockReferenceType;
  referenceId?: string | null;
  performedBy?: string;           // quem OPEROU o sistema (sessão, não forjável)
  performedByName?: string;
  responsibleId?: string | null;  // quem RESPONDE pela ação (default = quem operou)
  responsibleName?: string | null;
  notes?: string;
  createdAt: Timestamp;
  // Joined / virtual
  product?: StockProduct;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  fromStaffName?: string;         // nome do colaborador de origem
  toStaffName?: string;           // nome do colaborador de destino
}

/**
 * Filtros do histórico de movimentações (tela "Histórico", paginada).
 * Tudo opcional: sem filtro nenhum devolve a primeira página do histórico inteiro.
 */
export interface StockMovementHistoryFilters {
  from?: string;                  // 'YYYY-MM-DD' — inclusive
  to?: string;                    // 'YYYY-MM-DD' — inclusive (o dia inteiro)
  types?: StockMovementType[];
  productId?: string;
  /** Casa como ORIGEM ou como DESTINO. */
  locationId?: string;
  /** Responsável pela ação; cai no operador quando a movimentação não tem responsável. */
  responsibleId?: string;
  referenceType?: StockReferenceType;
  /** Texto livre dentro das observações. */
  search?: string;
  /** Só movimentações que têm observação escrita. */
  onlyWithNotes?: boolean;
  page?: number;                  // 1-based
  pageSize?: number;
}

/** Uma página do histórico + o total, para a paginação saber onde está. */
export interface StockMovementHistory {
  rows: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
}

/** Conteúdo completo de um lote — o que foi lançado junto e se já foi estornado. */
export interface StockBatchDetail {
  movements: StockMovement[];
  /**
   * Quantas movimentações de estorno deste lote já existem. Maior que zero = o lote
   * já foi revertido; estornar de novo RE-APLICA o movimento original no saldo.
   */
  reversalCount: number;
}

/**
 * Reconciliação entre a coleção `cabins` e os locais de estoque do tipo cabana.
 * Uma proposta NUNCA é aplicada sozinha — o usuário confirma linha a linha.
 */
export interface CabinLinkProposal {
  cabin: { id: string; number: string; category: string; name: string };
  linkedLocationId: string | null;              // já vinculado (cabinId gravado)
  suggestedLocationId: string | null;           // candidato, ainda não vinculado
  matchKind: 'linked' | 'exact-name' | 'number' | 'none';
}

/** Local de estoque candidato/órfão, com o peso do que ele carrega. */
export interface CabinLinkCandidate {
  id: string;
  name: string;
  type: StockLocationType;
  active: boolean;
  cabinId?: string | null;
  balanceRows: number;
  totalUnits: number;
  movementCount: number;
}

// ── RELATÓRIOS DE ESTOQUE ─────────────────────────────────────────────────────
export type StockReportKind = 'position' | 'movements' | 'losses' | 'consumption';

export interface StockReportFilters {
  /** Vazio = todos. Ids de stock_locations. */
  locationIds?: string[];
  /** Vazio = todos. Ids de stock_products. */
  productIds?: string[];
  categoryIds?: string[];
  /** Só para movimentações/perdas. */
  from?: string | null;
  to?: string | null;
  types?: StockMovementType[];
  /** position: esconde linhas com saldo zero. */
  hideZero?: boolean;
}

/**
 * Linhas estruturadas — nunca CSV pronto. O mesmo payload alimenta a tabela na
 * tela, o arquivo CSV e a versão de impressão.
 */
export interface StockReport {
  kind: StockReportKind;
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number>;
  meta: { generatedAt: string; filterSummary: string; rowCount: number };
}

// ── LANÇAMENTO EM LOTE ────────────────────────────────────────────────────────
/** Uma linha do lote. O cabeçalho (tipo, locais, responsável) é comum a todas. */
export interface BatchMovementLine {
  productId: string;
  quantity: number;
  unitCost?: number;
  expiryDate?: string | null;
  batchCode?: string | null;
}

export interface BatchMovementInput {
  type: StockMovementType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  fromCabinId?: string | null;
  toCabinId?: string | null;
  fromStaffId?: string | null;
  toStaffId?: string | null;
  responsibleId?: string | null;
  notes?: string;
  lossType?: StockLossType;
  lines: BatchMovementLine[];
  allowNegative?: boolean;
  /** Continua um lote que falhou no meio, mantendo o mesmo agrupamento. */
  batchRef?: string | null;
}

export interface BatchLineError {
  index: number;
  productId: string;
  error: string;
  code?: string;
  available?: number;
  resulting?: number;
}

export interface BatchMovementResult {
  batchRef: string;
  /** Índices (na lista enviada) que gravaram, com o id da movimentação. */
  ok: { index: number; productId: string; movementId: string }[];
  /** A linha que parou o lote — só uma, porque a execução para na primeira falha. */
  failed: BatchLineError | null;
  /** Índices que nem chegaram a ser tentados. */
  remaining: number[];
  /** Erros do pré-voo: quando vem preenchido, NADA foi gravado. */
  preflight: BatchLineError[];
}

/** Card de um estoque na visão geral: o que tem dentro, em uma linha. */
export interface StockLocationOverview {
  location: StockLocation;
  cabinNumber?: string | null;
  productCount: number;
  totalUnits: number;
  totalValue: number;
  belowMinCount: number;
  lastMovementAt?: string | null;
}

/** Conteúdo de um estoque: produtos com saldo ali + histórico do local. */
export interface StockLocationDetail {
  location: StockLocation;
  items: {
    productId: string;
    name: string;
    unit: StockUnit;
    categoryName?: string;
    quantity: number;
    averageCost: number;
    value: number;
    minStock: number;
    belowMin: boolean;
  }[];
  movements: StockMovement[];
  totals: { units: number; value: number; belowMin: number };
}

/** Cabana escolhível como origem/destino de movimentação (passo 2 do seletor). */
export interface StockCabinOption {
  id: string;
  number: string;
  name: string;
  /** Local de estoque já existente; null = será criado na primeira movimentação. */
  locationId: string | null;
}

export interface CabinLinkReport {
  proposals: CabinLinkProposal[];
  /** Locais tipo 'cabin' que não casaram com nenhuma cabana (inclui o "CABANAS" genérico). */
  unmatched: CabinLinkCandidate[];
  /** Todos os candidatos por id, para a UI mostrar saldo/histórico de cada proposta. */
  candidates: Record<string, CabinLinkCandidate>;
}

/** Colaborador selecionável como origem/destino ou responsável de uma movimentação. */
export interface StockStaffOption {
  id: string;
  name: string;
  role?: UserRole;   // agrupa o select por cargo
}

/**
 * Abertura da tela de Movimentações numa requisição só (antes eram seis).
 * `products` vem enxuto — os campos que o select e as duas regras da tela usam,
 * sem `totalQuantity` nem o resto da linha.
 */
export interface StockMovementsBootstrap {
  products: StockProduct[];
  locations: StockLocation[];
  staffOptions: StockStaffOption[];
  cabinOptions: StockCabinOption[];
  defaultLocationId: string;
  movements: StockMovement[];
}

export interface StockSettings {
  propertyId: string;
  noTurnoverDays: number;         // janela "sem giro" (default 60)
  expiryAlertLeadDays: number;    // antecedência do alerta de validade (default 30)
  autoLossOnExpiry: boolean;
  defaultSaleLocationId?: string | null;  // local de onde concierge/F&B dão baixa (Fase 3)
  defaultLocationId?: string | null;      // "estoque principal": origem padrão das transferências
  assetTagPrefix?: string;                // prefixo do nº de patrimônio (default 'PAT')
  assetTagPadding?: number;               // dígitos do sufixo (default 4 → PAT-0042)
  updatedAt: Timestamp;
}

// ── Reposição (camareira/governanta → mensageiro) ────────────────────────────
// Extraída do Concierge: o pedido aponta PRODUTO do estoque e nunca toca fólio.

export type RestockRequestStatus = 'pending' | 'in_progress' | 'delivered' | 'not_delivered' | 'cancelled';

export interface RestockRequest {
  id: string;
  propertyId: string;
  cabinId?: string | null;
  productId: string;
  quantity: number;
  status: RestockRequestStatus;
  notDeliveredReason?: string | null;
  requestedById?: string;
  requestedByName?: string;
  requestedByRole?: 'maid' | 'governance';
  assignedTo?: string | null;
  assignedName?: string | null;
  /** Fonte resolvida na criação (instrução "retirar de"). */
  plannedSourceId?: string | null;
  /** Local alternativo com saldo quando a fonte planejada estava em falta ("pegar no estoque Y"). */
  fallbackSourceId?: string | null;
  /** Fonte REALMENTE usada na baixa da entrega. */
  sourceLocationId?: string | null;
  notes?: string | null;
  createdAt: Timestamp;
  assignedAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  updatedAt: Timestamp;
  // Joined / virtual (enriquecidos na rota field)
  productName?: string;
  productUnit?: StockUnit;
  cabinName?: string | null;
  plannedSourceName?: string | null;
  fallbackSourceName?: string | null;
}

/** Item do catálogo de reposição da camareira (produto + disponibilidade já resolvida). */
export interface RestockCatalogItem {
  productId: string;
  name: string;
  unit: StockUnit;
  categoryId?: string | null;
  categoryName?: string;
  categoryIcon?: string;
  categoryOrder?: number;
  /**
   * ok = tem saldo na fonte; fallback = fonte vazia mas há saldo em outro local;
   * out = em falta em todo lugar (pedido bloqueado); ungated = sem fonte de
   * baixa configurada ou módulo de estoque desligado (sem trava).
   */
  availability: 'ok' | 'fallback' | 'out' | 'ungated';
  fallbackLocationName?: string | null;
}

// ── Fase 1: Fornecedores & Compras ───────────────────────────────────────────
export type PurchaseStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  propertyId: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
  paymentTerms?: string;
  category?: string;
  active: boolean;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  expiryDate?: string | null;     // YYYY-MM-DD (usado na Fase 2)
  batchCode?: string | null;
  createdAt?: Timestamp;
  // Joined / virtual
  product?: StockProduct;
}

export interface Purchase {
  id: string;
  propertyId: string;
  supplierId?: string | null;
  locationId?: string | null;     // local de recebimento (destino das entradas)
  invoiceNumber?: string;
  invoiceUrl?: string;            // documento da NF (PDF/imagem)
  // Identidade fiscal — preenchida quando a nota entra pelo XML
  invoiceKey?: string | null;           // chave de acesso (44 dígitos): trava a duplicidade
  invoiceSeries?: string | null;
  invoiceModel?: string | null;         // 55 = NF-e · 65 = NFC-e
  invoiceXmlUrl?: string | null;        // XML original arquivado
  invoiceDeclaredTotal?: number | null; // vNF do XML — contra o qual a soma dos itens é conferida
  importSource?: 'manual' | 'xml_upload' | 'xml_dfe' | null;
  status: PurchaseStatus;
  isEmergency: boolean;
  orderDate?: string | null;      // YYYY-MM-DD
  receivedDate?: string | null;
  totalValue: number;             // líquido (soma dos itens + frete − desconto)
  discountValue?: number;         // desconto da nota (R$)
  freightValue?: number;          // taxa de entrega / frete da nota (R$)
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  supplier?: Supplier;
  location?: StockLocation;
  items?: PurchaseItem[];
}

/** Ficha do fornecedor: dados + histórico de compras + resumo. */
export interface SupplierDetail {
  supplier: Supplier;
  purchases: Purchase[];
  stats: { count: number; totalReceived: number; lastPurchaseDate?: string | null };
}

// ── Importação da nota pelo XML (NF-e / NFC-e) ───────────────────────────────

/**
 * De-para que se lembra: o código do produto NA NOTA DO FORNECEDOR (cProd)
 * apontando para o produto daqui, com o fator de embalagem (1 CX = 12 un).
 */
export interface SupplierProductMap {
  id: string;
  propertyId: string;
  supplierId: string;
  supplierCode: string;
  productId?: string | null;
  assetLine: boolean;             // a linha vira ativo em Patrimônio, não estoque
  ignoreLine: boolean;            // a linha nunca entra no lançamento
  factor: number;                 // 1 unidade do XML = N unidades do AURA
  xmlUnit?: string | null;
  lastDescription?: string | null;
  lastEan?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** O que fazer com uma linha da nota. */
export type InvoiceLineTarget = 'product' | 'new_product' | 'asset' | 'ignore';

/** Como o servidor chegou no produto sugerido — a tela mostra isso para dar confiança. */
export type InvoiceLineMatch = 'map' | 'barcode' | 'name' | null;

export interface InvoiceImportLine {
  n: number;                      // nItem
  code: string;                   // cProd
  ean: string | null;
  description: string;            // xProd, do jeito que o fornecedor escreveu
  unit: string;                   // uCom
  quantity: number;               // qCom
  unitValue: number;              // vUnCom
  total: number;                  // vProd
  ipi: number;
  icmsSt: number;
  discount: number;
  freight: number;
  // Sugestão do servidor — a tela deixa trocar tudo
  target: InvoiceLineTarget;
  productId: string | null;
  factor: number;
  suggestedFactor: number | null; // inferido de qTrib/qCom, para a tela explicar de onde veio
  matchedBy: InvoiceLineMatch;
  candidates: { productId: string; name: string; unit: string }[];
}

export interface InvoiceImportPreview {
  invoice: {
    key: string | null;
    number: string;
    series: string;
    model: string;
    issuedAt: string | null;
    operation?: string;
  };
  /** Nota já lançada nesta propriedade — a chave de acesso não repete. */
  duplicate: { purchaseId: string; invoiceNumber?: string | null; status: PurchaseStatus; createdAt: string } | null;
  supplier: {
    matchedId: string | null;     // fornecedor já cadastrado com este CNPJ
    cnpj: string;
    name: string;
    suggestion: Partial<Supplier>; // o que criar, se a pessoa confirmar
  };
  lines: InvoiceImportLine[];
  totals: {
    products: number;
    freight: number;
    discount: number;
    icmsSt: number;
    ipi: number;
    other: number;
    declared: number;             // vNF
  };
  /** XML de volta: o commit reenvia para o servidor reler (fonte da verdade). */
  xml: string;
  fileName?: string;
}

export interface InvoiceImportCommitLine {
  n: number;
  target: InvoiceLineTarget;
  productId?: string | null;
  factor: number;
  remember: boolean;              // grava o de-para para a próxima nota
  newProduct?: { name: string; unit: StockUnit; categoryId?: string | null; minStock?: number; trackExpiry?: boolean };
  asset?: { name: string; categoryId?: string | null; locationId?: string | null };
}

export interface InvoiceImportCommit {
  propertyId: string;
  xml: string;
  fileName?: string;
  supplierId?: string | null;
  createSupplier?: boolean;
  locationId?: string | null;
  invoiceXmlUrl?: string | null;
  /** Soma IPI + ICMS-ST ao custo dos itens (para consumo próprio, imposto É custo). */
  includeTaxesInCost?: boolean;
  /** Frete da nota — a tela deixa jogar aqui a diferença que não fechou. */
  freightValue?: number;
  isEmergency?: boolean;
  notes?: string;
  lines: InvoiceImportCommitLine[];
}

export interface InvoiceImportResult {
  purchaseId: string;
  supplierId: string | null;
  createdProducts: number;
  createdAssets: number;
  mappedLines: number;
  skippedLines: number;
  totalValue: number;
  declaredTotal: number;
  difference: number;             // totalValue − vNF (o que ficou de resto)
}

// ── Fase 1: Patrimônio ───────────────────────────────────────────────────────
export type AssetStatus = 'active' | 'maintenance' | 'inactive' | 'disposed' | 'written_off';
export type AssetDepreciationMethod = 'linear' | 'none';
export type AssetDisposalType = 'sale' | 'donation' | 'scrap' | 'loss' | 'theft' | 'trade_in';
export type AssetWarrantyStatus = 'active' | 'expiring' | 'expired' | 'none';

export interface Asset {
  id: string;
  propertyId: string;
  name: string;
  assetTag?: string;              // nº de patrimônio
  categoryId?: string | null;
  locationId?: string | null;
  cabinId?: string | null;
  serialNumber?: string;
  brand?: string;
  model?: string;
  acquisitionDate?: string | null;
  acquisitionCost: number;
  supplierId?: string | null;
  purchaseId?: string | null;
  depreciationMethod: AssetDepreciationMethod;
  usefulLifeMonths?: number | null;
  residualValue: number;
  depreciationStart?: string | null;
  status: AssetStatus;
  // Garantia (opcional)
  warrantyUntil?: string | null;
  warrantyProvider?: string;
  warrantyDocUrl?: string;        // documento de garantia (PDF/imagem)
  warrantyNotes?: string;
  imageUrl?: string;              // foto do produto
  specImageUrl?: string;          // foto da etiqueta de especificações
  invoiceUrl?: string;            // nota fiscal (PDF/imagem)
  notes?: string;
  /** Código curto da plaqueta física (QR). IMUTÁVEL — a placa não se reimprime. */
  publicCode?: string;
  /** Custodiante: quem responde pelo ativo. TEXT sem FK (ver migration). */
  custodianId?: string | null;
  custodianName?: string | null;
  // Baixa / alienação — substitui o DELETE físico
  disposalDate?: string | null;
  disposalType?: AssetDisposalType | null;
  disposalReason?: string;
  disposalValue?: number | null;
  disposalDocUrl?: string;
  /** Valor contábil congelado na data da baixa — não recalcular depois. */
  bookValueAtDisposal?: number | null;
  disposedBy?: string;
  disposedByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / computed — NUNCA persistir (ver VIRTUAL_ASSET_FIELDS em asset-service)
  category?: StockCategory;
  location?: StockLocation;
  cabinName?: string;
  monthlyDepreciation?: number;
  accumulatedDepreciation?: number;
  bookValue?: number;             // valor contábil atual
  maintenanceCost?: number;       // soma de maintenance_tasks.cost
  openMaintenanceCount?: number;
  warrantyStatus?: AssetWarrantyStatus;
  disposalResult?: number;        // disposalValue − bookValueAtDisposal (ganho/perda)
}

// ── Fase 2: Lotes / Validade ─────────────────────────────────────────────────
export interface StockBatch {
  id: string;
  propertyId: string;
  productId: string;
  locationId: string;
  batchCode?: string | null;
  quantity: number;               // saldo restante do lote
  unitCost: number;
  expiryDate?: string | null;     // YYYY-MM-DD
  purchaseId?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  product?: StockProduct;
  location?: StockLocation;
}

/** Agregado da Visão Geral do estoque (dashboard). */
export interface StockDashboard {
  kpis: {
    stockValue: number;        // Σ saldo × custo médio
    totalProducts: number;
    totalUnits: number;
    lowStockCount: number;
    noTurnoverCount: number;
    noTurnoverValue: number;
    lossesValue: number;       // perdas no período
    cmv: number;               // custo dos consumos (concierge/fb) no período
    accuracy: number | null;   // último inventário fechado
    purchasesCount: number;
    purchasesTotal: number;
    expiringCount: number;
  };
  byCategory: { name: string; value: number; color?: string }[];
  movementsDaily: { date: string; entry: number; exit: number }[];
  lossesByType: { type: string; value: number; count: number }[];
  movementsSummary: { entry: number; exit: number; transfer: number; adjustment: number; loss: number };
  lowStockItems: { id: string; name: string; unit: string; qty: number; min: number }[];
  recentMovements: StockMovement[];
}

/** Ficha do produto: saldo por local, lotes/validades e histórico. */
export interface ProductDetail {
  product: StockProduct;
  balances: (StockBalance & { locationName: string })[];
  batches: (StockBatch & { locationName: string })[];
  movements: StockMovement[];
}

// ── Fase 2: Inventário físico ────────────────────────────────────────────────
export type InventoryCountStatus = 'open' | 'counting' | 'closed';

export interface InventoryCount {
  id: string;
  propertyId: string;
  locationId?: string | null;     // null = todos os locais
  scope: string[];                // categoryIds ([] = todas)
  status: InventoryCountStatus;
  accuracy?: number | null;       // % preenchida ao fechar
  createdBy?: string;
  createdByName?: string;
  startedAt: Timestamp;
  closedAt?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  location?: StockLocation;
  items?: InventoryCountItem[];
  itemCount?: number;
}

export interface InventoryCountItem {
  id: string;
  countId: string;
  productId: string;
  locationId?: string | null;
  systemQty: number;
  countedQty?: number | null;     // null = ainda não contado
  difference?: number | null;
  adjusted: boolean;
  createdAt?: Timestamp;
  // Joined / virtual
  product?: StockProduct;
}

// ── Fase 2: Depreciação (lançamentos) ────────────────────────────────────────
export interface AssetDepreciationEntry {
  id: string;
  propertyId: string;
  assetId: string;
  period: string;                 // YYYY-MM
  amount: number;
  accumulatedDepreciation: number;
  bookValue: number;
  createdAt: Timestamp;
}

// ── Patrimônio: movimentações do ativo ───────────────────────────────────────
export type AssetMovementType = 'transfer' | 'custody' | 'status' | 'disposal' | 'inventory';

export interface AssetMovement {
  id: string;
  propertyId: string;
  assetId: string;
  type: AssetMovementType;
  fromLocationId?: string | null;   toLocationId?: string | null;
  fromCabinId?: string | null;      toCabinId?: string | null;
  fromCustodianId?: string | null;  fromCustodianName?: string | null;
  toCustodianId?: string | null;    toCustodianName?: string | null;
  fromStatus?: AssetStatus | null;  toStatus?: AssetStatus | null;
  reason?: string;
  referenceType?: 'inventory' | 'disposal' | null;
  referenceId?: string | null;
  performedBy?: string;
  performedByName?: string;
  createdAt: Timestamp;
  // Joined / virtual
  fromLocationName?: string; toLocationName?: string;
  fromCabinName?: string;    toCabinName?: string;
}

export interface AssetDisposalInput {
  disposalDate: string;             // YYYY-MM-DD
  disposalType: AssetDisposalType;
  disposalReason: string;
  disposalValue?: number | null;
  disposalDocUrl?: string;
}

export interface AssetTransferInput {
  toLocationId?: string | null;
  toCabinId?: string | null;
  toCustodianId?: string | null;
  toCustodianName?: string | null;
  toStatus?: AssetStatus | null;
  reason?: string;
}

/** Ficha do ativo: payload composto, montado em consultas paralelas. */
export interface AssetDetail {
  asset: Asset;
  depreciation: AssetDepreciationEntry[];
  maintenance: MaintenanceTask[];
  maintenanceCost: number;
  movements: AssetMovement[];
  audit: AuditLog[];
  /** URL completa da plaqueta, com o domínio já resolvido. */
  publicUrl: string;
}

// ── Patrimônio: conferência (inventário físico) ──────────────────────────────
export type AssetInventoryStatus = 'open' | 'counting' | 'closed';
/** Ativo não tem quantidade, tem presença — por isso status em vez de contagem. */
export type AssetInventoryItemStatus = 'pending' | 'found' | 'missing' | 'moved' | 'unexpected';

export interface AssetInventoryCount {
  id: string;
  propertyId: string;
  locationId?: string | null;
  cabinId?: string | null;
  scope: string[];                 // categoryIds; [] = todas
  status: AssetInventoryStatus;
  expectedCount: number;
  foundCount?: number | null;
  missingCount?: number | null;
  movedCount?: number | null;
  unexpectedCount?: number | null;
  accuracy?: number | null;
  applyMoves: boolean;
  createdBy?: string;
  createdByName?: string;
  startedAt: Timestamp;
  closedAt?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  location?: StockLocation;
  items?: AssetInventoryItem[];
  itemCount?: number;
}

export interface AssetInventoryItem {
  id: string;
  countId: string;
  assetId: string;
  expectedLocationId?: string | null;
  expectedCabinId?: string | null;
  status: AssetInventoryItemStatus;
  foundLocationId?: string | null;
  foundCabinId?: string | null;
  checkedAt?: string | null;
  checkedBy?: string;
  checkedByName?: string;
  notes?: string;
  createdAt?: Timestamp;
  // Joined / virtual
  asset?: Asset;
}

export interface AssetInventoryItemUpdate {
  id: string;
  status: AssetInventoryItemStatus;
  foundLocationId?: string | null;
  notes?: string;
}

// ── Patrimônio: relatórios ───────────────────────────────────────────────────
export type AssetReportKind =
  | 'asset_position' | 'asset_depreciation' | 'asset_warranty'
  | 'asset_maintenance' | 'asset_disposals';

export interface AssetReportFilters {
  categoryIds?: string[];
  locationIds?: string[];
  statuses?: AssetStatus[];
  custodianIds?: string[];
  from?: string | null;            // YYYY-MM-DD (ou YYYY-MM na depreciação)
  to?: string | null;
  /** Garantias: janela em dias à frente (default 90). */
  warrantyWindowDays?: number;
  includeDisposed?: boolean;       // default false
}

/**
 * Mesmo contrato de StockReport — o encanamento de CSV (lib/csv.ts) e de
 * impressão (PrintReport) não sabe nem precisa saber de que módulo veio.
 * O Omit<'kind'> é deliberado: reaproveita columns/rows/totals/meta SEM mexer em
 * StockReportKind, então o switch do stock-report-service segue exaustivo.
 */
export interface AssetReport extends Omit<StockReport, 'kind'> {
  kind: AssetReportKind;
}

// ── Patrimônio: página pública da plaqueta (/p/<code>) ───────────────────────
/**
 * TUDO que a rota pública devolve. É a allowlist de colunas em forma de tipo:
 * o que não está aqui não sai do servidor.
 *
 * NUNCA adicionar custo de aquisição, valor contábil, depreciação, fornecedor,
 * nota fiscal, observações, dados de baixa — nem o NÚMERO DE SÉRIE, que é
 * exatamente o que se precisa para fraudar uma garantia ou receptar o item.
 */
export interface AssetPublicView {
  id: string;
  publicCode: string;
  name: string;
  assetTag?: string | null;
  brand?: string | null;
  model?: string | null;
  status: AssetStatus;
  imageUrl?: string | null;
  categoryName?: string | null;
  locationName?: string | null;
  cabinName?: string | null;
  warrantyUntil?: string | null;
  warrantyStatus: AssetWarrantyStatus;
  property: { id: string; name: string; logoUrl?: string; theme?: PropertyTheme };
}

export interface AssetPublicReportInput {
  description: string;
  reporterName?: string;
  imageUrl?: string;
  /** Honeypot — se vier preenchido, a resposta é ok e nada é gravado. */
  website?: string;
  /** ms desde a abertura do formulário; abaixo de 2000 é bot. */
  elapsedMs?: number;
}

export type AssetPublicReportResult =
  | { ok: true; merged?: boolean }
  | { ok: false; error: string };

/** Personalização da etiqueta de patrimônio. */
export interface AssetLabelOptions {
  size: 'large' | 'small';
  /** Exibir a logo da pousada. */
  showLogo: boolean;
  /** 'full' = logo completa (marca + nome); 'simple' = só a marca. */
  logoVariant: 'full' | 'simple';
  /** Exibir o nome do ativo abaixo do número. */
  showName: boolean;
  /** Moldura em volta do bloco "PATRIMÔNIO + número". */
  framed: boolean;
  /** Imprime a logo em preto e branco (o resto da etiqueta já é monocromático). */
  monochrome: boolean;
  /** Camaleão da Aura no centro do QR. */
  auraMark: boolean;
  /** Assinatura "Powered by Aura" no rodapé. */
  poweredBy: boolean;
}

export const DEFAULT_ASSET_LABEL_OPTIONS: AssetLabelOptions = {
  size: 'large',
  showLogo: true,
  logoVariant: 'full',
  showName: false,
  framed: true,
  monochrome: false,
  auraMark: true,
  poweredBy: true,
};

/** Uma etiqueta na folha A4 de impressão. */
export interface AssetLabel {
  id: string;
  name: string;
  assetTag: string;
  publicCode: string;
  url: string;
  locationName?: string;
}

// ==========================================
// MÓDULO TARIFÁRIO (port do SIT)
// ==========================================

/**
 * Tabela de preços: diária por categoria de cabana × nº de pagantes (1..6).
 * `prices` = { "<categoryId>": { "1": 990, "2": 1090, ... } } — a chave é o id
 * de `CabinCategory`, o mesmo que a cabana referencia. É por isso que preço e
 * disponibilidade não têm como divergir (antes se encontravam por string).
 */
export interface RateTable {
  id: string;
  propertyId: string;
  name: string;
  prices: Record<string, Record<string, number>>;
  /**
   * Arquivada = fora das listas ativas e dos selects de período; vive na aba
   * Arquivo (histórico de preços). Regra antiga que ainda aponta para ela
   * continua resolvendo — arquivar não quebra o calendário.
   */
  archivedAt?: Timestamp | null;
  archivedBy?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Snapshot de uma tabela ANTES de uma alteração real (ou da exclusão) — o
 * histórico de preços da fazenda. `tableId` sem FK: a versão sobrevive.
 */
export interface RateTableVersion {
  id: string;
  tableId: string;
  propertyId: string;
  name: string;
  prices: RateTable['prices'];
  replacedAt: Timestamp;
  replacedBy?: string | null;
  replacedByName?: string | null;
}

/**
 * Regra de calendário: no intervalo [startDate, endDate] (noites, inclusive)
 * vale a tabela de dia de semana ou a de fim de semana (SEX/SÁB).
 */
export interface RatePeriod {
  id: string;
  propertyId: string;
  name: string;
  startDate: string;   // YYYY-MM-DD (primeira noite)
  endDate: string;     // YYYY-MM-DD (última noite, inclusive)
  minNights: number;
  weekdayTableId?: string | null;
  weekendTableId?: string | null;
  createdAt?: Timestamp;
}

/** Ajuste de ocupação escolhido no orçamento (ex.: "Alta (+10%)"). */
export interface RateFluctuation {
  id: string;
  name: string;
  pct: number;         // positivo encarece
}

/**
 * Um PRESET de flutuação atribuído a um intervalo de datas (tabela
 * rate_fluctuations) — difere de `RateFluctuation`, que é só a opção do
 * select. `pct` é snapshot assinado do preset no momento da atribuição:
 * editar o preset depois não reprecifica períodos já atribuídos. A cotação
 * em modo "Automática" aplica o % de cada noite e exibe a média.
 */
export interface RateFluctuationRule {
  id: string;
  propertyId: string;
  /** id do preset em `RateSettings.fluctuations` (JSONB — sem FK). */
  presetId?: string | null;
  /** Label do preset na atribuição (calendário/auditoria). */
  name?: string | null;
  startDate: string;   // YYYY-MM-DD (primeira noite)
  endDate: string;     // YYYY-MM-DD (última noite, inclusive)
  pct: number;         // assinado: positivo encarece
  createdAt?: Timestamp;
  createdBy?: string | null;
  createdByName?: string | null;
}

/** Desconto manual de checkbox (ex.: "Pix à vista -5%"). */
export interface RateDiscount {
  id: string;
  name: string;
  pct: number;
}

export type RatePromoDayType = 'all' | 'fds' | 'week';

/** Promoção automática aplicada por diária dentro do intervalo. */
export interface RatePromo {
  id: string;
  name: string;
  pct: number;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  minNights: number;
  dayType: RatePromoDayType;  // fds = SEX/SÁB · week = DOM–QUI
}

/**
 * Uma condição de pagamento oferecida na proposta pública. `discountPct` > 0
 * recalcula o total EXIBIDO ao cliente (o "Pix à vista com 5%") — é
 * informativo: quem fecha o valor do orçamento continua sendo a recepção.
 */
export interface RatePaymentOption {
  id: string;
  label: string;
  label_en?: string | null;
  label_es?: string | null;
  /** Desconto sobre o total, em % (0 = sem desconto). */
  discountPct: number;
  order: number;
}

/** Config comercial do tarifário — 1 linha por propriedade. */
/**
 * Idade de gratuidade dos acompanhantes — regra da casa, não constante de código.
 *
 * Quem está na faixa isenta **não entra no preço**, mas **ocupa vaga como
 * qualquer pessoa**: a capacidade da acomodação conta cabeças, não pagantes.
 * A mesma política classifica bebê × criança na reserva que chega do canal.
 */
export interface GuestAgePolicy {
  /** Isento até esta idade, inclusive (5 = 0 a 5 anos não paga). */
  freeUpToAge: number;
}

export const DEFAULT_AGE_POLICY: GuestAgePolicy = {
  freeUpToAge: 5,   // 0 a 5 isento; a partir de 6 paga
};

export interface RateSettings {
  propertyId: string;
  petFee: number;      // por pet, por diária
  /** Idade de gratuidade. Ausente = DEFAULT_AGE_POLICY. */
  agePolicy?: GuestAgePolicy | null;
  fluctuations: RateFluctuation[];
  discounts: RateDiscount[];
  promos: RatePromo[];
  /** @deprecated Migrado para `CabinCategory.siteUrl`; mantido só para linhas antigas. */
  categoryLinks: Record<string, string>;
  msgTemplate?: string | null;
  msgTemplate_en?: string | null;
  msgTemplate_es?: string | null;
  msgSingleTemplate?: string | null;
  msgSingleTemplate_en?: string | null;
  msgSingleTemplate_es?: string | null;
  eventTemplate?: string | null;
  eventTemplate_en?: string | null;
  eventTemplate_es?: string | null;
  /**
   * "O que está incluso" — texto que o cliente lê na proposta pública, acima
   * das regras da pousada. Uma linha por item (vira lista na tela).
   */
  inclusionsText?: string | null;
  inclusionsText_en?: string | null;
  inclusionsText_es?: string | null;
  /**
   * Condições de pagamento oferecidas no cadastro da proposta. Vazio/ausente
   * cai em DEFAULT_PAYMENT_OPTIONS (src/lib/rate-engine.ts).
   */
  paymentOptions?: RatePaymentOption[] | null;
  updatedAt?: Timestamp;
}

/** Parâmetros de um orçamento (tela Orçamento do tarifário). */
export interface RateQuoteInput {
  checkIn: string;     // YYYY-MM-DD
  checkOut: string;    // YYYY-MM-DD
  adults: number;
  children: number;    // pagantes
  babies: number;      // isentos
  pets: number;
  fluctuationPct: number;
  /**
   * Modo "Automática": ignora `fluctuationPct` e aplica, noite a noite, o %
   * da regra de `rate_fluctuations` que cobre cada noite (sem regra = 0%).
   */
  fluctuationAuto?: boolean;
  /** ids de RateDiscount marcados. */
  discountIds: string[];
  adhocValue: number;
  adhocType: 'pct' | 'brl';
  /**
   * EXCEÇÃO de ocupação: computa também as categorias que não têm preço para
   * este pax, usando a maior coluna de pax com preço (a Eco de 2 é cotada
   * para 3 pelo valor de 2). Off = comportamento normal, a categoria some.
   */
  allowOverCapacity?: boolean;
}

export type RateBreakdownKind = 'base' | 'fluct' | 'promo' | 'discount' | 'adhoc' | 'fee';

export interface RateBreakdownItem {
  label: string;
  value: number;       // negativo = desconto
  kind: RateBreakdownKind;
}

/** Resultado do orçamento para uma categoria de cabana. */
export interface RateQuoteCategory {
  categoryId: string;
  /** Nome comercial para exibição/mensagem (shortName ?? name). */
  category: string;
  nights: number;
  rawTotal: number;          // tabela pura + taxa pet (comparativo "de/por")
  finalTotal: number;        // com todos os ajustes
  avgNightly: number;
  breakdown: RateBreakdownItem[];
  /** nome da regra de calendário → nº de noites cobertas por ela. */
  periodNights: Record<string, number>;
  /** noites em que a tabela não tinha preço para esse pax (0 = ok). */
  daysWithoutPrice: number;
  /**
   * Só em cotação de EXCEÇÃO: a categoria não tem preço para o pax pedido e
   * o valor saiu da coluna de `pricedPax`. Ausente = ocupação normal.
   * `requestedPax` já vem limitado a MAX_PAX (grupo de 7+ aparece como 6).
   */
  overCapacity?: { requestedPax: number; pricedPax: number };
}

export interface RateQuoteResult {
  categories: RateQuoteCategory[];
  /** noites do intervalo sem NENHUMA regra de calendário (orçamento bloqueado). */
  uncoveredDates: string[];
  /** maior mínimo de diárias entre as regras tocadas. */
  minNightsRequired: number;
  nights: number;
  /** Média simples dos % de flutuação por noite (modo Automática exibe). */
  fluctuationAvgPct?: number;
}

/**
 * Uma ACOMODAÇÃO pedida dentro do orçamento — o hóspede pode querer 2 cabanas
 * de casal, ou 1 casal + 1 família, na MESMA negociação (um card só no funil).
 * Não confundir com `options`: essas são as cabanas OFERECIDAS para esta
 * acomodação, das quais o cliente escolhe UMA. O valor do orçamento é a soma
 * das acomodações.
 */
export interface RateQuoteRoom {
  /** id estável (uuid) — chave da escolha e da UI. */
  id: string;
  /** Rótulo livre ("Casal 1", "Família"); vazio = numeração automática. */
  label?: string | null;
  /**
   * Período PRÓPRIO desta acomodação (chegadas escalonadas: um casal entra
   * um dia antes). Ausente = herda o período do orçamento. As colunas raiz
   * checkIn/checkOut guardam o intervalo TOTAL (menor entrada → maior saída).
   */
  checkIn?: string | null;
  checkOut?: string | null;
  adults: number;
  children: number;
  babies: number;
  pets: number;
  /** Opções calculadas NO SERVIDOR para o pax desta acomodação. */
  options: RateQuoteCategory[];
  /** Categoria escolhida para esta acomodação (categoryId). */
  selectedCategory?: string | null;
  /**
   * Preço oferecido POR CABANA nesta acomodação: `categoryId → valor`.
   * O tarifário calcula tudo (flutuação, promoções, descontos); o vendedor
   * pode baixar o preço de uma cabana específica sem mexer nas outras. Na
   * proposta, a opção com preço menor mostra o valor calculado riscado.
   * Vazio = vale o valor do tarifário.
   */
  priceOverrides?: Record<string, number> | null;
  /**
   * ENTRADA de save, não campo persistido: quais categoryId o vendedor
   * marcou pra oferecer nesta acomodação. O servidor filtra `options` por
   * essa lista antes de gravar — depois de salvo, `options` (as chaves dela)
   * já É o registro do que foi oferecido; não há necessidade de reler isso.
   * Ausente = oferece tudo o que o tarifário calculou (chamador antigo).
   */
  includedCategoryIds?: string[] | null;
  /**
   * EXCEÇÃO de ocupação liberada NESTA acomodação: as cabanas sem preço para
   * o pax pedido entram em `options`, cada uma marcada por `overCapacity`.
   * Quem grava é só o servidor, e só quando a exceção produziu opção.
   */
  allowOverCapacity?: boolean;
  /** Justificativa da exceção — obrigatória; vai para a timeline e a auditoria. */
  overCapacityReason?: string | null;
}

// ==========================================
// MÓDULO CRM (compartilhado: orçamentos + casamentos)
// ==========================================

/** Canal de origem de lead. `id` é slug estável (agrupa KPI); `label` é livre. */
export interface CrmChannel {
  id: string;
  label: string;
}

/** Lista padrão — substituível por propriedade em `settings.crmChannels`. */
export const DEFAULT_CRM_CHANNELS: CrmChannel[] = [
  { id: 'whatsapp',  label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'site',      label: 'Site' },
  { id: 'telefone',  label: 'Telefone' },
  { id: 'booking',   label: 'Booking' },
  { id: 'airbnb',    label: 'Airbnb' },
  { id: 'indicacao', label: 'Indicação' },
  { id: 'balcao',    label: 'Balcão' },
  { id: 'agencia',   label: 'Agência' },
  { id: 'evento',    label: 'Evento/Casamento' },
  { id: 'outro',     label: 'Outro' },
];

/** Prazos padrão dos orçamentos de reserva (escala menor que casamentos). */
export const DEFAULT_QUOTE_LEAD: WeddingLeadSettings = {
  followUpDays: 3,
  expiryDays: 30,
  renewDays: 30,
};

export type CrmEntityType = 'quote' | 'wedding';

export type CrmInteractionKind =
  | 'created' | 'note' | 'stage_change' | 'follow_up' | 'sent'
  | 'converted' | 'stay_linked' | 'lost' | 'reopened'
  | 'value_change' | 'guest_linked' | 'alarm_done'
  /** O cliente aceitou a proposta na página pública. */
  | 'client_accepted'
  /** O cliente preencheu o cadastro do titular na proposta pública. */
  | 'client_intake';

/** Uma linha do histórico comercial — contato, troca de etapa, envio, perda… */
export interface CrmInteraction {
  id: string;
  propertyId: string;
  entityType: CrmEntityType;
  entityId: string;
  kind: CrmInteractionKind;
  note?: string | null;
  /** {from,to} em stage_change · {stayId} · {reason} · {followUpAt,expiresAt} */
  payload: Record<string, unknown>;
  actorId?: string | null;
  actorName?: string | null;
  createdAt: Timestamp;
}

/**
 * Lead normalizado para o Hub Comercial: os dois funis (orçamentos e
 * casamentos) viram esta forma única no pipeline — a normalização acontece no
 * service (CrmService.getPipeline), nunca no client.
 */
export interface CrmLead {
  entityType: CrmEntityType;
  id: string;
  /** Nome do cliente ou "Noiva & Noivo". */
  title: string;
  phone?: string | null;
  email?: string | null;
  /** @usuário do Instagram (orçamentos) — meio de contato de quem chega por DM. */
  instagram?: string | null;
  /** CPF/doc do lead (orçamentos) — habilita criar a ficha de hóspede. */
  document?: string | null;
  /** FNRH ID do tipo de documento (orçamentos) — default CPF. */
  documentType?: string | null;
  source?: string | null;
  /** Estágio bruto da entidade de origem (RateQuoteStatus ou WeddingStatus). */
  stage: string;
  value: number;
  /** true = "a partir de" (mínimo do snapshot, sem opção fechada). */
  valueApproximate: boolean;
  /** Data de referência: check-in (orçamento) ou data do casamento. */
  dateRef: string;
  followUpAt?: string | null;
  expiresAt?: string | null;
  lostReason?: string | null;
  guestId?: string | null;
  stayId?: string | null;
  weddingId?: string | null;
  /** Valor negociado manualmente (orçamentos) — quando presente, é o `value`. */
  negotiatedValue?: number | null;
  /** Cliente aceitou a proposta na página pública — a recepção precisa agir. */
  acceptedAt?: Timestamp | null;
  /** Cliente preencheu o cadastro do titular na proposta (ver QuoteIntake). */
  intakeAt?: Timestamp | null;
  createdAt: Timestamp;
}

export type CrmAlarmKind = 'follow_up' | 'payment' | 'reminder' | 'other';

/**
 * Alarme comercial (follow-up, cobrança, lembrete) — vale para lead ATIVO ou
 * FECHADO (cobrança é pós-fechamento). Fila no CRM + badge no menu; sem push.
 */
export interface CrmAlarm {
  id: string;
  propertyId: string;
  entityType: CrmEntityType;
  entityId: string;
  /** Snapshot do nome do lead — a fila não depende do recorte de 60d do pipeline. */
  entityLabel: string;
  kind: CrmAlarmKind;
  title: string;
  note?: string | null;
  dueAt: string;            // YYYY-MM-DD
  dueTime?: string | null;  // HH:mm — só exibição
  done: boolean;
  doneAt?: Timestamp | null;
  doneBy?: string | null;
  doneByName?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: Timestamp;
  /**
   * true = linha derivada de parcela vencida (não existe em crm_alarms):
   * concluir marca a parcela como paga; não dá para excluir pela fila.
   */
  virtual?: boolean;
}

export type WaitlistStatus = 'waiting' | 'contacted' | 'converted' | 'archived';

/**
 * Lista de espera para períodos concorridos (feriados, pousada exclusiva).
 * Simples de propósito: nome + contato + período. Conversão abre a
 * calculadora pré-preenchida e só marca 'converted' quando o orçamento salva.
 */
export interface WaitlistEntry {
  id: string;
  propertyId: string;
  name: string;
  /** Só dígitos — padrão guests.phone / contacts.id. */
  phone?: string | null;
  email?: string | null;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  guests?: number | null;
  notes?: string | null;
  /** Canal de origem — slug de settings.crmChannels. */
  source?: string | null;
  status: WaitlistStatus;
  /** Orçamento gerado na conversão — rastro, sem FK dura. */
  quoteId?: string | null;
  contactedAt?: Timestamp | null;
  convertedAt?: Timestamp | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: Timestamp;
}

/** Motivos de perda de ORÇAMENTO (casamentos têm a própria lista). */
export const CRM_LOST_REASONS_QUOTE = [
  'Preço acima do orçamento',
  'Sem disponibilidade nas datas',
  'Mudou as datas',
  'Reservou em outro lugar',
  'Sem retorno do cliente',
  'Desistiu da viagem',
] as const;

/** Disponibilidade real por categoria no intervalo consultado. */
export interface RateAvailability {
  total: number;
  free: number;
  freeCabins: string[];      // nomes das cabanas livres
}

/** Uma noite da estadia na visão financeira (painel de diárias). */
export interface LodgingNight {
  /** YYYY-MM-DD — a noite (data de entrada dela). */
  date: string;
  /** Valor efetivo: override quando houver, senão o rateio do total. */
  value: number;
  /** Valor que sairia do rateio, sem override (para mostrar "de/por"). */
  baseValue: number;
  /** Há valor negociado para esta noite. */
  overridden: boolean;
  /** Já lançada no fólio. */
  posted: boolean;
  /** id do item no fólio, quando lançada. */
  folioItemId?: string | null;
  /** A noite já terminou (elegível para lançamento). */
  due: boolean;
}

/** Estágio do funil de vendas de um orçamento salvo. */
export type RateQuoteStatus = 'open' | 'sent' | 'negotiating' | 'won' | 'lost';

/** Endereço do titular como o cliente preenche na proposta (começa pelo CEP). */
export interface QuoteIntakeAddress {
  /** ISO 3166-1 alpha-2 — 'BR' liga a busca por CEP; fora dele o endereço é livre. */
  country: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  /** UF (BR) ou província/estado no formato do país. */
  state: string;
}

/** Uma pessoa da reserva além do titular. Nome e nascimento são opcionais. */
export interface QuoteIntakeCompanion {
  /** Acomodação a que pertence (`RateQuoteRoom.id`) — a reserva pode ter várias. */
  roomId: string;
  kind: 'adult' | 'child' | 'baby';
  fullName?: string;
  birthDate?: string;   // YYYY-MM-DD
}

/**
 * CADASTRO DO TITULAR — o que o CLIENTE preencheu na proposta pública depois
 * de aceitar (/cotacao/<id>), no lugar da mensagem que a recepção mandava no
 * WhatsApp. Vive em `rate_quotes.intake`: a página é anônima e não escreve em
 * `guests`; a ficha e a estadia são pré-preenchidas na conversão, por quem
 * tem sessão.
 *
 * `RateQuoteRecord.intakeAt` é a trava: preenchido, o link não aceita novo
 * envio — correção é da recepção, pelo drawer do lead.
 */
export interface QuoteIntake {
  holder: {
    fullName: string;
    /** FNRH ID (CPF/PASSAPORTE/RG/DNI/CNH/OUTRO). */
    documentType: string;
    document: string;
    birthDate?: string;    // YYYY-MM-DD — opcional
    email: string;
    /** Só dígitos, COM DDI (55…) — mesmo formato de `Guest.phone`. */
    phone: string;
    address: QuoteIntakeAddress;
  };
  companions: QuoteIntakeCompanion[];
  vehiclePlate?: string;
  /** Condição escolhida — informativa: quem fecha o valor é a recepção. */
  payment?: {
    optionId: string;
    label: string;
    discountPct: number;
    /** Total exibido na tela no momento do envio (com o desconto aplicado). */
    valueAtSubmit: number;
  };
  pets?: PetDetails[];
  /** Cliente informou pet numa cotação SEM pet — a diária muda de preço. */
  petsNotQuoted?: boolean;
  notes?: string;
  /** Prova do consentimento — mesma lógica do aceite das regras. */
  consent: {
    privacyAccepted: boolean;
    /** Tamanho do texto vigente: identifica a versão sem guardar o texto. */
    privacyLength?: number | null;
    at: Timestamp;
    ip?: string | null;
    userAgent?: string | null;
  };
  submittedAt: Timestamp;
  /** Correção feita pela recepção no drawer (o link nunca reabre). */
  editedBy?: { id: string; name: string; at: Timestamp };
}

/**
 * Orçamento salvo no funil (CRM leve): dados do cliente são todos opcionais —
 * é um lead. `guestId` liga ao hóspede (guests.id = documento normalizado),
 * `stayId` à estadia criada na conversão. `snapshot` congela os preços
 * calculados no momento (tabelas mudam; o valor prometido não).
 */
export interface RateQuoteRecord {
  id: string;
  propertyId: string;
  // Cliente (lead)
  clientName?: string | null;
  clientDocument?: string | null;
  /** FNRH ID do tipo de documento (CPF/PASSAPORTE/RG/DNI/CNH/OUTRO) — default CPF. */
  clientDocumentType?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  /** Idioma falado pelo hóspede — escolhido pelo vendedor no wizard. Rege a
   *  proposta pública e o template de WhatsApp copiado. Default 'pt'. */
  clientLanguage?: 'pt' | 'en' | 'es' | null;
  /**
   * @usuário do Instagram. Lead que chega por DM não tem telefone nem e-mail —
   * este campo vale como meio de contato no wizard (telefone, e-mail OU
   * Instagram). Guardado sem o '@'.
   */
  clientInstagram?: string | null;
  guestId?: string | null;
  stayId?: string | null;
  weddingId?: string | null;
  /** Canal de origem do lead — slug de `settings.crmChannels`. */
  source?: string | null;
  // Parâmetros da consulta
  checkIn: string;           // YYYY-MM-DD
  checkOut: string;          // YYYY-MM-DD
  adults: number;
  children: number;
  babies: number;
  pets: number;
  fluctuationPct: number;
  /**
   * Salvo em modo "Automática" — reabre em auto; `fluctuationPct` guarda a
   * média efetiva do período (exibição/histórico).
   */
  fluctuationAuto?: boolean;
  discountIds: string[];
  adhocValue: number;
  adhocType: 'pct' | 'brl';
  /**
   * Acomodações pedidas (1..N). Presente nos orçamentos criados a partir da
   * fase 3; nos antigos é undefined e vale o par snapshot/selectedCategory.
   * As colunas raiz (adults/children/…, snapshot, selectedCategory,
   * finalValue) espelham a acomodação 1 — é o que mantém as telas legadas
   * funcionando.
   */
  rooms?: RateQuoteRoom[] | null;
  // Resultado congelado (espelho da acomodação 1 quando há `rooms`)
  snapshot: RateQuoteCategory[];
  selectedCategory?: string | null;
  finalValue?: number | null;
  /**
   * Valor fechado na conversa (desconto, condição especial) — vence a tabela
   * em resolveQuoteValue. Editável pela recepção COM auditoria (value_change).
   */
  negotiatedValue?: number | null;
  /** Quando o cliente aceitou a proposta na página pública /cotacao/[id]. */
  acceptedAt?: Timestamp | null;
  /** Cadastro do titular preenchido pelo cliente na proposta (ver QuoteIntake). */
  intake?: QuoteIntake | null;
  /** Quando o cadastro chegou. Preenchido = link travado para novos envios. */
  intakeAt?: Timestamp | null;
  // Funil
  status: RateQuoteStatus;
  lostReason?: string | null;
  lostAt?: Timestamp | null;
  /** 1ª vez que a cotação foi enviada ao cliente. */
  sentAt?: Timestamp | null;
  /** Próximo contato com o cliente (YYYY-MM-DD). Só sinaliza. */
  followUpAt?: string | null;
  /** Validade da negociação (YYYY-MM-DD): vencida vira 'lost' pelo cron. */
  expiresAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}


// =====================================================================
// --- INTEGRAÇÃO HSYSTEM (HUNIT / HBOOK / HPRICE) ---
// =====================================================================

/**
 * Configuração pública do módulo (vive em `properties.settings.hsystemConfig`;
 * o flag do módulo é `settings.hasHsystem`). Credenciais (userName/password do
 * HUNIT) ficam no cofre `property_secrets` — nunca aqui.
 */
export interface HsystemConfig {
  /**
   * shadow = espelha reservas SEM confirmar recebimento e SEM enviar
   * disponibilidade (HMAX segue como PMS oficial da fila).
   * active = fluxo completo (confirma + envia disponibilidade) — sandbox de
   * homologação hoje; produção só no evento de troca de PMS.
   */
  mode: 'shadow' | 'active';
  /** Código do hotel no HUNIT (não é segredo — segredo é user/senha). */
  hotelId: string;
  /** roomTypeId do HUNIT → categoryId do AURA (cabin_categories). */
  categoryMap: Record<string, string>;
  /** Envia disponibilidade no ciclo do cron (só tem efeito em mode=active). */
  pushAvailability: boolean;
  /** Janela do envio de disponibilidade em dias (máx. 730 — limite do HUNIT é 2 anos). */
  horizonDays: number;
  /** Portais tratados como motor próprio (automações de WhatsApp ligadas). Default [27] = HBOOK. */
  hbookPortalIds: number[];
}

/** Linha de `hsystem_reservations` — espelho de uma reserva recebida do HUNIT. */
export interface HsystemReservationRecord {
  propertyId: string;
  locatorId: string;
  portalId?: number | null;
  portalName?: string | null;
  channelReservationId?: string | null;
  status?: string | null;            // new | modify | cancel (último visto)
  payload?: Record<string, unknown> | null;
  contentHash?: string | null;
  guestName?: string | null;
  checkIn?: string | null;           // YYYY-MM-DD
  checkOut?: string | null;          // YYYY-MM-DD
  totalValue?: number | null;
  collectType?: string | null;       // HotelCollect | CanalCollect
  paymentType?: number | null;
  stayGroupId?: string | null;
  stayIds: string[];
  action?: HsystemReservationAction | null;
  actionDetail?: string | null;
  error?: string | null;
  receivedAt: Timestamp;
  processedAt?: Timestamp | null;
  confirmedAt?: Timestamp | null;    // nunca preenchido em modo sombra
  updatedAt: Timestamp;
}

export type HsystemReservationAction =
  | 'created' | 'updated' | 'cancelled' | 'skipped' | 'needs_attention' | 'failed';

/** Linha de `hsystem_sync_log`. */
export interface HsystemSyncLogEntry {
  id: string;
  propertyId: string;
  kind: 'bookings' | 'availability' | 'kpi' | 'test';
  ok: boolean;
  itemCount: number;
  detail?: Record<string, unknown> | null;
  error?: string | null;
  startedAt: Timestamp;
  finishedAt?: Timestamp | null;
}

/** Combinação quarto × tarifa devolvida pelo roomrate/read do HUNIT (p/ UI de mapeamento). */
export interface HunitRoomRate {
  id: string;
  roomTypeId: string;
  name: string;
  isActive: boolean;
  rateTypeId?: string | null;
  isChildRoomRate?: boolean;
  masterRoomRateId?: string | null;
  masterRoomRate?: string | null;
}

// ==========================================
// MÓDULO GUARITA / ESTACIONAMENTO
// ==========================================

/** O que o veículo é para a pousada — decide se paga e o que o painel mostra. */
export type VehicleKind = 'guest' | 'visitor' | 'supplier' | 'staff' | 'customer';
/** `whitelist` nunca paga; `blacklist` dispara alerta na entrada. */
export type VehicleStatus = 'normal' | 'whitelist' | 'blacklist';
export type ParkingPaymentMethod = 'credit' | 'debit' | 'pix' | 'cash';

/**
 * Cadastro de placas — permanente, não diário.
 *
 * Responde "de quem é esse carro?" sem ninguém redigitar: a placa do hóspede
 * entra pelo pré-check-in (`stays.vehiclePlate`) e a do funcionário pelo
 * cadastro dele.
 */
export interface Vehicle {
  id: string;
  propertyId: string;
  /** SEMPRE normalizada: maiúscula, sem hífen nem espaço. */
  plate: string;
  model?: string | null;
  color?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** Consentimento para contato de marketing — o uso operacional não depende dele. */
  marketingOptIn?: boolean;
  kind: VehicleKind;
  guestId?: string | null;
  staffId?: string | null;
  supplierId?: string | null;
  status: VehicleStatus;
  statusReason?: string | null;
  statusBy?: string | null;
  statusByName?: string | null;
  statusAt?: Timestamp | null;
  notes?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Tarifa de uma data. `closed` = não abriu (≠ tarifa zero). */
export interface ParkingRate {
  propertyId: string;
  date: string;            // YYYY-MM-DD
  amount: number;
  closed: boolean;
  setBy?: string | null;
  setByName?: string | null;
  setAt: Timestamp;
}

/** Turno numerado: quem abre raramente é quem fecha. */
export interface ParkingShift {
  id: string;
  propertyId: string;
  number: number;
  status: 'open' | 'closed';
  openedAt: Timestamp;
  openedBy?: string | null;
  openedByName?: string | null;
  closedAt?: Timestamp | null;
  closedBy?: string | null;
  closedByName?: string | null;
  /** Congelado no fechamento — turno fechado não se recalcula. */
  summary?: ParkingShiftSummary | null;
  notes?: string | null;
}

export interface ParkingShiftSummary {
  total: number;
  paidCount: number;
  byMethod: Record<string, { count: number; total: number }>;
  freeByKind: Record<string, number>;
  stillInside: number;
}

/** Entrada (e saída) de um veículo. */
export interface VehicleMovement {
  id: string;
  propertyId: string;
  vehicleId?: string | null;
  /** Desnormalizada: o histórico não muda se o cadastro for corrigido depois. */
  plate: string;
  kind: VehicleKind;
  stayId?: string | null;
  enteredAt: Timestamp;
  exitedAt?: Timestamp | null;
  amount: number;
  paymentMethod?: ParkingPaymentMethod | null;
  cardBrand?: string | null;
  /** Número da transação do cartão — pode entrar depois, mas não passa do fechamento. */
  nsu?: string | null;
  shiftId?: string | null;
  registeredBy?: string | null;
  registeredByName?: string | null;
  exitBy?: string | null;
  exitByName?: string | null;
  notes?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // ── Virtuais (montados na leitura, não persistem) ──
  vehicle?: Vehicle | null;
  guestName?: string | null;
  cabinName?: string | null;
}

/** O que o app responde quando o guarita digita uma placa. */
export interface PlateLookup {
  plate: string;
  vehicle: Vehicle | null;
  /** De onde veio o palpite quando não há cadastro ainda. */
  source: 'vehicle' | 'stay' | 'staff' | 'none';
  kind: VehicleKind;
  status: VehicleStatus;
  statusReason?: string | null;
  guestName?: string | null;
  cabinName?: string | null;
  stayId?: string | null;
  checkOut?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  /** Fornecedor vinculado no cadastro da placa (tabela `suppliers`). */
  supplierName?: string | null;
  /** Movimento em aberto: este carro já está no pátio. */
  openMovement?: VehicleMovement | null;
  /** Quantas vezes já entrou (histórico). */
  visitCount?: number;
}
