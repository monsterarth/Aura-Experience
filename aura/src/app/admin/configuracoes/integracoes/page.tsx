"use client";

// src/app/admin/configuracoes/integracoes/page.tsx
//
// WhatsApp (Evolution), Chatwoot e o domínio próprio.
//
// Os SEGREDOS nunca chegam ao navegador: o campo abre vazio mostrando "••••1234
// (inalterado)" e em branco significa "mantém o atual". Quem confere se a
// credencial presta é o botão Testar, que roda no servidor.
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePropertySection, changedOnly } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingRow } from "@/components/ui/SettingRow";
import { Toggle } from "@/components/ui/Toggle";
import { PropertySettingsClient, IntegrationsView } from "@/lib/property-settings-client";
import { toast } from "sonner";
import { MessageSquare, Globe, Loader2, CheckCircle2, AlertTriangle, Plug } from "lucide-react";

interface Draft {
  whatsappEnabled: boolean;
  whatsappNumber: string;
  customDomain: string;
  apiUrl: string;
  instanceName: string;
  chatwootUrl: string;
  chatwootAccountId: string;
  chatwootInboxId: string;
  // Write-only: sempre nascem vazios, preenchidos só para substituir.
  evolutionApiKey: string;
  chatwootApiToken: string;
}

const CONFIG_KEYS = ["apiUrl", "instanceName", "chatwootUrl", "chatwootAccountId", "chatwootInboxId"] as const;

