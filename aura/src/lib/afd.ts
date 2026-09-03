// src/lib/afd.ts
//
// Leitor de AFD (Arquivo Fonte de Dados) — o arquivo do relógio de ponto.
// Puro: recebe bytes, devolve batidas. Não conhece Supabase nem a tela.
//
// ─────────────────────────────────────────────────────────────────────────────
// SÃO TRÊS LEIAUTES, NÃO DOIS
//
//   MTE 1.510/2009      cabeçalho 232 · marcação 34 · trailer 46
//   INMETRO 595/2013    cabeçalho 236 · marcação 38 · trailer 55   ← +CRC-16
//   MTP 671/2021        cabeçalho 302 · marcação 50 · trailer 64
//
// O RTQ da Portaria INMETRO 595 manda gravar um CRC-16 em cada registro, e todo
// REP certificado a partir de 2014 emite assim. Um leitor que só conhece 1.510 e
// 671 quebra no arquivo real.
//
// A boa notícia: **1.510 e 595 têm os campos nas MESMAS posições** — o 595 só
// acrescenta quatro caracteres de CRC no fim. Então bastam DOIS parsers: o
// posicional antigo (serve aos dois) e o da 671.
//
// ─────────────────────────────────────────────────────────────────────────────
// AS ARMADILHAS QUE ESTE ARQUIVO EVITA
//
//  · ENCODING. A norma exige ISO-8859-1, onde 1 caractere = 1 byte, e é isso que
//    torna o fatiamento posicional válido. Se alguém abrir o arquivo no Bloco de
//    Notas e salvar como UTF-8, um "Ç" vira dois bytes e TODOS os campos depois
//    dele deslocam. O sintoma não é acento estranho: é campo errado. Por isso a
//    entrada é `Uint8Array` e a decodificação é explícita.
//  · BOM. Três bytes (EF BB BF) no início empurram o tipo do registro para fora
//    da posição 10 e o arquivo inteiro é rejeitado como inválido.
//  · CR+LF. `split("\n")` deixa um `\r` pendurado, inofensivo no meio da linha e
//    destruidor no último campo.
//  · LINHAS DE TAMANHOS DIFERENTES. Num mesmo AFD convivem cabeçalho, tipo 2,
//    tipo 3, tipo 5, trailer... Validar comprimento global rejeita o arquivo
//    todo; a validação é POR TIPO, lida no caractere 10.
//  · O CAMPO DE 12 DO EMPREGADO NÃO É "PIS COM ZERO À ESQUERDA". O art. 96 §2 da
//    671 define o primeiro caractere como DISCRIMINADOR: "0" + PIS, "9" + CPF.
//  · PIPE. Se a linha tem "|", não é AFD — é AEJ, outro arquivo.

export type AfdLayout = "1510" | "595" | "671" | "desconhecido";
export type IdKind = "pis" | "cpf";

export interface AfdPunch {
  nsr: number;
  /** Instante da batida em ISO com offset. */
  ts: string;
  /** YYYY-MM-DD no fuso da marcação — é por ele que o dia é agrupado. */
  date: string;
  identifier: string;
  identifierKind: IdKind;
  /** A linha crua, para diagnóstico quando algo não bate. */
  raw: string;
}

export interface AfdParse {
  layout: AfdLayout;
  /** Número de fabricação do REP (17 posições). É metade da chave de idempotência. */
  repSerial: string | null;
  employerId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  punches: AfdPunch[];
  linesTotal: number;
  warnings: string[];
  /** Impede o import de seguir com um arquivo que não é AFD. */
  fatal: string | null;
}

// ─── decodificação ───────────────────────────────────────────────────────────

/**
 * Bytes → linhas. ISO-8859-1 por norma: um byte, um caractere, e a posição do
 * campo passa a ser o offset do byte.
 */
