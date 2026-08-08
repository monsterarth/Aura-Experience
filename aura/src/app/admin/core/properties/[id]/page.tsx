"use client";

// src/app/admin/core/properties/[id]/page.tsx
//
// PÁGINA DE PLATAFORMA — o que sobrou depois que a configuração da pousada saiu daqui.
//
// Esta tela tinha 1542 linhas e era a configuração de verdade da propriedade, morando
// em /admin/core (área de super_admin) e lendo `params.id` em vez do PropertyContext.
// Dava para editar a Fazenda do Rosa com o sistema apontando para outra pousada,
// enquanto o breadcrumb exibia a outra. Marca, operação, políticas, gastronomia,
// integrações e módulos foram para /admin/configuracoes, presos à propriedade ATIVA.
//
// Aqui ficou só o que é mesmo de plataforma: a identidade do workspace e a Danger Zone.
// Destruição em massa continua a um clique de distância de ninguém que não seja
// super_admin — de propósito, é o motivo de não ter ido para o hub.
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { PropertyService } from "@/services/property-service";
import { Property } from "@/types/aura";
import { toast } from "sonner";
import {
    Loader2, AlertTriangle, Database, RefreshCcw, Trash2, ArrowRight,
    Settings, Building2, ArrowLeft,
} from "lucide-react";

/** Links antigos (?tab=visual…) continuam funcionando: viram a seção equivalente do hub. */
const TAB_TO_SECTION: Record<string, string> = {
    visual: "marca",
    operational: "operacao",
    policies: "politicas",
    f_b: "gastronomia",
};

const PURGE_TARGETS = [
    { id: "stays", label: "Estadias" },
    { id: "guests", label: "Hóspedes" },
    { id: "messages", label: "Histórico de mensagens" },
    { id: "housekeeping_tasks", label: "Tarefas de faxina" },
    { id: "maintenance_tasks", label: "Tickets de manutenção" },
    { id: "survey_responses", label: "Avaliações respondidas" },
    { id: "structure_bookings", label: "Agendamentos de estruturas" },
    { id: "structures", label: "Estruturas cadastradas" },
    { id: "cabins", label: "Cabanas cadastradas" },
];

