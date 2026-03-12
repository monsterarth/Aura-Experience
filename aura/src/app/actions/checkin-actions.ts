'use server';

import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { StayService } from '@/services/stay-service';

const RATE_LIMIT_MAX = 10;        // max failed attempts
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FAILURE_DELAY_MS = 1500;    // artificial delay on wrong code

export async function validateAccessCode(code: string) {
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headersList.get('x-real-ip')
    || 'unknown';

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  // Check rate limit for this IP
  const { count } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', windowStart);

  if ((count || 0) >= RATE_LIMIT_MAX) {
    throw new Error('RATE_LIMITED');
  }

  // Attempt login
  const stays = await StayService.getStaysByAccessCode(code.toUpperCase().trim());

  if (!stays || stays.length === 0) {
    // Log failed attempt
    await supabaseAdmin.from('login_attempts').insert({
      ip,
      attempted_at: new Date().toISOString(),
      success: false,
    });

    // Artificial delay — makes brute force take years even at high req/s
    await new Promise(r => setTimeout(r, FAILURE_DELAY_MS));

    throw new Error('INVALID_CODE');
  }

  // Log successful attempt
  await supabaseAdmin.from('login_attempts').insert({
    ip,
    attempted_at: new Date().toISOString(),
    success: true,
  });

  return stays;
}
