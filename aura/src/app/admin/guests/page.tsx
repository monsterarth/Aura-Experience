// src/app/admin/guests/page.tsx
"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { Guest } from "@/types/aura";
import { PageShell, PageHeader, Card, Dialog, EmptyState, useMediaQuery, useConfirm } from "@/components/aura";
import { GuestList } from "./_components/GuestList";
import { GuestDetailPanel } from "./_components/GuestDetailPanel";
import { NewGuestPanel } from "./_components/NewGuestPanel";

function GuestsPageInner() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const searchParams = useSearchParams();
  const preSelectId = searchParams.get("id");
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Guest | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showPanel, setShowPanel] = useState(false); // celular: painel em tela cheia
  const [panelDirty, setPanelDirty] = useState(false);

  const propertyId = property?.id;
  const actorId = userData?.id ?? "ADMIN";
  const actorName = userData?.fullName ?? "Recepção";

  const loadGuests = useCallback(async (term?: string) => {
    if (!propertyId) return;
    setLoading(true);
    try {
      setGuests(await GuestService.listGuests(propertyId, term));
    } catch {
      toast.error("Erro ao carregar hóspedes.");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  // A busca já chega "debounced" do SearchInput (300ms).
  useEffect(() => { void loadGuests(search || undefined); }, [search, loadGuests]);

  // Deep-link ?id= (vem do CRM): busca a ficha DIRETO — a lista é limitada a 100 nomes.
  const preSelectHandled = useRef(false);
  useEffect(() => {
    if (!preSelectId || !propertyId || preSelectHandled.current) return;
    preSelectHandled.current = true;
    fetch(`/api/admin/guests/lookup?propertyId=${propertyId}&doc=${encodeURIComponent(preSelectId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.guest) { toast.error("Hóspede não encontrado nesta propriedade."); return; }
        setSelected(d.guest);
        setShowPanel(true);
        setSearch(d.guest.fullName);
      })
      .catch(() => {});
  }, [preSelectId, propertyId]);

  const handleSelect = (g: Guest) => { setCreatingNew(false); setSelected(g); setShowPanel(true); };
  const handleNewGuest = () => { setSelected(null); setCreatingNew(true); setShowPanel(true); };
  const handleUpdated = (updated: Guest) => { setSelected(updated); setGuests(prev => prev.map(g => (g.id === updated.id ? updated : g))); };
  const handleMergeSuccess = () => { setSelected(null); setShowPanel(false); void loadGuests(search || undefined); };
  const handleCreated = (g: Guest) => { setCreatingNew(false); setSelected(g); setPanelDirty(false); void loadGuests(search || undefined); };

  // Fechar o painel no celular com edição em curso pede confirmação.
  const closePanel = async () => {
    if (panelDirty) {
      const ok = await confirm({ title: "Descartar alterações?", description: "O que você digitou nesta ficha será perdido.", confirmLabel: "Descartar", cancelLabel: "Continuar editando", tone: "danger" });
      if (!ok) return;
    }
    setPanelDirty(false);
    setShowPanel(false);
    if (creatingNew) setCreatingNew(false);
  };

  const panel = creatingNew && propertyId ? (
    <NewGuestPanel
      propertyId={propertyId}
      onBack={() => void closePanel()}
      onCreated={handleCreated}
      onDirtyChange={setPanelDirty}
      actorId={actorId}
      actorName={actorName}
      embedded={!isDesktop}
    />
  ) : selected && propertyId ? (
    <GuestDetailPanel
      key={selected.id}
      guest={selected}
      propertyId={propertyId}
      onBack={() => void closePanel()}
      onUpdated={handleUpdated}
      onMerged={handleMergeSuccess}
      onEditingChange={setPanelDirty}
      actorId={actorId}
      actorName={actorName}
      embedded={!isDesktop}
    />
  ) : null;

  return (
    <PageShell maxWidth="full">
      <PageHeader
        title="Hóspedes"
        icon={UserSearch}
        subtitle={property?.name ?? "Carregando…"}
        primaryAction={{ label: "Novo hóspede", icon: UserPlus, onClick: handleNewGuest }}
      />

      <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] lg:gap-4 lg:items-start">
        {/* Lista */}
        <Card
          pad={0}
          className="lg:sticky lg:top-0"
          style={isDesktop ? { maxHeight: "calc(100dvh - var(--topbar-h, 48px) - 2 * var(--page-pad))", display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}
        >
          <GuestList guests={guests} loading={loading} search={search} onSearch={setSearch} selectedId={selected?.id} onSelect={handleSelect} onNew={handleNewGuest} desktop={isDesktop} />
        </Card>

        {/* Detalhe (desktop: coluna direita; celular: tela cheia) */}
        {isDesktop ? (
          <Card pad={0} style={{ minHeight: 520 }}>
            {panel ?? (
              <EmptyState
                icon={UserSearch}
                title="Selecione um hóspede"
                description="Clique em um nome na lista para ver a ficha completa."
                action={{ label: "Criar novo hóspede", icon: UserPlus, onClick: handleNewGuest }}
              />
            )}
          </Card>
        ) : (
          <Dialog open={showPanel && !!panel} onClose={() => void closePanel()} presentation="fullscreen" rawBody hideClose ariaLabel="Ficha do hóspede">
            {panel}
          </Dialog>
        )}
      </div>
    </PageShell>
  );
}

export default function GuestsPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "manager"]}>
      <Suspense fallback={null}>
        <GuestsPageInner />
      </Suspense>
    </RoleGuard>
  );
}
