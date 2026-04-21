// src/components/admin/MaidMobileApp.tsx
"use client";

import React, { useState, useEffect } from "react";
import { HousekeepingTask, Cabin, ConciergeItem } from "@/types/aura";
import { HousekeepingChecklistModal } from "./HousekeepingChecklistModal";
import { MinibarModal } from "./MinibarModal";
import { HousekeepingService } from "@/services/housekeeping-service";
import { ConciergeService } from "@/services/concierge-service";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, ClipboardCheck, Coffee, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, MessageSquare, Info, KeyRound, PackagePlus, Loader2, Plus, Minus, Send, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface MaidMobileAppProps {
  propertyId: string;
  userData: any;
  tasks: HousekeepingTask[];
  cabins: Record<string, Cabin>;
}

// Checklist tick state + lazy-load per task — kept outside the component to survive re-renders
type CheckItem = { id: string; label: string; checked: boolean; source?: 'global' | 'cabin' | 'stay' };

function TaskDetailsPanel({ task, cabins, propertyId, userData }: { task: HousekeepingTask; cabins: Record<string, Cabin>; propertyId: string; userData: any }) {
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // Reposição
  const [showReposicao, setShowReposicao] = useState(false);
  const [maidItems, setMaidItems] = useState<ConciergeItem[]>([]);
  const [loadingMaidItems, setLoadingMaidItems] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load checklist
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingChecklist(true);
      try {
        let items: CheckItem[] = [];

        if (task.checklist && task.checklist.length > 0) {
          items = task.checklist.map(i => ({ ...i, checked: i.checked ?? false }));
        } else {
          const templates = await HousekeepingService.getChecklistTemplates(task.propertyId);
          const tpl = templates.find((t: any) => t.type === task.type);
          if (tpl?.items) items.push(...tpl.items.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: 'global' as const })));

          if (task.cabinId) {
            const { data: cabinData } = await supabase.from('cabins').select('housekeepingItems').eq('id', task.cabinId).single();
            if (cabinData?.housekeepingItems?.length) items.push(...cabinData.housekeepingItems.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: 'cabin' as const })));
          }

          if (task.stayId && !task.stayId.includes("MOCK")) {
            const { data: stayData } = await supabase.from('stays').select('housekeepingItems').eq('id', task.stayId).single();
            if (stayData?.housekeepingItems?.length) items.push(...stayData.housekeepingItems.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: 'stay' as const })));
          }

          if (items.length === 0) items.push({ id: 'fallback-1', label: 'Limpeza padrão concluída', checked: false, source: 'global' });
        }

        if (!cancelled) setChecklist(items);
      } finally {
        if (!cancelled) setLoadingChecklist(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [task.id]);

  // Load concierge items available for maid (lazy, only when panel opens)
  const openReposicao = async () => {
    setShowReposicao(true);
    if (maidItems.length > 0) return;
    setLoadingMaidItems(true);
    try {
      const items = await ConciergeService.getConciergeItemsForMaid(propertyId);
      setMaidItems(items);
    } finally {
      setLoadingMaidItems(false);
    }
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      const n = { ...prev };
      if (next === 0) delete n[itemId];
      else n[itemId] = next;
      return n;
    });
  };

  const handleSubmitReposicao = async () => {
    if (!task.stayId) {
      toast.error("Tarefa sem reserva vinculada — não é possível solicitar reposição.");
      return;
    }
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.info("Selecione ao menos um item.");
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all(entries.map(([itemId, qty]) =>
        ConciergeService.createRequest(
          { propertyId, stayId: task.stayId!, cabinId: task.cabinId || undefined, itemId, quantity: qty, requestedBy: 'maid', notes: 'Solicitado pela camareira' },
          userData?.id || 'SYSTEM',
          userData?.fullName || 'Camareira'
        )
      ));
      toast.success(`${entries.length} solicitação(ões) enviada(s)!`);
      setCart({});
      setShowReposicao(false);
    } catch {
      toast.error("Erro ao enviar solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (id: string) => setChecklist(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  const done = checklist.filter(i => i.checked).length;

  return (
    <div className="mt-3 space-y-3 border-t border-green-500/20 pt-3">
      {/* Observations */}
      {task.observations && (
        <div className="flex items-start gap-2 bg-orange-500/10 text-orange-700 dark:text-orange-400 px-3 py-2.5 rounded-xl text-xs font-medium">
          <MessageSquare size={13} className="shrink-0 mt-0.5" />
          <span>{task.observations}</span>
        </div>
      )}

      {/* Checklist */}
      {loadingChecklist ? (
        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-green-500" /></div>
      ) : checklist.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-green-600/70">Checklist</span>
            <span className="text-[10px] font-bold text-green-600/70">{done}/{checklist.length}</span>
          </div>
          {checklist.map(item => (
            <label
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none",
                item.checked ? "bg-green-500/10 border-green-500/30" : "bg-background/60 border-border/60"
              )}
            >
              <input type="checkbox" className="sr-only" checked={item.checked} onChange={() => toggle(item.id)} />
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                item.checked ? "border-green-500 bg-green-500 text-white" : "border-green-500/30 bg-background"
              )}>
                {item.checked && <CheckCircle2 size={12} strokeWidth={3} />}
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className={cn("text-xs font-medium transition-all", item.checked ? "line-through opacity-50" : "text-foreground")}>
                  {item.label}
                </span>
                {item.source === 'cabin' && <span className="w-fit text-[9px] font-black uppercase bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded">Cabana</span>}
                {item.source === 'stay' && <span className="w-fit text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">Hóspede</span>}
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Ações */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {/* Chave — Em Breve */}
        <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed">
          <KeyRound size={18} className="text-muted-foreground" />
          <span className="text-[10px] font-black uppercase text-muted-foreground text-center leading-tight">Chave na Acomodação</span>
          <span className="text-[9px] font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">Em Breve</span>
        </div>

        {/* Solicitar Reposição — Funcional */}
        <button
          onClick={openReposicao}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-orange-500/30 bg-orange-500/5 active:scale-95 transition-all"
        >
          <PackagePlus size={18} className="text-orange-500" />
          <span className="text-[10px] font-black uppercase text-orange-600 text-center leading-tight">Solicitar Reposição</span>
        </button>
      </div>

      {/* Reposição sub-panel */}
      {showReposicao && (
        <div className="bg-card border border-orange-500/20 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-orange-500/10 bg-orange-500/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">Solicitar Reposição</span>
            <button onClick={() => { setShowReposicao(false); setCart({}); }} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          {loadingMaidItems ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-orange-500" /></div>
          ) : maidItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Nenhum item de reposição configurado.<br />
              <span className="opacity-60">Configure em Catálogo Concierge → Disponível para Camareira.</span>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {maidItems.map(item => {
                const qty = cart[item.id] || 0;
                return (
                  <div key={item.id} className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors",
                    qty > 0 && "bg-orange-500/5"
                  )}>
                    <span className={cn("flex-1 text-xs font-medium", qty > 0 ? "text-foreground font-bold" : "text-muted-foreground")}>
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => updateCart(item.id, -1)}
                        disabled={qty === 0}
                        className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center disabled:opacity-30 hover:bg-destructive/20 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-4 text-center font-black text-xs">{qty}</span>
                      <button
                        onClick={() => updateCart(item.id, 1)}
                        className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-orange-500/20 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="p-3">
                <button
                  onClick={handleSubmitReposicao}
                  disabled={submitting || Object.keys(cart).length === 0}
                  className="w-full py-2.5 bg-orange-500 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Enviar Solicitação
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MaidMobileApp({ propertyId, userData, tasks, cabins }: MaidMobileAppProps) {
  const router = useRouter();
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<string | null>(null);

  const toggleGuide = (taskId: string) => setExpandedGuide(prev => prev === taskId ? null : taskId);
  const toggleDetails = (taskId: string) => setOpenDetails(prev => prev === taskId ? null : taskId);

  // A mágica: Verifica se o ID da camareira logada está DENTRO do array de atribuídos
  const myTasks = tasks.filter(t => t.assignedTo?.includes(userData?.id) && t.status !== 'completed');

  const activeTasks = myTasks.filter(t => t.status === 'in_progress');
  const pendingTasks = myTasks.filter(t => t.status === 'pending');
  const waitingTasks = myTasks.filter(t => t.status === 'waiting_conference');

  // Filtro Global: Check-outs recém efetuados que ela ainda NÃO assumiu
  const globalPendingTurnovers = tasks.filter(t => t.status === 'pending' && t.type === 'turnover' && !t.assignedTo?.includes(userData?.id));

  const handleStart = async (taskId: string) => {
    try {
      await HousekeepingService.startTask(propertyId, taskId, userData.id, userData.fullName);
      toast.success("Limpeza iniciada.");
    } catch (e) {
      toast.error("Erro ao iniciar a tarefa.");
    }
  };

  const handleAssignToMe = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Adiciona esta camareira à lista sem remover as outras (Delegação Múltipla)
      const newAssignees = [...(task.assignedTo || []), userData.id];

      await HousekeepingService.updateTask(
        propertyId, taskId, { assignedTo: newAssignees }, userData.id, userData.fullName
      );
      toast.success("Você assumiu esta tarefa!");
    } catch (e) {
      toast.error("Erro ao assumir a tarefa.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  return (
    <div className="bg-background text-foreground flex flex-col mx-auto">

      <header className="bg-primary text-primary-foreground p-6 shadow-md shrink-0 relative overflow-hidden pb-10">
        {/* Background Decal */}
        <div className="absolute -right-4 -top-8 text-white/10 rotate-12 pointer-events-none">
            <Sparkles size={120} />
        </div>
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Olá, {userData?.fullName?.split(' ')[0]}!</h1>
            <p className="text-primary-foreground/80 text-sm font-medium">Você tem {pendingTasks.length + activeTasks.length} cabanas para hoje.</p>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-xl backdrop-blur-sm">
            {userData?.fullName?.charAt(0) || "C"}
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6 pb-24 -mt-6 relative z-20">

        {globalPendingTurnovers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-500 flex items-center gap-2">
              <Coffee size={16} /> Check-outs Recentes
            </h2>
            <p className="text-[10px] text-muted-foreground -mt-2 mb-3 leading-tight">
              Acesso livre para toda a equipe lançar o frigobar antes da arrumação.
            </p>
            {globalPendingTurnovers.map(task => (
              <div key={task.id} className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-foreground">
                    {cabins[task.cabinId || '']?.name || `Cabana ${task.cabinId}`}
                  </h3>
                  {task.keyLocation && (
                    <span className={cn(
                      "flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full border",
                      task.keyLocation === 'reception'
                        ? "bg-green-500/10 text-green-500 border-green-500/30"
                        : "bg-red-500/10 text-red-500 border-red-500/30"
                    )}>
                      <KeyRound size={10} />
                      {task.keyLocation === 'reception' ? 'Chave na Recepção' : 'Conferir Chaves'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                    className="flex-1 py-3 bg-blue-600 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-sm"
                  >
                    <Coffee size={16} /> Lançar Frigobar
                  </button>
                  <button
                    onClick={() => handleAssignToMe(task.id)}
                    className="py-3 px-4 bg-background text-foreground font-black text-xs uppercase rounded-xl border border-border hover:bg-secondary active:scale-95 transition-transform"
                  >
                    Assumir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mt-6">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Em Limpeza
            </h2>
            {activeTasks.map(task => {
              const isDetailsOpen = openDetails === task.id;
              const locationName = task.customLocation || cabins[task.cabinId || '']?.name || `Cabana ${task.cabinId}`;
              return (
                <div key={task.id} className="bg-green-500/10 border-2 border-green-500/30 rounded-2xl overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-2xl font-black text-green-600 dark:text-green-400">{locationName}</h3>
                        <p className="text-xs font-bold uppercase text-green-600/70 mt-0.5">
                          {task.type === 'turnover' ? 'Faxina Completa (Troca)' : task.type === 'daily' ? 'Arrumação Diária' : 'Limpeza Personalizada'}
                        </p>
                      </div>
                      {task.type === 'turnover' && task.keyLocation && (
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full border shrink-0",
                          task.keyLocation === 'reception'
                            ? "bg-green-500/10 text-green-500 border-green-500/30"
                            : "bg-red-500/10 text-red-500 border-red-500/30"
                        )}>
                          <KeyRound size={10} />
                          {task.keyLocation === 'reception' ? 'Chave OK' : 'Conferir Chaves'}
                        </span>
                      )}
                    </div>

                    {isDetailsOpen && (
                      <TaskDetailsPanel task={task} cabins={cabins} propertyId={propertyId} userData={userData} />
                    )}

                    <div className="flex gap-2 pt-1">
                      {task.type === 'turnover' && (
                        <button
                          onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                          className="py-3 px-4 bg-background text-blue-600 font-black text-xs uppercase rounded-xl border border-blue-500/20 active:scale-95 transition-transform flex justify-center items-center gap-2"
                        >
                          <Coffee size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => toggleDetails(task.id)}
                        className={cn(
                          "flex-1 py-3 font-black text-xs uppercase rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2 border",
                          isDetailsOpen
                            ? "bg-green-600/10 text-green-700 border-green-500/30"
                            : "bg-background text-green-700 border-green-500/30"
                        )}
                      >
                        <Info size={15} />
                        {isDetailsOpen ? "Fechar" : "Detalhes"}
                        {isDetailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <button
                        onClick={() => { setSelectedTask(task); setIsChecklistOpen(true); }}
                        className="flex-1 py-3 bg-green-600 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-lg shadow-green-500/30"
                      >
                        Finalizar <ClipboardCheck size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendingTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-6">Para Fazer (Minhas)</h2>
            {pendingTasks.map(task => {
              const isGuideOpen = expandedGuide === task.id;
              const hasGuide = task.checklist?.length > 0 || task.observations;
              const locationName = task.customLocation || cabins[task.cabinId || '']?.name || `Cabana ${task.cabinId}`;
              return (
                <div key={task.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-black text-foreground">{locationName}</h3>
                        <p className="text-xs font-bold uppercase text-muted-foreground mt-0.5">
                          {task.type === 'turnover' ? 'Faxina Completa' : task.type === 'daily' ? 'Arrumação Diária' : 'Limpeza Personalizada'}
                        </p>
                        {task.type === 'turnover' && task.keyLocation && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border mt-1",
                            task.keyLocation === 'reception'
                              ? "bg-green-500/10 text-green-500 border-green-500/30"
                              : "bg-red-500/10 text-red-500 border-red-500/30"
                          )}>
                            <KeyRound size={10} />
                            {task.keyLocation === 'reception' ? 'Chave na Recepção' : 'Conferir Chaves'}
                          </span>
                        )}
                      </div>
                      {hasGuide && (
                        <button
                          onClick={() => toggleGuide(task.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-secondary text-muted-foreground rounded-xl text-[10px] font-black uppercase transition-colors hover:text-foreground"
                        >
                          <ListChecks size={13} />
                          Guia
                          {isGuideOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                    </div>

                    {isGuideOpen && (
                      <div className="space-y-3 pt-1">
                        {task.observations && (
                          <div className="flex items-start gap-2 bg-orange-500/10 text-orange-700 dark:text-orange-400 px-3 py-2.5 rounded-xl text-xs font-medium">
                            <MessageSquare size={13} className="shrink-0 mt-0.5" />
                            <span>{task.observations}</span>
                          </div>
                        )}
                        {task.checklist?.length > 0 && (
                          <div className="space-y-1.5">
                            {task.checklist.map(item => (
                              <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-secondary/50 rounded-xl">
                                <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
                                <span className="text-xs font-medium text-foreground">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      {task.type === 'turnover' && (
                        <button
                          onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                          className="flex-1 py-3 bg-secondary text-foreground font-black text-xs uppercase rounded-xl border border-border active:scale-95 transition-transform flex justify-center items-center gap-2"
                        >
                          <Coffee size={16} /> Frigobar
                        </button>
                      )}
                      <button
                        onClick={() => handleStart(task.id)}
                        className="flex-1 py-3 bg-primary text-primary-foreground font-black text-sm uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2"
                      >
                        Iniciar <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {waitingTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-6">Aguardando Governanta</h2>
            {waitingTasks.map(task => (
              <div key={task.id} className="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl flex items-center justify-between opacity-70">
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {cabins[task.cabinId || '']?.name}
                  </h3>
                  <p className="text-[10px] uppercase font-bold text-green-600">Enviada para aprovação</p>
                </div>
                <CheckCircle2 size={24} className="text-green-500" />
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center space-y-3 opacity-50 mt-10">
            <Sparkles size={40} className="text-muted-foreground" />
            <p className="text-lg font-bold">Quadro Limpo</p>
            <p className="text-sm">Nenhuma tarefa pendente na pousada.</p>
          </div>
        )}
      </main>

      <HousekeepingChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.customLocation || cabins[selectedTask.cabinId || '']?.name || "") : ""} onComplete={() => { }} />
      <MinibarModal isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.customLocation || cabins[selectedTask.cabinId || '']?.name || "") : ""} />
    </div>
  );
}
