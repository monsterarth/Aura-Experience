import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const today      = todayStart.toISOString().split('T')[0];

  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd      = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthStartStr = monthStart.toISOString().split('T')[0];
  const monthEndStr   = monthEnd.toISOString().split('T')[0];

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const in30dStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Semana Seg–Dom da semana corrente
  const dow = todayStart.getDay();
  const weekMonday = new Date(todayStart); weekMonday.setDate(todayStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekSunday = new Date(weekMonday); weekSunday.setDate(weekMonday.getDate() + 6); weekSunday.setHours(23, 59, 59, 999);
  const weekMondayStr = weekMonday.toISOString().split('T')[0];
  const weekSundayStr = weekSunday.toISOString().split('T')[0];

  try {
    const [
      occupiedRes,
      totalCabinsRes,
      checkinsDoneRes,
      checkinsTotalRes,
      checkoutsDoneRes,
      checkoutsTotalRes,
      guestsRes,
      surveyRes,
      negativeNpsRes,
      urgentMaintenanceRes,
      hkTasksRes,
      conciergeRes,
      fbOrdersRes,
      nextWeddingRes,
      upcomingWeddingsRes,
      upcomingEventsRes,
      weekStaysRes,
      monthStaysRes,
      monthWeddingsRes,
      monthMaintenanceRes,
      monthComplaintsRes,
      recentSurveysRes,
    ] = await Promise.all([
      // Cabanas ocupadas agora
      supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId).eq('status', 'active'),
      // Total cabanas
      supabaseAdmin.from('cabins').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId),
      // Check-ins feitos hoje
      supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
        .eq('status', 'active'),
      // Check-ins esperados hoje
      supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
        .in('status', ['pending', 'pre_checkin_done', 'active']),
      // Check-outs feitos hoje
      supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('checkOut', todayStart.toISOString()).lte('checkOut', todayEnd.toISOString())
        .in('status', ['checked_out', 'finished', 'archived']),
      // Check-outs esperados hoje
      supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('checkOut', todayStart.toISOString()).lte('checkOut', todayEnd.toISOString())
        .in('status', ['active', 'checked_out', 'finished', 'archived']),
      // Hóspedes ativos (para somar pessoas)
      supabaseAdmin.from('stays').select('counts')
        .eq('propertyId', propertyId).eq('status', 'active'),
      // NPS últimos 30 dias — metrics é JSONB
      supabaseAdmin.from('survey_responses').select('metrics')
        .eq('propertyId', propertyId).gte('createdAt', since30d),
      // Avaliações negativas últimas 48h (detractors)
      supabaseAdmin.from('survey_responses').select('metrics, createdAt')
        .eq('propertyId', propertyId).gte('createdAt', since48h),
      // Manutenção urgente aberta
      supabaseAdmin.from('maintenance_tasks').select('id, title, createdAt')
        .eq('propertyId', propertyId).eq('priority', 'urgent')
        .in('status', ['pending', 'in_progress']),
      // Tarefas de HK ativas
      supabaseAdmin.from('housekeeping_tasks').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId).in('status', ['pending', 'in_progress', 'waiting_conference']),
      // Concierge pendente
      supabaseAdmin.from('concierge_requests').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId).eq('status', 'pending'),
      // F&B hoje
      supabaseAdmin.from('fb_orders').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('createdAt', todayStart.toISOString()).lte('createdAt', todayEnd.toISOString()),
      // Próximo casamento — colunas corretas
      supabaseAdmin.from('weddings')
        .select('id, bride, groom, weddingDate, exclusivity, guestCount, coordinator, ceremonyDetails, receptionDetails, checkin, checkout, cabinsOccupied, notes, status')
        .eq('propertyId', propertyId).gt('weddingDate', today)
        .order('weddingDate', { ascending: true }).limit(1),
      // Casamentos próximos 30 dias
      supabaseAdmin.from('weddings')
        .select('id, bride, groom, weddingDate, exclusivity, guestCount, coordinator, ceremonyDetails, receptionDetails, checkin, checkout, cabinsOccupied, notes, status')
        .eq('propertyId', propertyId)
        .gte('weddingDate', today).lte('weddingDate', in30dStr)
        .order('weddingDate', { ascending: true }),
      // Eventos publicados próximos 30 dias
      supabaseAdmin.from('events')
        .select('id, title, startDate, endDate, startTime, endTime, location, category, type, imageUrl, description, price, priceDescription, featured')
        .eq('propertyId', propertyId)
        .eq('status', 'published')
        .gte('startDate', today).lte('startDate', in30dStr)
        .order('startDate', { ascending: true }),
      // Stays da semana (Seg–Dom)
      supabaseAdmin.from('stays').select('checkIn, checkOut')
        .eq('propertyId', propertyId)
        .lte('checkIn', weekSundayStr)
        .gte('checkOut', weekMondayStr)
        .in('status', ['pending', 'pre_checkin_done', 'active', 'checked_out', 'finished', 'archived']),
      // Stays do mês
      supabaseAdmin.from('stays').select('checkIn, checkOut')
        .eq('propertyId', propertyId)
        .lte('checkIn', monthEndStr)
        .gte('checkOut', monthStartStr),
      // Casamentos do mês
      supabaseAdmin.from('weddings').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .gte('weddingDate', monthStartStr).lte('weddingDate', monthEndStr),
      // Ordens de manutenção abertas no mês
      supabaseAdmin.from('maintenance_tasks').select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId).gte('createdAt', monthStart.toISOString()),
      // Reclamações no mês (isDetractor = true no metrics)
      supabaseAdmin.from('survey_responses').select('metrics')
        .eq('propertyId', propertyId).gte('createdAt', monthStart.toISOString()),
      // Avaliações individuais últimos 30 dias
      supabaseAdmin.from('survey_responses')
        .select('id, metrics, createdAt, stayId')
        .eq('propertyId', propertyId).gte('createdAt', since30d)
        .order('createdAt', { ascending: false }).limit(30),
    ]);

    // ── Ocupação ──────────────────────────────────────────────────────────────
    const occupiedCabins = occupiedRes.count ?? 0;
    const totalCabins    = totalCabinsRes.count ?? 0;
    const guestsOnProperty = (guestsRes.data ?? []).reduce((s, r) => {
      const c = r.counts as { adults?: number; children?: number; babies?: number } | null;
      return s + (c?.adults ?? 0) + (c?.children ?? 0) + (c?.babies ?? 0);
    }, 0);

    // ── NPS ───────────────────────────────────────────────────────────────────
    type Metrics = { npsScore?: number; averageRating?: number; isDetractor?: boolean };
    const surveyData = (surveyRes.data ?? [])
      .map(r => r.metrics as Metrics)
      .filter(m => m?.npsScore != null);

    let npsScore: number | null = null;
    let promoters = 0, passives = 0, detractors = 0;
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (surveyData.length > 0) {
      const sum = surveyData.reduce((s, m) => s + (m.npsScore ?? 0), 0);
      npsScore = Math.round((sum / surveyData.length) * 10) / 10;
      surveyData.forEach(m => {
        const n = m.npsScore ?? 0;
        if (n >= 9) promoters++;
        else if (n >= 7) passives++;
        else detractors++;
        const star = Math.round(m.averageRating ?? 0);
        if (star >= 1 && star <= 5) ratingDist[star] = (ratingDist[star] ?? 0) + 1;
      });
      const total = surveyData.length;
      promoters   = Math.round((promoters  / total) * 100);
      passives    = Math.round((passives   / total) * 100);
      detractors  = 100 - promoters - passives;
    }

    // ── Alertas ───────────────────────────────────────────────────────────────
    const alerts: { type: string; title: string; desc: string; createdAt: string }[] = [];
    (negativeNpsRes.data ?? [])
      .filter(r => (r.metrics as Metrics)?.isDetractor)
      .slice(0, 3)
      .forEach(r => {
        const m = r.metrics as Metrics;
        alerts.push({ type: 'detractor', title: 'Avaliação negativa', desc: `NPS ${m.npsScore} registrado`, createdAt: r.createdAt });
      });
    (urgentMaintenanceRes.data ?? []).slice(0, 3).forEach(r => {
      alerts.push({ type: 'maintenance_urgent', title: 'Manutenção urgente', desc: r.title ?? '', createdAt: r.createdAt });
    });
    alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ── Casamentos ────────────────────────────────────────────────────────────
    const weddingShape = (w: any) => ({
        id: w.id,
        coupleName: `${w.bride} & ${w.groom}`,
        bride: w.bride, groom: w.groom,
        date: w.weddingDate,
        exclusive: !!w.exclusivity,
        guestCount: w.guestCount ?? 0,
        coordinator: w.coordinator ?? null,
        ceremonyDetails: w.ceremonyDetails ?? null,
        receptionDetails: w.receptionDetails ?? null,
        checkin: w.checkin ?? null,
        checkout: w.checkout ?? null,
        cabinsOccupied: w.cabinsOccupied ?? null,
        notes: w.notes ?? null,
        status: w.status ?? null,
        daysUntil: Math.ceil((new Date(w.weddingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    });
    const nw = (nextWeddingRes.data ?? [])[0] ?? null;
    const nextWedding = nw ? weddingShape(nw as any) : null;
    const upcomingWeddings = (upcomingWeddingsRes.data ?? []).map(w => weddingShape(w as any));

    // ── Semana ────────────────────────────────────────────────────────────────
    const weekStays = weekStaysRes.data ?? [];
    const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekOccupancy = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekMonday); d.setDate(weekMonday.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      const occupied = weekStays.filter(s => {
        const ci = (s.checkIn as string).slice(0, 10);
        const co = (s.checkOut as string).slice(0, 10);
        return ci <= dStr && co >= dStr;
      }).length;
      const checkinsExpected = weekStays.filter(s => (s.checkIn as string).slice(0, 10) === dStr).length;
      const pct = totalCabins > 0 ? Math.round((occupied / totalCabins) * 100) : 0;
      return { date: dStr, dayLabel: DAY_SHORT[d.getDay()], occupied, total: totalCabins, pct, checkinsExpected };
    });

    // ── Mês ───────────────────────────────────────────────────────────────────
    const monthStays = monthStaysRes.data ?? [];
    const daysElapsed   = Math.min(now.getDate(), monthEnd.getDate());
    const possibleNights = totalCabins * daysElapsed;
    const nightsSold = monthStays.reduce((s, st) => {
      const ci = new Date((st.checkIn as string).slice(0, 10));
      const co = new Date((st.checkOut as string).slice(0, 10));
      return s + Math.ceil((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    const occupancyPct = possibleNights > 0 ? Math.round((nightsSold / possibleNights) * 100) : 0;

    const monthComplaints = (monthComplaintsRes.data ?? [])
      .filter(r => (r.metrics as Metrics)?.isDetractor).length;

    return NextResponse.json({
      stats: {
        occupiedCabins, totalCabins,
        checkinsDone:  checkinsDoneRes.count  ?? 0,
        checkinsTotal: checkinsTotalRes.count ?? 0,
        checkoutsDone:  checkoutsDoneRes.count  ?? 0,
        checkoutsTotal: checkoutsTotalRes.count ?? 0,
        guestsOnProperty,
      },
      nps: {
        score: npsScore, promoters, passives, detractors,
        distribution: [5, 4, 3, 2, 1].map(stars => ({ stars, count: ratingDist[stars] ?? 0 })),
      },
      alerts: alerts.slice(0, 5),
      ops: {
        hkActiveTasks:    hkTasksRes.count   ?? 0,
        conciergeePending: conciergeRes.count ?? 0,
        fbOrdersToday:    fbOrdersRes.count   ?? 0,
        staffOnDuty: 0,
      },
      nextWedding,
      upcomingEvents: (upcomingEventsRes.data ?? []).map(e => ({
        id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate ?? null,
        startTime: e.startTime ?? null, endTime: e.endTime ?? null,
        location: e.location ?? null, category: e.category, type: e.type,
        imageUrl: e.imageUrl ?? null, description: e.description ?? null,
        price: e.price ?? null, priceDescription: e.priceDescription ?? null,
        featured: !!e.featured,
        daysUntil: Math.ceil((new Date(e.startDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      weekOccupancy,
      monthStats: {
        occupancyPct,
        uniqueGuests:      monthStays.length,
        nightsSold,
        weddingsCount:     monthWeddingsRes.count     ?? 0,
        maintenanceOrders: monthMaintenanceRes.count  ?? 0,
        complaints:        monthComplaints,
      },
      upcomingWeddings,
      recentSurveys: await (async () => {
        const surveys = recentSurveysRes.data ?? [];
        if (surveys.length === 0) return [];
        // Busca nomes via stays
        const stayIds = Array.from(new Set(surveys.map((r: any) => r.stayId).filter(Boolean)));
        const { data: staysData } = await supabaseAdmin
          .from('stays').select('id, guestName')
          .in('id', stayIds);
        const nameMap: Record<string, string> = {};
        (staysData ?? []).forEach((s: any) => { if (s.id) nameMap[s.id] = s.guestName ?? "Hóspede"; });
        return surveys.map((r: any) => ({
          id: r.id,
          guestName: nameMap[r.stayId] ?? "Hóspede",
          npsScore: (r.metrics as any)?.npsScore ?? null,
          averageRating: (r.metrics as any)?.averageRating ?? null,
          categoryRatings: (r.metrics as any)?.categoryRatings ?? {},
          isDetractor: !!(r.metrics as any)?.isDetractor,
          createdAt: r.createdAt,
        }));
      })(),
    });
  } catch (err) {
    console.error('[director/dashboard]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
