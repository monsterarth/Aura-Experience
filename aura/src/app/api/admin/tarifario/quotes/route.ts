// Tarifário — orçamentos salvos / funil de vendas (CRM leve).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { QuoteConflictError, RateService } from "@/services/rate-service";
import { CrmService } from "@/services/crm-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;
const DELETE_ROLES = ["super_admin", "admin", "manager"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  try {
    // ?id= devolve um orçamento único (reabrir na calculadora).
    const id = url.searchParams.get("id");
    if (id) {
      const quote = await RateService.getQuoteById(propertyId, id);
      if (!quote) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
      return NextResponse.json({ quote });
    }
    // ?guestId=/?phone= → cotações do CLIENTE (aba Orçamentos da ficha do
    // hóspede). Vive no CrmService: rate-service já importa crm-service.
    const guestId = url.searchParams.get("guestId");
    const phone = url.searchParams.get("phone");
    if (guestId || phone) {
      const quotes = await CrmService.listQuotesByClient(propertyId, { guestId, phone });
      return NextResponse.json({ quotes });
    }
    // Sem filtro, este branch devolvia 400 orçamentos INTEIROS (as mesmas
    // colunas pesadas do funil). Nenhuma tela chama assim — todas passam `id=`,
    // `guestId=` ou `phone=`. Em vez de deletar (pode haver script manual ou aba
    // velha aberta), exige o filtro e diz qual.
    return NextResponse.json(
      { error: "Informe um filtro: id, guestId ou phone." },
      { status: 400 },
    );
  } catch (e) {
    console.error("Erro ao listar orçamentos:", e);
    return NextResponse.json({ error: "Falha ao carregar o funil." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.quote) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const saved = await RateService.saveQuote(propertyId, body.quote, auth.staff.id, auth.staff.fullName);
    return NextResponse.json(saved);
  } catch (e) {
    // Conflito não é erro de servidor: a tela editou em cima de uma versão
    // que já não é a do banco. Devolve o orçamento FRESCO junto — o wizard
    // mostra o que mudou e deixa o vendedor escolher.
    if (e instanceof QuoteConflictError) {
      return NextResponse.json({ error: e.message, conflict: true, quote: e.quote }, { status: 409 });
    }
    console.error("Erro ao salvar orçamento:", e);
    const msg = e instanceof Error ? e.message : "Falha ao salvar o orçamento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || !body?.patch) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    await RateService.updateQuote(propertyId, String(body.id), body.patch, {
      id: auth.staff.id, name: auth.staff.fullName,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao atualizar orçamento:", e);
    return NextResponse.json({ error: "Falha ao atualizar o orçamento." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth([...DELETE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    await RateService.deleteQuote(propertyId, id, auth.staff.id, auth.staff.fullName);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao excluir orçamento:", e);
    return NextResponse.json({ error: "Falha ao excluir o orçamento." }, { status: 500 });
  }
}
