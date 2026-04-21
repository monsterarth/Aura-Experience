// src/app/admin/concierge/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeRequest } from "@/types/aura";
import {
  ShoppingBag, Loader2, CheckCircle2, RotateCcw, XCircle,
  Clock, Package, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = 'pending' | 'history';

function timeElapsed(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function AdminConciergePage() {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const { userData } = useAuth();

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<ConciergeRequest[]>([]);
  const [history, setHistory] = useState<ConciergeRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Realtime pending listener
  useEffect(() => {
    if (!property) return;

    const unsub = ConciergeService.listenToPendingRequests(property.id, (reqs) => {
      setPending(reqs);
    }, 'guest');

    return unsub;
  }, [property]);

  // Audio notification when new pending arrives
  useEffect(() => {
    if (pending.length > prevCountRef.current) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio('/notification.mp3');
        }
        audioRef.current.play().catch(() => {/* autoplay blocked */});
      } catch { /* ignore */ }
    }
    prevCountRef.current = pending.length;
  }, [pending.length]);

  const loadHistory = async () => {
    if (!property) return;
    setLoadingHistory(true);
    try {
      const data = await ConciergeService.getTodayRequests(property.id);
      setHistory(data);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (tab === 'history' && property) {
      loadHistory();
    }
  }, [tab, property]);

  const runAction = async (
    requestId: string,
    action: 'deliver' | 'return' | 'lost'
  ) => {
    if (!property || !userData) return;
    setActionLoading(prev => ({ ...prev, [requestId]: true }));

    try {
      if (action === 'deliver') {
        await ConciergeService.deliverRequest(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item entregue.');
      } else if (action === 'return') {
        await ConciergeService.returnRequest(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item retornado.');
      } else {
        await ConciergeService.markLost(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item marcado como extraviado.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar ação.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  if (propLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground text-sm">Selecione uma propriedade.</p>
      </div>
    );
  }

  const RequestCard = ({ req }: { req: ConciergeRequest }) => {
    const isLoan = req.item?.category === 'loan';
    const isActing = actionLoading[req.id];

    return (
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isLoan ? (
                <Package size={14} className="text-blue-400 shrink-0" />
              ) : (
                <ShoppingBag size={14} className="text-primary shrink-0" />
              )}
              <span className="text-xs font-black uppercase tracking-wide text-foreground truncate">
                {req.cabinName || '—'}
              </span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {req.quantity}x {req.item?.name || req.itemId}
            </p>
            {req.notes && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{req.notes}&rdquo;</p>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Clock size={11} />
            <span>{timeElapsed(req.createdAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => runAction(req.id, 'deliver')}
            disabled={isActing}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-xl py-2 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            Entregar
          </button>

          {isLoan && (
            <>
              <button
                onClick={() => runAction(req.id, 'return')}
                disabled={isActing}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl py-2 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                <RotateCcw size={13} />
                Retornado
              </button>
              <button
                onClick={() => runAction(req.id, 'lost')}
                disabled={isActing}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl py-2 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                <XCircle size={13} />
                Extraviado
              </button>
            </>
          )}
        </div>

        {isActing && (
          <div className="flex items-center justify-center">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  };

  const HistoryCard = ({ req }: { req: ConciergeRequest }) => {
    const statusMap: Record<string, { label: string; cls: string }> = {
      delivered: { label: 'Entregue', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
      returned: { label: 'Devolvido', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      lost: { label: 'Extraviado', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    };
    const s = statusMap[req.status] || statusMap.delivered;

    return (
      <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {req.quantity}x {req.item?.name || req.itemId}
          </p>
          <p className="text-[11px] text-muted-foreground">{req.cabinName || '—'}</p>
          {req.total_price != null && req.total_price > 0 && (
            <p className="text-[11px] text-primary font-semibold">R$ {req.total_price.toFixed(2)}</p>
          )}
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0', s.cls)}>
          {s.label}
        </span>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
          <ShoppingBag size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground uppercase tracking-wide">Concierge</h1>
          <p className="text-xs text-muted-foreground">Central de pedidos em tempo real</p>
        </div>
        {pending.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-black animate-pulse">
              {pending.length}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-2xl p-1">
        {(['pending', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all',
              tab === t
                ? 'bg-primary text-primary-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'pending' ? `Pendentes${pending.length > 0 ? ` (${pending.length})` : ''}` : 'Histórico de Hoje'}
          </button>
        ))}
      </div>

      {/* Pending Tab */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum pedido pendente</p>
              <p className="text-xs mt-1">Os pedidos dos hóspedes aparecem aqui em tempo real.</p>
            </div>
          ) : (
            pending.map(req => <RequestCard key={req.id} req={req} />)
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum pedido finalizado hoje.</p>
            </div>
          ) : (
            history.map(req => <HistoryCard key={req.id} req={req} />)
          )}
        </div>
      )}
    </div>
  );
}
