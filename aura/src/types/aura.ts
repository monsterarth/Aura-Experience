// src/types/aura.ts

export type Timestamp = string;

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'reception'
  | 'governance' // Governanta / Gestor do setor
  | 'maid'       // Camareira (Operacional Mobile)
  | 'maintenance'// Gestor de Manutenção
  | 'technician' // Técnico (Operacional Mobile)
  | 'kitchen'    // Gestor de Cozinha
  | 'waiter'     // Garçom (Operacional Mobile)
  | 'porter'     // Porteiro (Operacional Mobile)
  | 'houseman'   // Houseman (Operacional Mobile)
  | 'marketing'; // Marketing

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

    // NOVO: Configurações do Módulo de F&B
    fbSettings?: FBSettings;

    // Domínio personalizado para o portal do hóspede (ex: aura.fazendadorosa.com.br)
    customDomain?: string;
  };
  createdAt: Timestamp;
}

// --- ENTIDADE HÓSPEDE ---
export interface Guest {
  id: string;
  propertyId: string;
  fullName: string;
  nationality: string; // 'Brasil' por padrão
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type StructureVisibility = 'admin_only' | 'guest_request' | 'guest_auto_approve';

export interface Structure {
  id: string;
  propertyId: string;
  name: string;
  category: string; // e.g. 'spa', 'sport', 'leisure', 'service'
  description: string;
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
  housekeepingChecklist?: { id: string; label: string }[];
  messageTemplatePendingId?: string;
  messageTemplateConfirmedId?: string;
  messageTemplateCancelledId?: string;
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
  type: 'turnover' | 'daily' | 'custom'; // Turnover = Faxina de Troca | Daily = Arrumação | Custom = Personalizada
  status: 'pending' | 'in_progress' | 'waiting_conference' | 'completed' | 'cancelled' | 'paused' | 'skipped';
  paused_until?: string; // ISO timestamp — DND
  skippedAt?: string;   // ISO timestamp — when it was skipped (DND)
  guestName?: string;   // Denormalized guest name at time of skip

  // Controle de Pessoal
  assignedTo?: string[]; // Múltiplas camareiras
  conferredBy?: string; // ID da governanta que aprovou (se turnover)

  // Controle de Tempo (Cronômetro)
  startedAt?: Timestamp;
  finishedAt?: Timestamp;

  // Checklist Copiado do Padrão da Propriedade no momento da criação
  checklist: {
    id: string;
    label: string;
    checked: boolean;
  }[];

  routineId?: string; // ID da rotina que gerou esta tarefa (se aplicável)
  customLocation?: string; // Local livre (ex: "Recepção", "Banheiro Social")
  keyLocation?: 'reception' | 'cabin' | 'unknown';
  cabinChecked?: boolean;         // true após a camareira concluir a conferência (frigobar + chave + achados + empréstimos)
  observations?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- ROTINAS DE LIMPEZA ---
// Tabela: housekeeping_routines
export interface HousekeepingRoutine {
  id: string;
  propertyId: string;
  cabinId?: string;
  structureId?: string;
  customLocation?: string; // Ex: "Recepção", "Banheiro Social"
  type: 'daily' | 'custom';
  intervalDays: number;
  checklist: { id: string; label: string; checked: boolean }[];
  assignedTo: string[];
  observations?: string;
  active: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- TEMPLATES DE CHECKLIST ---
// Coleção: properties/{propertyId}/checklists
export interface ChecklistTemplate {
  id: string;
  propertyId: string;
  title: string; // Ex: "Limpeza Padrão - Praia 2 Dormitórios"
  type: 'turnover' | 'daily' | 'inspection';
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

  checklist: MaintenanceChecklistItem[];

