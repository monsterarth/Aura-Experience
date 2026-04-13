"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";

interface NotificationCounts {
  messages: number;
  concierge: number;
  bookings: number;
  total: number;
}

interface NotificationContextValue {
  counts: NotificationCounts;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  counts: { messages: 0, concierge: 0, bookings: 0, total: 0 },
  refetch: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { currentProperty: property } = useProperty();
  const supabase = createClientBrowser();
  const propertyId = property?.id;

  const [messages, setMessages] = useState(0);
  const [concierge, setConcierge] = useState(0);
  const [bookings, setBookings] = useState(0);

  const fetchAll = useCallback(async () => {
    if (!propertyId) return;

    const [msgRes, concRes, bookRes] = await Promise.all([
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
    ]);

    setMessages(msgRes.count ?? 0);
    setConcierge(concRes.count ?? 0);
    setBookings(bookRes.count ?? 0);
  }, [propertyId, supabase]);

  useEffect(() => {
    if (!propertyId) return;
    fetchAll();

    const msgChannel = supabase
      .channel(`notifctx_messages_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    const conciergeChannel = supabase
      .channel(`notifctx_concierge_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concierge_requests', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    const bookingsChannel = supabase
      .channel(`notifctx_bookings_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'structure_bookings', filter: `propertyId=eq.${propertyId}` }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(bookingsChannel);
    };
  }, [propertyId, supabase, fetchAll]);

  const counts: NotificationCounts = {
    messages,
    concierge,
    bookings,
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
