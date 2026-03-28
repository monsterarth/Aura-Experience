"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Megaphone, Users, Clock, CalendarClock, Loader2, AlertTriangle, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Variable catalog (same as CommunicationCenter)
const VARIABLE_CATALOG = [
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

// Fake data for variable preview
const PREVIEW_REPLACEMENTS: Record<string, string> = {
  "{{guest_name}}": "João",
  "{{guest_full_name}}": "João Silva",
  "{{cabin_name}}": "Cabana Cedro",
  "{{checkin_date}}": "25/04/2026",
  "{{checkout_date}}": "28/04/2026",
  "{{access_code}}": "ABC12XYZ",
  "{{wifi_ssid}}": "FazendaDoRosa",
  "{{wifi_password}}": "minhasenha",
  "{{portal_link}}": "https://aaura.app.br/check-in/login",
  "{{survey_link}}": "https://aaura.app.br/feedback/exemplo",
};

function resolvePreview(text: string): string {
  let result = text;
  for (const [key, val] of Object.entries(PREVIEW_REPLACEMENTS)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
  }
  return result;
}

type Audience = 'active' | 'future' | 'past';

interface PreviewData {
  count: number;
  names: string[];
}

interface BroadcastPanelProps {
  propertyId: string;
  messengerName?: string;
  messengerColor?: string;
}

export function BroadcastPanel({ propertyId, messengerName }: BroadcastPanelProps) {
  const [audience, setAudience] = useState<Audience>('active');
  const [pastDays, setPastDays] = useState(3);
  const [messageBody, setMessageBody] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Mention/variable autocomplete
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch preview audience count
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ propertyId, audience, pastDays: String(pastDays) });
      const res = await fetch(`/api/broadcast/preview?${params}`);
      const data = await res.json();
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [propertyId, audience, pastDays]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // Mention autocomplete logic
  const filteredVars = VARIABLE_CATALOG.filter(v =>
    mentionQuery === '' || v.searchKey.includes(mentionQuery.toLowerCase()) || v.label.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageBody(val);

    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/%(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertVariable = (placeholder: string) => {
    const val = messageBody;
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const mentionStart = textBefore.lastIndexOf('%');
    const newVal = val.slice(0, mentionStart) + placeholder + val.slice(cursor);
    setMessageBody(newVal);
    setMentionOpen(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = mentionStart + placeholder.length;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredVars.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredVars[mentionIndex]) insertVariable(filteredVars[mentionIndex].placeholder);
    }
    if (e.key === 'Escape') setMentionOpen(false);
  };

  const handleSend = async () => {
    setSending(true);
    setShowConfirm(false);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          audience,
          pastDays,
          body: messageBody.trim(),
          messengerName: messengerName?.trim() || undefined,
          scheduledFor: scheduleEnabled && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      toast.success(`${data.queued} mensagens enfileiradas com sucesso!${data.skipped > 0 ? ` (${data.skipped} sem telefone ignorados)` : ''}`);
      setMessageBody('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar comunicado.');
    } finally {
      setSending(false);
    }
  };

  const audienceLabel: Record<Audience, string> = {
    active: 'hóspedes ativos (in-house)',
    future: 'reservas futuras',
    past: `checkout nos últimos ${pastDays} dia${pastDays > 1 ? 's' : ''}`,
  };

  const previewText = resolvePreview(messageBody.trim());
  const canSend = messageBody.trim().length > 0 && (preview?.count ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-2">

      {/* Audience selector */}
      <div className="space-y-3">
        <label className="field-label">Audiência</label>
        <div className="flex gap-2">
          {([
            { key: 'active', label: 'Ativos', icon: '🟢', desc: 'In-house agora' },
            { key: 'future', label: 'Futuros', icon: '📅', desc: 'Chegadas confirmadas' },
            { key: 'past',   label: 'Passados', icon: '🏁', desc: 'Já fizeram checkout' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setAudience(opt.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-sm font-medium transition-all ${
                audience === opt.key
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card border-border hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <span>{opt.label}</span>
              <span className={`text-[10px] font-normal ${audience === opt.key ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>{opt.desc}</span>
            </button>
          ))}
        </div>

        {/* Past days slider */}
        {audience === 'past' && (
          <div className="flex items-center gap-4 bg-muted/40 rounded-xl px-4 py-3 border">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Janela:</span>
            <input
              type="range"
              min={1}
              max={30}
              value={pastDays}
              onChange={e => setPastDays(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-semibold w-24 text-right">
              últimos {pastDays} dia{pastDays > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Audience count */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          preview?.count === 0 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'bg-muted/40 text-muted-foreground'
        }`}>
          {previewLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : preview?.count === 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Users className="w-3.5 h-3.5 shrink-0" />
          )}
          {previewLoading ? 'Calculando...' : preview?.count === 0
            ? 'Nenhum hóspede encontrado nessa audiência.'
            : `${preview?.count ?? '–'} hóspede${(preview?.count ?? 0) !== 1 ? 's' : ''} serão atingidos${preview?.names?.length ? ` · ${preview.names.join(', ')}${(preview.count ?? 0) > 5 ? '...' : ''}` : ''}`
          }
        </div>
      </div>

      {/* Message textarea with variable autocomplete */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="field-label">Mensagem</label>
          <span className="text-[10px] text-muted-foreground">Use % para inserir variáveis</span>
        </div>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={messageBody}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={5}
            placeholder="Olá {{guest_name}}, gostaríamos de informar..."
            className="w-full field-input resize-none leading-relaxed"
          />
          {/* Variable autocomplete dropdown */}
          {mentionOpen && filteredVars.length > 0 && (
            <div className="absolute left-0 right-0 bottom-full mb-1 bg-popover border rounded-xl shadow-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
              {filteredVars.map((v, i) => (
                <button
                  key={v.placeholder}
                  onMouseDown={e => { e.preventDefault(); insertVariable(v.placeholder); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 ${i === mentionIndex ? 'bg-muted/50' : ''}`}
                >
                  <span className="font-medium">{v.label}</span>
                  <code className="text-[10px] text-muted-foreground font-mono">{v.placeholder}</code>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live preview */}
        {messageBody.trim() && (
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Prévia (com dados fictícios)</span>
            <div className="bg-muted/40 rounded-xl px-4 py-3 text-sm text-foreground/80 whitespace-pre-wrap border">
              {messengerName?.trim() ? <><strong>{messengerName.trim()}:</strong>{' '}</> : null}
              {previewText}
            </div>
          </div>
        )}
      </div>

      {/* Schedule toggle */}
      <div className="space-y-2">
        <button
          onClick={() => setScheduleEnabled(s => !s)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarClock className="w-4 h-4" />
          {scheduleEnabled ? 'Cancelar agendamento' : 'Agendar envio para mais tarde'}
        </button>
        {scheduleEnabled && (
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={e => setScheduledFor(e.target.value)}
            className="field-input w-fit"
          />
        )}
      </div>

      {/* Send button */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Envios distribuídos automaticamente para evitar bloqueios
        </div>
        <Button
          disabled={!canSend || sending}
          onClick={() => setShowConfirm(true)}
          className="gap-2 shrink-0"
        >
          <Megaphone className="w-4 h-4" />
          {scheduleEnabled ? 'Agendar' : 'Enviar'} para {preview?.count ?? 0} hóspedes
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-semibold">Confirmar Comunicado</h2>
              <button onClick={() => setShowConfirm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Audiência</p>
                  <p className="font-medium capitalize">{audienceLabel[audience]}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Destinatários</p>
                  <p className="font-semibold text-lg">{preview?.count ?? 0}</p>
                </div>
              </div>
              <div className="bg-muted/40 rounded-xl px-4 py-3 text-sm text-foreground/80 whitespace-pre-wrap border max-h-32 overflow-y-auto">
                {messengerName?.trim() ? <><strong>{messengerName.trim()}:</strong>{' '}</> : null}
                {previewText.slice(0, 200)}{previewText.length > 200 ? '...' : ''}
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>Os envios serão distribuídos automaticamente com intervalos variados para evitar bloqueios no WhatsApp.</span>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t justify-end">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                Confirmar Envio
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
