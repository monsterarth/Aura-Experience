"use client";

// src/app/admin/configuracoes/gastronomia/page.tsx
//
// Restaurante e café da manhã.
//
// O picker do Salão do Café gravava na tabela `structures` no onChange do select e
// no blur do horário — furando o botão Salvar que rege o resto da tela. Agora ele
// entra no mesmo rascunho. Não existe transação entre `properties` e `structures`,
// então quando o segundo passo falha a tela DIZ isso, em vez de fingir que salvou.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingRow } from "@/components/ui/SettingRow";
import { Toggle } from "@/components/ui/Toggle";
import { StructureService } from "@/services/structure-service";
import { FBSettings, Structure } from "@/types/aura";
import { toast } from "sonner";
import { Coffee, UtensilsCrossed, Loader2, ExternalLink } from "lucide-react";

interface Draft {
  fbSettings: FBSettings;
  cafeVenueId: string;
  cafeOpen: string;
  cafeClose: string;
}

const DEFAULT_HOURS = { slotDurationMinutes: 60, slotIntervalMinutes: 15 };

export default function GastronomiaPage() {
  const { userData } = useAuth();
  const [structures, setStructures] = useState<Structure[]>([]);

  const { property, draft, baseline, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => {
    const fb = ((p.settings as any)?.fbSettings ?? {}) as FBSettings;
    return {
      // Defaults por baixo do que veio do banco: propriedade nova chega com fbSettings vazio.
      fbSettings: {
        ...fb,
        restaurant: { ...{ enabled: false, name: "" }, ...(fb.restaurant ?? {}) } as FBSettings["restaurant"],
        breakfast: { ...{ enabled: false, name: "", modality: "buffet" }, ...(fb.breakfast ?? {}) } as FBSettings["breakfast"],
      },
      cafeVenueId: "",
      cafeOpen: "08:00",
      cafeClose: "10:30",
    };
  });

  // O salão vive em `structures`, não em settings — por isso vem numa carga própria.
  const loadStructures = useCallback(async () => {
    if (!property) return;
    const list = await StructureService.getStructures(property.id).catch(() => [] as Structure[]);
    setStructures(list);
    const venue = list.find((s) => s.isBreakfastVenue);
    if (venue) {
      patch({
        cafeVenueId: venue.id,
        cafeOpen: venue.operatingHours?.openTime || "08:00",
        cafeClose: venue.operatingHours?.closeTime || "10:30",
      });
    }
    // patch é estável (useCallback sem deps) — não entra nas dependências de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property]);

  useEffect(() => { loadStructures(); }, [loadStructures]);

  if (!draft || !property) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const fb = draft.fbSettings;
  const breakfast = fb.breakfast as any;
  const delivery = breakfast?.delivery ?? {};
  const showDelivery = breakfast?.modality === "delivery" || breakfast?.modality === "both";
  const showBuffet = breakfast?.modality === "buffet" || breakfast?.modality === "both";

  const setBreakfast = (partial: Record<string, unknown>) =>
    patch({ fbSettings: { ...fb, breakfast: { ...breakfast, ...partial } } as FBSettings });
  const setDelivery = (partial: Record<string, unknown>) =>
    setBreakfast({ delivery: { ...delivery, ...partial } });
  const setRestaurant = (partial: Record<string, unknown>) =>
    patch({ fbSettings: { ...fb, restaurant: { ...(fb.restaurant as any), ...partial } } as FBSettings });

  const onSave = () => save(
    (d) => ({ patch: { fbSettings: d.fbSettings } }),
    {
      after: async () => {
        if (!userData) return;
        const venueChanged = draft.cafeVenueId !== baseline?.cafeVenueId;
        const hoursChanged = draft.cafeOpen !== baseline?.cafeOpen || draft.cafeClose !== baseline?.cafeClose;
        if (!venueChanged && !hoursChanged) return;

        try {
          if (venueChanged) {
            await StructureService.setBreakfastVenue(property.id, draft.cafeVenueId || null, userData.id, userData.fullName);
          }
          if (draft.cafeVenueId && (hoursChanged || venueChanged)) {
            const venue = structures.find((s) => s.id === draft.cafeVenueId);
            await StructureService.updateStructure(
              property.id, draft.cafeVenueId,
              { operatingHours: { ...(venue?.operatingHours ?? DEFAULT_HOURS), openTime: draft.cafeOpen, closeTime: draft.cafeClose } },
              userData.id, userData.fullName,
            );
          }
          await loadStructures();
        } catch {
          // Honestidade sobre gravação parcial: settings foi, structures não.
          toast.error("Configurações salvas, mas o salão do café não pôde ser atualizado.");
        }
      },
    },
  );

  return (
    <div className="max-w-3xl space-y-4">
      <SectionCard title="Restaurante" icon={UtensilsCrossed}>
        <SettingRow
          title="Restaurante ativo"
          description="Liga o módulo de restaurante para esta pousada."
          icon={UtensilsCrossed}
          onClick={() => setRestaurant({ enabled: !(fb.restaurant as any)?.enabled })}
        >
          <Toggle checked={!!(fb.restaurant as any)?.enabled} label="Restaurante ativo" />
        </SettingRow>
        {(fb.restaurant as any)?.enabled && (
          <div>
            <label className="field-label">Nome do restaurante</label>
            <input
              className="field-input w-full"
              value={(fb.restaurant as any)?.name ?? ""}
              onChange={(e) => setRestaurant({ name: e.target.value })}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Café da manhã" icon={Coffee}>
        <SettingRow
          title="Café da manhã ativo"
          description="Desligado, o café some do portal do hóspede."
          icon={Coffee}
          onClick={() => setBreakfast({ enabled: !breakfast?.enabled })}
        >
          <Toggle checked={!!breakfast?.enabled} label="Café da manhã ativo" />
        </SettingRow>

        {breakfast?.enabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Nome do café</label>
                <input className="field-input w-full" value={breakfast?.name ?? ""} onChange={(e) => setBreakfast({ name: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Modalidade</label>
                <select className="field-input w-full" value={breakfast?.modality ?? "buffet"} onChange={(e) => setBreakfast({ modality: e.target.value })}>
                  <option value="buffet">Apenas buffet</option>
                  <option value="delivery">Apenas entrega na cabana</option>
                  <option value="both">Buffet + entrega</option>
                </select>
              </div>
            </div>

            {showDelivery && (
              <div className="bg-secondary/60 p-5 rounded-2xl space-y-4">
                <h4 className="font-bold text-sm text-foreground">Pedidos por entrega</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Abre pedidos (véspera)</label>
                    <input type="time" className="field-input w-full [color-scheme:light] dark:[color-scheme:dark]"
                      value={delivery.orderWindowStart || "18:00"} onChange={(e) => setDelivery({ orderWindowStart: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">Fecha pedidos</label>
                    <input type="time" className="field-input w-full [color-scheme:light] dark:[color-scheme:dark]"
                      value={delivery.orderWindowEnd || "22:00"} onChange={(e) => setDelivery({ orderWindowEnd: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="field-label">Horários de entrega (separados por vírgula)</label>
                  <input className="field-input w-full" placeholder="08:30, 09:30, 10:30"
                    value={(delivery.deliveryTimes ?? []).join(", ")}
                    onChange={(e) => setDelivery({ deliveryTimes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A mensagem de boas-vindas e as instruções do café no portal ficam no cardápio.{" "}
                  <Link href="/admin/food-and-beverage/menu?config=cafe" className="text-primary font-bold inline-flex items-center gap-1">
                    Abrir <ExternalLink size={11} />
                  </Link>
                </p>
              </div>
            )}

            {showBuffet && (
              <div className="bg-secondary/60 p-5 rounded-2xl space-y-4">
                <h4 className="font-bold text-sm text-foreground">Salão do buffet</h4>
                <p className="text-xs text-muted-foreground -mt-2">
                  Qual estrutura é o salão. O horário aqui é o mesmo horário de funcionamento
                  dela — salvar altera a estrutura, e a posição no mapa alimenta o
                  &quot;Como chegar&quot; do portal.
                </p>
                <div>
                  <label className="field-label">Estrutura do café</label>
                  <select className="field-input w-full" value={draft.cafeVenueId} onChange={(e) => patch({ cafeVenueId: e.target.value })}>
                    <option value="">— Nenhuma —</option>
                    {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {draft.cafeVenueId && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Abertura</label>
                      <input type="time" className="field-input w-full [color-scheme:light] dark:[color-scheme:dark]"
                        value={draft.cafeOpen} onChange={(e) => patch({ cafeOpen: e.target.value })} />
                    </div>
                    <div>
                      <label className="field-label">Fechamento</label>
                      <input type="time" className="field-input w-full [color-scheme:light] dark:[color-scheme:dark]"
                        value={draft.cafeClose} onChange={(e) => patch({ cafeClose: e.target.value })} />
                    </div>
                  </div>
                )}
                <Link href="/admin/estruturas" className="text-xs text-primary font-bold inline-flex items-center gap-1">
                  Gerenciar estruturas <ExternalLink size={11} />
                </Link>
              </div>
            )}
          </>
        )}
      </SectionCard>

      <SaveBar dirty={dirty} saving={saving} onReset={reset} onSave={onSave} />
    </div>
  );
}
