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

        // Enrich audit log with human-readable structure name, unit, and guest identity
        let auditUserName = actorName;
        let auditDetails = `Ocupação registrada.`;
        try {
            const { data: structData } = await supabase.from('structures').select('name, units').eq('id', booking.structureId).single();
            const structureName = structData?.name || booking.structureId;

            // Resolve unit name if booking has a specific unit
            let unitLabel = '';
            if (booking.unitId && structData?.units?.length) {
                const unit = (structData.units as { id: string; name: string }[]).find(u => u.id === booking.unitId);
                if (unit) unitLabel = ` (${unit.name})`;
            }

            // Resolve guest/cabin identity
            let guestLabel = '';
            if (booking.stayId) {
                const { data: stayData } = await supabase
                    .from('stays').select('guestId, cabinId').eq('id', booking.stayId).single();
                if (stayData) {
                    const [{ data: cabinData }, { data: guestData }] = await Promise.all([
                        supabase.from('cabins').select('number').eq('id', stayData.cabinId).single(),
                        supabase.from('guests').select('fullName').eq('id', stayData.guestId).single(),
                    ]);
                    if (cabinData && guestData) {
                        const firstName = guestData.fullName.split(' ')[0];
                        const cabinLabel = `${cabinData.number} - ${firstName}`;
                        // Autor = hóspede apenas quando ele mesmo fez a reserva pelo app
                        if (booking.source === 'guest') auditUserName = cabinLabel;
                        guestLabel = ` para cabana ${cabinLabel}`;
                    }
                }
            } else if (booking.guestName) {
                guestLabel = ` para ${booking.guestName}`;
            }

            const bookingTypeLabel = booking.type === 'maintenance_block' ? 'Bloqueio' : 'Reserva';
            auditDetails = `${bookingTypeLabel} em ${structureName}${unitLabel}${guestLabel}: ${booking.startTime}–${booking.endTime}`;
        } catch { /* enrich fails silently */ }

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: auditUserName,
            action: "STRUCTURE_BOOKING_CREATED",
            entity: "STRUCTURE_BOOKING",
            entityId: id,
            details: auditDetails
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

        // Enrich audit details with structure name and guest identity
        let auditDetails = `Agendamento atualizado. Status: ${updates.status || 'sem mudança'}`;
        try {
            const { data: booking } = await supabase
                .from('structure_bookings')
                .select('structureId, startTime, endTime, stayId, guestName, unitId, type')
                .eq('id', bookingId)
                .single();
            if (booking) {
                const { data: st } = await supabase.from('structures').select('name, units').eq('id', booking.structureId).single();
                const structureName = st?.name || booking.structureId;

                // Resolve unit name
                let unitLabel = '';
                if (booking.unitId && st?.units?.length) {
                    const unit = (st.units as { id: string; name: string }[]).find((u: { id: string; name: string }) => u.id === booking.unitId);
                    if (unit) unitLabel = ` (${unit.name})`;
                }

                // Resolve guest/cabin label
                let guestLabel = booking.guestName || '';
                if (!guestLabel && booking.stayId) {
                    const { data: stay } = await supabase.from('stays').select('guestId, cabinId').eq('id', booking.stayId).single();
                    if (stay) {
                        const [{ data: cabinData }, { data: guestData }] = await Promise.all([
                            supabase.from('cabins').select('number').eq('id', stay.cabinId).single(),
                            supabase.from('guests').select('fullName').eq('id', stay.guestId).single(),
                        ]);
                        if (cabinData && guestData) {
                            guestLabel = `cabana ${cabinData.number} - ${guestData.fullName.split(' ')[0]}`;
                        }
                    }
                }

                const statusLabel = updates.status || 'atualizado';
                const bookingTypeLabel = booking.type === 'maintenance_block' ? 'Bloqueio' : 'Reserva';
                auditDetails = guestLabel
                    ? `${bookingTypeLabel} em ${structureName}${unitLabel} para ${guestLabel}: ${booking.startTime}–${booking.endTime} → ${statusLabel}`
                    : `${bookingTypeLabel} em ${structureName}${unitLabel}: ${booking.startTime}–${booking.endTime} → ${statusLabel}`;
            }
        } catch { /* enrich fails silently */ }

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_BOOKING_STATUS_CHANGED",
            entity: "STRUCTURE_BOOKING",
            entityId: bookingId,
            details: auditDetails
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
