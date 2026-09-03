// src/lib/evolution.ts
// SERVER-ONLY — lê property_secrets. Nunca importe em client component.
//
// O caminho de envio pela Evolution estava escrito por inteiro em três rotas
// (chat/send, admin/messages/send-now, cron/process-messages) e a resolução de
// configuração em mais duas. As cópias já tinham divergido: só o cron ganhou o
// gate de `whatsappEnabled` e a checagem prévia de número, e só ele conta
// tentativas. Isso é o tipo de divergência que ninguém percebe até uma
// mensagem não sair.
//
// O QUE FICA AQUI: resolver configuração, o modo seguro e o POST.
// O QUE FICA NA ROTA: o que gravar na tabela `messages` — elas discordam de
// propósito (o cron incrementa `attempts`/`lastAttemptAt` porque reprocessa; o
// chat responde na hora e não reprocessa nada).
import { supabaseAdmin } from '@/lib/supabase';
import { PropertySecretsService } from '@/services/property-secrets-service';
import { parseEvolutionError } from '@/lib/evolution-error';
import { isSafeMode, logSuppressedSend } from '@/lib/safe-mode';

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export type EvolutionConfigResult =
  | { ok: true; config: EvolutionConfig }
  | { ok: false; reason: 'disabled' | 'incomplete'; message: string };

/**
 * Monta a configuração da Evolution: `settings.whatsappConfig` da propriedade,
 * a chave do cofre `property_secrets` (fora do alcance do navegador) e as
 * variáveis de ambiente como último recurso.
 *
 * `requireEnabled` reproduz o gate que só o cron tinha. Deixei opcional em vez
 * de ligar para todos porque ligá-lo mudaria o comportamento do envio manual
 * numa propriedade com o WhatsApp desligado — é decisão de produto, não faxina.
 */
export async function resolveEvolutionConfig(
  propertyId: string,
  opts: { requireEnabled?: boolean } = {},
): Promise<EvolutionConfigResult> {
  // Só as duas chaves lidas abaixo: `settings` inteiro custa ~13 kB comprimidos,
  // e este caminho roda a cada envio de WhatsApp.
  const { data: property } = await supabaseAdmin!
    .from('properties')
    .select('whatsappEnabled:settings->whatsappEnabled, whatsappConfig:settings->whatsappConfig')
    .eq('id', propertyId)
    .single();

  const settings = (property ?? {}) as Record<string, any>;

  if (opts.requireEnabled && !settings.whatsappEnabled) {
    return { ok: false, reason: 'disabled', message: 'WhatsApp desligado na propriedade.' };
  }

  const cfg = settings.whatsappConfig ?? {};
  const secrets = await PropertySecretsService.get(propertyId);

  const apiUrl: string = cfg.apiUrl || process.env.EVOLUTION_API_URL || '';
  const apiKey: string = secrets.evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
  const instanceName: string =
    cfg.instanceName || cfg.instances?.[0]?.instanceName || process.env.EVOLUTION_INSTANCE || '';

  if (!apiUrl || !apiKey || !instanceName) {
    return { ok: false, reason: 'incomplete', message: 'Configuração da Evolution API ausente.' };
  }

  return {
    ok: true,
    config: {
      baseUrl: apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl,
      apiKey,
      instanceName,
    },
  };
}

export type EvolutionSendResult =
  | { ok: true; apiMessageId: string | null; safeMode: boolean }
  | { ok: false; errorMessage: string; status: number | null };

/**
 * Envia um texto. NÃO grava nada em `messages` — quem chamou decide isso.
 *
 * Fora de produção nada sai: o conteúdo vai para o log e o retorno é sucesso
 * com `safeMode: true`, para a fila andar sem falar com a Evolution real.
 */
export async function sendEvolutionText(
  config: EvolutionConfig,
  number: string,
  text: string,
  logTag = 'evolution',
): Promise<EvolutionSendResult> {
  if (isSafeMode()) {
    logSuppressedSend('whatsapp', number || '(sem destinatário)', String(text).slice(0, 60));
    return { ok: true, apiMessageId: null, safeMode: true };
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
        body: JSON.stringify({ number, text }),
      },
    );
  } catch (err: any) {
    console.error(`[${logTag}] Evolution inalcançável:`, err?.message);
    return { ok: false, errorMessage: 'Servidor offline (Timeout)', status: null };
  }

  if (!response.ok) {
    const rawText = await response.text();
    console.error(`[${logTag}] Evolution API error:`, response.status, rawText);
    return {
      ok: false,
      errorMessage: parseEvolutionError(response.status, rawText),
      status: response.status,
    };
  }

  const data = await response.json().catch(() => null);
  return { ok: true, apiMessageId: data?.key?.id || null, safeMode: false };
}
