"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, User, Clock, CheckCircle2, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase"; 
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";

interface Message {
  id: string;
  text: string;
  sender: "hotel" | "guest";
  timestamp: string;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  createdAt?: any;
}

interface ChatContact {
  id: string; 
  name: string;
  number: string;
  cabin: string;
  lastMessage: string;
  unread: number;
}

export function CommunicationCenter({ propertyId }: { propertyId: string }) {
  const [activeContact, setActiveContact] = useState<ChatContact | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. OUVIR A LISTA DE CONTATOS EM TEMPO REAL
  useEffect(() => {
    if (!propertyId) return;

    const contactsRef = collection(db, "properties", propertyId, "communications");
    const q = query(contactsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactsData: ChatContact[] = snapshot.docs.map(doc => ({
        id: doc.id,
        number: doc.id,
        name: doc.data().name || "Hóspede",
        cabin: doc.data().cabin || "Sem cabana",
        lastMessage: doc.data().lastMessage || "",
        unread: doc.data().unread || 0,
        updatedAt: doc.data().updatedAt
      }));
      
      contactsData.sort((a: any, b: any) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
      setContacts(contactsData);
    }, (error) => {
      console.error("❌ Erro no onSnapshot:", error);
    });

    return () => unsubscribe();
  }, [propertyId]);

  // 2. OUVIR AS MENSAGENS DO CONTATO SELECIONADO EM TEMPO REAL
  useEffect(() => {
    if (!propertyId || !activeContact) return;

    const messagesRef = collection(db, "properties", propertyId, "communications", activeContact.id, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgsData: Message[] = snapshot.docs.map(doc => {
        const data = doc.data();
        let timeString = "";
        if (data.timestamp) {
          const date = data.timestamp.toDate();
          timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        return {
          id: doc.id,
          text: data.text,
          sender: data.sender,
          timestamp: timeString,
          status: data.status,
          createdAt: data.timestamp
        };
      });
      setChatHistory(msgsData);
      
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      if (activeContact.unread > 0) {
        setDoc(doc(db, "properties", propertyId, "communications", activeContact.id), {
          unread: 0
        }, { merge: true });
      }
    });

    return () => unsubscribe();
  }, [propertyId, activeContact]);

  // 3. ENVIAR NOVA MENSAGEM (LÓGICA OTIMISTA + BACKEND DE CONFIANÇA)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeContact) return;

    const textToSend = newMessage;
    const currentContact = activeContact; // Captura segura do estado
    setNewMessage(""); // Limpa input para UX instantânea

    try {
      // 1. Cria a mensagem no Firebase IMEDIATAMENTE como "pending"
      const contactRef = doc(db, "properties", propertyId, "communications", currentContact.id);
      const messageRef = await addDoc(collection(contactRef, "messages"), {
        text: textToSend,
        sender: "hotel",
        timestamp: serverTimestamp(),
        status: "pending" // Estado de transição
      });

      // Atualiza a "última mensagem" na lista de contatos
      await setDoc(contactRef, {
        lastMessage: textToSend,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 2. Chama a API passando os IDs para que o Backend faça o envio e atualize o status final
      fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: propertyId,
          contactId: currentContact.id,
          messageId: messageRef.id, // Chave do sucesso da arquitetura!
          number: currentContact.number,
          message: textToSend
        })
      }).catch(err => {
        console.error("Erro fatal de rede na chamada da API:", err);
        // Opcional: Se a própria internet do hotel cair antes do fetch completar, pode atualizar o front aqui.
      });

    } catch (error) {
      console.error("Erro ao preparar a mensagem no Firebase:", error);
    }
  };

  return (
    <div className="flex h-[80vh] w-full border rounded-xl overflow-hidden bg-background shadow-sm">
      
      {/* BARRA LATERAL ESQUERDA */}
      <div className="w-1/3 border-r flex flex-col bg-muted/10">
        <div className="p-4 border-b bg-background">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Comunicações
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Buscar hóspede ou cabana..." 
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground mt-10">
              Nenhuma conversa ativa no momento.
            </div>
          ) : (
            contacts.map((contact) => (
              <div 
                key={contact.id}
                onClick={() => setActiveContact(contact)}
                className={`p-4 border-b cursor-pointer transition-colors hover:bg-accent/50 ${activeContact?.id === contact.id ? "bg-accent" : ""}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">{contact.name} ({contact.number})</span>
                  {contact.unread > 0 && (
                    <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                      {contact.unread}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span className="truncate pr-4">{contact.lastMessage}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ÁREA CENTRAL: CHAT */}
      <div className="w-2/3 flex flex-col bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-opacity-5 dark:bg-opacity-10 bg-repeat relative">
        
        {activeContact ? (
          <>
            <div className="p-4 border-b bg-background flex justify-between items-center shadow-sm z-10">
              <div>
                <h3 className="font-semibold">{activeContact.name}</h3>
                <p className="text-xs text-muted-foreground">{activeContact.number} • {activeContact.cabin}</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs">
                Ver Ficha da Reserva
              </Button>
            </div>

            {/* Histórico de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {chatHistory.map((msg) => {
                const isHotel = msg.sender === "hotel";
                return (
                  <div key={msg.id} className={`flex ${isHotel ? "justify-end" : "justify-start"}`}>
                    <div 
                      className={`max-w-[70%] rounded-2xl px-4 py-2 relative shadow-sm ${
                        isHotel 
                          ? "bg-green-600 text-white rounded-tr-none" 
                          : "bg-background border text-foreground rounded-tl-none"
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                      
                      {/* Gestor Visual de Estado do WhatsApp */}
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isHotel ? "text-green-100" : "text-muted-foreground"}`}>
                        <span className="text-[10px]">{msg.timestamp}</span>
                        
                        {isHotel && msg.status === "read" && <CheckCircle2 className="w-3 h-3 text-blue-300" />}
                        {isHotel && msg.status === "delivered" && <CheckCircle2 className="w-3 h-3 text-green-200" />}
                        {isHotel && msg.status === "sent" && <CheckCircle2 className="w-3 h-3 text-green-200 opacity-70" />}
                        {isHotel && msg.status === "pending" && <Clock className="w-3 h-3 text-green-200 opacity-70 animate-pulse" />}
                        {isHotel && msg.status === "failed" && (
                          <span title="Falha ao enviar, servidor offline">
                            <AlertCircle className="w-3 h-3 text-red-300" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de Envio */}
            <div className="p-4 bg-background border-t">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input 
                  type="text"
                  value={newMessage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
                  placeholder="Digite uma mensagem para o hóspede..." 
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-1"
                />
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white shadow-md">
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-background/80 backdrop-blur-sm z-10">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 shadow-inner">
              <User className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-xl font-medium mb-2 text-foreground">Aura Experience Chat</h3>
            <p className="text-sm">Selecione uma conversa na lateral para iniciar o atendimento.</p>
          </div>
        )}
      </div>

    </div>
  );
}