export default function PropertyPlatformPage() {
    const { id } = useParams();
    const router = useRouter();
    const tabParam = useSearchParams().get("tab");
    const { isSuperAdmin, userData, loading: authLoading } = useAuth();
    const { currentProperty, setProperty } = useProperty();

    const [target, setTarget] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [purge, setPurge] = useState<string[]>([]);
    const [showDelete, setShowDelete] = useState(false);
    const [confirmName, setConfirmName] = useState("");

    const propertyId = String(id);
    const sameProperty = currentProperty?.id === propertyId;

    useEffect(() => {
        PropertyService.getPropertyById(propertyId)
            .then((p) => setTarget(p))
            .finally(() => setLoading(false));
    }, [propertyId]);

    // Quem não é super_admin não tem o que fazer aqui — e não deve alcançar a config de
    // outro tenant por URL. A configuração dele é o hub, preso à própria propriedade.
    useEffect(() => {
        if (authLoading || !userData) return;
        if (!isSuperAdmin) router.replace("/admin/configuracoes");
    }, [authLoading, userData, isSuperAdmin, router]);

    // Link antigo com ?tab= vai direto para a seção nova (só quando é a propriedade ativa).
    useEffect(() => {
        if (!tabParam || !sameProperty) return;
        const section = TAB_TO_SECTION[tabParam];
        if (section) router.replace(`/admin/configuracoes/${section}`);
    }, [tabParam, sameProperty, router]);

    async function manage(action: string, extra: Record<string, unknown> = {}) {
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/properties/${propertyId}/manage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actorId: userData?.id, actorName: userData?.fullName, action, ...extra }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            return json;
        } finally {
            setBusy(false);
        }
    }

    const doReset = async () => {
        if (!window.confirm("Isso apaga automações, checklists e templates atuais desta propriedade e clona os padrões do sistema. Tem certeza?")) return;
        try { await manage("reset_defaults"); toast.success("Padrões restaurados."); }
        catch (e) { toast.error((e as Error).message || "Erro ao restaurar padrões."); }
    };

    const doPurge = async () => {
        if (purge.length === 0) return;
        const labels = PURGE_TARGETS.filter((t) => purge.includes(t.id)).map((t) => t.label).join(", ");
        if (!window.confirm(`Apagar permanentemente: ${labels}?\n\nNão há como desfazer.`)) return;
        try { await manage("purge", { targets: purge }); toast.success("Dados limpos."); setPurge([]); }
        catch (e) { toast.error((e as Error).message || "Erro ao limpar dados."); }
    };

    const doDelete = async () => {
        if (confirmName !== (target?.name ?? "")) { toast.error("O nome digitado não confere."); return; }
        try {
            await manage("delete_property");
            toast.success("Propriedade excluída.");
            router.push("/admin/core/properties");
        } catch (e) {
            toast.error((e as Error).message || "Erro ao excluir.");
            setShowDelete(false);
        }
    };

    if (loading || authLoading) {
        return <div className="flex justify-center p-24"><Loader2 className="animate-spin text-primary" size={40} /></div>;
    }
    if (!isSuperAdmin) return null;   // o efeito acima já redirecionou
    if (!target) {
        return (
            <div className="p-8 max-w-lg mx-auto text-center space-y-3">
                <AlertTriangle className="mx-auto text-amber-500" size={28} />
                <p className="text-foreground font-bold">Propriedade não encontrada.</p>
                <Link href="/admin/core/properties" className="text-sm text-primary font-bold">Voltar para a lista</Link>
            </div>
        );
    }

    // Interstitial: em vez de editar às escondidas uma pousada diferente da ativa, a tela
    // pergunta. Era exatamente esse descompasso silencioso que gerava o bug antigo.
    if (!sameProperty) {
        return (
            <div className="p-8 max-w-lg mx-auto">
                <div className="bg-card border border-border rounded-3xl p-6 space-y-4 text-center">
                    <Building2 className="mx-auto text-primary" size={28} />
                    <h1 className="text-lg font-bold text-foreground">Trocar de propriedade?</h1>
                    <p className="text-sm text-muted-foreground">
                        Você está operando em <b className="text-foreground">{currentProperty?.name ?? "nenhuma"}</b>,
                        mas abriu <b className="text-foreground">{target.name}</b>.
                        Todo o sistema segue a propriedade ativa — inclusive as configurações.
                    </p>
                    <div className="flex gap-2 justify-center pt-2 flex-wrap">
                        <Link href="/admin/core/properties" className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">
                            Cancelar
                        </Link>
                        <button
                            onClick={() => { setProperty(target); router.push("/admin/configuracoes"); }}
                            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground"
                        >
                            Mudar para {target.name} <ArrowRight size={15} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <header className="mb-2">
                <Link href="/admin/core/properties" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
                    <ArrowLeft size={12} /> Propriedades
                </Link>
                <h1 className="text-2xl font-bold text-foreground">{target.name}</h1>
                <p className="text-sm text-muted-foreground">Administração de plataforma deste workspace.</p>
            </header>

            <Link
                href="/admin/configuracoes"
                className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-secondary/30 transition-colors"
            >
                <Settings size={18} className="text-primary shrink-0" />
                <span className="flex-1">
                    <span className="block text-sm font-bold text-foreground">Configurações da pousada</span>
                    <span className="block text-xs text-muted-foreground">
                        Marca, operação, políticas, gastronomia, integrações e módulos.
                    </span>
                </span>
                <ArrowRight size={15} className="text-muted-foreground" />
            </Link>

            <section className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-3xl space-y-4">
                <div className="flex items-start gap-3">
                    <RefreshCcw size={20} className="text-orange-600 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-bold text-orange-600">Restaurar padrões</h2>
                        <p className="text-sm text-orange-600/80 mt-1">
                            Apaga <b>automações</b>, <b>templates de mensagem</b> e <b>checklists</b> desta
                            propriedade e recria os modelos originais do sistema.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button onClick={doReset} disabled={busy}
                        className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold uppercase text-xs tracking-wider rounded-xl disabled:opacity-50">
                        <RefreshCcw size={15} /> Sobrescrever e restaurar
                    </button>
                </div>
            </section>

            <section className="bg-red-500/5 border border-red-500/20 p-6 rounded-3xl space-y-4">
                <div className="flex items-start gap-3">
                    <Database size={20} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-bold text-red-500">Limpeza em massa</h2>
                        <p className="text-sm text-red-500/80 mt-1">
                            Apaga permanentemente todos os registros das categorias marcadas.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PURGE_TARGETS.map((t) => (
                        <label key={t.id} className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl cursor-pointer hover:border-red-500/30">
                            <input
                                type="checkbox" className="w-4 h-4 accent-red-500 cursor-pointer"
                                checked={purge.includes(t.id)}
                                onChange={() => setPurge((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id])}
                            />
                            <span className="text-sm font-bold text-foreground">{t.label}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end pt-2 border-t border-red-500/10">
                    <button onClick={doPurge} disabled={busy || purge.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-500/20 hover:bg-red-500 hover:text-white text-red-500 font-bold uppercase text-xs tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                        <Trash2 size={15} /> Limpar selecionados
                    </button>
                </div>
            </section>

            <section className="bg-red-600/10 border-2 border-red-600/30 p-6 rounded-3xl space-y-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-bold text-red-600 text-lg">Excluir workspace</h2>
                        <p className="text-sm text-red-600/80 mt-1 font-medium">
                            Apaga a pousada inteira em cascata e desloga toda a equipe vinculada. Não há como desfazer.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button onClick={() => setShowDelete(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-widest rounded-xl">
                        <Trash2 size={16} /> Excluir definitivamente
                    </button>
                </div>
            </section>

            {showDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-card border border-red-500/30 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
                        <div className="p-6 bg-red-500/10 border-b border-red-500/20 text-center space-y-2">
                            <AlertTriangle size={28} className="mx-auto text-red-500" />
                            <h3 className="text-lg font-black text-red-500 uppercase tracking-widest">Aviso crítico</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-muted-foreground text-center">
                                Para confirmar, digite o nome exato da propriedade: <b className="text-foreground">{target.name}</b>
                            </p>
                            <input
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                placeholder={target.name}
                                className="field-input w-full text-center font-black"
                            />
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => { setShowDelete(false); setConfirmName(""); }}
                                    disabled={busy}
                                    className="flex-1 py-3 text-muted-foreground font-bold hover:text-foreground"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={doDelete}
                                    disabled={busy || confirmName !== target.name}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-wider rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {busy ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
