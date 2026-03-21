// src/components/admin/CommunicationCenter.tsx

"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { WhatsAppMessage, Contact, ContactContext, MessageTemplate } from "@/types/aura";
import { ContactService } from "@/services/contact-service";
import { AutomationService } from "@/services/automation-service";
import { Button } from "@/components/ui/button";
import {
  Search, Send, Clock, CheckCircle2,
  MapPin, Loader2, ArrowLeft, Plus, X, Bot, MessageCircle, Languages, Archive, Inbox,
  ChevronRight, ChevronLeft, FileText, Wifi, Key, User, CalendarRange, PanelRightClose, PanelRightOpen
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CommunicationCenterProps {
  propertyId: string;
}

// Interface que espelha a subcoleção mais leve "communications"
interface Communication {
  id: string; // phone number
  lastMessage: string;
  updatedAt: any;
  unread: number;
  archived?: boolean;
}

interface StayDetails {
  accessCode?: string;
  wifiSsid?: string;
  wifiPassword?: string;
}

interface MentionItem {
  type: 'variable' | 'template';
  label: string;
  searchKey: string;
  value: string;
}

interface MentionMenuState {
  open: boolean;
  query: string;
  items: MentionItem[];
  activeIndex: number;
}

const VARIABLE_CATALOG: { label: string; searchKey: string; placeholder: string }[] = [
  { label: "Nome do Hóspede",  searchKey: "nome",      placeholder: "{{guest_name}}" },
  { label: "Nome Completo",    searchKey: "nomecomp",  placeholder: "{{guest_full_name}}" },
  { label: "Cabana",           searchKey: "cabana",    placeholder: "{{cabin_name}}" },
  { label: "Check-in",         searchKey: "checkin",   placeholder: "{{checkin_date}}" },
  { label: "Check-out",        searchKey: "checkout",  placeholder: "{{checkout_date}}" },
  { label: "Código de Acesso", searchKey: "codigo",    placeholder: "{{access_code}}" },
  { label: "Wi-Fi (Rede)",     searchKey: "wifi",      placeholder: "{{wifi_ssid}}" },
  { label: "Wi-Fi (Senha)",    searchKey: "wifisenha", placeholder: "{{wifi_password}}" },
  { label: "Link do Portal",   searchKey: "portal",    placeholder: "{{portal_link}}" },
  { label: "Link da Pesquisa", searchKey: "pesquisa",  placeholder: "{{survey_link}}" },
];

export function CommunicationCenter({ propertyId }: CommunicationCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPhone = searchParams.get('phone');

  // Estados Base
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Controles de Interface
  const [activeTab, setActiveTab] = useState<'inbox' | 'archived'>('inbox');
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(urlPhone);

  // Ações
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [contactContext, setContactContext] = useState<ContactContext | null>(null);
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactData, setNewContactData] = useState({ name: "", phone: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});

  // Painel lateral direito
  const [showPanel, setShowPanel] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [stayDetails, setStayDetails] = useState<StayDetails | null>(null);

  // Menu de menção (%)
  const [mentionMenu, setMentionMenu] = useState<MentionMenuState>({
    open: false, query: '', items: [], activeIndex: 0
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionStartRef = useRef<number>(-1);

  const safeFormatDate = (timestamp: any, formatStr: string) => {
    try {
      if (!timestamp) return '';
      return format(new Date(timestamp), formatStr);
    } catch {
      return '';
    }
  };

  // 1. OUVINTE GLOBAL: Carrega Contatos e as Conversas Resumidas
  useEffect(() => {
    if (!propertyId) return;

    const fetchGlobal = async () => {
      const { data: cData } = await supabase.from('contacts').select('*').eq('propertyId', propertyId);
      setContacts(cData || []);

      const { data: commData } = await supabase.from('communications')
        .select('*')
        .eq('propertyId', propertyId)
        .order('updatedAt', { ascending: false });
      setCommunications((commData as any) || []);
      setLoading(false);
    };

    fetchGlobal();

    const globalChannel = supabase.channel('global-communications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `propertyId=eq.${propertyId}` }, fetchGlobal)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communications', filter: `propertyId=eq.${propertyId}` }, fetchGlobal)
      .subscribe();

    return () => { supabase.removeChannel(globalChannel); };
  }, [propertyId]);

  // 2. OUVINTE DE CHAT: Carrega as 50 mensagens mais recentes
  useEffect(() => {
    if (!propertyId || !selectedPhone) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      const { data, error } = await supabase.from('messages')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('contactId', selectedPhone)
        .order('createdAt', { ascending: false })
        .limit(50);

      if (error) console.error("Error fetching messages:", error);
      setMessages(data ? [...data].reverse() as any : []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };

    fetchMessages();

    const msgChannel = supabase.channel(`messages-${selectedPhone}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `contactId=eq.${selectedPhone}` }, fetchMessages)
      .subscribe();

    supabase.from('communications').update({ unread: 0 }).eq('id', selectedPhone).eq('propertyId', propertyId).then();

    return () => { supabase.removeChannel(msgChannel); };
  }, [propertyId, selectedPhone]);

  // 3. RAIO-X: Verifica o status de hospedagem do contato clicado
  useEffect(() => {
    async function loadContext() {
      if (selectedPhone && propertyId) {
        const ctx = await ContactService.resolveContactContext(propertyId, selectedPhone);
        setContactContext(ctx);
      } else {
        setContactContext(null);
      }
    }
    loadContext();
  }, [selectedPhone, propertyId]);

  // 4. TEMPLATES: Carrega templates de mensagem para o painel lateral
  useEffect(() => {
    if (!propertyId) return;
    setTemplateLoading(true);
    AutomationService.getTemplates(propertyId).then(data => {
      setTemplates(data);
      setTemplateLoading(false);
    });
  }, [propertyId]);

  // 5. STAY DETAILS: Carrega wi-fi e código de acesso da estadia ativa
  useEffect(() => {
    if (!contactContext?.stayId) {
      setStayDetails(null);
      return;
    }
    supabase.from('stays')
      .select('accessCode, cabins(wifi)')
      .eq('id', contactContext.stayId)
      .single()
      .then(({ data }) => {
        if (data) {
          const cabin = Array.isArray((data as any).cabins) ? (data as any).cabins[0] : (data as any).cabins;
          setStayDetails({
            accessCode: (data as any).accessCode,
            wifiSsid: cabin?.wifi?.ssid ?? undefined,
            wifiPassword: cabin?.wifi?.password ?? undefined,
          });
        }
      });
  }, [contactContext?.stayId]);

  // Resolve variáveis com dados reais do hóspede selecionado
  const resolveVariables = useCallback((text: string): string => {
    const contact = contacts.find(c => c.id === selectedPhone);
    const firstName = contact?.name?.split(' ')[0] ?? '';
    const fullName = contact?.name ?? '';
    const cabinName = contactContext?.cabinName ?? '';

    const checkInFormatted = contactContext?.checkIn
      ? (contactContext.checkIn instanceof Date ? contactContext.checkIn : new Date(contactContext.checkIn as any)).toLocaleDateString('pt-BR')
      : '';
    const checkOutFormatted = contactContext?.checkOut
      ? (contactContext.checkOut instanceof Date ? contactContext.checkOut : new Date(contactContext.checkOut as any)).toLocaleDateString('pt-BR')
      : '';

    const portalLink = `https://app.fazendadorosa.com.br/check-in/login`;
    const surveyLink = contactContext?.stayId
      ? `https://app.fazendadorosa.com.br/feedback/${contactContext.stayId}`
      : '';

    return text
      .replace(/{{guest_name}}/g, firstName)
      .replace(/{{guest_full_name}}/g, fullName)
      .replace(/{{cabin_name}}/g, cabinName)
      .replace(/{{checkin_date}}/g, checkInFormatted)
      .replace(/{{checkout_date}}/g, checkOutFormatted)
      .replace(/{{check_in}}/g, checkInFormatted)
      .replace(/{{check_out}}/g, checkOutFormatted)
      .replace(/{{access_code}}/g, stayDetails?.accessCode ?? '')
      .replace(/{{wifi_ssid}}/g, stayDetails?.wifiSsid ?? '')
      .replace(/{{wifi_password}}/g, stayDetails?.wifiPassword ?? '')
      .replace(/{{portal_link}}/g, portalLink)
      .replace(/{{survey_link}}/g, surveyLink);
  }, [contacts, selectedPhone, contactContext, stayDetails]);

  // Constrói os itens do menu %
  const buildMentionItems = useCallback((query: string): MentionItem[] => {
    const q = query.toLowerCase().replace(/\s/g, '');
    const items: MentionItem[] = [];

    VARIABLE_CATALOG.forEach(v => {
      if (!q || v.searchKey.includes(q) || v.label.toLowerCase().includes(q)) {
        const resolved = resolveVariables(v.placeholder);
        items.push({
          type: 'variable',
          label: v.label,
          searchKey: v.searchKey,
          value: resolved !== v.placeholder ? resolved : v.placeholder,
        });
      }
    });

    templates.forEach(t => {
      if (!q || t.name.toLowerCase().includes(q)) {
        items.push({
          type: 'template',
          label: t.name,
          searchKey: t.name.toLowerCase(),
          value: resolveVariables(t.body),
        });
      }
    });

    return items.slice(0, 12);
  }, [templates, resolveVariables]);

  // Insere item do menu % no textarea
  const insertMentionItem = useCallback((item: MentionItem | undefined) => {
    if (!item) return;
    const start = mentionStartRef.current;
    if (start === -1) return;

    const cursorPos = inputRef.current?.selectionStart ?? inputText.length;
    const before = inputText.slice(0, start);
    const after = inputText.slice(cursorPos);
    const newText = before + item.value + after;

    setInputText(newText);
    setMentionMenu(m => ({ ...m, open: false }));
    mentionStartRef.current = -1;

    setTimeout(() => {
      if (inputRef.current) {
        const newCursor = before.length + item.value.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }, [inputText]);

  // Handler de mudança no textarea (detecta %)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setInputText(val);

    const textBeforeCursor = val.slice(0, cursor);
    const lastPercent = textBeforeCursor.lastIndexOf('%');

    if (lastPercent !== -1) {
      const queryText = textBeforeCursor.slice(lastPercent + 1);
      if (!queryText.includes(' ')) {
        mentionStartRef.current = lastPercent;
        setMentionMenu({
          open: true,
          query: queryText,
          items: buildMentionItems(queryText),
          activeIndex: 0,
        });
        return;
      }
    }

    setMentionMenu(m => ({ ...m, open: false }));
  };

  // Handler de teclado no textarea
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionMenu(m => ({ ...m, activeIndex: Math.min(m.activeIndex + 1, m.items.length - 1) }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionMenu(m => ({ ...m, activeIndex: Math.max(m.activeIndex - 1, 0) }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMentionItem(mentionMenu.items[mentionMenu.activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionMenu(m => ({ ...m, open: false }));
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !mentionMenu.open) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedPhone || sending) return;

    setSending(true);
    try {
      const messageId = crypto.randomUUID();
      const contactId = selectedPhone;

      const messageData = {
        propertyId,
        contactId,
        stayId: contactContext?.stayId || null,
        to: contactId,
        body: inputText.trim(),
        isAutomated: false,
        status: 'pending',
        direction: 'outbound' as const,
        createdAt: new Date().toISOString(),
      };

      await supabase.from('messages').insert({ id: messageId, ...messageData });

      await supabase.from('communications').upsert({
        id: contactId,
        propertyId,
        lastMessage: inputText.trim(),
        updatedAt: new Date().toISOString(),
        archived: false
      }, { onConflict: 'id' });

      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          messageId,
          number: contactId,
          message: inputText.trim()
        })
      });

      if (!response.ok) throw new Error("Falha ao enviar");

      const resData = await response.json();

      if (resData.messageId && resData.messageId !== messageId) {
        await supabase.from('messages').delete().eq('id', messageId);
        await supabase.from('messages').insert({
          ...messageData,
          id: resData.messageId,
          status: 'sent'
        });
      }

      setInputText("");
    } catch (error) {
      toast.error("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContactData.name || !newContactData.phone) return;

    let cleanPhone = ContactService.formatPhoneId(newContactData.phone);

    // Auto-insere código do Brasil (55) se digitou só DDD + número
    if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    if (cleanPhone.length < 10) {
      return toast.error("Número muito curto. Inclua o DDD.");
    }

    setSavingContact(true);
    const toastId = toast.loading("Validando número no WhatsApp...");

    try {
      const res = await fetch('/api/whatsapp/check-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone })
      });

      const data = await res.json();

      if (!res.ok || !data.exists) {
        toast.error("Este número não possui WhatsApp ativo.", { id: toastId });
        setSavingContact(false);
        return;
      }

      toast.success("WhatsApp validado!", { id: toastId });

      await ContactService.upsertContact(propertyId, newContactData.name, cleanPhone, false);
      setIsNewContactOpen(false);
      setSelectedPhone(cleanPhone);
      setNewContactData({ name: "", phone: "" });
    } catch {
      toast.error("Falha ao validar número.", { id: toastId });
    } finally {
      setSavingContact(false);
    }
  };

  const toggleArchive = async () => {
    if (!selectedPhone) return;
    const currentComm = communications.find(c => c.id === selectedPhone);
    const isCurrentlyArchived = currentComm?.archived || false;
    await supabase.from('communications').update({ archived: !isCurrentlyArchived }).eq('id', selectedPhone).eq('propertyId', propertyId);
    if (!isCurrentlyArchived) setSelectedPhone(null);
  };

  const getContactInfo = (phone: string) => {
    const contact = contacts.find(c => c.id === phone);
    return {
      name: contact && contact.name !== `+${phone}` ? contact.name : `+${phone}`,
      isGuest: contact?.isGuest ?? false,
    };
  };

  const getStatusColor = (status?: string) => {
    if (status === 'active') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (status === 'pending') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    if (status === 'past') return 'bg-muted text-muted-foreground border-border';
    return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  };

  const toggleOriginal = (msgId: string) => {
    setShowOriginal(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const renderMedia = (msg: WhatsAppMessage) => {
    if (!msg.mediaUrl) return null;
    const secureUrl = `/api/media?url=${encodeURIComponent(msg.mediaUrl)}`;
    const textToAnalyze = (msg.originalBody || msg.body || "").toLowerCase();

    if (textToAnalyze.includes('áudio') || textToAnalyze.includes('voz') || msg.mediaUrl.endsWith('.ogg')) {
      return <audio src={secureUrl} controls className="w-full max-w-[240px] h-10 mt-2 rounded-md bg-secondary/50" />;
    }
    if (textToAnalyze.includes('imagem') || textToAnalyze.includes('figurinha') || msg.mediaUrl.endsWith('.jpg') || msg.mediaUrl.endsWith('.webp')) {
      return <img src={secureUrl} alt="Mídia Recebida" className="max-w-full rounded-md mt-2 max-h-64 object-cover border shadow-sm" />;
    }
    if (textToAnalyze.includes('vídeo') || msg.mediaUrl.endsWith('.mp4')) {
      return <video src={secureUrl} controls className="max-w-full rounded-md mt-2 max-h-64 border shadow-sm" />;
    }

    return <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="text-primary underline mt-2 inline-block text-xs font-semibold">📎 Abrir Anexo Externo</a>;
  };

  const displayList = useMemo(() => {
    if (searchTerm) {
      return contacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.includes(searchTerm))
        .map(c => ({ phone: c.id, name: c.name, lastMsg: null, unread: 0, updatedAt: null, isGuest: c.isGuest ?? false }));
    }

    const list = communications.filter(c => activeTab === 'archived' ? c.archived : !c.archived);
    return list.map(c => {
      const info = getContactInfo(c.id);
      return {
        phone: c.id,
        name: info.name,
        lastMsg: c.lastMessage,
        updatedAt: c.updatedAt,
        unread: c.unread || 0,
        isGuest: info.isGuest,
      };
    });
  }, [communications, activeTab, searchTerm, contacts]);

  // Conteúdo do painel lateral (reutilizado em desktop e mobile)
  const renderPanelContent = () => {
    const contact = contacts.find(c => c.id === selectedPhone);
    return (
      <div className="flex-1 overflow-y-auto">
        {/* Dados do Hóspede */}
        {contactContext && contactContext.status !== 'none' && (
          <div className="p-4 border-b space-y-2">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Dados do Hóspede
            </h4>
            <div className="space-y-2">
              {contact?.name && (
                <div className="flex items-center gap-2 text-xs">
                  <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground font-medium truncate">{contact.name}</span>
                </div>
              )}
              {contactContext.cabinName && (
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{contactContext.cabinName}</span>
                </div>
              )}
              {(contactContext.checkIn || contactContext.checkOut) && (
                <div className="flex items-center gap-2 text-xs">
                  <CalendarRange className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">
                    {contactContext.checkIn && (contactContext.checkIn instanceof Date ? contactContext.checkIn : new Date(contactContext.checkIn as any)).toLocaleDateString('pt-BR')}
                    {contactContext.checkOut && ` → ${(contactContext.checkOut instanceof Date ? contactContext.checkOut : new Date(contactContext.checkOut as any)).toLocaleDateString('pt-BR')}`}
                  </span>
                </div>
              )}
              {stayDetails?.accessCode && (
                <div className="flex items-center gap-2 text-xs">
                  <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground font-mono">{stayDetails.accessCode}</span>
                </div>
              )}
              {stayDetails?.wifiSsid && (
                <div className="flex items-center gap-2 text-xs">
                  <Wifi className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">
                    {stayDetails.wifiSsid}
                    {stayDetails.wifiPassword && <span className="text-muted-foreground"> / {stayDetails.wifiPassword}</span>}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Templates */}
        <div className="p-4">
          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
            Modelos de Mensagem
          </h4>
          {templateLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhum modelo cadastrado.<br />
              <span className="text-[11px]">Crie em Automações → Configurações</span>
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    const resolved = resolveVariables(template.body);
                    setInputText(resolved);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="w-full text-left rounded-xl border bg-background hover:bg-primary/5 hover:border-primary/30 p-3 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-foreground group-hover:text-primary leading-tight">
                      {template.name}
                    </span>
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                    {template.body}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const currentComm = communications.find(c => c.id === selectedPhone);
  const isArchived = currentComm?.archived || false;
  const selectedContactInfo = selectedPhone ? getContactInfo(selectedPhone) : null;

  return (
    <div className="flex h-[calc(100vh-140px)] bg-card border rounded-2xl overflow-hidden shadow-sm">

      {/* SIDEBAR — Lista de Conversas */}
      <div className={`w-full md:w-80 border-r flex flex-col bg-muted/10 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-background flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-foreground">Conversas</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsNewContactOpen(true)} title="Novo Contato"><Plus className="w-5 h-5 text-primary" /></Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar contatos..." className="w-full h-9 pl-9 pr-3 rounded-md bg-secondary text-sm border-none focus:ring-1 focus:ring-primary outline-none" />
          </div>
        </div>

        {!searchTerm && (
          <div className="flex bg-muted/50 p-1 mx-4 mt-3 rounded-lg">
            <button onClick={() => setActiveTab('inbox')} className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${activeTab === 'inbox' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Caixa de Entrada
            </button>
            <button onClick={() => setActiveTab('archived')} className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${activeTab === 'archived' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Arquivados
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-2">
          {displayList.map((item) => {
            const isSelected = selectedPhone === item.phone;
            return (
              <div key={item.phone} onClick={() => setSelectedPhone(item.phone)} className={`p-4 border-b cursor-pointer transition-colors flex items-start gap-3 ${isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/30 border-l-4 border-l-transparent'}`}>
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    item.isGuest
                      ? 'bg-primary/15 text-primary ring-2 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  {item.isGuest && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-background rounded-full flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                      {item.isGuest && (
                        <span className="flex-shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                          Guest
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.unread > 0 && <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>}
                      <span className="text-[10px] text-muted-foreground">{safeFormatDate(item.updatedAt, "HH:mm")}</span>
                    </div>
                  </div>
                  {item.lastMsg && (
                    <p className={`text-xs truncate ${item.unread > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                      {item.lastMsg}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CHAT + PAINEL DIREITO (compartilham header) */}
      <div className={`flex-1 flex flex-col bg-[#FDFDFD] dark:bg-background relative min-w-0 ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {!selectedPhone ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <MessageCircle className="w-16 h-16 opacity-20 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Central de Comunicação</h2>
            <p className="text-sm">Selecione ou arquive uma conversa na barra lateral.</p>
          </div>
        ) : (
          <>
            {/* Header do Chat — ocupa largura total acima do chat+painel */}
            <div className="px-4 py-3 bg-background border-b flex items-center justify-between gap-3 z-10 shadow-sm flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="md:hidden -ml-2 flex-shrink-0" onClick={() => setSelectedPhone(null)}><ArrowLeft className="w-5 h-5" /></Button>
                <div className="relative flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
                    selectedContactInfo?.isGuest
                      ? 'bg-primary/15 text-primary ring-2 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                  }`}>{selectedContactInfo?.name.charAt(0).toUpperCase()}</div>
                  {selectedContactInfo?.isGuest && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full flex items-center justify-center">
                      <User className="w-2 h-2 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-bold text-foreground leading-tight truncate">{selectedContactInfo?.name}</h2>
                    {selectedContactInfo?.isGuest && (
                      <span className="flex-shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                        Guest
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">+{selectedPhone}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {contactContext && contactContext.status !== 'none' && (
                  <div className={`hidden sm:flex px-3 py-1.5 rounded-xl border items-center gap-1.5 text-xs font-semibold ${getStatusColor(contactContext.status)}`}>
                    {contactContext.status === 'active' && <MapPin className="w-3.5 h-3.5" />}
                    {contactContext.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                    {contactContext.status === 'past' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span className="hidden lg:inline">{contactContext.message}</span>
                    <span className="lg:hidden">{contactContext.cabinName ?? contactContext.status}</span>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={toggleArchive} className="text-xs font-semibold gap-1.5 border-border/60 hover:bg-muted/50 h-8">
                  {isArchived ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isArchived ? "Desarquivar" : "Arquivar"}</span>
                </Button>

                {/* Toggle painel — desktop */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPanel(p => !p)}
                  title={showPanel ? "Ocultar painel" : "Modelos & Contexto"}
                  className="hidden md:flex h-8 w-8"
                >
                  {showPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                </Button>

                {/* Toggle painel — mobile */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPanel(p => !p)}
                  className="md:hidden h-8 w-8"
                  title="Modelos"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Status do hóspede — mobile (abaixo do header) */}
            {contactContext && contactContext.status !== 'none' && (
              <div className={`sm:hidden px-4 py-2 border-b flex items-center gap-2 text-xs font-semibold ${getStatusColor(contactContext.status)}`}>
                {contactContext.status === 'active' && <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
                {contactContext.status === 'pending' && <Clock className="w-3.5 h-3.5 flex-shrink-0" />}
                {contactContext.status === 'past' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{contactContext.message}</span>
              </div>
            )}

            {/* Corpo: Chat + Painel lado a lado abaixo do header */}
            <div className="flex-1 flex min-h-0">
              {/* Coluna do Chat */}
              <div className="flex-1 flex flex-col min-w-0">

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-amber-50/30 dark:bg-transparent">
              {messages.map((msg, i) => {
                const isMe = msg.direction === 'outbound';
                const hasTranslation = msg.originalBody && msg.originalBody !== msg.body;

                return (
                  <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`relative max-w-[85%] md:max-w-[65%] rounded-2xl px-4 py-3 shadow-sm ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border rounded-tl-sm text-foreground'}`}>
                      {msg.isAutomated && msg.status === 'pending' ? (
                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold mb-1 text-yellow-600 dark:text-yellow-500">
                          <Clock className="w-3 h-3" /> Agendada para: {safeFormatDate(msg.scheduledFor, "dd/MM HH:mm") || 'Em breve'}
                        </div>
                      ) : msg.isAutomated ? (
                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold mb-1 opacity-70">
                          <Bot className="w-3 h-3" /> Robô Automação
                        </div>
                      ) : null}
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>

                      {renderMedia(msg)}

                      {hasTranslation && (
                        <div className="mt-2 pt-2 border-t border-current/10 flex flex-col items-start">
                          <button onClick={() => toggleOriginal(msg.id!)} className="text-[10px] font-semibold opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Languages className="w-3 h-3" />
                            {showOriginal[msg.id!] ? "Ocultar original" : "Ver original"}
                          </button>
                          {showOriginal[msg.id!] && (
                            <div className="mt-2 text-xs opacity-80 italic border-l-2 border-current/30 pl-2">
                              {msg.originalBody}
                            </div>
                          )}
                        </div>
                      )}

                      {msg.reaction && (
                        <div className={`absolute -bottom-3 ${isMe ? 'right-4' : 'left-4'} bg-background border shadow-sm rounded-full px-1.5 py-0.5 text-xs z-10 text-foreground`}>
                          {msg.reaction}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[10px] text-muted-foreground">{safeFormatDate(msg.createdAt, "HH:mm")}</span>
                      {isMe && msg.statusApi !== undefined && (
                        <span className="text-[12px] font-bold flex items-center tracking-tighter">
                          {msg.statusApi === 1 && <span className="text-muted-foreground opacity-60">✓</span>}
                          {msg.statusApi === 2 && <span className="text-muted-foreground opacity-60">✓✓</span>}
                          {(msg.statusApi === 3 || msg.statusApi === 4) && <span className="text-blue-500">✓✓</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input com menu % */}
            <div className="p-3 md:p-4 bg-background border-t">
              <div className="relative">
                {/* Menu % flutuante */}
                {mentionMenu.open && mentionMenu.items.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border rounded-xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto">
                    <div className="px-3 py-2 border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                      {mentionMenu.query ? `"${mentionMenu.query}"` : 'Templates e variáveis'} — <span className="font-normal normal-case">↑↓ navegar · Enter inserir · Esc fechar</span>
                    </div>
                    {mentionMenu.items.map((item, idx) => (
                      <button
                        key={`${item.type}-${item.label}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); insertMentionItem(item); }}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                          idx === mentionMenu.activeIndex ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                          item.type === 'template' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {item.type === 'template' ? 'T' : '#'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{item.label}</div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.value.slice(0, 70)}{item.value.length > 70 ? '…' : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    autoFocus
                    placeholder="Mensagem… use % para modelos e variáveis"
                    className="flex-1 bg-secondary rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-primary text-sm resize-none min-h-[48px] max-h-32 leading-snug overflow-y-auto"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    disabled={sending}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />
                  <Button type="submit" disabled={sending || !inputText.trim()} className="h-12 w-12 rounded-xl shrink-0 p-0 self-end">
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </form>
              </div>
            </div>

              </div>{/* fim coluna chat */}

              {/* PAINEL DIREITO — Desktop (dentro do flex, abaixo do header) */}
              <div className={`hidden md:flex flex-col border-l bg-muted/5 transition-all duration-200 ${showPanel ? 'w-72 flex-shrink-0' : 'w-0 overflow-hidden border-l-0'}`}>
                {showPanel && renderPanelContent()}
              </div>

            </div>{/* fim flex chat+painel */}
          </>
        )}
      </div>

      {/* PAINEL MOBILE — Bottom Sheet */}
      {selectedPhone && showPanel && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t rounded-t-2xl shadow-2xl md:hidden max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <h3 className="font-bold text-sm">Modelos & Contexto</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowPanel(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          {renderPanelContent()}
        </div>
      )}

      {/* MODAL NOVO CONTATO */}
      {isNewContactOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5 border-b pb-2">
              <h2 className="text-lg font-bold">Novo Contato</h2>
              <Button variant="ghost" size="icon" onClick={() => { if (!savingContact) setIsNewContactOpen(false); }}><X className="w-5 h-5" /></Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold">Nome / Empresa</label>
                <input type="text" className="flex h-10 w-full rounded-md border px-3 mt-1" value={newContactData.name} onChange={e => setNewContactData({ ...newContactData, name: e.target.value })} disabled={savingContact} />
              </div>
              <div>
                <label className="text-xs font-semibold">WhatsApp (Com DDD)</label>
                <input type="text" placeholder="5553991234567" className="flex h-10 w-full rounded-md border px-3 mt-1" value={newContactData.phone} onChange={e => setNewContactData({ ...newContactData, phone: e.target.value })} disabled={savingContact} />
                <p className="text-[10px] text-muted-foreground mt-1">O número será verificado na Meta antes de salvar.</p>
              </div>
              <Button onClick={handleAddContact} className="w-full gap-2" disabled={!newContactData.name || !newContactData.phone || savingContact}>
                {savingContact ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : 'Verificar e Abrir Chat'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
