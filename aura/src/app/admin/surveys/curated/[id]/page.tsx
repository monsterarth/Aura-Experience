"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { SurveyService } from "@/services/survey-service";
import { SurveyCuratedConfig, SurveyChip, SurveyReward } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, Save, ArrowLeft, Star, Tag, MessageSquare, Gift, Sparkles } from "lucide-react";

const ICON_OPTIONS = ["sparkle", "heart", "coffee", "home", "droplet", "spa", "waves", "compass", "leaf", "star", "utensils", "bell"];

function defaultConfig(): SurveyCuratedConfig {
    return {
        overall: { enabled: true },
        categories: [
            { id: crypto.randomUUID(), label: "Limpeza", label_en: "Cleanliness", label_es: "Limpieza", icon: "sparkle" },
            { id: crypto.randomUUID(), label: "Atendimento", label_en: "Service", label_es: "Atención", icon: "heart" },
            { id: crypto.randomUUID(), label: "Café da manhã", label_en: "Breakfast", label_es: "Desayuno", icon: "coffee" },
            { id: crypto.randomUUID(), label: "Conforto do chalé", label_en: "Comfort", label_es: "Confort", icon: "home" },
            { id: crypto.randomUUID(), label: "Áreas & lazer", label_en: "Areas & leisure", label_es: "Áreas y ocio", icon: "droplet" },
        ],
        minCategories: 3,
        highlights: {
            positive: ["Tranquilidade", "Atendimento caloroso", "Café delicioso", "Vista linda", "Limpeza impecável", "Voltaria com certeza"]
                .map((l) => ({ id: crypto.randomUUID(), label: l })),
            improve: ["Limpeza", "Café da manhã", "Conforto da cama", "Wi-Fi / sinal", "Silêncio / barulho", "Manutenção", "Custo-benefício"]
                .map((l) => ({ id: crypto.randomUUID(), label: l })),
            otherPositive: true,
            otherImprove: true,
        },
        recommend: { enabled: true },
        comment: { enabled: true },
        review: { googlePlaceId: "", booking: "" },
        recovery: {},
        thankYou: {},
    };
}

const emptyReward: SurveyReward = { hasReward: false, type: "", description: "" };