export function decodeAfd(bytes: Uint8Array): string[] {
  let inicio = 0;
  // BOM UTF-8: some antes de qualquer coisa, senão desloca a linha inteira.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) inicio = 3;

  let texto = "";
  // Sem TextDecoder("latin1") por compatibilidade: o mapeamento de ISO-8859-1
  // para Unicode é a identidade nos 256 primeiros pontos, então isto É latin-1.
  const CHUNK = 8192;
  for (let i = inicio; i < bytes.length; i += CHUNK) {
    texto += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return texto.split(/\r?\n/).filter(l => l.length > 0);
}

/** Fatia 1-based inclusiva, como a norma numera. */
function campo(linha: string, ini: number, fim: number): string {
  return linha.slice(ini - 1, fim);
}

// ─── identificação do trabalhador ────────────────────────────────────────────

/**
 * O campo de 12 posições que diz de quem é a batida.
 *
 * Art. 96 §2 da Portaria 671: o primeiro caractere é discriminador — "0" seguido
 * do PIS de 11, ou "9" seguido do CPF de 11. Tratar tudo como "PIS com zero à
 * esquerda" funciona por acidente no caso comum e erra em quem não tem PIS.
 *
 * Na 671 o campo é CPF, e o FAQ do MTE admite as duas formas: zero à esquerda
 * ("0" + 11) ou espaço à direita (11 + " ").
 */
export function lerIdentificador(bruto: string, layout: AfdLayout): { id: string; kind: IdKind } | null {
  const t = bruto.trim();
  if (!/^\d+$/.test(t)) return null;

  if (layout === "671") {
    const cpf = t.length === 12 && t.startsWith("0") ? t.slice(1) : t;
    return cpf.length === 11 ? { id: cpf, kind: "cpf" } : null;
  }

  if (t.length === 12) {
    const disc = t[0];
    const resto = t.slice(1);
    if (disc === "9") return { id: resto, kind: "cpf" };
    // "0" é o caso normal (PIS de 11 alinhado); qualquer outro dígito é PIS de
    // 12 do jeito antigo, e vale inteiro.
    if (disc === "0") return { id: resto, kind: "pis" };
    return { id: t, kind: "pis" };
  }

  return t.length === 11 ? { id: t, kind: "pis" } : null;
}

// ─── datas ───────────────────────────────────────────────────────────────────

/** "ddmmaaaa" + "hhmm" → ISO com o offset da pousada. */
function tsDo1510(data: string, hora: string, offsetMin: number): { ts: string; date: string } | null {
  if (!/^\d{8}$/.test(data) || !/^\d{4}$/.test(hora)) return null;
  const dd = data.slice(0, 2), mm = data.slice(2, 4), aaaa = data.slice(4, 8);
  const hh = hora.slice(0, 2), mi = hora.slice(2, 4);
  const sinal = offsetMin <= 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const off = `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return { ts: `${aaaa}-${mm}-${dd}T${hh}:${mi}:00${off}`, date: `${aaaa}-${mm}-${dd}` };
}

/** "AAAA-MM-ddThh:mm:00ZZZZZ" (offset sem dois-pontos) → ISO padrão. */
function tsDo671(dh: string): { ts: string; date: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}([+-]\d{2})(\d{2})$/.exec(dh.trim());
  if (!m) return null;
  return { ts: `${m[1]}T${m[2]}:00${m[3]}:${m[4]}`, date: m[1] };
}

// ─── leitura ─────────────────────────────────────────────────────────────────

/** A data existe no calendário? "9202-10-80" passa num teste de formato e não aqui. */
function dataValida(ymd: string | null): boolean {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [a, m, d] = ymd.split("-").map(Number);
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Último dia com horário de verão no Brasil. Antes disso, hora local é ambígua. */
const FIM_DO_HORARIO_DE_VERAO = "2019-02-16";

export function parseAfd(bytes: Uint8Array, opts: { offsetMinutes?: number } = {}): AfdParse {
  const offsetMin = opts.offsetMinutes ?? -180;
  const linhas = decodeAfd(bytes);
  const warnings: string[] = [];

  const vazio: AfdParse = {
    layout: "desconhecido", repSerial: null, employerId: null,
    periodFrom: null, periodTo: null, punches: [], linesTotal: linhas.length,
    warnings, fatal: null,
  };

  if (linhas.length === 0) return { ...vazio, fatal: "Arquivo vazio." };
  if (linhas[0].includes("|")) {
    return { ...vazio, fatal: "Este arquivo usa | para separar campos — é um AEJ, não um AFD. O AFD é posicional." };
  }

  const cab = linhas[0];
  if (campo(cab, 10, 10) !== "1") {
    return {
      ...vazio,
      fatal: `A primeira linha não é um cabeçalho de AFD (esperado "1" na posição 10, veio "${campo(cab, 10, 10)}"). ` +
             `Se o arquivo foi aberto e salvo num editor, o encoding pode ter deslocado tudo.`,
    };
  }

  // Discriminação: só a 671 põe uma data ISO no cabeçalho. O comprimento também
  // separa (232/236/302), mas arquivos passam por ferramentas que aparam espaços
  // à direita, e aí o comprimento mente — o conteúdo não.
  const ehR671 = /^\d{4}-\d{2}-\d{2}$/.test(campo(cab, 207, 216));
  const layout: AfdLayout = ehR671 ? "671" : cab.length >= 236 ? "595" : "1510";

  const repSerial = (ehR671 ? campo(cab, 190, 206) : campo(cab, 188, 204)).trim() || null;
  const employerId = campo(cab, 12, 25).trim() || null;

  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  if (ehR671) {
    periodFrom = campo(cab, 207, 216).trim() || null;
    periodTo = campo(cab, 217, 226).trim() || null;
  } else {
    const de = campo(cab, 205, 212), ate = campo(cab, 213, 220);
    if (/^\d{8}$/.test(de)) periodFrom = `${de.slice(4)}-${de.slice(2, 4)}-${de.slice(0, 2)}`;
    if (/^\d{8}$/.test(ate)) periodTo = `${ate.slice(4)}-${ate.slice(2, 4)}-${ate.slice(0, 2)}`;
  }

  if (!repSerial) {
    warnings.push("O cabeçalho não traz o número de fabricação do REP. Sem ele a reimportação não consegue reconhecer o que já entrou.");
  }

  // ── o arquivo foi reencodado? ──────────────────────────────────────────────
  //
  // O sintoma de um AFD salvo como UTF-8 não é acento estranho: é CAMPO ERRADO.
  // Cada caractere acentuado na razão social vira dois bytes e empurra tudo que
  // vem depois — inclusive o número de série e as datas. E o cheque da posição
  // 10 não pega, porque o deslocamento começa depois dela.
  //
  // A prova é barata: por norma, o número de fabricação é NUMÉRICO e as datas do
  // período têm formato fixo. Se qualquer um dos dois vier sujo, o arquivo não
  // pode ser lido posicionalmente — e é melhor recusar do que importar batida
  // com a data trocada.
  // O número de fabricação ocupa 17 posições fixas e é numérico; as datas do
  // período têm que existir no calendário. Um deslocamento de um único byte
  // encurta a série para 16 e transforma "01092026" em "9202-10-80" — que passa
  // por qualquer teste de formato e não passa por este.
  const serieSuja = repSerial !== null && !/^\d{17}$/.test(repSerial);
  const datasSujas = !dataValida(periodFrom) || !dataValida(periodTo);
  if (serieSuja || datasSujas) {
    return {
      ...vazio,
      layout,
      repSerial,
      employerId,
      periodFrom,
      periodTo,
      fatal:
        "O cabeçalho não bate com as posições do leiaute — número de série ou datas vieram fora de formato. " +
        "Quase sempre isso é o arquivo ter sido aberto e salvo num editor (UTF-8) em vez de vir direto do relógio. " +
        "Exporte de novo, sem abrir o arquivo antes.",
    };
  }

  const punches: AfdPunch[] = [];
  const semId = new Set<string>();
  let malformadas = 0;

  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (campo(l, 10, 10) !== "3") continue; // tipos 2, 4, 5, 6, 7, 9 e a assinatura

    const nsr = Number(campo(l, 1, 9));
    if (!Number.isFinite(nsr)) { malformadas++; continue; }

    const quando = ehR671
      ? tsDo671(campo(l, 11, 34))
      : tsDo1510(campo(l, 11, 18), campo(l, 19, 22), offsetMin);
    if (!quando) { malformadas++; continue; }

    const bruto = ehR671 ? campo(l, 35, 46) : campo(l, 23, 34);
    const ident = lerIdentificador(bruto, layout);
    if (!ident) { semId.add(bruto.trim() || "(vazio)"); malformadas++; continue; }

    punches.push({ nsr, ts: quando.ts, date: quando.date, identifier: ident.id, identifierKind: ident.kind, raw: l });
  }

  if (malformadas > 0) {
    warnings.push(`${malformadas} linha(s) de marcação não puderam ser lidas e foram ignoradas.`);
  }
  if (semId.size > 0) {
    warnings.push(`Identificador do trabalhador ilegível em: ${Array.from(semId).slice(0, 5).join(", ")}.`);
  }
  if (punches.length === 0) {
    return { ...vazio, layout, repSerial, employerId, periodFrom, periodTo, fatal: "Nenhuma marcação de ponto (registro tipo 3) no arquivo." };
  }

  // A 1.510 e a 595 não têm campo de fuso. Enquanto o período for posterior ao
  // fim do horário de verão, assumir o offset da pousada é seguro; antes disso,
  // há uma hora que não existiu e outra que aconteceu duas vezes.
  if (!ehR671 && punches.some(p => p.date <= FIM_DO_HORARIO_DE_VERAO)) {
    warnings.push(
      `O arquivo tem marcações anteriores a ${FIM_DO_HORARIO_DE_VERAO} e este leiaute não grava fuso. ` +
      `Nas viradas do horário de verão o instante pode estar deslocado em uma hora.`,
    );
  }

  // NSR fora de ordem ou com buraco: informação, não erro. O AFD é cumulativo e
  // pode legitimamente ter sido exportado por período.
  const nsrs = punches.map(p => p.nsr);
  const menor = Math.min(...nsrs), maior = Math.max(...nsrs);
  const esperados = maior - menor + 1;
  if (esperados > nsrs.length) {
    warnings.push(
      `A sequência de NSR vai de ${menor} a ${maior} mas o arquivo tem ${nsrs.length} marcações — ` +
      `há ${esperados - nsrs.length} número(s) ausente(s). Normal se a exportação foi por período; ` +
      `investigar se era para ser o arquivo completo.`,
    );
  }

  return { layout, repSerial, employerId, periodFrom, periodTo, punches, linesTotal: linhas.length, warnings, fatal: null };
}
