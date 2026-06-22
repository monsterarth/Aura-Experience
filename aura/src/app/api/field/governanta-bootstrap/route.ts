import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Bootstrap do app da governanta numa única rota server-side (sessão validada/renovada pelo
// middleware). Antes a página lia cabanas/estruturas/camareiras/frigobar/ocupação direto pelo
// client do browser (RLS): em refreshes seguidos, a contenção de lock/token do Supabase no
// browser pendurava as queries e a tela só destravava pelos timeouts de 6s (~16s no total).
// Lendo via service-role no servidor não há essa dependência de token no browser.
export async function GET(req: Request) {
  // Sem lista de cargos (igual /api/field/cabins e /api/field/housekeeping-tasks): requireAuth
  // só enxerga o cargo PRIMÁRIO, então uma lista tipo ['governance',...] barraria uma camareira
  // com cargo SECUNDÁRIO de governanta (acessa o app via RoleSwitcher) — a página vinha sem
  // cabanas e tudo virava "Local desconhecido". A leitura é escopada à propriedade do staff e a
  // UI já é protegida pelo RoleGuard.
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  const empty = { cabins: [], structures: [], maids: [], frigobar: [], occupancy: {} };
  if (!propertyId) return NextResponse.json(empty);

  const todayStr = new Date().toISOString().split('T')[0];

  const [cabinsRes, structuresRes, staffRes, itemsRes, staysRes] = await Promise.all([
    supabaseAdmin
      .from('cabins')
      .select('id, name, number, category, status, propertyId')
      .eq('propertyId', propertyId)
      .order('number', { ascending: true }),
    supabaseAdmin
      .from('structures')
      .select('*')
      .eq('propertyId', propertyId),
    supabaseAdmin
      .from('staff')
      .select('id, fullName, role, secondaryRoles, active, propertyId')
      .eq('propertyId', propertyId),
    supabaseAdmin
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .eq('deleted', false)
      .order('order', { ascending: true }),
    supabaseAdmin
      .from('stays')
      .select('id, cabinId, checkIn, checkOut, status, expectedArrivalTime, guestId, internalUse, internalLabel')
      .eq('propertyId', propertyId)
      .in('status', ['active', 'pending', 'pre_checkin_done'])
      .not('cabinId', 'is', null)
      .gte('checkOut', todayStr),
  ]);

  const cabins = cabinsRes.data ?? [];
  const structures = structuresRes.data ?? [];

  // Camareiras ativas (role primário maid ou secundário) — mesmo filtro que a página usava.
  const maids = (staffRes.data ?? []).filter(
    (s: any) => s.active && (s.role === 'maid' || (s.secondaryRoles ?? []).includes('maid'))
  );

  // Frigobar = itens do catálogo no grupo "Frigobar" (não depende de availableForMaid: a
  // conferência de checkout precisa de todos os produtos do frigobar para lançar consumo).
  const frigobar = (itemsRes.data ?? []).filter(
    (i: any) => (i.group?.name || '').trim().toLowerCase() === 'frigobar'
  );

  // Ocupação por cabana (para os badges dos cards).
  const stays = staysRes.data ?? [];
  const guestIds = Array.from(new Set(stays.map((s: any) => s.guestId).filter(Boolean)));
  const guestMap: Record<string, string> = {};
  if (guestIds.length > 0) {
    const { data: guests } = await supabaseAdmin
      .from('guests')
      .select('id, fullName')
      .in('id', guestIds as string[]);
    (guests ?? []).forEach((g: any) => { guestMap[g.id] = g.fullName; });
  }
  const occupancy: Record<string, any> = {};
  stays.forEach((stay: any) => {
    if (!stay.cabinId) return;
    occupancy[stay.cabinId] = {
      guestName: stay.internalUse ? (stay.internalLabel?.trim() || 'Uso da Casa') : (guestMap[stay.guestId] ?? ''),
      internalUse: !!stay.internalUse,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      expectedArrivalTime: stay.expectedArrivalTime ?? null,
    };
  });

  return NextResponse.json({ cabins, structures, maids, frigobar, occupancy });
}
