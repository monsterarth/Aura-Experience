import { supabase } from "@/lib/supabase";
import { Structure, StructureBooking, TimeSlot } from "@/types/aura";
import { AuditService } from "./audit-service";

export const StructureService = {

    // ==========================================
    // STRUCTURE MANAGEMENT
    // ==========================================

    async getStructures(propertyId: string): Promise<Structure[]> {
        const { data, error } = await supabase
            .from('structures')
            .select('*')
            .eq('propertyId', propertyId);

        if (error) {
            console.error("Error fetching structures:", error);
            return [];
        }
        return data as Structure[];
    },

    async getStructure(propertyId: string, structureId: string): Promise<Structure | null> {
        const { data, error } = await supabase
            .from('structures')
            .select('*')
            .eq('id', structureId)
            .eq('propertyId', propertyId)
            .single();

        if (error || !data) return null;
        return data as Structure;
    },

    async createStructure(propertyId: string, data: Omit<Structure, 'id' | 'createdAt'>, actorId: string, actorName: string): Promise<string> {
        const id = crypto.randomUUID();
        const payload = {
            ...data,
            id,
            propertyId
        };

        const { error } = await supabase
            .from('structures')
            .insert(payload);

        if (error) throw error;

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_CREATED",
            entity: "STRUCTURE",
            entityId: id,
            details: `Estrutura ${data.name} criada.`
        });

        return id;
    },

    async updateStructure(propertyId: string, structureId: string, data: Partial<Structure>, actorId: string, actorName: string): Promise<void> {
        const { error } = await supabase
            .from('structures')
            .update(data)
            .eq('id', structureId)
            .eq('propertyId', propertyId);

        if (error) throw error;

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_UPDATED",
            entity: "STRUCTURE",
            entityId: structureId,
            details: `Estrutura atualizada.`
        });
    },

    async deleteStructure(propertyId: string, structureId: string, actorId: string, actorName: string): Promise<void> {
        const { error } = await supabase
            .from('structures')
            .delete()
            .eq('id', structureId)
            .eq('propertyId', propertyId);

        if (error) throw error;

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_DELETED",
            entity: "STRUCTURE",
            entityId: structureId,
            details: `Estrutura excluída.`
        });
    },

    // ==========================================
    // BOOKING MANAGEMENT
    // ==========================================

    generateTimeSlots(structure: Structure, existingBookings: StructureBooking[], unitId?: string): TimeSlot[] {
        const slots: TimeSlot[] = [];
        const { openTime, closeTime, slotDurationMinutes, slotIntervalMinutes } = structure.operatingHours;

        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        };

        const minutesToTime = (totalMinutes: number) => {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        };

        if (!openTime || !closeTime || !slotDurationMinutes) return slots;

        let start = timeToMinutes(openTime);
        const end = timeToMinutes(closeTime);

        while (start + slotDurationMinutes <= end) {
            const currentStartStr = minutesToTime(start);
            const currentEndStr = minutesToTime(start + slotDurationMinutes);

            const conflictingBooking = existingBookings.find(b => {
                if (b.status === 'cancelled' || b.status === 'rejected') return false;
                // Bookings sem unitId bloqueiam todas as unidades (retrocompatibilidade).
                // Bookings com unitId diferente do filtro não geram conflito.
                if (unitId && b.unitId && b.unitId !== unitId) return false;

                const bStart = timeToMinutes(b.startTime);
                const bEnd = timeToMinutes(b.endTime);
                const sStart = start;
                const sEnd = start + slotDurationMinutes;

                return Math.max(sStart, bStart) < Math.min(sEnd, bEnd);
            });

            slots.push({
                startTime: currentStartStr,
                endTime: currentEndStr,
                available: !conflictingBooking,
                bookingId: conflictingBooking?.id
            });

            start += slotDurationMinutes + (slotIntervalMinutes || 0);
        }

        return slots;
    },

    checkOverlap(startTime: string, endTime: string, existingBookings: StructureBooking[], unitId?: string): boolean {
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        };

        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);

        return existingBookings.some(b => {
            if (b.status === 'cancelled' || b.status === 'rejected') return false;
            if (unitId && b.unitId && b.unitId !== unitId) return false;

            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);

            return Math.max(start, bStart) < Math.min(end, bEnd);
        });
    },

    async getBookingsByDate(propertyId: string, structureId: string, date: string): Promise<StructureBooking[]> {
        const { data, error } = await supabase
            .from('structure_bookings')
            .select('*')
            .eq('propertyId', propertyId)
            .eq('structureId', structureId)
            .eq('date', date);

        if (error) return [];
        return data as StructureBooking[];
    },

    async getAllBookingsByDate(propertyId: string, date: string): Promise<StructureBooking[]> {
        const { data, error } = await supabase
            .from('structure_bookings')
            .select('*')
            .eq('propertyId', propertyId)
            .eq('date', date);

        if (error) { console.error("getAllBookingsByDate error:", error); return []; }
        return data as StructureBooking[];
    },

    async createBooking(propertyId: string, booking: Omit<StructureBooking, 'id' | 'createdAt'>, actorId: string, actorName: string): Promise<string> {
        const id = crypto.randomUUID();
        const payload = { ...booking, id, propertyId };

        const { error } = await supabase
            .from('structure_bookings')
            .insert(payload);

        if (error) throw error;

        // =======================
        // AURA AUTOMATION TRIGGER
        // =======================
        if (booking.stayId && (booking.status === 'approved' || booking.status === 'pending')) {
            try {
                const { AutomationService } = await import('./automation-service');
                const { data: st } = await supabase.from('structures').select('*').eq('id', booking.structureId).single();
                if (st) {
                    const templateId = booking.status === 'pending' ? st.messageTemplatePendingId : st.messageTemplateConfirmedId;
                    if (templateId) {
                        await AutomationService.triggerStructureBookingAutomation(
                            propertyId,
                            booking.stayId,
                            st.name,
                            booking.date,
                            booking.startTime,
                            templateId
                        );
                    }
                }
            } catch (e) { console.error("Falha ao disparar automação de estrutura", e) }
        }

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_BOOKING_CREATED",
            entity: "STRUCTURE_BOOKING",
            entityId: id,
            details: `Ocupação na estrutura ${booking.structureId} registrada.`
        });

        return id;
    },

    async updateBooking(propertyId: string, bookingId: string, updates: Partial<StructureBooking>, actorId: string, actorName: string): Promise<void> {
        const { error } = await supabase
            .from('structure_bookings')
            .update(updates)
            .eq('id', bookingId)
            .eq('propertyId', propertyId);

        if (error) throw error;

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_BOOKING_STATUS_CHANGED",
            entity: "STRUCTURE_BOOKING",
            entityId: bookingId,
            details: `Reserva ${bookingId} atualizada. Status resultante: ${updates.status || 'sem mudança de status'}`
        });
    },

    async updateBookingStatus(
        propertyId: string,
        bookingId: string,
        status: StructureBooking['status'],
        actorId: string,
        actorName: string,
        requiresTurnover: boolean = false,
        structureId?: string,
        cancellationReason?: string
    ): Promise<void> {
        await this.updateBooking(propertyId, bookingId, { status }, actorId, actorName);

        // =======================
        // AURA AUTOMATION TRIGGER
        // =======================
        if (status === 'approved' && structureId) {
            try {
                const { AutomationService } = await import('./automation-service');
                const { data: st } = await supabase.from('structures').select('*').eq('id', structureId).single();
                if (st && st.messageTemplateConfirmedId) {
                    const { data: b } = await supabase.from('structure_bookings').select('*').eq('id', bookingId).single();
                    if (b?.stayId) {
                        await AutomationService.triggerStructureBookingAutomation(
                            propertyId,
                            b.stayId,
                            st.name,
                            b.date,
                            b.startTime,
                            st.messageTemplateConfirmedId
                        );
                    }
                }
            } catch (e) { console.error("Falha ao disparar automação estrutura - approve:", e) }
        }

        if (status === 'cancelled' && structureId) {
            try {
                const { AutomationService } = await import('./automation-service');
                const { data: st } = await supabase.from('structures').select('*').eq('id', structureId).single();
                if (st && st.messageTemplateCancelledId) {
                    const { data: b } = await supabase.from('structure_bookings').select('*').eq('id', bookingId).single();
                    if (b?.stayId) {
                        await AutomationService.triggerStructureBookingAutomation(
                            propertyId,
                            b.stayId,
                            st.name,
                            b.date,
                            b.startTime,
                            st.messageTemplateCancelledId,
                            cancellationReason
                        );
                    }
                }
            } catch (e) { console.error("Falha ao disparar automação estrutura - cancel:", e) }
        }

        if (status === 'completed' && requiresTurnover && structureId) {
            const { HousekeepingService } = await import('./housekeeping-service');
            await HousekeepingService.createTask(
                propertyId,
                {
                    structureId,
                    stayId: bookingId,
                    type: 'turnover',
                    status: 'pending',
                } as any,
                actorId,
                actorName
            );
        }
    }
};
