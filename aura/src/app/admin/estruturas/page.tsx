"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Clock, MapPin, Eye, CheckCircle2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { StructureService } from "@/services/structure-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { Structure } from "@/types/aura";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { PageShell, PageHeader, Card, Button, IconButton, Pill, Loadable, SkeletonCards, EmptyState, useConfirm } from "@/components/aura";
import { StructureEditModal } from "./components/StructureEditModal";

const VISIBILITY_LABEL: Record<string, string> = {
  admin_only: "Apenas recepção",
  guest_request: "Hóspede solicita",
  guest_auto_approve: "Hóspede reserva (auto)",
  map_only: "Apenas no mapa",
};

export default function StructuresPage() {
  const { currentProperty } = useProperty();
  const { userData } = useAuth();
  const confirm = useConfirm();

  const [structures, setStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<Structure | null>(null);

  const loadStructures = useCallback(async () => {
    if (!currentProperty) return;
    try {
      const data = await StructureService.getStructures(currentProperty.id);
      setStructures(data);
    } catch {
      toast.error("Erro ao carregar estruturas.");
    } finally {
      setLoading(false);
    }
  }, [currentProperty]);

  useEffect(() => { if (currentProperty) { setLoading(true); void loadStructures(); } }, [currentProperty, loadStructures]);

  const handleDelete = async (structure: Structure) => {
    if (!currentProperty || !userData) return;
    const ok = await confirm({ title: "Excluir estrutura?", description: `“${structure.name}” some da agenda e do mapa. Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", tone: "danger" });
    if (!ok) return;
    try {
      await StructureService.deleteStructure(currentProperty.id, structure.id, userData.id, userData.fullName);
      toast.success("Estrutura excluída!");
      void loadStructures();
    } catch {
      toast.error("Erro ao excluir estrutura.");
    }
  };

  const openNew = () => { setEditingStructure(null); setIsModalOpen(true); };
  const openEdit = (structure: Structure) => { setEditingStructure(structure); setIsModalOpen(true); };

  return (
    <PageShell>
      <PageHeader
        icon={MapPin}
        title="Estruturas"
        subtitle="Quadras, spas, saunas e salas de massagem — regras de operação e agendamento"
        primaryAction={{ label: "Nova estrutura", icon: Plus, onClick: openNew }}
        actions={<Button variant="secondary" icon={CalendarDays} href="/admin/estruturas/bookings">Agenda do dia</Button>}
      />

      <Loadable loading={loading} skeleton={<SkeletonCards n={6} minWidth={280} />}>
        {structures.length === 0 ? (
          <EmptyState icon={MapPin} title="Nenhuma estrutura cadastrada" description="Adicione spas, quadras ou áreas comuns que precisam de agendamento por horários." action={{ label: "Criar primeira estrutura", icon: Plus, onClick: openNew }} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
            {structures.map(structure => {
              const mapOnly = structure.visibility === "map_only";
              return (
                <Card key={structure.id} pad={16} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: toneOf("brand").bg, border: `1px solid ${toneOf("brand").border}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.brandText, flexShrink: 0 }}><MapPin size={18} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>{structure.name}</h3>
                      <div style={{ marginTop: 6 }}><Pill tone={mapOnly ? "neutral" : "brand"} label={VISIBILITY_LABEL[structure.visibility] ?? structure.visibility} /></div>
                    </div>
                  </div>

                  {!mapOnly && (
                    <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.muted, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}><Clock size={13} /> Horários</span>
                        <span style={{ fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{structure.operatingHours.openTime} às {structure.operatingHours.closeTime}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.muted, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}><CheckCircle2 size={13} /> Slots</span>
                        <span style={{ fontWeight: 800, color: T.text }}>{structure.bookingType === "free_time" ? "horário livre" : `${structure.operatingHours.slotDurationMinutes} min`}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.muted, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}><Eye size={13} /> Capacidade</span>
                        <span style={{ fontWeight: 900, color: T.text }}>{structure.capacity} {structure.capacity === 1 ? "pessoa" : "pessoas"}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingTop: 8, borderTop: `1px solid ${T.border}`, marginTop: "auto" }}>
                    <IconButton icon={Edit2} label="Editar estrutura" variant="ghost" onClick={() => openEdit(structure)} />
                    <IconButton icon={Trash2} label="Excluir estrutura" variant="ghost" tone="red" onClick={() => handleDelete(structure)} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Loadable>

      <StructureEditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} structure={editingStructure} onSaved={loadStructures} />
    </PageShell>
  );
}
