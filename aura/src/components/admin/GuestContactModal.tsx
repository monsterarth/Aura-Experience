"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Guest, Stay } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  MessageCircle, 
  Send, 
  X, 
  Loader2,
  CheckCircle2
} from "lucide-react";

interface GuestContactModalProps {
  propertyId: string;
  guest: Guest;
  stay: Stay;
  onClose: () => void;
  whatsappApiUrl?: string; 
  whatsappToken?: string; 
}

export function GuestContactModal({ propertyId, guest, stay, onClose }: GuestContactModalProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const cleanPhone = guest.phone.replace(/\D/g, '');

  const handleGoToChat = () => {
    // Redireciona com o parâmetro na URL para abrir o chat automaticamente
    router.push(`/admin/comunicacao?phone=${cleanPhone}`);
  };

const handleSendMessage = async () => {
    if (!message.trim() || !cleanPhone) return;
    setSending(true);
    
    try {
      const messageId = crypto.randomUUID();

      // UNIFICADO: Cria a mensagem na raiz
      const messageRef = doc(db, "properties", propertyId, "messages", messageId);
      await setDoc(messageRef, {
        id: messageId,
        propertyId,
        contactId: cleanPhone,
        stayId: stay.id,
        to: cleanPhone,
        body: message.trim(),
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
          messageId, // Agora passamos o messageId exato
          number: cleanPhone,
          message: message.trim()
        })
      });

      if (!response.ok) throw new Error("Falha na API");

      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); setMessage(""); }, 2000);

    } catch (error) {
      alert("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background rounded-xl w-full max-w-md shadow-xl overflow-hidden flex flex-col">
        
        <div className="flex justify-between items-center p-4 border-b bg-muted/10">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {guest.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">{guest.fullName}</h2>
              <p className="text-xs text-muted-foreground">+{cleanPhone}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={sending}><X className="w-5 h-5" /></Button>
        </div>

        <div className="p-5 space-y-4">
          {success ? (
            <div className="flex flex-col items-center justify-center py-6 text-emerald-600 animate-in zoom-in">
              <CheckCircle2 className="w-12 h-12 mb-2" />
              <p className="font-semibold">Mensagem enviada!</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mensagem Rápida</label>
                <Textarea 
                  placeholder={`Escreva uma mensagem para ${guest.fullName.split(' ')[0]}...`}
                  className="min-h-[120px] resize-none text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button 
                  className="flex-1 gap-2" 
                  onClick={handleSendMessage} 
                  disabled={sending || !message.trim()}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar Agora
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                  onClick={handleGoToChat}
                >
                  <MessageCircle className="w-4 h-4" />
                  Ver Conversa
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
