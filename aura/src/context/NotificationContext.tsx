"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";
import { todayPropertyIso } from "@/lib/dates";

interface NotificationCounts {
  messages: number;
  concierge: number;
  bookings: number;
  /** Alarmes comerciais vencidos/de hoje — badge dos itens do grupo Comercial. */
  crmQuoteAlarms: number;
  crmWeddingAlarms: number;
  /** Só o operacional de balcão (mensagens+concierge+agendamentos) — alarmes ficam de fora. */
  total: number;
}

interface NotificationContextValue {
  counts: NotificationCounts;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  counts: { messages: 0, concierge: 0, bookings: 0, crmQuoteAlarms: 0, crmWeddingAlarms: 0, total: 0 },
  refetch: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { currentProperty: property } = useProperty();
  const supabase = createClientBrowser();
  const propertyId = property?.id;

  const [messages, setMessages] = useState(0);
  const [concierge, setConcierge] = useState(0);
  const [bookings, setBookings] = useState(0);
  const [crmQuoteAlarms, setCrmQuoteAlarms] = useState(0);
  const [crmWeddingAlarms, setCrmWeddingAlarms] = useState(0);

  const fetchAll = useCallback(async () => {
    if (!propertyId) return;

    // Alarme "devido" = vence hoje ou já venceu (fuso da operação).
    const today = todayPropertyIso();

    const [msgRes, concRes, bookRes, quoteAlarmRes, weddingAlarmRes, overdueInstRes] = await Promise.all([
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('direction', 'inbound')
        .eq('isReadByAdmin', false),
      supabase
        .from('concierge_requests')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('status', 'pending'),
      supabase
        .from('structure_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('status', 'pending')
        .eq('type', 'booking'),
      supabase
        .from('crm_alarms')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('done', false)
        .eq('entityType', 'quote')
        .lte('dueAt', today),
      supabase
        .from('crm_alarms')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('done', false)
        .eq('entityType', 'wedding')
        .lte('dueAt', today),
      // Parcela vencida = cobrança na fila de casamentos (linha virtual) —
      // entra no badge também. Join !inner: a tabela não tem propertyId.
      // Cancelado/perdido fora, espelhando listOverdueInstallments.
      supabase
        .from('wedding_installments')
        .select('id, weddings!inner(propertyId, status)', { count: 'exact', head: true })
        .eq('weddings.propertyId', propertyId)
        .not('weddings.status', 'in', '(cancelled,lost)')
        .eq('paid', false)
        .not('dueDate', 'is', null)
        .lte('dueDate', today),
    ]);

    setMessages(msgRes.count ?? 0);
    setConcierge(concRes.count ?? 0);
    setBookings(bookRes.count ?? 0);
    // Antes das migrations da fase B.5 as tabelas não existem: count null → 0.
    setCrmQuoteAlarms(quoteAlarmRes.count ?? 0);
    setCrmWeddingAlarms((weddingAlarmRes.count ?? 0) + (overdueInstRes.count ?? 0));
  }, [propertyId, supabase]);

  useEffect(() => {
    if (!propertyId) return;
    fetchAll();

    const msgChannel = supabase
      .channel(`notifctx_messages_${propertyId}`)
      // Filtro por `direction`, não por `propertyId`: a contagem só depende de mensagem
      // RECEBIDA. Filtrando aqui, as ~22 mil transições de status do fluxo de saída
      // (queued→sent→delivered) param de atravessar RLS e websocket só para serem
      // descartadas logo abaixo — eram ~60% do tráfego de realtime desta tabela.
      // O escopo de propriedade não se perde: a policy `property_scoped_all` de
      // `messages` já limita o que o realtime entrega. A conferência cobre o
      // super_admin, o único que enxerga as duas propriedades.
      // DELETE continua fora: com replica identity DEFAULT só a PK viaja, então não
      // casa o filtro — mesmo efeito de antes, quando `direction` vinha undefined.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'direction=eq.inbound' }, (payload: any) => {
        const pid = payload.new?.propertyId ?? payload.old?.propertyId;
        if (pid && pid !== propertyId) return;
        fetchAll();
      })
      .subscribe();

    const conciergeChannel = supabase
      .channel(`notifctx_concierge_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concierge_requests', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    const bookingsChannel = supabase
      .channel(`notifctx_bookings_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'structure_bookings', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    const alarmsChannel = supabase
      .channel(`notifctx_crm_alarms_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_alarms', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    // Sem filtro por propertyId (a tabela não tem a coluna) — volume é baixo
    // e o fetchAll refaz a conta certa de qualquer jeito.
    const installmentsChannel = supabase
      .channel(`notifctx_wedding_installments_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wedding_installments' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(alarmsChannel);
      supabase.removeChannel(installmentsChannel);
    };
  }, [propertyId, supabase, fetchAll]);

  const counts: NotificationCounts = {
    messages,
    concierge,
    bookings,
    crmQuoteAlarms,
    crmWeddingAlarms,
    total: messages + concierge + bookings,
  };

  return (
    <NotificationContext.Provider value={{ counts, refetch: fetchAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
