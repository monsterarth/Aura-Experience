"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";

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
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const [msgRes, concRes, bookRes, quoteAlarmRes, weddingAlarmRes] = await Promise.all([
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
    ]);

    setMessages(msgRes.count ?? 0);
    setConcierge(concRes.count ?? 0);
    setBookings(bookRes.count ?? 0);
    // Antes da migration crm_phase2_alarms a tabela não existe: count vem null → 0.
    setCrmQuoteAlarms(quoteAlarmRes.count ?? 0);
    setCrmWeddingAlarms(weddingAlarmRes.count ?? 0);
  }, [propertyId, supabase]);

  useEffect(() => {
    if (!propertyId) return;
    fetchAll();

    const msgChannel = supabase
      .channel(`notifctx_messages_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `propertyId=eq.${propertyId}` }, (payload: any) => {
        // A contagem só depende de mensagens recebidas; ignora o fluxo automatizado de saída e seus status
        const direction = payload.new?.direction ?? payload.old?.direction;
        if (direction !== 'inbound') return;
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

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(alarmsChannel);
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
