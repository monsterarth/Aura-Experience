"use server";
// src/app/actions/chatwoot-actions.ts
// Server actions para integração com o Chatwoot.
// Rodam sempre no servidor — env vars privadas disponíveis.

import { supabaseAdmin } from "@/lib/supabase";
import { Stay, Guest, Cabin, Property } from "@/types/aura";
import { ChatwootService } from "@/services/chatwoot-service";

async function fetchProperty(propertyId: string): Promise<Property | undefined> {
  const { data } = await supabaseAdmin.from("properties").select("*").eq("id", propertyId).maybeSingle();
  return data as Property | undefined;
}

/** Gatilho 1 — Upsert do contato após criação de estadia. */
export async function chatwootSyncOnStayCreated(propertyId: string, guestId: string) {
  const [{ data: guest }, { data: stay }, property] = await Promise.all([
    supabaseAdmin.from("guests").select("*").eq("id", guestId).eq("propertyId", propertyId).maybeSingle(),
    supabaseAdmin.from("stays").select("*").eq("guestId", guestId).eq("propertyId", propertyId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
    fetchProperty(propertyId),
  ]);
  if (!guest || !stay) return;
  await ChatwootService.syncOnStayCreated(stay as Stay, guest as Guest, property).catch(e =>
    console.error("[Chatwoot] syncOnStayCreated error:", e)
  );
}

/** Gatilho 3 — Atualiza atributo de cabana na conversa após transferência. */
export async function chatwootSyncOnCabinTransfer(stayId: string, newCabinId: string) {
  const [{ data: stay }, { data: cabin }] = await Promise.all([
    supabaseAdmin.from("stays").select("*").eq("id", stayId).maybeSingle(),
    supabaseAdmin.from("cabins").select("*").eq("id", newCabinId).maybeSingle(),
  ]);
  if (!stay || !cabin) return;
  const property = await fetchProperty(stay.propertyId);
  await ChatwootService.syncOnCabinTransfer(stay as Stay, cabin as Cabin, property).catch(e =>
    console.error("[Chatwoot] syncOnCabinTransfer error:", e)
  );
}

/** Gatilho 4 — Atualiza Contact ACF após conclusão do pré check-in. */
export async function chatwootSyncOnPreCheckinComplete(stayId: string) {
  const { data: stay } = await supabaseAdmin.from("stays").select("*").eq("id", stayId).maybeSingle();
  if (!stay) return;
  const [{ data: guest }, property] = await Promise.all([
    supabaseAdmin.from("guests").select("*").eq("id", stay.guestId).maybeSingle(),
    fetchProperty(stay.propertyId),
  ]);
  if (!guest) return;
  await ChatwootService.syncOnPreCheckinComplete(guest as Guest, stay as Stay, property).catch(e =>
    console.error("[Chatwoot] syncOnPreCheckinComplete error:", e)
  );
}

/** Gatilho 5 — Remove "tem_reserva" do contato se não houver outras reservas pendentes. */
export async function chatwootSyncOnCancelled(stayId: string) {
  const { data: stay } = await supabaseAdmin.from("stays").select("*").eq("id", stayId).maybeSingle();
  if (!stay) return;
  const [{ data: guest }, property, { data: others }] = await Promise.all([
    supabaseAdmin.from("guests").select("*").eq("id", stay.guestId).maybeSingle(),
    fetchProperty(stay.propertyId),
    supabaseAdmin.from("stays").select("id").eq("guestId", stay.guestId).in("status", ["pending", "pre_checkin_done"]).neq("id", stayId).limit(1),
  ]);
  if (!guest) return;
  const hasOtherPending = !!(others && others.length > 0);

  await ChatwootService.syncOnCancelled(stay as Stay, guest as Guest, hasOtherPending, property).catch(e =>
    console.error("[Chatwoot] syncOnCancelled error:", e)
  );
}

/** Gatilho 6 — Etiqueta "hospede" no contato após check-in. */
export async function chatwootSyncOnCheckIn(stayId: string) {
  const { data: stay } = await supabaseAdmin.from("stays").select("*").eq("id", stayId).maybeSingle();
  if (!stay) return;
  const [{ data: guest }, property] = await Promise.all([
    supabaseAdmin.from("guests").select("*").eq("id", stay.guestId).maybeSingle(),
    fetchProperty(stay.propertyId),
  ]);
  if (!guest) return;
  await ChatwootService.syncOnCheckIn(stay as Stay, guest as Guest, property).catch(e =>
    console.error("[Chatwoot] syncOnCheckIn error:", e)
  );
}

/** Gatilho 7 — Remove etiqueta "hospede" do contato após check-out. */
export async function chatwootSyncOnCheckOut(stayId: string) {
  const { data: stay } = await supabaseAdmin.from("stays").select("*").eq("id", stayId).maybeSingle();
  if (!stay) return;
  const [{ data: guest }, property] = await Promise.all([
    supabaseAdmin.from("guests").select("*").eq("id", stay.guestId).maybeSingle(),
    fetchProperty(stay.propertyId),
  ]);
  if (!guest) return;
  await ChatwootService.syncOnCheckOut(stay as Stay, guest as Guest, property).catch(e =>
    console.error("[Chatwoot] syncOnCheckOut error:", e)
  );
}