  completion?: {
    resolved: boolean;
    needsCleaning: boolean;
    photoUrl?: string; // Vercel blob URL
    notes?: string;
  };

  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SurveyReward {
  hasReward: boolean;
  type: 'discount' | 'freebie' | 'points' | 'other' | '';
  description: string;
  description_en?: string;
  description_es?: string;
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
    npsScore?: number; // 0-10 (Se houver pergunta NPS)
    averageRating?: number; // 1-5 (Média de todas as perguntas de Rating)
    categoryRatings: Record<string, number>; // Ex: { governance: 4.5, reception: 5 }
    isDetractor: boolean; // Flag automática (NPS <= 6 ou Rating <= 2) para disparar alertas
  };

  createdAt: Timestamp;
}

// --- ENTIDADE ESTADIA ---
export interface Stay {
  id: string;
  propertyId: string;
  groupId?: string | null;
  guestId: string;
  cabinId: string;
  cabinHistory?: { cabinId: string; from: string; to: string }[];
  accessCode: string;

  cabinConfigs?: {
    cabinId: string;
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

  // Status
  status: 'pending' | 'pre_checkin_done' | 'active' | 'finished' | 'cancelled' | 'archived';
  automationFlags: {
    send48h: boolean;
    send24h: boolean;
    preCheckinSent: boolean;
    remindersCount: number;
    termsAccepted?: boolean;
  };

  housekeepingItems?: { id: string; label: string }[];
  hasOpenFolio?: boolean;
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
  | 'MESSAGE_SENT' | 'MESSAGE_FAILED' | 'MESSAGE_RESENT'
  | 'CHECKIN' | 'CHECKOUT'
  | 'USER_CREATE' | 'USER_UPDATE'
  | 'CREATE_STAY' | 'COMPLETE_STAY' | 'STAY_GROUP_CREATE'
  | 'STRUCTURE_CREATED' | 'STRUCTURE_UPDATED' | 'STRUCTURE_DELETED'
  | 'STRUCTURE_BOOKING_CREATED' | 'STRUCTURE_BOOKING_STATUS_CHANGED'
  | 'EVENT_CREATED' | 'EVENT_UPDATED' | 'EVENT_DELETED' | 'EVENT_PUBLISHED'
  | 'CONCIERGE_REQUESTED' | 'CONCIERGE_DELIVERED' | 'CONCIERGE_RETURNED' | 'CONCIERGE_LOST'
  | 'FB_ORDER_CREATED' | 'FB_ORDER_STATUS_CHANGED'
  | 'REASSIGN_GUEST';
  entity: 'STAY' | 'GUEST' | 'CABIN' | 'USER' | 'PROPERTY' | 'MESSAGE' | 'STOCK' | 'STRUCTURE' | 'STRUCTURE_BOOKING' | 'MAINTENANCE' | 'EVENT' | 'CONCIERGE' | 'FB_ORDER';
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
export type ConciergeRequestStatus = 'pending' | 'in_progress' | 'delivered' | 'returned' | 'lost';

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
  image_url?: string;
  active: boolean;
  availableForGuest: boolean;
  availableForMaid: boolean;
  order?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Itens do minibar/frigobar — catálogo global (cabinId = null) + overrides por cabana
export interface MinibarItem {
  id: string;
  cabinId: string | null; // null = item global da propriedade
  propertyId: string;
  name: string;       // PT
  name_en?: string;
  name_es?: string;
  price: number;
  stock: number;
  active: boolean;
  order?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Ajuste por cabana: sobrescreve active e/ou preço de um item global
export interface MinibarCabinOverride {
  id: string;
  itemId: string;
  cabinId: string;
  active: boolean;
  price: number | null; // null = usa o preço global
  updatedAt: Timestamp;
}

export interface ConciergeRequest {
  id: string;
  propertyId: string;
  stayId: string;
  cabinId?: string;
  itemId: string;
  quantity: number;
  status: ConciergeRequestStatus;
  requestedBy: 'guest' | 'maid';
  assignedTo?: string;
  assignedName?: string;
  total_price?: number;
  notes?: string;
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
