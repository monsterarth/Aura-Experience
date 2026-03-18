// src/app/api/guest/structure-bookings/route.ts
// API route para reservas de estruturas feitas pelo portal do hóspede.
// Usa supabaseAdmin para contornar RLS — o hóspede é anônimo (sem sessão).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "@/services/audit-service";

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const bookingId = searchParams.get("bookingId");
        const stayId = searchParams.get("stayId");
        const propertyId = searchParams.get("propertyId");

        if (!bookingId || !stayId || !propertyId) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Valida que a reserva pertence à estadia do hóspede (segurança)
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('structure_bookings')
            .select('id, status')
            .eq('id', bookingId)
            .eq('stayId', stayId)
            .eq('propertyId', propertyId)
            .single();

        if (fetchError || !existing) {
            return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
        }

        if (!['pending', 'approved'].includes(existing.status)) {
            return NextResponse.json({ error: "Esta reserva não pode ser cancelada" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('structure_bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[guest/structure-bookings DELETE] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

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

        // Impede reserva duplicada: o hóspede não pode ter 2 reservas ativas
        // na mesma estrutura no mesmo dia (independente de unidade)
        if (stayId && booking.structureId && booking.date) {
            const { data: duplicate } = await supabaseAdmin
                .from('structure_bookings')
                .select('id')
                .eq('stayId', stayId)
                .eq('structureId', booking.structureId)
                .eq('date', booking.date)
                .in('status', ['pending', 'approved'])
                .limit(1)
                .single();

            if (duplicate) {
                return NextResponse.json(
                    { error: "Você já tem uma reserva ativa nesta estrutura para hoje." },
                    { status: 409 }
                );
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
