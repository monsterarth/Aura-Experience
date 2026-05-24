// src/services/changelog-service.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { Changelog, ChangelogEntry, ChangelogStatus, ChangelogEntryType } from '@/types/aura';

/* ── helpers ───────────────────────────────────────────────────── */

function sortEntries(c: Changelog): Changelog {
  if (c.entries) c.entries = [...c.entries].sort((a, b) => a.sortOrder - b.sortOrder);
  return c;
}

/* ── public reads (server components / public pages) ──────────── */

/** All published changelogs, newest-first, with entries sorted. */
export async function getPublishedChangelogs(): Promise<Changelog[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('changelogs')
    .select('*, entries:changelog_entries(*)')
    .eq('status', 'published')
    .order('date', { ascending: false });
  if (error) { console.error('[changelog] getPublished:', error.message); return []; }
  return (data ?? []).map(sortEntries);
}

/** Latest N published entries (flattened) — for the landing strip. */
export async function getLatestChangelogEntries(limit = 16): Promise<
  (ChangelogEntry & { version: string })[]
> {
  const releases = await getPublishedChangelogs();
  return releases
    .flatMap(r => (r.entries ?? []).map(e => ({ ...e, version: r.version })))
    .slice(0, limit);
}

/* ── admin reads ───────────────────────────────────────────────── */

/** All changelogs (any status) for the admin panel. */
export async function getAllChangelogs(): Promise<Changelog[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('changelogs')
    .select('*, entries:changelog_entries(*)')
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(sortEntries);
}

/* ── mutations ─────────────────────────────────────────────────── */

export async function createChangelog(payload: {
  version:   string;
  label:     string;
  date:      string;
  status?:   ChangelogStatus;
  highlight?: string | null;
}): Promise<Changelog> {
  if (!supabaseAdmin) throw new Error('Admin client unavailable');
  const { data, error } = await supabaseAdmin
    .from('changelogs')
    .insert({ ...payload, updatedAt: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateChangelog(
  id: string,
  patch: Partial<Pick<Changelog, 'version' | 'label' | 'date' | 'status' | 'highlight'>>,
): Promise<Changelog> {
  if (!supabaseAdmin) throw new Error('Admin client unavailable');
  const { data, error } = await supabaseAdmin
    .from('changelogs')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteChangelog(id: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client unavailable');
  const { error } = await supabaseAdmin.from('changelogs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addChangelogEntry(payload: {
  changelogId: string;
  type:        ChangelogEntryType;
  text:        string;
  sortOrder?:  number;
}): Promise<ChangelogEntry> {
  if (!supabaseAdmin) throw new Error('Admin client unavailable');
  const { data, error } = await supabaseAdmin
    .from('changelog_entries')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteChangelogEntry(entryId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client unavailable');
  const { error } = await supabaseAdmin
    .from('changelog_entries')
    .delete()
    .eq('id', entryId);
  if (error) throw new Error(error.message);
}
