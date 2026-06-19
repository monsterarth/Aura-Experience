"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
    MapPin, MapPinned, Save, Crosshair, Target, Eye, EyeOff,
    Loader2, Trash2, Satellite, Image as ImageIcon, Info, Check, Home,
    Plus, X, ExternalLink, Instagram,
} from "lucide-react";
import { StructureService } from "@/services/structure-service";
import { PropertyService } from "@/services/property-service";
import { CabinService } from "@/services/cabin-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { Structure, Cabin, Property, MapPoi } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { gcpResidualsPercent } from "@/app/check-in/[code]/map/utils/geoTransform";

const POI_CATEGORY_LABELS: Record<string, string> = {
    gate:        "Portão / Entrada",
    photo_spot:  "Local de Foto",
    trail:       "Trilha / Caminho",
    parking:     "Estacionamento",
    restaurant:  "Restaurante / Bar",
    bar:         "Bar / Balada",
    market:      "Mercado / Loja",
    other:       "Outro",
};

const DEFAULT_POI: Partial<MapPoi> = {
    name: "", category: "other", pinIcon: "📍", pinColor: "#6b7280",
    showOnMap: true, photos: [], externalLink: "", instagram: "",
};

// ── Componente de entrada de coordenadas no formato Google Maps ─────────────
// Aceita colar direto: "-28.131983, -48.643969" e faz o parse automaticamente.
function CoordInput({
    lat, lng,
    onChange,
    placeholder = "-28.131983, -48.643969",
}: {
    lat?: number; lng?: number;
    onChange: (lat: number, lng: number) => void;
    placeholder?: string;
}) {
    const hasValue = lat && lng && (lat !== 0 || lng !== 0);
    const display  = hasValue ? `${lat}, ${lng}` : "";

    const parse = (raw: string) => {
        const parts = raw.trim().split(",");
        if (parts.length !== 2) return;
        const parsedLat = parseFloat(parts[0].trim());
        const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) onChange(parsedLat, parsedLng);
    };

    return (
        <div className="space-y-1">
            <label className="field-label flex items-center gap-1.5">
                Coordenadas
                <span className="text-muted-foreground/60 font-normal normal-case tracking-normal text-[10px]">
                    — cole do Google Maps
                </span>
            </label>
            <div className="relative">
                <input
                    className="field-input w-full text-sm font-mono pr-7"
                    defaultValue={display}
                    key={display}          // recria quando salvo externamente
                    placeholder={placeholder}
                    onBlur={e  => parse(e.target.value)}
                    onPaste={e => { e.preventDefault(); parse(e.clipboardData.getData("text")); (e.target as HTMLInputElement).value = e.clipboardData.getData("text").trim(); }}
                />
                {hasValue && (
                    <Check size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none" />
                )}
            </div>
        </div>
    );
}

