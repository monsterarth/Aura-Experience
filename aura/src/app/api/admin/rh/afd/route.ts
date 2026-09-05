// src/app/api/admin/rh/afd/route.ts
//
// Import do AFD: recebe o arquivo do relógio, devolve o que entrou.
//
// GET    → histórico de imports da propriedade.
// POST   → sobe um arquivo. `conferir=1` só simula e devolve o resumo.
// DELETE → desfaz um import inteiro (`?id=`).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, scopedPropertyId, requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { AfdImportService } from "@/services/afd-import-service";
import type { UserRole } from "@/types/aura";

export const dynamic = "force-dynamic";

/** Importar ponto mexe na base de horas de gente. Fica com quem fecha a folha. */
const ROLES: UserRole[] = ["super_admin", "admin", "manager"];

/** 8 MB. Um AFD de um ano da Fazenda tem alguns milhares de linhas de 34 a 50
 *  caracteres — não passa de centenas de KB. O teto é para o arquivo errado
 *  (um dump, um zip renomeado) parar aqui e não no parser. */
const MAX_BYTES = 8 * 1024 * 1024;

const pontoOff = (propertyId: string) => requireModule(propertyId, "ponto");

export async function GET(request: NextRequest) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

  const off = await pontoOff(propertyId);
  if (off) return off;

  try {
    return NextResponse.json(await AfdImportService.listar(propertyId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o histórico." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const conferir = searchParams.get("conferir") === "1";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envie o arquivo como multipart/form-data." }, { status: 400 });
  }

  const propertyId = scopedPropertyId(auth, String(form.get("propertyId") ?? "") || null);
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

  const off = await pontoOff(propertyId);
  if (off) return off;

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Arquivo grande demais (${Math.round(file.size / 1024)} KB). Um AFD não passa de algumas centenas de KB.` }, { status: 400 });
  }

  try {
    // `arrayBuffer` e não `text()`: o AFD é ISO-8859-1 e posicional. Deixar o
    // runtime decidir o encoding é o que transforma um acento na razão social em
    // todos os campos seguintes deslocados — e o sintoma não é acento estranho,
    // é data errada.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await AfdImportService.importar(
      propertyId,
      { name: file.name, bytes },
      { id: auth.staff.id, name: auth.staff.fullName ?? "—" },
      { dryRun: conferir },
    );
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao importar o AFD." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));
  const id = searchParams.get("id");
  if (!propertyId || !id) return NextResponse.json({ error: "propertyId e id são obrigatórios." }, { status: 400 });

  const off = await pontoOff(propertyId);
  if (off) return off;

  try {
    const apagadas = await AfdImportService.desfazer(id, propertyId);
    return NextResponse.json({ apagadas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao desfazer." }, { status: 500 });
  }
}
