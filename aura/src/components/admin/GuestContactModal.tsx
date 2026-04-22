"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Guest, Stay, Cabin, MessageTemplate } from "@/types/aura";
import { ContactService } from "@/services/contact-service";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle,
  Send,
  X,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GuestContactModalProps {
  propertyId: string;
  guest: Guest;
  stay: Stay;
  cabin?: Cabin | null;
  onClose: () => void;
}

function resolveVariables(body: string, guest: Guest, stay: Stay, cabin?: Cabin | null): string {
  const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const firstName = toTitleCase(guest.fullName.split(" ")[0]);

  let text = body
    .replace(/{{guest_name}}/g, firstName)
    .replace(/{{guest_full_name}}/g, toTitleCase(guest.fullName));

  if (cabin) {
    text = text
      .replace(/{{cabin_name}}/g, cabin.name)
      .replace(/{{wifi_ssid}}/g, cabin.wifi?.ssid || "")
      .replace(/{{wifi_password}}/g, cabin.wifi?.password || "");
  }

  if (stay.checkIn) text = text.replace(/{{checkin_date}}/g, new Date(stay.checkIn).toLocaleDateString('pt-BR'));
  if (stay.checkOut) text = text.replace(/{{checkout_date}}/g, new Date(stay.checkOut).toLocaleDateString('pt-BR'));
  if (stay.accessCode) text = text.replace(/{{access_code}}/g, stay.accessCode);

  const baseUrl = "https://aaura.app.br";
  text = text
    .replace(/{{portal_link}}/g, `${baseUrl}/check-in`)
    .replace(/{{survey_link}}/g, `${baseUrl}/feedback/${stay.id}`);

  return text;
}

export function GuestContactModal({ propertyId, guest, stay, cabin, onClose }: GuestContactModalProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [chatwootContactUrl, setChatwootContactUrl] = useState<string | null>(null);

  const cleanPhone = guest.phone.replace(/\D/g, '');

  useEffect(() => {
    Promise.all([
      supabase
        .from("message_templates")
        .select("id, name, body, body_en, body_es")
        .eq("propertyId", propertyId)
        .order("name"),
      supabase
        .from("properties")
        .select("settings")
        .eq("id", propertyId)
        .single(),
    ]).then(([tRes, pRes]) => {
      if (tRes.data) setTemplates(tRes.data as MessageTemplate[]);

      const wc = (pRes.data as any)?.settings?.whatsappConfig;
      if (wc?.chatwootUrl && wc?.chatwootAccountId) {
        const contactId = guest.chatwootContactId;
        const base = `${wc.chatwootUrl}/app/accounts/${wc.chatwootAccountId}`;
        setChatwootContactUrl(
          contactId
            ? `${base}/contacts/${contactId}`
            : `${base}/conversations`
        );
      }
    });
  }, [propertyId, guest.chatwootContactId]);

  const handleApplyTemplate = (template: MessageTemplate) => {
    const body = (guest.preferredLanguage === 'en' && template.body_en)
      ? template.body_en
      : (guest.preferredLanguage === 'es' && template.body_es)
        ? template.body_es
        : template.body;
    setMessage(resolveVariables(body, guest, stay, cabin));
    setShowTemplates(false);
  };

  const handleGoToChat = () => {
    if (chatwootContactUrl) {
      window.open(chatwootContactUrl, "_blank", "noopener,noreferrer");
    } else {
      router.push("/admin/comunicacao");
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !cleanPhone) return;
    setSending(true);

    try {
      await ContactService.upsertContact(propertyId, guest.fullName, cleanPhone, true, guest.id);

      const messageId = crypto.randomUUID();
      const isoNow = new Date().toISOString();

      await supabase.from("messages").insert({
        id: messageId,
        propertyId,
        contactId: cleanPhone,
        stayId: stay.id,
        to: cleanPhone,
        body: message.trim(),
        isAutomated: false,
        status: 'pending',
        direction: 'outbound',
        createdAt: isoNow,
      });

      await supabase.from('communications').upsert({
        id: cleanPhone,
        propertyId,
        lastMessage: message.trim(),
        updatedAt: isoNow,
        archived: false
      }, { onConflict: 'id' });

      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, messageId, number: cleanPhone, message: message.trim() })
      });

      if (!response.ok) throw new Error("Falha na API");

      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); setMessage(""); }, 2000);
    } catch {
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
              {/* Templates */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowTemplates(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Usar template
                    {showTemplates ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showTemplates && (
                    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                      {templates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleApplyTemplate(t)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all",
                            "bg-background border-border text-foreground hover:border-primary hover:text-primary"
                          )}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mensagem</label>
                <Textarea
                  placeholder={`Escreva uma mensagem para ${guest.fullName.split(' ')[0]}...`}
                  className="min-h-[140px] resize-none text-sm"
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