// Mesmo componente para os pontos de calibração GCP
function GcpCoordInput({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
    return (
        <CoordInput lat={lat || undefined} lng={lng || undefined} onChange={onChange} placeholder="-28.131983, -48.643969" />
    );
}

type MapConfig = NonNullable<Property["settings"]["mapConfig"]>;
type Gcp = { lat: number; lng: number; px: number; py: number };

type ClickMode =
    | { kind: "pin";       entityId: string; entityType: "structure" | "cabin" | "poi" }
    | { kind: "gcp" }
    | null;

// Aba lateral: estruturas, cabanas ou pontos de interesse
type SideTab = "structures" | "cabins" | "pois";

const DEFAULT_PIN_COLOR = "#9b6dff";
const CABIN_PIN_COLOR   = "#f59e0b"; // âmbar — diferencia visualmente das estruturas

export default function ResortMapAdminPage() {
    const { currentProperty } = useProperty();
    const { userData } = useAuth();

    const [structures, setStructures] = useState<Structure[]>([]);
    const [cabins,     setCabins]     = useState<Cabin[]>([]);
    const [pois,       setPois]       = useState<MapPoi[]>([]);
    const [mapConfig,  setMapConfig]  = useState<MapConfig>({});
    const [loading,    setLoading]    = useState(false);
    const [saving,     setSaving]     = useState(false);
    const [clickMode,  setClickMode]  = useState<ClickMode>(null);
    const [sideTab,    setSideTab]    = useState<SideTab>("structures");
    // Editor de POI
    const [editingPoi, setEditingPoi] = useState<Partial<MapPoi> | null>(null);
    const [savingPoi,  setSavingPoi]  = useState(false);

    const imageWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentProperty) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProperty?.id]);

    const load = async () => {
        if (!currentProperty) return;
        setLoading(true);
        try {
            const [structs, cabs, poisRes] = await Promise.all([
                StructureService.getStructures(currentProperty.id),
                CabinService.getCabinsByProperty(currentProperty.id),
                fetch(`/api/admin/map-pois?propertyId=${currentProperty.id}`).then(r => r.json()),
            ]);
            setStructures(structs);
            setCabins(cabs);
            setPois(poisRes.pois ?? []);
            setMapConfig(currentProperty.settings?.mapConfig ?? {});
        } catch {
            toast.error("Erro ao carregar dados do mapa.");
        } finally {
            setLoading(false);
        }
    };

    const patchPoi = (id: string, patch: Partial<MapPoi>) =>
        setPois(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

    const handleSavePoi = async () => {
        if (!editingPoi?.name || !currentProperty) return;
        setSavingPoi(true);
        try {
            if (editingPoi.id) {
                const res = await fetch("/api/admin/map-pois", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...editingPoi, propertyId: currentProperty.id }),
                });
                if (!res.ok) { toast.error("Erro ao atualizar ponto de interesse."); return; }
                patchPoi(editingPoi.id, editingPoi);
                toast.success("Ponto de interesse atualizado!");
            } else {
                const res = await fetch("/api/admin/map-pois", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...editingPoi, propertyId: currentProperty.id }),
                });
                if (!res.ok) { toast.error("Erro ao criar ponto de interesse."); return; }
                const { id } = await res.json();
                setPois(prev => [{ ...editingPoi, id, propertyId: currentProperty.id, showOnMap: true } as MapPoi, ...prev]);
                toast.success("Ponto de interesse criado!");
            }
            setEditingPoi(null);
        } catch {
            toast.error("Erro ao salvar ponto de interesse.");
        } finally {
            setSavingPoi(false);
        }
    };

    const handleDeletePoi = async (id: string) => {
        if (!confirm("Remover este ponto de interesse?")) return;
        try {
            const res = await fetch(`/api/admin/map-pois?id=${id}`, { method: "DELETE" });
            if (!res.ok) { toast.error("Erro ao remover ponto de interesse."); return; }
            setPois(prev => prev.filter(p => p.id !== id));
            toast.success("Ponto removido.");
        } catch {
            toast.error("Erro ao remover ponto.");
        }
    };

    const patchStructure = (id: string, patch: Partial<Structure>) =>
        setStructures(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

    const patchCabin = (id: string, patch: Partial<Cabin>) =>
        setCabins(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

    // ── Clique na imagem ────────────────────────────────────────────────────────
    const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!clickMode || !imageWrapRef.current) return;
        const rect = imageWrapRef.current.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (e.clientX - rect.left)  / rect.width));
        const py = Math.min(1, Math.max(0, (e.clientY - rect.top)   / rect.height));

        if (clickMode.kind === "pin") {
            if (clickMode.entityType === "structure") {
                const prevPin = structures.find(s => s.id === clickMode.entityId)?.mapPin ?? { lat: 0, lng: 0 };
                patchStructure(clickMode.entityId, {
                    mapPin: { ...prevPin, pixelX: px, pixelY: py },
                    showOnMap: true,
                });
            } else if (clickMode.entityType === "cabin") {
                const prevPin = cabins.find(c => c.id === clickMode.entityId)?.mapPin ?? { lat: 0, lng: 0 };
                patchCabin(clickMode.entityId, {
                    mapPin: { ...prevPin, pixelX: px, pixelY: py },
                });
            } else if (clickMode.entityType === "poi") {
                const prevPin = pois.find(p => p.id === clickMode.entityId)?.mapPin ?? {};
                patchPoi(clickMode.entityId, {
                    mapPin: { ...prevPin, pixelX: px, pixelY: py },
                });
            }
            toast.success("Pin posicionado. Informe lat/lng para calibração GPS.");
            setClickMode(null);
        } else if (clickMode.kind === "gcp") {
            setMapConfig(c => ({ ...c, gcps: [...(c.gcps ?? []), { lat: 0, lng: 0, px, py }] }));
            toast.success("Ponto de calibração adicionado. Informe lat/lng reais.");
            setClickMode(null);
        }
    }, [clickMode, structures, cabins, pois]);

    const updateGcp = (idx: number, patch: Partial<Gcp>) =>
        setMapConfig(c => ({ ...c, gcps: (c.gcps ?? []).map((g, i) => i === idx ? { ...g, ...patch } : g) }));
    const removeGcp = (idx: number) =>
        setMapConfig(c => ({ ...c, gcps: (c.gcps ?? []).filter((_, i) => i !== idx) }));

    // ── Persistência ────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!currentProperty || !userData) return;
        setSaving(true);
        try {
            const mergedSettings = { ...currentProperty.settings, mapConfig };
            await PropertyService.updateSettings(
                currentProperty.id, { settings: mergedSettings },
                userData.id, userData.fullName,
            );

            await Promise.all([
                ...structures.map(s =>
                    StructureService.updateStructure(
                        currentProperty.id, s.id,
                        { showOnMap: s.showOnMap ?? false, mapPin: s.mapPin, pinColor: s.pinColor, pinIcon: s.pinIcon },
                        userData.id, userData.fullName,
                    )
                ),
                // Atualiza só o mapPin das cabanas posicionadas — UPDATE direto, sem upsert
                ...cabins
                    .filter(c => c.mapPin !== undefined)
                    .map(c => CabinService.updateCabinMapPin(currentProperty.id, c.id, c.mapPin)),
                // Persiste mapPin dos POIs que já têm id
                ...pois
                    .filter(p => p.id && p.mapPin !== undefined)
                    .map(p => fetch("/api/admin/map-pois", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: p.id, mapPin: p.mapPin, showOnMap: p.showOnMap }),
                    })),
            ]);

            toast.success("Mapa do resort salvo com sucesso!");
        } catch (e) {
            console.error(e);
            toast.error("Erro ao salvar o mapa.");
        } finally {
            setSaving(false);
        }
    };

    // ── Derivados para render ────────────────────────────────────────────────────
    const gcps             = mapConfig.gcps ?? [];
    const mappedStructures = structures.filter(s => s.showOnMap && s.mapPin?.pixelX != null);
    const mappedCabins     = cabins.filter(c => c.mapPin?.pixelX != null);
    const mappedPois       = pois.filter(p => p.showOnMap && p.mapPin?.pixelX != null);

    // Diagnóstico de calibração: mesmo conjunto de pontos que o hóspede usa
    // (GCPs manuais + pins de estrutura com lat/lng) com o erro leave-one-out.
    const calibrationPoints = useMemo(() => {
        const pts: { label: string; lat: number; lng: number; px: number; py: number }[] = [];
        (mapConfig.gcps ?? []).forEach((g, i) => pts.push({ label: `Ponto de calibração ${i + 1}`, lat: g.lat, lng: g.lng, px: g.px, py: g.py }));
        structures
            .filter(s => s.showOnMap && s.mapPin?.pixelX != null && (s.mapPin.lat !== 0 || s.mapPin.lng !== 0))
            .forEach(s => pts.push({ label: s.name, lat: s.mapPin!.lat, lng: s.mapPin!.lng, px: s.mapPin!.pixelX!, py: s.mapPin!.pixelY! }));
        return pts;
    }, [mapConfig.gcps, structures]);

    const residuals = useMemo(() => {
        const r = gcpResidualsPercent(calibrationPoints.map(p => ({ lat: p.lat, lng: p.lng, px: p.px, py: p.py })));
        return calibrationPoints
            .map((p, i) => ({ ...p, residual: r[i] }))
            .filter(x => x.residual != null)
            .sort((a, b) => (b.residual! - a.residual!));
    }, [calibrationPoints]);

    const avgResidual = residuals.length ? residuals.reduce((s, x) => s + x.residual!, 0) / residuals.length : null;

    if (!currentProperty) {
        return (
            <div className="max-w-3xl mx-auto py-20 text-center text-muted-foreground">
                <MapPinned className="mx-auto mb-4 opacity-40" size={40} />
                Selecione uma propriedade para configurar o mapa.
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                        <MapPinned className="text-primary" /> Mapa do Resort
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Configure a imagem ilustrada, posicione as áreas e calibre o GPS para o portal do hóspede.
                    </p>
                </div>
                <button
                    onClick={handleSave} disabled={saving}
                    className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Salvar
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-muted-foreground animate-pulse">Carregando…</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* ── Coluna esquerda: imagem + calibração ─────────────────────── */}
                    <div className="lg:col-span-2 space-y-4">
                        {!mapConfig.illustratedImageUrl ? (
                            <div className="bg-card border border-dashed border-border rounded-3xl p-8">
                                <p className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
                                    <ImageIcon size={16} className="text-primary" /> Imagem ilustrada do resort
                                </p>
                                <p className="text-xs text-muted-foreground mb-4">
                                    PNG/JPG/WebP, de preferência vista de cima (drone 90°). Mínimo 1200×1000px. Até 20MB.
                                </p>
                                <div className="h-64 rounded-2xl overflow-hidden border border-border">
                                    <ImageUpload
                                        path="maps" direct maxSizeMb={20}
                                        onUploadSuccess={(url) => setMapConfig(c => ({ ...c, illustratedImageUrl: url }))}
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setClickMode(clickMode?.kind === "gcp" ? null : { kind: "gcp" })}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all border ${clickMode?.kind === "gcp" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"}`}
                                        >
                                            <Crosshair size={14} /> {clickMode?.kind === "gcp" ? "Clique no mapa…" : "Add ponto GPS"}
                                        </button>
                                        {clickMode?.kind === "pin" && (
                                            <span className="text-xs font-bold text-primary flex items-center gap-1.5 animate-pulse">
                                                <Target size={14} /> Clique para posicionar o pin
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setMapConfig(c => ({ ...c, illustratedImageUrl: undefined }))}
                                        className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1.5"
                                    >
                                        <Trash2 size={13} /> Trocar imagem
                                    </button>
                                </div>

                                {/* Canvas de posicionamento */}
                                <div
                                    ref={imageWrapRef}
                                    onClick={handleImageClick}
                                    className={`relative w-full rounded-3xl overflow-hidden border border-border bg-secondary select-none ${clickMode ? "cursor-crosshair" : "cursor-default"}`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={mapConfig.illustratedImageUrl} alt="Mapa" className="w-full block pointer-events-none" />

                                    {/* Pins das estruturas */}
                                    {mappedStructures.map(s => (
                                        <div key={s.id}
                                            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
                                            style={{ left: `${(s.mapPin!.pixelX ?? 0) * 100}%`, top: `${(s.mapPin!.pixelY ?? 0) * 100}%` }}
                                        >
                                            <div className="px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1"
                                                style={{ background: s.pinColor || DEFAULT_PIN_COLOR }}>
                                                <span>{s.pinIcon || "📍"}</span>{s.name}
                                            </div>
                                            <div className="w-0.5 h-2" style={{ background: s.pinColor || DEFAULT_PIN_COLOR }} />
                                        </div>
                                    ))}

                                    {/* Pins das cabanas */}
                                    {mappedCabins.map(c => (
                                        <div key={c.id}
                                            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
                                            style={{ left: `${(c.mapPin!.pixelX ?? 0) * 100}%`, top: `${(c.mapPin!.pixelY ?? 0) * 100}%` }}
                                        >
                                            <div className="px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1"
                                                style={{ background: CABIN_PIN_COLOR }}>
                                                🏠 {c.number}
                                            </div>
                                            <div className="w-0.5 h-2" style={{ background: CABIN_PIN_COLOR }} />
                                        </div>
                                    ))}

                                    {/* Pins dos POIs */}
                                    {mappedPois.map(p => (
                                        <div key={p.id}
                                            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
                                            style={{ left: `${(p.mapPin!.pixelX ?? 0) * 100}%`, top: `${(p.mapPin!.pixelY ?? 0) * 100}%` }}
                                        >
                                            <div className="px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1"
                                                style={{ background: p.pinColor || "#6b7280", border: "1.5px dashed rgba(255,255,255,.7)" }}>
                                                <span>{p.pinIcon || "📍"}</span>{p.name}
                                            </div>
                                            <div className="w-0.5 h-2" style={{ background: p.pinColor || "#6b7280" }} />
                                        </div>
                                    ))}

                                    {/* GCPs */}
                                    {gcps.map((g, i) => (
                                        <div key={i}
                                            className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white bg-amber-500 shadow-lg flex items-center justify-center text-[9px] font-black text-white pointer-events-none"
                                            style={{ left: `${g.px * 100}%`, top: `${g.py * 100}%` }}
                                        >
                                            {i + 1}
                                        </div>
                                    ))}
                                </div>

                                {/* Calibração GPS */}
                                <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Crosshair size={16} className="text-amber-500" />
                                        <h3 className="font-bold text-foreground">Calibração GPS (pontos de controle)</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                                        <Info size={13} className="mt-0.5 shrink-0" />
                                        Marque ≥3 pontos conhecidos no mapa e informe a latitude/longitude reais.
                                        Com menos de 3, o GPS usa apenas os pins das estruturas como referência.
                                    </p>
                                    {gcps.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic py-2">Nenhum ponto de calibração ainda.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {gcps.map((g, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0 mt-5">{i + 1}</span>
                                                    <div className="flex-1">
                                                        <GcpCoordInput
                                                            lat={g.lat} lng={g.lng}
                                                            onChange={(lat, lng) => updateGcp(i, { lat, lng })}
                                                        />
                                                    </div>
                                                    <button onClick={() => removeGcp(i)} className="p-2 text-muted-foreground hover:text-red-500 mt-5">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Qualidade da Calibração — diagnóstico de pontos inconsistentes */}
                                {residuals.length >= 4 && (
                                    <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Target size={16} className="text-primary" />
                                                <h3 className="font-bold text-foreground">Qualidade da calibração</h3>
                                            </div>
                                            {avgResidual != null && (
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${avgResidual < 4 ? "bg-green-500/10 text-green-600" : avgResidual < 8 ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-500"}`}>
                                                    erro médio {avgResidual.toFixed(1)}%
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground flex items-start gap-2">
                                            <Info size={13} className="mt-0.5 shrink-0" />
                                            Cada ponto é comparado com a posição prevista pelos demais. Erro alto = coordenada digitada errada ou pin no lugar errado. Corrija ou remova os pontos em vermelho.
                                        </p>
                                        <div className="space-y-1.5">
                                            {residuals.slice(0, 6).map((r, i) => (
                                                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                                                    <span className="truncate text-foreground/90">{r.label}</span>
                                                    <span className={`shrink-0 font-bold font-mono text-xs px-2 py-0.5 rounded ${r.residual! < 4 ? "text-green-600" : r.residual! < 8 ? "text-amber-600" : "bg-red-500/10 text-red-500"}`}>
                                                        {r.residual! < 4 ? "✓ " : r.residual! >= 8 ? "⚠ " : ""}{r.residual!.toFixed(1)}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Satélite */}
                                <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Satellite size={16} className="text-primary" />
                                            <h3 className="font-bold text-foreground">Modo satélite</h3>
                                        </div>
                                        <button
                                            onClick={() => setMapConfig(c => ({ ...c, satelliteEnabled: !c.satelliteEnabled }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mapConfig.satelliteEnabled ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                                        >
                                            {mapConfig.satelliteEnabled ? "Ativado" : "Desativado"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="field-label">Centro · Lat</label>
                                            <input type="number" step="any" className="field-input"
                                                value={mapConfig.center?.lat ?? ""}
                                                onChange={e => setMapConfig(c => ({ ...c, center: { lat: parseFloat(e.target.value) || 0, lng: c.center?.lng ?? 0 } }))} />
                                        </div>
                                        <div>
                                            <label className="field-label">Centro · Lng</label>
                                            <input type="number" step="any" className="field-input"
                                                value={mapConfig.center?.lng ?? ""}
                                                onChange={e => setMapConfig(c => ({ ...c, center: { lat: c.center?.lat ?? 0, lng: parseFloat(e.target.value) || 0 } }))} />
                                        </div>
                                        <div>
                                            <label className="field-label">Zoom inicial</label>
                                            <input type="number" className="field-input"
                                                value={mapConfig.defaultZoom ?? ""}
                                                onChange={e => setMapConfig(c => ({ ...c, defaultZoom: parseInt(e.target.value) || undefined }))} />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Coluna direita: abas Estruturas / Cabanas — scroll próprio ── */}
                    <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 space-y-3">
                        {/* Tab switcher */}
                        <div className="flex bg-secondary rounded-xl p-1 gap-0.5">
                            <button onClick={() => setSideTab("structures")}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${sideTab === "structures" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                                <MapPin size={12} /> Áreas
                            </button>
                            <button onClick={() => setSideTab("cabins")}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${sideTab === "cabins" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                                <Home size={12} /> Cabanas
                            </button>
                            <button onClick={() => setSideTab("pois")}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${sideTab === "pois" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                                <MapPin size={12} /> POIs
                            </button>
                        </div>

                        {/* Estruturas */}
                        {sideTab === "structures" && structures.map(s => (
                            <div key={s.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-sm text-foreground truncate">{s.name}</p>
                                    <button onClick={() => patchStructure(s.id, { showOnMap: !s.showOnMap })}
                                        className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${s.showOnMap ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                                        {s.showOnMap ? <Eye size={12} /> : <EyeOff size={12} />}
                                        {s.showOnMap ? "Visível" : "Oculta"}
                                    </button>
                                </div>
                                {s.showOnMap && (
                                    <div className="space-y-3 animate-in fade-in duration-200">
                                        <CoordInput
                                            lat={s.mapPin?.lat} lng={s.mapPin?.lng}
                                            onChange={(lat, lng) => patchStructure(s.id, { mapPin: { lat, lng, pixelX: s.mapPin?.pixelX, pixelY: s.mapPin?.pixelY } })}
                                        />
                                        <div className="grid grid-cols-2 gap-2 items-end">
                                            <div>
                                                <label className="field-label">Ícone (emoji)</label>
                                                <input className="field-input text-sm" maxLength={2} placeholder="🏊" value={s.pinIcon ?? ""}
                                                    onChange={e => patchStructure(s.id, { pinIcon: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="field-label">Cor</label>
                                                <input type="color" className="w-full h-9 rounded-lg border border-border bg-card cursor-pointer"
                                                    value={s.pinColor ?? DEFAULT_PIN_COLOR}
                                                    onChange={e => patchStructure(s.id, { pinColor: e.target.value })} />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (!mapConfig.illustratedImageUrl) { toast.error("Carregue a imagem do mapa primeiro."); return; }
                                                setClickMode({ kind: "pin", entityId: s.id, entityType: "structure" });
                                            }}
                                            className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${clickMode?.kind === "pin" && clickMode.entityId === s.id ? "bg-primary text-primary-foreground border-primary animate-pulse" : "bg-secondary text-foreground border-border hover:border-primary/50"}`}
                                        >
                                            {s.mapPin?.pixelX != null ? <Check size={13} /> : <Target size={13} />}
                                            {s.mapPin?.pixelX != null ? "Reposicionar no mapa" : "Posicionar no mapa"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Cabanas */}
                        {sideTab === "cabins" && (
                            <>
                                <p className="text-xs text-muted-foreground px-1 flex items-start gap-2">
                                    <Info size={13} className="shrink-0 mt-0.5" />
                                    Todas as cabanas aparecerão no mapa. O hóspede vê a própria em destaque e as demais de forma discreta.
                                </p>
                                {cabins.map(c => (
                                    <div key={c.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                                                style={{ background: `${CABIN_PIN_COLOR}22`, border: `1px solid ${CABIN_PIN_COLOR}44` }}>
                                                🏠
                                            </span>
                                            <p className="font-bold text-sm text-foreground truncate flex-1">{c.name}</p>
                                            {c.mapPin?.pixelX != null && (
                                                <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold">✓ Posicionada</span>
                                            )}
                                        </div>
                                        <CoordInput
                                            lat={c.mapPin?.lat} lng={c.mapPin?.lng}
                                            onChange={(lat, lng) => patchCabin(c.id, { mapPin: { lat, lng, pixelX: c.mapPin?.pixelX, pixelY: c.mapPin?.pixelY } })}
                                        />
                                        <button
                                            onClick={() => {
                                                if (!mapConfig.illustratedImageUrl) { toast.error("Carregue a imagem do mapa primeiro."); return; }
                                                setClickMode({ kind: "pin", entityId: c.id, entityType: "cabin" });
                                            }}
                                            className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${clickMode?.kind === "pin" && clickMode.entityId === c.id ? "bg-amber-500 text-white border-amber-500 animate-pulse" : "bg-secondary text-foreground border-border hover:border-amber-500/50"}`}
                                        >
                                            {c.mapPin?.pixelX != null ? <Check size={13} /> : <Target size={13} />}
                                            {c.mapPin?.pixelX != null ? "Reposicionar no mapa" : "Posicionar no mapa"}
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}
                        {/* Pontos de Interesse */}
                        {sideTab === "pois" && (
                            <>
                                <p className="text-xs text-muted-foreground px-1 flex items-start gap-2">
                                    <Info size={13} className="shrink-0 mt-0.5" />
                                    Portões, locais de foto, trilhas, estacionamentos e lugares externos (restaurantes, bares…). Aparecem no mapa com ícone distinto. Sem agendamento ou limpeza.
                                </p>
                                <button
                                    onClick={() => setEditingPoi({ ...DEFAULT_POI })}
                                    className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border border-primary/30 text-primary hover:bg-primary/10"
                                >
                                    <Plus size={14} /> Novo Ponto
                                </button>

                                {/* Formulário inline de criação/edição */}
                                {editingPoi && (
                                    <div className="bg-card border border-primary/40 rounded-2xl p-4 space-y-3 animate-in fade-in duration-150">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-black uppercase text-foreground/60 tracking-widest">
                                                {editingPoi.id ? "Editar POI" : "Novo POI"}
                                            </p>
                                            <button onClick={() => setEditingPoi(null)} className="p-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>
                                        </div>
                                        <div>
                                            <label className="field-label">Nome *</label>
                                            <input required className="field-input w-full" placeholder="Ex: Portão Principal"
                                                value={editingPoi.name ?? ""}
                                                onChange={e => setEditingPoi(p => ({ ...p!, name: e.target.value }))} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="field-label">Categoria</label>
                                                <select className="field-input w-full text-sm"
                                                    value={editingPoi.category ?? "other"}
                                                    onChange={e => setEditingPoi(p => ({ ...p!, category: e.target.value }))}>
                                                    {Object.entries(POI_CATEGORY_LABELS).map(([v, l]) => (
                                                        <option key={v} value={v}>{l}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="field-label">Ícone (emoji)</label>
                                                <input className="field-input w-full text-sm" maxLength={2} placeholder="📍"
                                                    value={editingPoi.pinIcon ?? ""}
                                                    onChange={e => setEditingPoi(p => ({ ...p!, pinIcon: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="field-label">Cor</label>
                                                <input type="color" className="w-full h-9 rounded-lg border border-border bg-card cursor-pointer"
                                                    value={editingPoi.pinColor ?? "#6b7280"}
                                                    onChange={e => setEditingPoi(p => ({ ...p!, pinColor: e.target.value }))} />
                                            </div>
                                            <div className="flex items-end pb-0.5">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox"
                                                        checked={editingPoi.showOnMap ?? true}
                                                        onChange={e => setEditingPoi(p => ({ ...p!, showOnMap: e.target.checked }))}
                                                        className="w-4 h-4 accent-primary rounded" />
                                                    <span className="text-xs font-bold text-foreground">Visível</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="field-label">Descrição</label>
                                            <textarea className="field-input w-full text-sm min-h-[60px]" placeholder="Descrição opcional…"
                                                value={editingPoi.description ?? ""}
                                                onChange={e => setEditingPoi(p => ({ ...p!, description: e.target.value }))} />
                                        </div>
                                        <CoordInput
                                            lat={editingPoi.mapPin?.lat} lng={editingPoi.mapPin?.lng}
                                            onChange={(lat, lng) => setEditingPoi(p => ({ ...p!, mapPin: { ...(p!.mapPin ?? {}), lat, lng } }))}
                                        />
                                        <div>
                                            <label className="field-label flex items-center gap-1.5"><ExternalLink size={11} /> Link Externo <span className="font-normal normal-case tracking-normal text-muted-foreground/60">(opcional)</span></label>
                                            <input className="field-input w-full text-sm" placeholder="https://…"
                                                value={editingPoi.externalLink ?? ""}
                                                onChange={e => setEditingPoi(p => ({ ...p!, externalLink: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="field-label flex items-center gap-1.5"><Instagram size={11} /> Instagram <span className="font-normal normal-case tracking-normal text-muted-foreground/60">(opcional)</span></label>
                                            <input className="field-input w-full text-sm" placeholder="@usuario ou link do perfil"
                                                value={editingPoi.instagram ?? ""}
                                                onChange={e => setEditingPoi(p => ({ ...p!, instagram: e.target.value }))} />
                                        </div>
                                        <button
                                            onClick={handleSavePoi}
                                            disabled={savingPoi || !editingPoi.name}
                                            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {savingPoi ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                            Salvar POI
                                        </button>
                                    </div>
                                )}

                                {/* Lista de POIs */}
                                {pois.map(p => (
                                    <div key={p.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-lg shrink-0">{p.pinIcon || "📍"}</span>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{POI_CATEGORY_LABELS[p.category] ?? p.category}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => patchPoi(p.id, { showOnMap: !p.showOnMap })}
                                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${p.showOnMap ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                                                    {p.showOnMap ? <Eye size={11} /> : <EyeOff size={11} />}
                                                </button>
                                                <button onClick={() => setEditingPoi({ ...p })} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary">
                                                    <Info size={13} />
                                                </button>
                                                <button onClick={() => handleDeletePoi(p.id)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Posicionar no mapa ilustrado */}
                                        <button
                                            onClick={() => {
                                                if (!mapConfig.illustratedImageUrl) { toast.error("Carregue a imagem do mapa primeiro."); return; }
                                                setClickMode({ kind: "pin", entityId: p.id, entityType: "poi" });
                                            }}
                                            className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${clickMode?.kind === "pin" && clickMode.entityId === p.id ? "bg-primary text-primary-foreground border-primary animate-pulse" : "bg-secondary text-foreground border-border hover:border-primary/50"}`}
                                        >
                                            {p.mapPin?.pixelX != null ? <Check size={13} /> : <Target size={13} />}
                                            {p.mapPin?.pixelX != null ? "Reposicionar no mapa" : "Posicionar no mapa"}
                                        </button>
                                    </div>
                                ))}
                                {pois.length === 0 && !editingPoi && (
                                    <p className="text-xs text-muted-foreground text-center italic py-6">Nenhum ponto de interesse cadastrado.</p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
