// src/services/afd-import-service.ts
//
// Import do AFD (o arquivo do relógio de ponto) para `time_clock_events`.
// SERVER-ONLY (supabaseAdmin): entra por `/api/admin/rh/afd`.
//
// A leitura do arquivo mora em `src/lib/afd.ts`, que é puro. Aqui se cuida de
// casar batida com pessoa, não duplicar, e registrar o que aconteceu.
//
// ─────────────────────────────────────────────────────────────────────────────
// AS TRÊS COISAS QUE ESTE ARQUIVO PROTEGE
//
//  1. IDEMPOTÊNCIA PELO PAR (repSerial, nsr). O NSR sozinho não serve: cada
//     equipamento tem a própria sequência, e um REP trocado reinicia do 1. O AFD
//     é CUMULATIVO — reimportar o mesmo arquivo é o caso normal, não um erro —
//     então a segunda vez tem que ser silenciosa e não duplicar o mês.
//
//  2. SÓ ENTRA BATIDA DE QUEM ESTÁ EM `timeSource = 'rep'`. Quem bate no Aura ou
//     não bate não pode ganhar uma segunda contagem de horas pelo import. É a
//     mesma invariante que a fase 1 do Ponto protege.
//
//  3. O QUE NÃO CASOU É INFORMAÇÃO, NÃO SILÊNCIO. Batida cujo PIS/CPF ninguém
//     cadastrou fica listada no registro do import. Sem isso, "a pessoa não
//     bateu ponto" e "ninguém cadastrou o documento dela" ficam indistinguíveis
//     — e o segundo é o caso comum no primeiro mês.
import { supabaseAdmin } from "@/lib/supabase";
import { parseAfd } from "@/lib/afd";

