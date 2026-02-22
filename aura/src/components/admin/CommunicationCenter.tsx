"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, query, onSnapshot, orderBy, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WhatsAppMessage, Contact, ContactContext } from "@/types/aura";
import { ContactService } from "@/services/contact-service";
import { Button } from "@/components/ui/button";
import { 
  Search, Send, Clock, CheckCircle2, 
  MapPin, Loader2, ArrowLeft, Plus, X, Bot, MessageCircle
} from "lucide-react";
import { format } from "date-fns";

interface CommunicationCenterProps {
  propertyId: string;
}

export function CommunicationCenter({ propertyId }: CommunicationCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPhone = searchParams.get('phone'); 

  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPhone, setSelectedPhone] = useState<string | null>(urlPhone);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [contactContext, setContactContext] = useState<ContactContext | null>(null);
  
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactData, setNewContactData] = useState({ name: "", phone: "" });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Sincronização em Tempo Real
  useEffect(() => {
    if (!propertyId) return;

    // Escuta a Agenda
    const qContacts = query(collection(db, "properties", propertyId, "contacts"));
    const unsubContacts = onSnapshot(qContacts, (snap) => {
      setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Contact)));
    });

    // UNIFICADO: Escuta TODAS as mensagens da raiz (Apanha webhook e envios)
    const qMsg = query(collection(db, "properties", propertyId, "messages"), orderBy("createdAt", "asc"));
    const unsubMsg = onSnapshot(qMsg, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppMessage)));
      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => { unsubContacts(); unsubMsg(); };
  }, [propertyId]);

  // 2. Agrupa mensagens por conversa
  const chats = useMemo(() => {
    const map = new Map<string, WhatsAppMessage[]>();
    messages.forEach(m => {
      // Pega o número real da mensagem independentemente da direção
      const phone = m.contactId || (m.direction === 'inbound' ? m.from : m.to);
      if (!phone) return;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(m);
    });

    return Array.from(map.entries()).map(([phone, msgs]) => ({
      phone,
      messages: msgs,
      lastMsg: msgs[msgs.length - 1]
    })).sort((a, b) => {
      const timeA = a.lastMsg?.createdAt?.toDate ? a.lastMsg.createdAt.toDate().getTime() : 0;
      const timeB = b.lastMsg?.createdAt?.toDate ? b.lastMsg.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    });
  }, [messages]);

  // 3. Efeito do Raio-X
  useEffect(() => {
    async function loadContext() {
      if (selectedPhone && propertyId) {
        await ContactService.upsertContact(propertyId, `+${selectedPhone}`, selectedPhone, false);
        const ctx = await ContactService.resolveContactContext(propertyId, selectedPhone);
        setContactContext(ctx);
      } else {
        setContactContext(null);
      }
    }
    loadContext();
  }, [selectedPhone, propertyId]);

  // 4. Envio de Mensagem Direto do Chat
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedPhone || sending) return;
    
    setSending(true);
    try {
      const messageId = crypto.randomUUID();
      const contactId = selectedPhone;

      // UNIFICADO: Cria a mensagem na raiz
      const messageRef = doc(db, "properties", propertyId, "messages", messageId);
      await setDoc(messageRef, {
        id: messageId,
        propertyId,
        contactId,
        stayId: contactContext?.stayId || null,
        to: contactId,
        body: inputText.trim(),
        isAutomated: false,
        status: 'pending',
        direction: 'outbound',
        createdAt: serverTimestamp(),
      });

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
      setInputText("");
    } catch (error) {
      alert("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContactData.name || !newContactData.phone) return;
    const cleanPhone = ContactService.formatPhoneId(newContactData.phone);
    await ContactService.upsertContact(propertyId, newContactData.name, cleanPhone, false);
    setIsNewContactOpen(false);
    setSelectedPhone(cleanPhone); 
    setNewContactData({ name: "", phone: "" });
  };

  const getContactInfo = (phone: string) => {
    const contact = contacts.find(c => c.id === phone);
    return { name: contact && contact.name !== `+${phone}` ? contact.name : `+${phone}` };
  };

  const getStatusColor = (status?: string) => {
    if (status === 'active') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (status === 'pending') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    if (status === 'past') return 'bg-muted text-muted-foreground border-border';
    return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  };

  // Garante que contatos sem mensagem também aparecem na barra lateral
  const sidebarList = Array.from(new Set([...chats.map(c => c.phone), ...contacts.map(c => c.id)]));

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const currentChatMessages = selectedPhone ? chats.find(c => c.phone === selectedPhone)?.messages || [] : [];
  const selectedContactInfo = selectedPhone ? getContactInfo(selectedPhone) : null;

  return (
    <div className="flex h-[calc(100vh-140px)] bg-card border rounded-2xl overflow-hidden shadow-sm">
      
      {/* SIDEBAR */}
      <div className={`w-full md:w-80 border-r flex flex-col bg-muted/10 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-background flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-foreground">Conversas</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsNewContactOpen(true)} title="Novo Contato"><Plus className="w-5 h-5 text-primary" /></Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Buscar contatos..." className="w-full h-9 pl-9 pr-3 rounded-md bg-secondary text-sm border-none focus:ring-1 focus:ring-primary outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarList.map((phone) => {
            const info = getContactInfo(phone);
            const chatData = chats.find(c => c.phone === phone);
            const isSelected = selectedPhone === phone;

            return (
              <div key={phone} onClick={() => setSelectedPhone(phone)} className={`p-4 border-b cursor-pointer transition-colors flex items-start gap-3 ${isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/30 border-l-4 border-l-transparent'}`}>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary font-bold">
                  {info.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold text-sm truncate">{info.name}</h3>
                    <span className="text-[10px] text-muted-foreground">{chatData?.lastMsg?.createdAt?.toDate ? format(chatData.lastMsg.createdAt.toDate(), "HH:mm") : ''}</span>
                  </div>
                  {chatData?.lastMsg && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {chatData.lastMsg.isAutomated && <Bot className="w-3 h-3" />}
                      {chatData.lastMsg.body}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CHAT */}
      <div className={`flex-1 flex flex-col bg-[#FDFDFD] dark:bg-background relative ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {!selectedPhone ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <MessageCircle className="w-16 h-16 opacity-20 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Central de Comunicação</h2>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 bg-background border-b flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 shadow-sm">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setSelectedPhone(null)}><ArrowLeft className="w-5 h-5" /></Button>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">{selectedContactInfo?.name.charAt(0).toUpperCase()}</div>
                <div>
                  <h2 className="font-bold text-foreground leading-tight">{selectedContactInfo?.name}</h2>
                  <p className="text-xs text-muted-foreground">+{selectedPhone}</p>
                </div>
              </div>
              {contactContext && contactContext.status !== 'none' && (
                <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${getStatusColor(contactContext.status)}`}>
                  {contactContext.status === 'active' && <MapPin className="w-4 h-4" />}
                  {contactContext.status === 'pending' && <Clock className="w-4 h-4" />}
                  {contactContext.status === 'past' && <CheckCircle2 className="w-4 h-4" />}
                  {contactContext.message}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-amber-50/30 dark:bg-transparent">
              {currentChatMessages.map((msg, i) => {
                const isMe = msg.direction === 'outbound';
                return (
                  <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[80%] md:max-w-[60%] rounded-2xl px-4 py-3 shadow-sm ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border rounded-tl-sm text-foreground'}`}>
                      {msg.isAutomated && <div className="flex items-center gap-1 text-[10px] uppercase font-bold mb-1 opacity-70">Robô Automação</div>}
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">{msg.createdAt?.toDate ? format(msg.createdAt.toDate(), "HH:mm") : ''}</span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-background border-t">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input type="text" autoFocus placeholder="Digite sua mensagem..." className="flex-1 h-12 bg-secondary rounded-xl px-4 outline-none focus:ring-1 focus:ring-primary text-sm" value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={sending} />
                <Button type="submit" disabled={sending || !inputText.trim()} className="h-12 w-12 rounded-xl shrink-0 p-0">{sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</Button>
              </form>
            </div>
          </>
        )}
      </div>


      {/* MODAL NOVO CONTATO */}
      {isNewContactOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5 border-b pb-2">
              <h2 className="text-lg font-bold">Novo Contato</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsNewContactOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold">Nome / Empresa</label>
                <input type="text" className="flex h-10 w-full rounded-md border px-3 mt-1" value={newContactData.name} onChange={e => setNewContactData({...newContactData, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold">WhatsApp</label>
                <input type="text" className="flex h-10 w-full rounded-md border px-3 mt-1" value={newContactData.phone} onChange={e => setNewContactData({...newContactData, phone: e.target.value})} />
              </div>
              <Button onClick={handleAddContact} className="w-full" disabled={!newContactData.name || !newContactData.phone}>
                Salvar e Abrir Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}