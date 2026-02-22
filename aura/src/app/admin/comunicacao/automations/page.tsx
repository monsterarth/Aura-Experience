"use client";

import { useEffect, useState } from "react";
import { useProperty } from "@/context/PropertyContext";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WhatsAppMessage } from "@/types/aura";
import { AutomationService } from "@/services/automation-service";
import { Button } from "@/components/ui/button";
import { 
  Bot, CheckCircle2, Clock, AlertCircle, RefreshCw, MessageSquareWarning, Loader2, CalendarClock
} from "lucide-react";

export default function AutomationsQueuePage() {
  const { property } = useProperty();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'sent' | 'failed'>('pending');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (!property?.id) return;

    const messagesRef = collection(db, "properties", property.id, "messages");
    
    // ARQUITETURA DE BAIXO CUSTO: Exige o Índice Composto, mas garante limite de Reads no Firebase.
    const q = query(
      messagesRef, 
      where("isAutomated", "==", true),
      orderBy("createdAt", "desc"),
      limit(200) // Proteção financeira: Baixa no máximo o histórico recente
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppMessage));
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar fila de mensagens. Crie o índice no link do console:", error);
      setLoading(false);
    });

    return () => unsubscribe();
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

  const pendingMessages = messages.filter(m => m.status === 'pending' || m.status === 'processing');
  const sentMessages = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read');
  const failedMessages = messages.filter(m => m.status === 'failed');

  const getFilteredMessages = () => {
    if (activeTab === 'pending') return pendingMessages;
    if (activeTab === 'sent') return sentMessages;
    return failedMessages;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return "Data indefinida";
    return timestamp.toDate().toLocaleString('pt-BR', { 
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
        <div className="flex space-x-1 bg-muted/50 p-1 rounded-xl mb-6 w-full max-w-md">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'pending' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Clock className="w-4 h-4" /> Agendadas ({pendingMessages.length})</button>
          <button onClick={() => setActiveTab('sent')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'sent' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><CheckCircle2 className="w-4 h-4" /> Enviadas ({sentMessages.length})</button>
          <button onClick={() => setActiveTab('failed')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'failed' ? 'bg-background shadow-sm text-destructive' : 'text-muted-foreground hover:text-destructive'}`}><AlertCircle className="w-4 h-4" /> Falhas ({failedMessages.length})</button>
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
                    <Button variant="outline" size="sm" className="mt-2 w-full border-destructive/30 hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleRetry(msg.id)} disabled={retryingId === msg.id}>{retryingId === msg.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> A reprocessar...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Tentar Novamente</>}</Button>
                  </div>
                )}

                {msg.status === 'pending' && <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200"><Clock className="w-4 h-4" /> <span className="text-sm font-medium">A aguardar envio</span></div>}
                {(msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read') && <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"><CheckCircle2 className="w-4 h-4" /> <span className="text-sm font-medium">Entregue</span></div>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}