// src/types/aura.ts

export type Timestamp = any; // Firestore ServerTimestamp

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
  | 'porter';    // Porteiro (Operacional Mobile)

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
  theme: PropertyTheme  ;
  settings: {
    hasBreakfast: boolean;
    hasKDS: boolean;
    whatsappEnabled: boolean;
    whatsappConfig?: {
      apiUrl: string;
      token: string;
    }
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
    type: 'CPF' | 'Passaporte' | 'DNI';
    number: string;
  };
  birthDate: string;
  gender: 'M' | 'F' | 'Outro';
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
  };
  allergies: string[];
  updatedAt: Timestamp;
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
  allowedSetups: string[];
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
}


// ==========================================
// MÓDULO DE GOVERNANÇA E CONSUMO
// ==========================================

// --- CONSUMO (Conta/Folio da Estadia) ---
// Sub-coleção: properties/{propertyId}/stays/{stayId}/folio
export interface FolioItem {
  id: string;
  status:'pending' | 'paid';
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
  cabinId: string;
  stayId?: string; // Para limpezas diárias vinculadas a uma estadia ativa
  type: 'turnover' | 'daily'; // Turnover = Faxina de Troca | Daily = Arrumação
  status: 'pending' | 'in_progress' | 'waiting_conference' | 'completed' | 'cancelled';
  
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
  
  observations?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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

// Categoria dinâmica para BI (Business Intelligence)
export type SurveyCategory = 'governance' | 'reception' | 'comfort' | 'breakfast' | 'general';

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  question: { pt: string; en: string; es: string }; // Suporte a hóspedes gringos
  options?: { pt: string; en: string; es: string }[]; // Para múltipla escolha
  category: SurveyCategory;
  required: boolean;
  order: number;
}

// --- TEMPLATE DA PESQUISA ---
// Coleção: properties/{propertyId}/survey_templates
export interface SurveyTemplate {
  id: string;
  propertyId: string;
  title: string;
  active: boolean;
  questions: SurveyQuestion[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  accessCode: string;

  
  // Datas e Logística
  checkIn: Timestamp;
  checkOut: Timestamp;
  expectedArrivalTime?: string;
  vehiclePlate?: string;
  roomSetup: 'double' | 'twin' | 'triple' | 'other';
  roomSetupNotes?: string;

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
  travelReason: 'Turismo' | 'Negocios' | 'Congresso' | 'Saude' | 'Outros';
  transportation: 'Carro' | 'Onibus' | 'Avião' | 'Navio' | 'Outro';

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
  };

  housekeepingItems?: { id: string; label: string }[];
  hasOpenFolio?: boolean; // Flag para o ícone de alerta
  
  createdAt: Timestamp;
}

// --- MENSAGERIA ---
export interface WhatsAppMessage {
  id: string;
  propertyId: string;
  stayId: string;
  to: string;
  body: string;
status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'; // Atualizado para suportar a UI
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
    | 'CREATE_STAY' | 'COMPLETE_STAY' | 'STAY_GROUP_CREATE';
  entity: 'STAY' | 'GUEST' | 'CABIN' | 'USER' | 'PROPERTY' | 'MESSAGE' | 'STOCK';
  entityId: string;
  oldData?: any;
  newData?: any;
  timestamp: Timestamp;
  details: string;
}

// --- STAFF ---
export interface Staff {
  id: string;
  propertyId: string | null;
  fullName: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: Timestamp;
}