function db() {
  if (!supabaseAdmin) throw new Error("AfdImportService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export interface AfdActor { id: string; name: string }

export interface AfdImportResult {
  importId: string | null;
  layout: string;
  repSerial: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  punchesFound: number;
  imported: number;
  duplicated: number;
  unmatched: number;
  /** Quem o arquivo trouxe e o sistema não soube de quem era. É a lista de "cadastre o PIS". */
  unmatchedIds: Array<{ id: string; kind: string; punches: number }>;
  warnings: string[];
}

export const AfdImportService = {
  /**
   * Lê o arquivo e, se `dryRun`, apenas devolve o que ACONTECERIA. A tela mostra
   * o resumo antes de gravar: importar batida com o de-para errado é caro de
   * desfazer, e conferir custa um clique.
   */
  async importar(
    propertyId: string,
    file: { name: string; bytes: Uint8Array },
    actor: AfdActor,
    opts: { dryRun?: boolean } = {},
  ): Promise<AfdImportResult> {
    const client = db();
    const parsed = parseAfd(file.bytes);
    if (parsed.fatal) throw new Error(parsed.fatal);

    const [{ data: docsData, error: docsErr }, { data: staffData, error: staffErr }] = await Promise.all([
      client.from("staff_documents").select("staffId, pis, cpf, repRegistration").eq("propertyId", propertyId),
      client.from("staff").select("id, timeSource").eq("propertyId", propertyId).eq("active", true),
    ]);
    if (docsErr) throw new Error(`Falha ao ler os documentos da equipe: ${docsErr.message}`);
    if (staffErr) throw new Error(`Falha ao ler a equipe: ${staffErr.message}`);

    const noRelogio = new Set(
      rows<{ id: string; timeSource: string | null }>(staffData)
        .filter(s => s.timeSource === "rep")
        .map(s => s.id),
    );

    const porDocumento = new Map<string, string>();
    for (const d of rows<{ staffId: string; pis: string | null; cpf: string | null; repRegistration: string | null }>(docsData)) {
      if (d.pis) porDocumento.set(`pis:${d.pis}`, d.staffId);
      if (d.cpf) porDocumento.set(`cpf:${d.cpf}`, d.staffId);
      if (d.repRegistration) porDocumento.set(`reg:${d.repRegistration}`, d.staffId);
    }

    const nsrs = parsed.punches.map(p => p.nsr);
    const jaTem = new Set<number>();
    if (parsed.repSerial && nsrs.length > 0) {
      const { data, error } = await client
        .from("time_clock_events")
        .select("nsr")
        .eq("repSerial", parsed.repSerial)
        .gte("nsr", Math.min(...nsrs))
        .lte("nsr", Math.max(...nsrs));
      if (error) throw new Error(`Falha ao verificar o que já foi importado: ${error.message}`);
      for (const r of rows<{ nsr: number }>(data)) jaTem.add(Number(r.nsr));
    }

    const naoCasadas = new Map<string, { id: string; kind: string; punches: number }>();
    const linhas: Array<Record<string, unknown>> = [];
    let duplicadas = 0;

    /**
     * O AFD NÃO diz se a batida é entrada ou saída — a norma só grava o instante.
     * O par é derivado: dentro do mesmo dia e da mesma pessoa, a 1ª é entrada, a
     * 2ª é saída, e assim por diante. É a mesma regra que `src/lib/timeclock.ts`
     * já aplica às batidas feitas no Aura, então os dois caminhos concordam e a
     * jornada de um dia misto continua fechando.
     */
    const contadorDoDia = new Map<string, number>();

    for (const p of [...parsed.punches].sort((a, b) => a.nsr - b.nsr)) {
      const staffId = porDocumento.get(`${p.identifierKind}:${p.identifier}`);

      if (!staffId || !noRelogio.has(staffId)) {
        const chave = `${p.identifierKind}:${p.identifier}`;
        const atual = naoCasadas.get(chave) ?? { id: p.identifier, kind: p.identifierKind, punches: 0 };
        atual.punches++;
        naoCasadas.set(chave, atual);
        continue;
      }

      if (jaTem.has(p.nsr)) { duplicadas++; continue; }

      const chaveDia = `${staffId}|${p.date}`;
      const n = (contadorDoDia.get(chaveDia) ?? 0) + 1;
      contadorDoDia.set(chaveDia, n);

      linhas.push({
        staffId,
        propertyId,
        ts: p.ts,
        kind: n % 2 === 1 ? "in" : "out",
        source: "rep",
        repSerial: parsed.repSerial,
        nsr: p.nsr,
        createdBy: actor.id,
        createdByName: `Import AFD (${actor.name})`,
      });
    }

    const naoCasadasLista = Array.from(naoCasadas.values()).sort((a, b) => b.punches - a.punches);

    const resumo = {
      layout: parsed.layout,
      repSerial: parsed.repSerial,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      punchesFound: parsed.punches.length,
      imported: linhas.length,
      duplicated: duplicadas,
      unmatched: naoCasadasLista.reduce((a, u) => a + u.punches, 0),
      unmatchedIds: naoCasadasLista,
      warnings: parsed.warnings,
    };

    if (opts.dryRun) return { importId: null, ...resumo };

    const { data: imp, error: impErr } = await client
      .from("afd_imports")
      .insert({
        propertyId,
        fileName: file.name,
        fileBytes: file.bytes.length,
        layout: parsed.layout,
        repSerial: parsed.repSerial,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        linesTotal: parsed.linesTotal,
        punchesFound: parsed.punches.length,
        punchesImported: linhas.length,
        punchesDuplicated: duplicadas,
        punchesUnmatched: resumo.unmatched,
        unmatchedIds: naoCasadasLista,
        warnings: parsed.warnings,
        createdBy: actor.id,
        createdByName: actor.name,
      })
      .select("id")
      .single();
    if (impErr) throw new Error(`Falha ao registrar o import: ${impErr.message}`);
    const importId = (imp as { id: string }).id;

    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500).map(l => ({ ...l, importId }));
      const { error } = await client.from("time_clock_events").insert(lote);
      if (error) throw new Error(`Falha ao gravar as batidas: ${error.message}`);
    }

    return { importId, ...resumo };
  },

  async listar(propertyId: string, limite = 20) {
    const { data, error } = await db()
      .from("afd_imports")
      .select("*")
      .eq("propertyId", propertyId)
      .order("createdAt", { ascending: false })
      .limit(limite);
    if (error) throw new Error(`Falha ao ler o histórico de imports: ${error.message}`);
    return rows<Record<string, unknown>>(data);
  },

  /**
   * Desfaz um import inteiro.
   *
   * Existe porque um de-para errado — o PIS de alguém cadastrado na pessoa
   * errada — contamina batidas boas, e sem isto a correção seria linha a linha.
   * É por isso que `time_clock_events.importId` existe.
   */
  async desfazer(importId: string, propertyId: string): Promise<number> {
    const client = db();
    const { data, error } = await client
      .from("time_clock_events")
      .delete()
      .eq("importId", importId)
      .eq("propertyId", propertyId)
      .select("id");
    if (error) throw new Error(`Falha ao desfazer o import: ${error.message}`);
    return rows<{ id: string }>(data).length;
  },
};
