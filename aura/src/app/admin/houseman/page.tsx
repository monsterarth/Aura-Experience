// src/app/admin/houseman/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeRequest } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import {
  PackagePlus, CheckCircle2, Clock, Loader2, Sparkles,
  LogOut, UserCheck, User, Wrench
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function timeElapsed(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

export default function HousemanPage() {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();

  const [requests, setRequests] = useState<ConciergeRequest[]>([]);
  const [done, setDone] = useState<ConciergeRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Realtime — all requests (guest + maid), status pending + in_progress
  useEffect(() => {
    if (!property) return;
    const unsub = ConciergeService.listenToPendingRequests(property.id, setRequests);
    return unsub;
  }, [property]);

  // Audio on new request
  useEffect(() => {
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    if (pendingCount > prevCountRef.current) {
      try {
        if (!audioRef.current) audioRef.current = new Audio('/notification.mp3');
        audioRef.current.play().catch(() => {});
      } catch { /* ignore */ }
    }
    prevCountRef.current = pendingCount;
  }, [requests]);

  const handleAssign = async (req: ConciergeRequest) => {
    if (!property || !userData) return;
    setActionLoading(prev => ({ ...prev, [req.id]: true }));
    try {
      await ConciergeService.assignRequest(property.id, req.id, userData.id, userData.fullName);
      toast.success('Pedido assumido!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao assumir pedido.');
    } finally {
      setActionLoading(prev => ({ ...prev, [req.id]: false }));
    }
  };

  const handleDeliver = async (req: ConciergeRequest) => {
    if (!property || !userData) return;
    setActionLoading(prev => ({ ...prev, [req.id]: true }));
    try {
      await ConciergeService.deliverRequest(property.id, req.id, userData.id, userData.fullName);
      setDone(prev => [{ ...req, status: 'delivered' }, ...prev]);
      toast.success('Entrega confirmada!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao confirmar entrega.');
    } finally {
      setActionLoading(prev => ({ ...prev, [req.id]: false }));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  const pending = requests.filter(r => r.status === 'pending');
  const inProgress = requests.filter(r => r.status === 'in_progress');
  const totalActive = requests.length;

  if (!property) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  const RequestCard = ({ req }: { req: ConciergeRequest }) => {
    const isActing = actionLoading[req.id];
    const isInProgress = req.status === 'in_progress';
    const isMine = req.assignedTo === userData?.id;
    const fromMaid = req.requestedBy === 'maid';

    return (
      <div className={cn(
        "bg-card rounded-2xl p-4 space-y-3 animate-in fade-in duration-200 border-2",
        isInProgress
          ? "border-blue-500/40"
          : "border-orange-500/30"
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {fromMaid
                ? <Wrench size={11} className="text-orange-400 shrink-0" />
                : <User size={11} className="text-primary shrink-0" />
              }
              <p className={cn(
                "text-xs font-black uppercase tracking-wide",
                isInProgress ? "text-blue-400" : "text-orange-500"
              )}>
                {req.cabinName || '—'}
              </p>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                fromMaid
                  ? "bg-orange-500/10 text-orange-400"
                  : "bg-primary/10 text-primary"
              )}>
                {fromMaid ? 'Camareira' : 'Hóspede'}
              </span>
            </div>
            <p className="text-base font-bold text-foreground">
              {req.quantity}x {req.item?.name || req.itemId}
            </p>
            {req.notes && req.notes !== 'Solicitado pela camareira' && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{req.notes}&rdquo;</p>
            )}
            {isInProgress && req.assignedName && (
              <p className="text-[11px] text-blue-400 mt-1 flex items-center gap-1">
                <UserCheck size={11} />
                {isMine ? 'Você assumiu' : `Assumido por ${req.assignedName}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Clock size={11} />
            <span>{timeElapsed(req.createdAt)}</span>
          </div>
        </div>

        {!isInProgress && (
          <button
            onClick={() => handleAssign(req)}
            disabled={isActing}
            className="w-full py-3 bg-orange-500/20 border border-orange-500/40 text-orange-400 font-black text-xs uppercase rounded-xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isActing
              ? <Loader2 size={15} className="animate-spin" />
              : <><UserCheck size={15} /> Assumir Pedido</>
            }
          </button>
        )}

        {isInProgress && (
          <button
            onClick={() => handleDeliver(req)}
            disabled={isActing}
            className="w-full py-3 bg-green-500 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/30"
          >
            {isActing
              ? <Loader2 size={15} className="animate-spin" />
              : <><CheckCircle2 size={15} /> Confirmar Entrega</>
            }
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <header className="bg-primary text-primary-foreground p-6 shadow-md shrink-0 relative overflow-hidden">
        <div className="absolute -right-4 -top-8 text-white/10 rotate-12 pointer-events-none">
          <PackagePlus size={120} />
        </div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Olá, {userData?.fullName?.split(' ')[0]}!
            </h1>
            <p className="text-primary-foreground/80 text-sm font-medium mt-0.5">
              {totalActive > 0
                ? `${pending.length} novo${pending.length !== 1 ? 's' : ''} · ${inProgress.length} em andamento`
                : 'Nenhuma solicitação pendente'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalActive > 0 && (
              <span className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-black text-sm animate-pulse">
                {totalActive}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6 overflow-y-auto pb-10">

        {/* Pending — waiting to be assumed */}
        {pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Novos Pedidos
            </h2>
            {pending.map(req => <RequestCard key={req.id} req={req} />)}
          </section>
        )}

        {/* In progress — assumed, awaiting delivery */}
        {inProgress.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Em Andamento
            </h2>
            {inProgress.map(req => <RequestCard key={req.id} req={req} />)}
          </section>
        )}

        {/* Empty state */}
        {totalActive === 0 && done.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3 opacity-40 mt-10">
            <Sparkles size={40} className="text-muted-foreground" />
            <p className="text-lg font-bold">Tudo em dia</p>
            <p className="text-sm">Pedidos de hóspedes e camareiras aparecem aqui.</p>
          </div>
        )}

        {/* Done this session */}
        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CheckCircle2 size={12} className="text-green-500" />
              Entregues esta sessão
            </h2>
            {done.map(req => (
              <div key={req.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3 opacity-70">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">
                    {req.quantity}x {req.item?.name || req.itemId}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{req.cabinName || '—'}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 shrink-0">
                  Entregue
                </span>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
