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

// --- ENTIDADE PROPRIEDADE ---
export interface Property {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  theme: PropertyTheme;
  settings: {
    hasBreakfast: boolean;
    hasKDS: boolean;
    hasStock?: boolean;          // módulo Compras & Estoque (default: habilitado; off só se === false)
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

    // Avaliações de área (mapa): visibilidade pública opt-in (padrão privado/só equipe).
    // Quando public=true, reviews passam por moderação antes de aparecer aos hóspedes.
    areaReviews?: { public?: boolean };

    // NOVO: Configurações do Módulo de F&B
    fbSettings?: FBSettings;

    // Domínio personalizado para o portal do hóspede (ex: aura.fazendadorosa.com.br)
    customDomain?: string;

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

// --- ENTIDADE CABANA ---
export interface Cabin {
  id: string;
  propertyId: string;
  number: string;     // Ex: "01"
  category: string;   // Ex: "Praia 2 dormitórios"
  name: string;       // Gerado: "01 - Praia 2 dormitórios"
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
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
  mapPin?: { lat: number; lng: number; pixelX?: number; pixelY?: number }; // posição GPS + pixel na imagem ilustrada
  pinColor?: string;                                                    // cor (hex) do pin na UI
  pinIcon?: string;                                                     // emoji ou nome de ícone do pin
  amenities?: string[];                                                 // comodidades da área
  photos?: string[];                                                   // galeria de fotos da área
  createdAt?: Timestamp;
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
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
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
  category: 'minibar' | 'restaurant' | 'services' | 'other';
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
    highlights?: string[];  // ids/labels dos chips escolhidos
    commentShared?: boolean; // intenção de publicar no Google (best-effort)
  };

  createdAt: Timestamp;
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
  hasPet: boolean;
  petDetails?: {
    name: string;
    breed?: string;
    species: 'Cachorro' | 'Gato' | 'Outro';
    weight: number; // Limite de 15kg
  };

  // Reserva interna / uso da casa
  internalUse?: boolean;   // true → ocupação interna (manutenção, família, bloqueio), não é cliente
  internalLabel?: string;  // rótulo livre quando não há hóspede (ex: "Manutenção cabana 5")

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
  billClosedAt?: string;          // Timestamp do encerramento manual da conta (zeriza aba pendente)
  lostItemsDescription?: string;
  lostItemsPhoto?: string;
  lostItemsReportedAt?: string;
  lostItemsReportedBy?: string;
  loanedItems?: string;           // Lista de objetos emprestados (preenchida pela recepção no checkout)
  loanedItemsChecked?: boolean;   // true após a camareira confirmar devolução
  loanedItemsCheckedAt?: string;

  cestaBreakfastEnabled?: boolean;

  // DND — Não Perturbe
  dnd_enabled?: boolean;
  dnd_until?: string; // ISO timestamp

  // Integração Chatwoot
  chatwootConvId?: number; // ID da conversa proativa no Chatwoot

  // Chave da acomodação no momento do check-out
  keyLocation?: 'reception' | 'cabin' | 'unknown';

  createdAt: Timestamp;
}

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
  | 'custom_scheduled';

// --- REGRAS DE AUTOMAÇÃO (Ligadas/Desligadas pela Pousada) ---
// Coleção: properties/{propertyId}/automation_rules
export interface AutomationRule {
  id: AutomationTriggerEvent;
  propertyId: string;
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
  | 'PURCHASE_CREATED' | 'PURCHASE_RECEIVED' | 'PURCHASE_CANCELLED'
  | 'SUPPLIER_CREATED' | 'SUPPLIER_UPDATED' | 'SUPPLIER_DELETED'
  | 'ASSET_CREATED' | 'ASSET_UPDATED' | 'ASSET_DISPOSED'
  | 'INVENTORY_OPENED' | 'INVENTORY_CLOSED'
  | 'CRON_STOCK_LOW' | 'CRON_STOCK_EXPIRY' | 'CRON_ASSET_DEPRECIATION'
  | 'STRUCTURE_REVIEW_LOW';
  entity: 'STAY' | 'GUEST' | 'CABIN' | 'USER' | 'PROPERTY' | 'MESSAGE' | 'STOCK' | 'STRUCTURE' | 'STRUCTURE_BOOKING' | 'STRUCTURE_REVIEW' | 'MAINTENANCE' | 'EVENT' | 'CONCIERGE' | 'FB_ORDER' | 'CONTACT' | 'AUTOMATION' | 'BREAKFAST' | 'CRON' | 'SUPPLIER' | 'ASSET' | 'PURCHASE' | 'INVENTORY';
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

export type ContactContextStatus = 'active' | 'pending' | 'past' | 'none';

export interface ContactContext {
  status: ContactContextStatus;
  stayId?: string;
  guestName?: string;
  cabinName?: string;
  checkIn?: Date;
  checkOut?: Date;
  message: string; // Ex: "Hospedado na Cabana 01 (Check-out amanhã)"
  /** Populated when multiple guests share the same phone number */
  allContexts?: ContactContext[];
}

// --- STAFF ---
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
  secondaryRoles?: UserRole[];
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
  productId?: string | null;     // vínculo com produto do estoque (Fase 3) — baixa no consumo
  createdAt: Timestamp;
  updatedAt: Timestamp;
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

export type WeddingStatus = 'tentative' | 'confirmed' | 'completed' | 'cancelled';

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

export interface WeddingInstallment {
  id: string;
  weddingId: string;
  label: string;
  value: number;
  paid: boolean;
  dueDate?: string;
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
  // Event
  weddingDate: string;       // YYYY-MM-DD
  ceremonyDetails?: string;  // e.g. "18h00 · Jardim das Oliveiras"
  receptionDetails?: string;
  guestCount: number;
  coordinator?: string;
  status: WeddingStatus;
  // Stay
  checkin: string;
  checkout: string;
  // Exclusivity
  exclusivity: boolean;
  cabinsOccupied?: number;
  // Financial
  contractTotal: number;
  depositValue?: number;
  depositPaid?: boolean;
  secondInstallmentValue?: number;
  secondInstallmentPaid?: boolean;
  // Notes
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / virtual
  vendors?: WeddingVendor[];
  cabinAssignments?: WeddingCabinAssignment[];
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
export type StockLocationType   = 'warehouse' | 'kitchen' | 'bar' | 'laundry' | 'cabin' | 'other';
export type StockUnit           = 'un' | 'kg' | 'g' | 'L' | 'ml' | 'cx' | 'pct' | 'par' | 'rolo';
export type StockMovementType   = 'entry' | 'exit' | 'transfer' | 'adjustment' | 'loss';
export type StockLossType       = 'expiry' | 'damage' | 'handling' | 'other';
export type StockReferenceType  = 'purchase' | 'consumption' | 'manual' | 'inventory' | 'concierge' | 'minibar' | 'fb';

export interface StockCategory {
  id: string;
  propertyId: string;
  name: string;
  name_en?: string;
  name_es?: string;
  icon?: string;            // emoji
  color?: string;
  appliesTo: StockCategoryScope;
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
  batchId?: string | null;        // usado a partir da Fase 2
  lossType?: StockLossType | null;
  referenceType: StockReferenceType;
  referenceId?: string | null;
  performedBy?: string;
  performedByName?: string;
  notes?: string;
  createdAt: Timestamp;
  // Joined / virtual
  product?: StockProduct;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
}

export interface StockSettings {
  propertyId: string;
  noTurnoverDays: number;         // janela "sem giro" (default 60)
  expiryAlertLeadDays: number;    // antecedência do alerta de validade (default 30)
  autoLossOnExpiry: boolean;
  defaultSaleLocationId?: string | null;  // local de onde concierge/F&B dão baixa (Fase 3)
  updatedAt: Timestamp;
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
  status: PurchaseStatus;
  isEmergency: boolean;
  orderDate?: string | null;      // YYYY-MM-DD
  receivedDate?: string | null;
  totalValue: number;
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

// ── Fase 1: Patrimônio ───────────────────────────────────────────────────────
export type AssetStatus = 'active' | 'maintenance' | 'inactive' | 'disposed' | 'written_off';
export type AssetDepreciationMethod = 'linear' | 'none';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Joined / computed
  category?: StockCategory;
  monthlyDepreciation?: number;
  accumulatedDepreciation?: number;
  bookValue?: number;             // valor contábil atual
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