export default function CuratedSurveyEditor() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const isNew = id === "new";
    const { currentProperty: property } = useProperty();

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState("Pesquisa de Satisfação");
    const [titleEn, setTitleEn] = useState("");
    const [titleEs, setTitleEs] = useState("");
    const [isDefault, setIsDefault] = useState(true);
    const [config, setConfig] = useState<SurveyCuratedConfig>(defaultConfig());
    const [reward, setReward] = useState<SurveyReward>(emptyReward);

    useEffect(() => {
        (async () => {
            if (isNew || !property?.id) return;
            const tpl = await SurveyService.getTemplateById(property.id, id);
            if (tpl) {
                setTitle(tpl.title || "");
                setTitleEn(tpl.title_en || "");
                setTitleEs(tpl.title_es || "");
                setIsDefault(!!tpl.isDefault);
                setConfig(tpl.config && tpl.config.categories ? tpl.config : defaultConfig());
                setReward(tpl.reward || emptyReward);
            }
            setLoading(false);
        })();
    }, [id, isNew, property?.id]);

    const patch = (p: Partial<SurveyCuratedConfig>) => setConfig((c) => ({ ...c, ...p }));

    const save = async () => {
        if (!property?.id) return;
        setSaving(true);
        const data = {
            title, title_en: titleEn || undefined, title_es: titleEs || undefined,
            isDefault, questions: [], reward, version: "curated" as const, config,
        };
        const res = isNew
            ? await SurveyService.createTemplate(property.id, data)
            : await SurveyService.updateTemplate(property.id, id, data);
        setSaving(false);
        if (res.success) router.push("/admin/surveys");
        else alert(res.error || "Falha ao salvar.");
    };

    if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full bg-muted/20 pb-24">
            <header className="flex items-center justify-between px-6 py-5 bg-background border-b sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/admin/surveys")}><ArrowLeft className="w-5 h-5" /></Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />{isNew ? "Nova pesquisa moderna" : "Editar pesquisa moderna"}</h1>
                        <p className="text-sm text-muted-foreground mt-1">Fluxo curado: faces → categorias → destaques → recomendação + comentário</p>
                    </div>
                </div>
                <Button onClick={save} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "Salvando..." : "Salvar"}</Button>
            </header>

            <main className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-6">
                {/* Título */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
                    <h2 className="font-bold text-foreground">Título</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="field-label">PT</label><input className="field-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                        <div><label className="field-label">EN</label><input className="field-input w-full" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></div>
                        <div><label className="field-label">ES</label><input className="field-input w-full" value={titleEs} onChange={(e) => setTitleEs(e.target.value)} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pt-1">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                        Definir como pesquisa padrão (enviada no check-out)
                    </label>
                </section>

                {/* Categorias */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-foreground flex items-center gap-2"><Star className="w-4 h-4 text-primary" />Categorias (estrelas)</h2>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Avaliar ao menos</span>
                            <input type="number" min={1} max={config.categories.length} className="field-input w-16 text-center" value={config.minCategories ?? 3} onChange={(e) => patch({ minCategories: Number(e.target.value) || 1 })} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        {config.categories.map((c, i) => (
                            <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-center">
                                <input className="field-input" placeholder="Rótulo PT" value={c.label} onChange={(e) => { const cats = [...config.categories]; cats[i] = { ...c, label: e.target.value }; patch({ categories: cats }); }} />
                                <input className="field-input" placeholder="EN" value={c.label_en || ""} onChange={(e) => { const cats = [...config.categories]; cats[i] = { ...c, label_en: e.target.value }; patch({ categories: cats }); }} />
                                <input className="field-input" placeholder="ES" value={c.label_es || ""} onChange={(e) => { const cats = [...config.categories]; cats[i] = { ...c, label_es: e.target.value }; patch({ categories: cats }); }} />
                                <select className="field-input" value={c.icon || "sparkle"} onChange={(e) => { const cats = [...config.categories]; cats[i] = { ...c, icon: e.target.value }; patch({ categories: cats }); }}>
                                    {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                                </select>
                                <Button variant="ghost" size="icon" onClick={() => patch({ categories: config.categories.filter((x) => x.id !== c.id) })}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => patch({ categories: [...config.categories, { id: crypto.randomUUID(), label: "", icon: "star" }] })}><Plus className="w-4 h-4" />Categoria</Button>
                    <p className="text-xs text-muted-foreground">O rótulo PT é a chave usada nas métricas por categoria do dashboard.</p>
                </section>

                {/* Destaques */}
                <ChipSection title="Destaques positivos" icon={<Tag className="w-4 h-4 text-primary" />} chips={config.highlights.positive} onChange={(positive) => patch({ highlights: { ...config.highlights, positive } })} other={config.highlights.otherPositive} onToggleOther={(v) => patch({ highlights: { ...config.highlights, otherPositive: v } })} />
                <ChipSection title="A melhorar (opcional)" icon={<Tag className="w-4 h-4 text-muted-foreground" />} chips={config.highlights.improve || []} onChange={(improve) => patch({ highlights: { ...config.highlights, improve } })} other={config.highlights.otherImprove} onToggleOther={(v) => patch({ highlights: { ...config.highlights, otherImprove: v } })} />

                {/* Recomendação + comentário */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-4">
                    <h2 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" />Recomendação & comentário</h2>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={config.recommend.enabled} onChange={(e) => patch({ recommend: { enabled: e.target.checked } })} />
                        Mostrar pergunta de recomendação (Não / Talvez / Com certeza)
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={config.comment.enabled} onChange={(e) => patch({ comment: { ...config.comment, enabled: e.target.checked } })} />
                        Permitir comentário (privado p/ detrator; oferta de publicar p/ promotor)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="field-label">Prompt PT</label><input className="field-input w-full" value={config.comment.prompt || ""} onChange={(e) => patch({ comment: { ...config.comment, prompt: e.target.value } })} /></div>
                        <div><label className="field-label">EN</label><input className="field-input w-full" value={config.comment.prompt_en || ""} onChange={(e) => patch({ comment: { ...config.comment, prompt_en: e.target.value } })} /></div>
                        <div><label className="field-label">ES</label><input className="field-input w-full" value={config.comment.prompt_es || ""} onChange={(e) => patch({ comment: { ...config.comment, prompt_es: e.target.value } })} /></div>
                    </div>
                </section>

                {/* Review público */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
                    <h2 className="font-bold text-foreground flex items-center gap-2"><Star className="w-4 h-4 text-primary" />Avaliação pública (promotores)</h2>
                    <div><label className="field-label">Google Place ID</label><input className="field-input w-full" placeholder="ChIJ..." value={config.review.googlePlaceId || ""} onChange={(e) => patch({ review: { ...config.review, googlePlaceId: e.target.value } })} /><p className="text-xs text-muted-foreground mt-1">Encontre em developers.google.com/maps/documentation/places/web-service/place-id. Abre a tela de avaliar e copia o comentário p/ colar.</p></div>
                    <div><label className="field-label">URL do Booking (opcional)</label><input className="field-input w-full" placeholder="https://www.booking.com/..." value={config.review.booking || ""} onChange={(e) => patch({ review: { ...config.review, booking: e.target.value } })} /></div>
                </section>

                {/* Recuperação (detrator) */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
                    <h2 className="font-bold text-foreground">Mensagem de recuperação (detratores)</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="field-label">PT</label><textarea className="field-input w-full min-h-[70px]" value={config.recovery?.message || ""} onChange={(e) => patch({ recovery: { ...config.recovery, message: e.target.value } })} /></div>
                        <div><label className="field-label">EN</label><textarea className="field-input w-full min-h-[70px]" value={config.recovery?.message_en || ""} onChange={(e) => patch({ recovery: { ...config.recovery, message_en: e.target.value } })} /></div>
                        <div><label className="field-label">ES</label><textarea className="field-input w-full min-h-[70px]" value={config.recovery?.message_es || ""} onChange={(e) => patch({ recovery: { ...config.recovery, message_es: e.target.value } })} /></div>
                    </div>
                </section>

                {/* Recompensa */}
                <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
                    <h2 className="font-bold text-foreground flex items-center gap-2"><Gift className="w-4 h-4 text-primary" />Recompensa (opcional)</h2>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={reward.hasReward} onChange={(e) => setReward({ ...reward, hasReward: e.target.checked })} />
                        Oferecer recompensa ao concluir
                    </label>
                    {reward.hasReward && (
                        <div className="grid grid-cols-3 gap-3">
                            <div><label className="field-label">Descrição PT</label><input className="field-input w-full" value={reward.description} onChange={(e) => setReward({ ...reward, description: e.target.value })} /></div>
                            <div><label className="field-label">EN</label><input className="field-input w-full" value={reward.description_en || ""} onChange={(e) => setReward({ ...reward, description_en: e.target.value })} /></div>
                            <div><label className="field-label">ES</label><input className="field-input w-full" value={reward.description_es || ""} onChange={(e) => setReward({ ...reward, description_es: e.target.value })} /></div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function ChipSection({ title, icon, chips, onChange, other, onToggleOther }: { title: string; icon: React.ReactNode; chips: SurveyChip[]; onChange: (c: SurveyChip[]) => void; other?: boolean; onToggleOther?: (v: boolean) => void }) {
    return (
        <section className="bg-background border rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-foreground flex items-center gap-2">{icon}{title}</h2>
            <div className="space-y-2">
                {chips.map((c, i) => (
                    <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <input className="field-input" placeholder="PT" value={c.label} onChange={(e) => { const arr = [...chips]; arr[i] = { ...c, label: e.target.value }; onChange(arr); }} />
                        <input className="field-input" placeholder="EN" value={c.label_en || ""} onChange={(e) => { const arr = [...chips]; arr[i] = { ...c, label_en: e.target.value }; onChange(arr); }} />
                        <input className="field-input" placeholder="ES" value={c.label_es || ""} onChange={(e) => { const arr = [...chips]; arr[i] = { ...c, label_es: e.target.value }; onChange(arr); }} />
                        <Button variant="ghost" size="icon" onClick={() => onChange(chips.filter((x) => x.id !== c.id))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => onChange([...chips, { id: crypto.randomUUID(), label: "" }])}><Plus className="w-4 h-4" />Item</Button>
                {onToggleOther && (
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!other} onChange={(e) => onToggleOther(e.target.checked)} />
                        Permitir campo livre (chip Outro)
                    </label>
                )}
            </div>
        </section>
    );
}
