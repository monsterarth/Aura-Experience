"use client";

import { useEffect, useState } from "react";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { WhatsAppMessage } from "@/types/aura";
import { AutomationService } from "@/services/automation-service";
import { Button } from "@/components/ui/button";
import {
  Bot, CheckCircle2, Clock, AlertCircle, RefreshCw, MessageSquareWarning, Loader2, CalendarClock, Edit2, XCircle, Trash2, Ban
} from "lucide-react";

export default function AutomationsQueuePage() {
  const { currentProperty: property } = useProperty();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'sent' | 'failed' | 'cancelled'>('pending');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!property?.id) return;

    const fetchMessages = async () => {
      // 4 days ago threshold for sent/delivered ones
      const archiveThreshold = new Date();
      archiveThreshold.setDate(archiveThreshold.getDate() - 4);

      let query = supabase
        .from('messages')
        .select('*')
        .eq('propertyId', property.id)
        .eq('isAutomated', true)
        .order('createdAt', { ascending: false })
        .limit(200);

      const { data, error } = await query;

      if (data) {
        // Filter out old sent/delivered messages in memory, to keep the view clean
        const filteredData = data.filter((m: any) => {
          if (['sent', 'delivered', 'read'].includes(m.status)) {
            const msgDate = new Date(m.createdAt);
            if (msgDate < archiveThreshold) return false;
          }
          return true;
        });
        setMessages(filteredData as any[]);
      }
      setLoading(false);
    };

    fetchMessages();

    // Listen for real-time changes
    const channel = supabase.channel('automations_queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `propertyId=eq.${property.id}`
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [property?.id]);

  const handleRetry = async (messageId: string) => {
    if (!property?.id) return;
    setRetryingId(messageId);

    const success = await AutomationService.retryFailedMessage(property.id, messageId);
    if (!success) {
      alert("Não foi possível reenviar a mensagem. Verifique a conexão.");
    }

    setRetryingId(null);
  };

  const handleEditAndRetry = async (messageId: string) => {
    if (!property?.id || !editPhone) return;
    setRetryingId(messageId);
    
    let cleanedPhone = editPhone.replace(/\D/g, '');
    if ((cleanedPhone.length === 10 || cleanedPhone.length === 11) && !cleanedPhone.startsWith('55')) {
      cleanedPhone = '55' + cleanedPhone;
    }

    const success = await AutomationService.editAndRetryMessage(property.id, messageId, cleanedPhone);
    if (success) {
      setEditingId(null);
      setEditPhone("");
    } else {
      alert("Não foi possível editar e reenviar a mensagem.");
    }
    setRetryingId(null);
  };

  const handleCancel = async (messageId: string) => {
    if (!property?.id) return;
    if (!confirm("Tem certeza que deseja cancelar esta mensagem? Ela não será enviada ao hóspede.")) return;
    
    setIsCancelling(messageId);
    const success = await AutomationService.cancelMessage(property.id, messageId);
    if (!success) {
      alert("Falha ao cancelar mensagem.");
    }
    setIsCancelling(null);
  };

  const pendingMessages = messages.filter(m => m.status === 'pending' || m.status === 'processing');
  const sentMessages = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read');
  const failedMessages = messages.filter(m => m.status === 'failed');
  const cancelledMessages = messages.filter(m => m.status === 'cancelled');

  const getFilteredMessages = () => {
    if (activeTab === 'pending') return pendingMessages;
    if (activeTab === 'sent') return sentMessages;
    if (activeTab === 'cancelled') return cancelledMessages;
    return failedMessages;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Data indefinida";
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const translateTrigger = (trigger?: string) => {
    const triggers: Record<string, string> = {
      'pre_checkin_48h': 'Pré Check-in (48h)',
      'pre_checkin_24h': 'Pré Check-in (24h)',
      'welcome_checkin': 'Boas-vindas (Check-in)',
      'pre_checkout': 'Instruções de Saída',
      'checkout_thanks': 'Agradecimento (Check-out)',
      'nps_survey': 'Pesquisa NPS',
      'structure_booking_confirmed': 'Agendamento de Estrutura',
    };
    return trigger ? (triggers[trigger] || trigger) : 'Gatilho Desconhecido';
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20">
      <header className="flex items-center justify-between px-6 py-5 bg-background border-b sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" /> Fila de Automações (Robô)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitorize o envio automático de mensagens</p>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex space-x-1 bg-muted/50 p-1 rounded-xl mb-6 w-full max-w-2xl overflow-x-auto">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'pending' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Clock className="w-4 h-4" /> Agendadas ({pendingMessages.length})</button>
          <button onClick={() => setActiveTab('sent')} className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'sent' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><CheckCircle2 className="w-4 h-4" /> Enviadas ({sentMessages.length})</button>
          <button onClick={() => setActiveTab('failed')} className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'failed' ? 'bg-background shadow-sm text-destructive' : 'text-muted-foreground hover:text-destructive'}`}><AlertCircle className="w-4 h-4" /> Falhas ({failedMessages.length})</button>
          <button onClick={() => setActiveTab('cancelled')} className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'cancelled' ? 'bg-background shadow-sm text-muted-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}><Ban className="w-4 h-4" /> Canceladas ({cancelledMessages.length})</button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin text-primary mb-4" /><p>A carregar a fila de automação...</p></div>
        ) : getFilteredMessages().length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 bg-background border border-dashed rounded-2xl shadow-sm text-center p-6 animate-in fade-in"><div className="w-16 h-16 bg-muted text-muted-foreground rounded-full flex items-center justify-center mb-4"><Bot className="w-8 h-8 opacity-50" /></div><h2 className="text-xl font-bold text-foreground mb-2">Fila Vazia</h2><p className="text-muted-foreground max-w-md">Não há mensagens nesta categoria no histórico recente.</p></div>
        ) : (
          <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4">
            {getFilteredMessages().map((msg) => (
              <div key={msg.id} className={`bg-background border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${msg.status === 'failed' ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary">{translateTrigger(msg.triggerEvent)}</span><span className="text-sm font-medium text-foreground">Destino: {msg.to}</span></div>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg line-clamp-2 border border-dashed">{msg.body}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1"><span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Agendado para: {formatDate(msg.scheduledFor || msg.createdAt)}</span>{msg.attempts > 0 && <span className="flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Tentativas: {msg.attempts}/3</span>}</div>
                </div>

                {msg.status === 'failed' && (
                  <div className="flex flex-col items-end gap-2 md:pl-6 md:border-l border-destructive/20 min-w-[200px]">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-destructive"><MessageSquareWarning className="w-4 h-4" /> Erro no Envio</div>
                    {msg.errorMessage && <p className="text-xs text-destructive/80 text-right line-clamp-2" title={msg.errorMessage}>{msg.errorMessage}</p>}
                    
                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-2 w-full mt-2 bg-background border border-border p-2 rounded-lg">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Corrigir WhatsApp</label>
                        <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Ex: 5553981169216" className="w-full text-xs p-1.5 border rounded-md outline-none focus:border-primary" />
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setEditingId(null)}>Cancelar</Button>
                          <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handleEditAndRetry(msg.id)} disabled={retryingId === msg.id || !editPhone}>Salvar e Enviar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col w-full gap-2 mt-2">
                        <Button variant="outline" size="sm" className="w-full border-destructive/30 hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleRetry(msg.id)} disabled={retryingId === msg.id}>{retryingId === msg.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> A reprocessar...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Tentar Novamente</>}</Button>
                        <Button variant="ghost" size="sm" className="w-full text-xs hover:bg-muted" onClick={() => { setEditingId(msg.id); setEditPhone(msg.to || ""); }}><Edit2 className="w-3.5 h-3.5 mr-1.5"/> Editar Número</Button>
                      </div>
                    )}
                  </div>
                )}

                {msg.status === 'pending' && (
                  <div className="flex flex-col items-end gap-2 md:pl-6 md:border-l border-border min-w-[150px]">
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200"><Clock className="w-4 h-4" /> <span className="text-sm font-medium">A aguardar envio</span></div>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10" disabled={isCancelling === msg.id} onClick={() => handleCancel(msg.id)}>
                      {isCancelling === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar Envio</>}
                    </Button>
                  </div>
                )}

                {(msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read') && <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 h-fit"><CheckCircle2 className="w-4 h-4" /> <span className="text-sm font-medium">Entregue</span></div>}
                {msg.status === 'cancelled' && <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border border-border h-fit"><Ban className="w-4 h-4" /> <span className="text-sm font-medium">Cancelada</span></div>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
