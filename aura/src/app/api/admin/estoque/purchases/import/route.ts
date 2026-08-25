// src/app/api/admin/estoque/purchases/import/route.ts
// Importar a compra pelo XML da NF-e. Duas caras na mesma rota:
//
//   multipart/form-data → arquivos (.xml soltos ou o .zip do contador).
//                         Devolve UM preview por nota, sem gravar nada.
//   application/json    → { action: 'commit', ... } grava de verdade.
//
// O commit reenvia o XML e o servidor relê: quantidade, custo e total saem da
// nota, não do navegador. Do cliente vêm só as decisões (produto, fator, ignorar).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { NfeImportService } from '@/services/nfe-import-service';
import { NfeParseError } from '@/lib/nfe';
import { unzipSync, strFromU8 } from 'fflate';
import type { InvoiceImportPreview } from '@/types/aura';

const ROLES = ['super_admin', 'admin', 'manager', 'compras'] as const;
const MAX_UPLOAD = 8 * 1024 * 1024;   // 8MB — um ZIP de um mês inteiro cabe folgado
const MAX_INVOICES = 60;              // teto por lote, para não estourar a resposta

type PreviewOk = { fileName: string; preview: InvoiceImportPreview };
type PreviewFail = { fileName: string; error: string };

/** Um arquivo enviado vira 1 XML (nota solta) ou N (ZIP do contador). */
function expand(fileName: string, bytes: Uint8Array): { name: string; xml: string }[] {
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;   // "PK"
  if (!isZip) return [{ name: fileName, xml: strFromU8(bytes) }];

  const entries = unzipSync(bytes, { filter: (f) => /\.xml$/i.test(f.name) && f.originalSize > 0 });
  return Object.entries(entries).map(([name, data]) => ({ name: name.split('/').pop() || name, xml: strFromU8(data) }));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  const actor = { id: auth.staff.id, name: auth.staff.fullName };
  const contentType = request.headers.get('content-type') ?? '';

  // ── Upload: lê os arquivos e devolve os previews ───────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const propertyId = scopedPropertyId(auth, String(form.get('propertyId') ?? ''));
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD) {
      return NextResponse.json({ error: 'Envio acima de 8MB. Mande o lote em partes menores.' }, { status: 413 });
    }

    const found: { name: string; xml: string }[] = [];
    const failures: PreviewFail[] = [];

    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        found.push(...expand(file.name, bytes));
      } catch {
        failures.push({ fileName: file.name, error: 'Não consegui abrir o arquivo (ZIP corrompido ou protegido por senha?).' });
      }
    }

    if (found.length === 0 && failures.length === 0) {
      return NextResponse.json({ error: 'O arquivo não tem nenhum XML dentro.' }, { status: 400 });
    }

    const truncated = Math.max(0, found.length - MAX_INVOICES);
    const previews: PreviewOk[] = [];
    for (const f of found.slice(0, MAX_INVOICES)) {
      try {
        previews.push({ fileName: f.name, preview: await NfeImportService.preview(propertyId, f.xml, f.name) });
      } catch (e) {
        failures.push({ fileName: f.name, error: e instanceof NfeParseError ? e.message : (e as Error).message });
      }
    }

    return NextResponse.json({ previews, failures, truncated });
  }

  // ── Commit: grava a compra ─────────────────────────────────────────────────
  const body = await request.json();
  const propertyId = scopedPropertyId(auth, body?.propertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  if (body?.action === 'preview') {
    try {
      return NextResponse.json(await NfeImportService.preview(propertyId, String(body.xml ?? ''), body.fileName));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  if (!body?.xml || !Array.isArray(body?.lines)) {
    return NextResponse.json({ error: 'xml e lines são obrigatórios.' }, { status: 400 });
  }

  try {
    const result = await NfeImportService.commit({ ...body, propertyId }, actor);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
