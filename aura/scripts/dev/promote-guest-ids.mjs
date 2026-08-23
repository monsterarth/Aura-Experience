// Migração única: promove fichas de id provisório (GUEST…) para o documento que elas já têm.
//
// Contexto: `guests.id` É o documento normalizado. Quando a recepção abre a reserva sem CPF,
// a ficha nasce com `GUEST-<timestamp>`; até o conserto em GuestService.promoteGuestId(),
// o documento que chegava depois era gravado na coluna `document` sem nunca re-chavear a ficha.
// Este script acerta o passivo; o código novo impede que volte a acontecer.
//
// Não existe FK apontando para `guests` — as referências são repontuadas na mão, tabela a tabela.
//
//   node scripts/dev/promote-guest-ids.mjs            → dry-run (não escreve nada)
//   node scripts/dev/promote-guest-ids.mjs --apply    → aplica, depois de salvar o backup
//
// O backup (JSON com todas as linhas tocadas, antes da escrita) vai para .backups/.
import fs from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; })
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local');
  process.exit(1);
}

// Mesmas tabelas de GuestService.GUEST_REF_TABLES.
const REF_TABLES = ['stays', 'contacts', 'structure_bookings', 'structure_reviews', 'survey_responses', 'rate_quotes'];

// Mesmas regras de src/lib/guest-doc.ts — mantidas em sincronia à mão (script não importa TS).
const normalizeDocument = raw => (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hasValidDocument = doc => normalizeDocument(doc?.number).length > 3;

// Mesma regra de GuestService._mergeBlankFields.
const isBlank = v => {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
};
const KEEP = new Set(['id', 'propertyId', 'document', 'createdAt', 'updatedAt']);
const mergeBlankFields = (primary, secondary) => {
  const patch = {};
  for (const [k, v] of Object.entries(secondary)) {
    if (KEEP.has(k)) continue;
    if (!isBlank(v) && isBlank(primary[k])) patch[k] = v;
  }
  return patch;
};

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, pathname, body, prefer) {
  const res = await fetch(`${BASE}/rest/v1/${pathname}`, {
    method,
    headers: prefer ? { ...H, Prefer: prefer } : H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
const get = p => rest('GET', p);
const eq = v => encodeURIComponent(v);

// ── 1. Levantamento ──────────────────────────────────────────────────────────
const temps = (await get('guests?select=*&id=like.GUEST*&limit=1000')).filter(g => hasValidDocument(g.document));
console.log(`fichas provisórias com documento: ${temps.length}`);

const groups = new Map(); // documento → { newId, propertyId, temps: [] }
for (const g of temps) {
  const newId = normalizeDocument(g.document.number);
  if (!newId || newId === g.id) continue;
  if (!groups.has(newId)) groups.set(newId, { newId, propertyId: g.propertyId, temps: [] });
  groups.get(newId).temps.push(g);
}

const backup = { generatedAt: new Date().toISOString(), guests: [], refs: {} };
const plan = [];

for (const grp of groups.values()) {
  const [existing] = await get(`guests?select=*&id=eq.${eq(grp.newId)}`);
  if (existing && existing.propertyId !== grp.propertyId) {
    plan.push({ ...grp, refs: {}, skip: `documento ${grp.newId} já pertence a outra propriedade` });
    continue;
  }
  // Ordem determinística: a mais recente é a semente quando não existe ficha definitiva.
  grp.temps.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));

  const refs = {};
  for (const t of grp.temps) {
    refs[t.id] = {};
    for (const table of REF_TABLES) {
      const rows = await get(`${table}?select=id&guestId=eq.${eq(t.id)}`);
      if (rows.length) {
        refs[t.id][table] = rows.length;
        backup.refs[table] = (backup.refs[table] ?? []).concat(rows.map(r => ({ id: r.id, guestId: t.id })));
      }
    }
    backup.guests.push(t);
  }
  if (existing) backup.guests.push(existing);
  plan.push({ ...grp, existing: existing ?? null, refs });
}

// ── 2. Relatório ─────────────────────────────────────────────────────────────
const fmtRefs = r => Object.entries(r).map(([t, n]) => `${n} ${t}`).join(', ') || 'sem referências';
const simples = plan.filter(p => !p.skip && !p.existing && p.temps.length === 1);
const merges = plan.filter(p => !p.skip && (p.existing || p.temps.length > 1));
const skipped = plan.filter(p => p.skip);

console.log(`\n── promoções simples: ${simples.length} ──`);
for (const p of simples) {
  console.log(`  ${p.temps[0].id} → ${p.newId}  ${p.temps[0].fullName}  (${fmtRefs(p.refs[p.temps[0].id])})`);
}

console.log(`\n── unificações: ${merges.length} ──`);
for (const p of merges) {
  console.log(`  destino ${p.newId} ${p.existing ? `(ficha existente: ${p.existing.fullName})` : '(ficha nova; semente = provisória mais recente)'}`);
  for (const t of p.temps) console.log(`     <- ${t.id}  ${t.fullName}  (${fmtRefs(p.refs[t.id])})`);
}

if (skipped.length) {
  console.log(`\n── ignoradas: ${skipped.length} ──`);
  for (const p of skipped) console.log(`  ${p.newId}: ${p.skip}`);
}

const totalRefs = {};
for (const p of plan) {
  for (const per of Object.values(p.refs ?? {})) {
    for (const [t, n] of Object.entries(per)) totalRefs[t] = (totalRefs[t] ?? 0) + n;
  }
}
console.log(`\nreferências a repontuar: ${fmtRefs(totalRefs)}`);
console.log(`fichas provisórias a apagar: ${plan.filter(p => !p.skip).reduce((a, p) => a + p.temps.length, 0)}`);

if (!APPLY) {
  console.log('\nDRY-RUN — nada foi escrito. Rode com --apply para aplicar.');
  process.exit(0);
}

// ── 3. Aplicação ─────────────────────────────────────────────────────────────
const dir = '.backups';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `promote-guest-ids-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(backup, null, 1));
console.log(`\nbackup salvo em ${file} (${backup.guests.length} fichas + referências)`);

let okGroups = 0;
const failures = [];

for (const p of plan) {
  if (p.skip) continue;
  try {
    let target = p.existing;

    // Sem ficha definitiva: a provisória mais recente vira a semente da nova linha.
    if (!target) {
      const seed = p.temps[0];
      await rest('POST', 'guests', { ...seed, id: p.newId, updatedAt: new Date().toISOString() }, 'return=minimal');
      target = { ...seed, id: p.newId };
    }

    for (const t of p.temps) {
      const patch = mergeBlankFields(target, t);
      if (Object.keys(patch).length > 0) {
        await rest('PATCH', `guests?id=eq.${eq(p.newId)}`, { ...patch, updatedAt: new Date().toISOString() }, 'return=minimal');
        Object.assign(target, patch);
      }
      // Repontua ANTES de apagar: falha aqui deixa duplicata, nunca linha órfã.
      for (const table of REF_TABLES) {
        if (!p.refs[t.id]?.[table]) continue;
        await rest('PATCH', `${table}?guestId=eq.${eq(t.id)}`, { guestId: p.newId }, 'return=minimal');
      }
      await rest('DELETE', `guests?id=eq.${eq(t.id)}`, undefined, 'return=minimal');
      console.log(`  ok ${t.id} → ${p.newId}`);
    }
    okGroups++;
  } catch (e) {
    failures.push({ newId: p.newId, error: String(e?.message ?? e) });
    console.error(`  FALHOU ${p.newId}: ${e?.message ?? e}`);
  }
}

console.log(`\ngrupos concluídos: ${okGroups}/${plan.filter(p => !p.skip).length}`);
if (failures.length) {
  console.error('falhas:', JSON.stringify(failures, null, 1));
  process.exit(1);
}
