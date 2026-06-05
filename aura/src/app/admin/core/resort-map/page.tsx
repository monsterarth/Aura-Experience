"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
    MapPin, MapPinned, Save, Crosshair, Target, Eye, EyeOff,
    Loader2, Trash2, Satellite, Image as ImageIcon, Info, Check, Home,
} from "lucide-react";
import { StructureService } from "@/services/structure-service";
import { PropertyService } from "@/services/property-service";
import { CabinService } from "@/services/cabin-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { Structure, Cabin, Property } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";

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
    | { kind: "pin";       entityId: string; entityType: "structure" | "cabin" }
    | { kind: "gcp" }
    | null;

// Aba lateral: estruturas ou cabanas
type SideTab = "structures" | "cabins";

const DEFAULT_PIN_COLOR = "#9b6dff";
const CABIN_PIN_COLOR   = "#f59e0b"; // âmbar — diferencia visualmente das estruturas

export default function ResortMapAdminPage() {
    const { currentProperty } = useProperty();
    const { userData } = useAuth();

    const [structures, setStructures] = useState<Structure[]>([]);
    const [cabins,     setCabins]     = useState<Cabin[]>([]);
    const [mapConfig,  setMapConfig]  = useState<MapConfig>({});
    const [loading,    setLoading]    = useState(false);
    const [saving,     setSaving]     = useState(false);
    const [clickMode,  setClickMode]  = useState<ClickMode>(null);
    const [sideTab,    setSideTab]    = useState<SideTab>("structures");

    const imageWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentProperty) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProperty?.id]);

    const load = async () => {
        if (!currentProperty) return;
        setLoading(true);
        try {
            const [structs, cabs] = await Promise.all([
                StructureService.getStructures(currentProperty.id),
                CabinService.getCabinsByProperty(currentProperty.id),
            ]);
            setStructures(structs);
            setCabins(cabs);
            setMapConfig(currentProperty.settings?.mapConfig ?? {});
        } catch {
            toast.error("Erro ao carregar dados do mapa.");
        } finally {
            setLoading(false);
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
            const prevPin = clickMode.entityType === "structure"
                ? structures.find(s => s.id === clickMode.entityId)?.mapPin ?? { lat: 0, lng: 0 }
                : cabins.find(c => c.id === clickMode.entityId)?.mapPin     ?? { lat: 0, lng: 0 };

            if (clickMode.entityType === "structure") {
                patchStructure(clickMode.entityId, {
                    mapPin: { ...prevPin, pixelX: px, pixelY: py },
                    showOnMap: true,
                });
            } else {
                patchCabin(clickMode.entityId, {
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
    }, [clickMode, structures, cabins]);

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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

                    {/* ── Coluna direita: abas Estruturas / Cabanas ──────────────────── */}
                    <div className="space-y-3">
                        {/* Tab switcher */}
                        <div className="flex bg-secondary rounded-xl p-1">
                            {(["structures", "cabins"] as SideTab[]).map(tab => (
                                <button key={tab} onClick={() => setSideTab(tab)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${sideTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                                >
                                    {tab === "structures" ? <><MapPin size={13} /> Áreas ({structures.filter(s => s.showOnMap).length})</> : <><Home size={13} /> Cabanas ({mappedCabins.length})</>}
                                </button>
                            ))}
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
                    </div>
                </div>
            )}
        </div>
    );
}