export default function IntegracoesPage() {
  const { isSuperAdmin } = useAuth();
  const { property, draft, baseline, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => {
    const s = p.settings as Record<string, any>;
    const wc = (s.whatsappConfig ?? {}) as Record<string, any>;
    return {
      whatsappEnabled: !!s.whatsappEnabled,
      whatsappNumber: s.whatsappNumber ?? "",
      customDomain: s.customDomain ?? "",
      apiUrl: wc.apiUrl ?? "",
      instanceName: wc.instanceName ?? "",
      chatwootUrl: wc.chatwootUrl ?? "",
      chatwootAccountId: wc.chatwootAccountId ?? "",
      chatwootInboxId: wc.chatwootInboxId ? String(wc.chatwootInboxId) : "",
      evolutionApiKey: "",
      chatwootApiToken: "",
    };
  });

  const [secrets, setSecrets] = useState<IntegrationsView | null>(null);
  const [testing, setTesting] = useState<"evolution" | "chatwoot" | null>(null);

  const loadSecrets = useCallback(async () => {
    if (!property) return;
    try { setSecrets(await PropertySettingsClient.getIntegrations(property.id)); }
    catch { /* a tela funciona sem a máscara */ }
  }, [property]);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  if (!draft || !property) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const onSave = () => save(
    (d) => ({ patch: changedOnly(d as any, baseline as any, ["whatsappEnabled", "whatsappNumber", "customDomain"]) }),
    {
      after: async () => {
        await PropertySettingsClient.saveIntegrations({
          propertyId: property.id,
          config: {
            apiUrl: draft.apiUrl, instanceName: draft.instanceName,
            chatwootUrl: draft.chatwootUrl, chatwootAccountId: draft.chatwootAccountId,
            chatwootInboxId: draft.chatwootInboxId ? Number(draft.chatwootInboxId) : null,
          },
          secrets: {
            ...(draft.evolutionApiKey ? { evolutionApiKey: draft.evolutionApiKey } : {}),
            ...(draft.chatwootApiToken ? { chatwootApiToken: draft.chatwootApiToken } : {}),
          },
        });
        patch({ evolutionApiKey: "", chatwootApiToken: "" });
        await loadSecrets();
      },
    },
  );

  const test = async (target: "evolution" | "chatwoot") => {
    setTesting(target);
    try {
      const r = await PropertySettingsClient.testIntegration(property.id, target);
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch (e) { toast.error((e as Error).message); }
    finally { setTesting(null); }
  };

  const evolutionOk = !!draft.apiUrl && !!draft.instanceName && !!secrets?.hasEvolutionApiKey;
  const chatwootOk = !!draft.chatwootUrl && !!draft.chatwootAccountId && !!draft.chatwootInboxId && !!secrets?.hasChatwootApiToken;

  const secretField = (
    label: string, key: "evolutionApiKey" | "chatwootApiToken", has?: boolean, mask?: string | null,
  ) => (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="password"
        className="field-input w-full font-mono"
        value={draft[key]}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<Draft>)}
        placeholder={has ? `${mask} (inalterado)` : "••••••••••••••••"}
      />
      <p className="text-[10px] text-muted-foreground mt-1">
        Guardado fora do alcance do navegador. Em branco, mantém o atual — preencha só para substituir.
      </p>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <SectionCard title="WhatsApp" icon={MessageSquare}>
        <SettingRow
          title="Envio pelo WhatsApp"
          description="Desligado, nenhuma automação de mensagem sai desta propriedade."
          icon={MessageSquare}
          onClick={() => patch({ whatsappEnabled: !draft.whatsappEnabled })}
        >
          <Toggle checked={draft.whatsappEnabled} label="Envio pelo WhatsApp" />
        </SettingRow>
        <div>
          <label className="field-label">Número de contato</label>
          <input
            className="field-input w-full"
            placeholder="+55 11 90000-0000"
            value={draft.whatsappNumber}
            onChange={(e) => patch({ whatsappNumber: e.target.value })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Evolution API" icon={Plug}
        aside={
          <button
            onClick={() => test("evolution")} disabled={testing !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {testing === "evolution" ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />} Testar
          </button>
        }
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">URL da API</label>
            <input className="field-input w-full font-mono text-xs" placeholder="https://evolution.seudominio.com"
              value={draft.apiUrl} onChange={(e) => patch({ apiUrl: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Nome da instância</label>
            <input className="field-input w-full font-mono text-xs" placeholder="ex.: fazenda-rosa"
              value={draft.instanceName} onChange={(e) => patch({ instanceName: e.target.value })} />
          </div>
        </div>
        {secretField("API Key", "evolutionApiKey", secrets?.hasEvolutionApiKey, secrets?.evolutionApiKeyMask)}

        {draft.whatsappEnabled && (
          evolutionOk ? (
            <p className="flex items-center gap-2 text-emerald-500 text-xs font-bold bg-emerald-500/10 p-3 rounded-xl">
              <CheckCircle2 size={14} /> Configurada — as automações de mensagem podem sair.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-amber-500 text-xs font-bold bg-amber-500/10 p-3 rounded-xl">
              <AlertTriangle size={14} /> Faltam URL, instância ou chave: nada é enviado.
            </p>
          )
        )}
        <p className="text-[10px] text-muted-foreground">
          O teste só prova que a credencial foi aceita. Instância conectada pode responder
          &quot;open&quot; e ainda assim não entregar — só um envio real prova envio.
        </p>
      </SectionCard>

      <SectionCard
        title="Chatwoot" icon={MessageSquare}
        aside={
          <button
            onClick={() => test("chatwoot")} disabled={testing !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {testing === "chatwoot" ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />} Testar
          </button>
        }
      >
        <div>
          <label className="field-label">URL do Chatwoot</label>
          <input className="field-input w-full font-mono text-xs" placeholder="https://chatwoot.seudominio.com"
            value={draft.chatwootUrl} onChange={(e) => patch({ chatwootUrl: e.target.value })} />
          <p className="text-[10px] text-muted-foreground mt-1">
            Usada no iframe da Central de Comunicação e nas chamadas de sincronização.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Account ID</label>
            <input className="field-input w-full font-mono text-xs" placeholder="1"
              value={draft.chatwootAccountId} onChange={(e) => patch({ chatwootAccountId: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Inbox ID</label>
            <input type="number" className="field-input w-full font-mono text-xs" placeholder="3"
              value={draft.chatwootInboxId} onChange={(e) => patch({ chatwootInboxId: e.target.value })} />
          </div>
        </div>
        {secretField("API Token", "chatwootApiToken", secrets?.hasChatwootApiToken, secrets?.chatwootApiTokenMask)}
        {chatwootOk && (
          <p className="flex items-center gap-2 text-emerald-500 text-xs font-bold bg-emerald-500/10 p-3 rounded-xl">
            <CheckCircle2 size={14} /> Configurado — inbox e sincronização de contatos ativos.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Domínio próprio" icon={Globe} description="O endereço em que o portal do hóspede e as plaquetas de patrimônio respondem.">
        <input
          className="field-input w-full font-mono text-sm disabled:opacity-60"
          placeholder="aura.suapousada.com.br"
          value={draft.customDomain}
          disabled={!isSuperAdmin}
          onChange={(e) => patch({ customDomain: e.target.value })}
        />
        <p className="text-[11px] text-amber-500">
          Trocar este valor <b>quebra as plaquetas de patrimônio já coladas</b>: o QR gravado no metal
          aponta para o domínio antigo e não pode ser reimpresso.
        </p>
        {!isSuperAdmin && <p className="text-[10px] text-muted-foreground">Somente super admin altera.</p>}
      </SectionCard>

      <SaveBar
        dirty={dirty} saving={saving} onReset={reset} onSave={onSave}
        warning={draft.customDomain !== baseline?.customDomain ? "Você está mudando o domínio próprio — confira as plaquetas antes de salvar." : undefined}
      />
    </div>
  );
}
