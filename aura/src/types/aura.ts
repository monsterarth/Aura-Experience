// src/types/aura.ts

export type Timestamp = any; // Firestore ServerTimestamp

export type UserRole = 
  | 'super_admin' 
  | 'admin' 
  | 'reception' 
  | 'maintenance' 
  | 'governance' 
  | 'marketing' 
  | 'kitchen';

// --- ENTIDADE PROPRIEDADE ---
export interface Property {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
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
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  allowedSetups: string[];
  currentStayId?: string;
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
  status: 'pending' | 'pre_checkin_done' | 'active' | 'finished' | 'cancelled';
  automationFlags: {
    send48h: boolean;
    send24h: boolean;
    preCheckinSent: boolean;
    remindersCount: number;
  };
  
  createdAt: Timestamp;
}

// --- MENSAGERIA ---
export interface WhatsAppMessage {
  id: string;
  propertyId: string;
  stayId: string;
  to: string;
  body: string;
  status: 'queued' | 'sent' | 'failed';
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