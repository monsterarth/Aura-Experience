// src/app/api/guest/structure-bookings/route.ts
// API route para reservas de estruturas feitas pelo portal do hóspede.
// Usa supabaseAdmin para contornar RLS — o hóspede é anônimo (sem sessão).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "@/services/audit-service";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { propertyId, booking, stayId, guestId } = body;

        if (!propertyId || !booking) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Validate that the stayId belongs to the propertyId to prevent abuse
        if (stayId) {
            const { data: stay, error: stayError } = await supabaseAdmin
                .from('stays')
                .select('id, propertyId')
                .eq('id', stayId)
                .eq('propertyId', propertyId)
                .single();

            if (stayError || !stay) {
                return NextResponse.json({ error: "Invalid stay or property" }, { status: 403 });
            }
        }

        const id = crypto.randomUUID();
        const payload = { ...booking, id, propertyId };

        const { error } = await supabaseAdmin
            .from('structure_bookings')
            .insert(payload);

        if (error) {
            console.error("[guest/structure-bookings] Insert error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Trigger automation if applicable
        if (stayId && (booking.status === 'approved' || booking.status === 'pending')) {
            try {
                const { AutomationService } = await import("@/services/automation-service");
                const { data: st } = await supabaseAdmin
                    .from('structures')
                    .select('*')
                    .eq('id', booking.structureId)
                    .single();

                if (st) {
                    const templateId = booking.status === 'pending'
                        ? st.messageTemplatePendingId
                        : st.messageTemplateConfirmedId;
                    if (templateId) {
                        await AutomationService.triggerStructureBookingAutomation(
                            propertyId,
                            stayId,
                            st.name,
                            booking.date,
                            booking.startTime,
                            templateId
                        );
                    }
                }
            } catch (e) {
                console.error("[guest/structure-bookings] Automation error:", e);
            }
        }

        await AuditService.log({
            propertyId,
            userId: guestId || 'guest',
            userName: "Guest App",
            action: "STRUCTURE_BOOKING_CREATED",
            entity: "STRUCTURE_BOOKING",
            entityId: id,
            details: `Reserva de hóspede na estrutura ${booking.structureId}.`
        });

        return NextResponse.json({ id }, { status: 201 });
    } catch (err) {
        console.error("[guest/structure-bookings] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
