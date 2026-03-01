import { db } from "@/lib/firebase";
import {
    collection, doc, getDoc, getDocs, addDoc, updateDoc,
    query, where, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { Structure, StructureBooking, TimeSlot } from "@/types/aura";
import { AuditService } from "./audit-service";

export const StructureService = {

    // ==========================================
    // STRUCTURE MANAGEMENT
    // ==========================================

    async getStructures(propertyId: string): Promise<Structure[]> {
        const q = query(
            collection(db, "properties", propertyId, "structures")
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Structure));
    },

    async getStructure(propertyId: string, structureId: string): Promise<Structure | null> {
        const docRef = doc(db, "properties", propertyId, "structures", structureId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Structure;
    },

    async createStructure(propertyId: string, data: Omit<Structure, 'id' | 'createdAt'>, actorId: string, actorName: string): Promise<string> {
        const collRef = collection(db, "properties", propertyId, "structures");
        const docRef = await addDoc(collRef, {
            ...data,
            createdAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_CREATED",
            entity: "STRUCTURE",
            entityId: docRef.id,
            details: `Estrutura ${data.name} criada.`
        });

        return docRef.id;
    },

    async updateStructure(propertyId: string, structureId: string, data: Partial<Structure>, actorId: string, actorName: string): Promise<void> {
        const docRef = doc(db, "properties", propertyId, "structures", structureId);
        await updateDoc(docRef, data);

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
        const docRef = doc(db, "properties", propertyId, "structures", structureId);
        await deleteDoc(docRef);

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

    /**
     * Generates possible time slots for a given day based on the structure's operating hours.
     * Can optionally filter bookings for a specific unitId.
     */
    generateTimeSlots(structure: Structure, existingBookings: StructureBooking[], unitId?: string): TimeSlot[] {
        const slots: TimeSlot[] = [];
        const { openTime, closeTime, slotDurationMinutes, slotIntervalMinutes } = structure.operatingHours;

        // Convert "HH:mm" to minutes from midnight
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        };

        const minutesToTime = (totalMinutes: number) => {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        };

        let start = timeToMinutes(openTime);
        const end = timeToMinutes(closeTime);

        while (start + slotDurationMinutes <= end) {
            const currentStartStr = minutesToTime(start);
            const currentEndStr = minutesToTime(start + slotDurationMinutes);

            // Check if there is an overlapping APPROVED or COMPLETED or PENDING booking
            const conflictingBooking = existingBookings.find(b => {
                // Active reservations blocking the slot:
                if (b.status === 'cancelled' || b.status === 'rejected') return false;

                // If checking for a specific unit, ignore bookings for other units
                if (unitId && b.unitId !== unitId) return false;
                // Conversely, if a structure has units but the booking doesn't specify one (e.g. whole structure maintenance block), it's a conflict!
                // Or if we are checking the whole structure (no unitId provided).

                const bStart = timeToMinutes(b.startTime);
                const bEnd = timeToMinutes(b.endTime);
                const sStart = start;
                const sEnd = start + slotDurationMinutes;

                // Overlap condition:
                return Math.max(sStart, bStart) < Math.min(sEnd, bEnd);
            });

            slots.push({
                startTime: currentStartStr,
                endTime: currentEndStr,
                available: !conflictingBooking,
                bookingId: conflictingBooking?.id
            });

            start += slotDurationMinutes + slotIntervalMinutes;
        }

        return slots;
    },

    /**
     * Checks if a custom free-time timeframe overlaps with existing bookings.
     */
    checkOverlap(startTime: string, endTime: string, existingBookings: StructureBooking[], unitId?: string): boolean {
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        };

        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);

        return existingBookings.some(b => {
            if (b.status === 'cancelled' || b.status === 'rejected') return false;

            // If checking a specific unit, ignore other units
            if (unitId && b.unitId && b.unitId !== unitId) return false;

            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);

            return Math.max(start, bStart) < Math.min(end, bEnd);
        });
    },

    async getBookingsByDate(propertyId: string, structureId: string, date: string): Promise<StructureBooking[]> {
        const q = query(
            collection(db, "properties", propertyId, "structure_bookings"),
            where("structureId", "==", structureId),
            where("date", "==", date)
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StructureBooking));
    },

    async getAllBookingsByDate(propertyId: string, date: string): Promise<StructureBooking[]> {
        const q = query(
            collection(db, "properties", propertyId, "structure_bookings"),
            where("date", "==", date)
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StructureBooking));
    },

    async createBooking(propertyId: string, data: Omit<StructureBooking, 'id' | 'createdAt'>, actorId: string, actorName: string): Promise<string> {
        const collRef = collection(db, "properties", propertyId, "structure_bookings");
        const docRef = await addDoc(collRef, {
            ...data,
            createdAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_BOOKING_CREATED",
            entity: "STRUCTURE_BOOKING",
            entityId: docRef.id,
            details: `Reserva para estrutura ${data.structureId} criada. Status: ${data.status}`
        });

        return docRef.id;
    },

    async updateBookingStatus(
        propertyId: string,
        bookingId: string,
        newStatus: StructureBooking['status'],
        actorId: string,
        actorName: string,
        requiresTurnover: boolean = false,
        structureId?: string
    ): Promise<void> {
        const docRef = doc(db, "properties", propertyId, "structure_bookings", bookingId);
        await updateDoc(docRef, { status: newStatus });

        // Se completou a reserva e a estrutura precisa de limpeza, marcar limpeza
        if (newStatus === 'completed' && requiresTurnover && structureId) {
            const structureRef = doc(db, "properties", propertyId, "structures", structureId);
            await updateDoc(structureRef, { status: 'cleaning' });
        }

        await AuditService.log({
            propertyId,
            userId: actorId,
            userName: actorName,
            action: "STRUCTURE_BOOKING_STATUS_CHANGED",
            entity: "STRUCTURE_BOOKING",
            entityId: bookingId,
            details: `Status da reserva alterado para ${newStatus}.`
        });
    }
};
