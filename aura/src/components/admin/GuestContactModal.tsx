"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Guest, Stay, Cabin, MessageTemplate } from "@/types/aura";
import { ContactService } from "@/services/contact-service";
import { useAuth } from "@/context/AuthContext";
import { MessageCircle, Send, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T, alpha } from "@/lib/admin-tokens";
import { Dialog } from "@/components/aura/Dialog";
import { Button } from "@/components/aura/Button";
import { Field, Textarea } from "@/components/aura/Field";

interface GuestContactModalProps {
  propertyId: string;
  guest: Guest;
  stay: Stay;
  cabin?: Cabin | null;
  onClose: () => void;
  /** Controlado pelo pai (anima a saída). Default true = aberto. */
  open?: boolean;
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

  if (stay.checkIn) text = text.replace(/{{checkin_date}}/g, new Date(stay.checkIn).toLocaleDateString("pt-BR"));
  if (stay.checkOut) text = text.replace(/{{checkout_date}}/g, new Date(stay.checkOut).toLocaleDateString("pt-BR"));
  if (stay.accessCode) text = text.replace(/{{access_code}}/g, stay.accessCode);

  const baseUrl = "https://aaura.app.br";
  text = text
    .replace(/{{portal_link}}/g, `${baseUrl}/check-in`)
    .replace(/{{survey_link}}/g, `${baseUrl}/feedback/${stay.id}`);

  return text;
}

/** Contato rápido com o hóspede por WhatsApp (templates + envio pela fila). */
export function GuestContactModal({ propertyId, guest, stay, cabin, onClose, open = true }: GuestContactModalProps) {
  const router = useRouter();
  const { userData: authUser } = useAuth();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [chatwootContactUrl, setChatwootContactUrl] = useState<string | null>(null);
  // Mensagem digitada e ainda não enviada não pode sumir com um clique fora.
  const { requestClose, guardProps } = useCloseGuard(onClose, {
    open,
    dirty: message.trim().length > 0 && !success,
    escape: false,
  });

  const cleanPhone = (guest.phone || "").replace(/\D/g, "");

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
        setChatwootContactUrl(contactId ? `${base}/contacts/${contactId}` : `${base}/conversations`);
      }
    });
  }, [propertyId, guest.chatwootContactId]);

  const handleApplyTemplate = (template: MessageTemplate) => {
    const body = (guest.preferredLanguage === "en" && template.body_en)
      ? template.body_en
      : (guest.preferredLanguage === "es" && template.body_es)
        ? template.body_es
        : template.body;
    setMessage(resolveVariables(body, guest, stay, cabin));
    setShowTemplates(false);
  };

  const handleGoToChat = () => {
    if (chatwootContactUrl) window.open(chatwootContactUrl, "_blank", "noopener,noreferrer");
    else router.push("/admin/comunicacao");
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !cleanPhone) return;
    setSending(true);
    try {
      await ContactService.upsertContact(propertyId, guest.fullName, cleanPhone, true, guest.id, authUser?.id, authUser?.fullName);

      const messageId = crypto.randomUUID();
      const isoNow = new Date().toISOString();

      await supabase.from("messages").insert({
        id: messageId, propertyId, contactId: cleanPhone, stayId: stay.id, to: cleanPhone,
        body: message.trim(), isAutomated: false, status: "pending", direction: "outbound", createdAt: isoNow,
      });

      await supabase.from("communications").upsert({
        id: cleanPhone, propertyId, lastMessage: message.trim(), updatedAt: isoNow, archived: false,
      }, { onConflict: "id" });

      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, messageId, number: cleanPhone, message: message.trim() }),
      });
      if (!response.ok) throw new Error("Falha na API");

      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); setMessage(""); }, 1600);
    } catch {
      toast.error("Erro ao enviar mensagem.", { description: "Tente de novo ou abra a conversa no chat." });
    } finally {
      setSending(false);
    }
  };

  const initial = guest.fullName.charAt(0).toUpperCase();

  return (
    <Dialog
      open={open}
      onClose={sending ? () => {} : requestClose}
      presentation="auto"
      size="sm"
      icon={<span style={{ fontWeight: 900, fontSize: 15 }}>{initial}</span>}
      iconTone="brand"
      title={guest.fullName}
      subtitle={cleanPhone ? `+${cleanPhone}` : "Sem telefone cadastrado"}
      panelProps={guardProps}
      footer={!success ? (
        <>
          <Button variant="secondary" icon={MessageCircle} onClick={handleGoToChat}>Ver conversa</Button>
          <Button variant="primary" icon={Send} onClick={handleSendMessage} loading={sending} disabled={!message.trim() || !cleanPhone}>Enviar agora</Button>
        </>
      ) : undefined}
    >
      {success ? (
        <div className="ak-empty" data-compact style={{ padding: "24px 8px" }}>
          <span className="ak-empty__icon" style={{ background: T.greenBg, borderColor: T.greenBorder, color: T.green }}><CheckCircle2 size={24} /></span>
          <div className="ak-empty__title">Mensagem enviada!</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {templates.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTemplates(v => !v)}
                className="ak-press ak-focus"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.brandText }}
              >
                Usar template {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showTemplates && (
                <div className="ak-fade-in" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, padding: 10, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleApplyTemplate(t)}
                      className="ak-chip ak-press ak-focus"
                      style={{ background: alpha(T.g1, 8) }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="Mensagem">
            <Textarea
              placeholder={`Escreva uma mensagem para ${guest.fullName.split(" ")[0]}…`}
              value={message}
              onChange={e => setMessage(e.target.value)}
              disabled={sending}
              rows={5}
              autoGrow
              maxRows={10}
            />
          </Field>
          {!cleanPhone && <p style={{ margin: 0, fontSize: 12, color: T.amber }}>Este hóspede não tem telefone cadastrado — cadastre na ficha para enviar.</p>}
        </div>
      )}
    </Dialog>
  );
}
