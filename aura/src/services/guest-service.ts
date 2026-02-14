// src/services/guest-service.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Guest } from "@/types/aura";

export const GuestService = {
  /**
   * Normaliza o documento para ser usado como ID (apenas números e letras)
   */
  normalizeDocument(docStr: string): string {
    return docStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  /**
   * Busca um hóspede pelo documento dentro de uma propriedade específica
   */
  async findByDocument(propertyId: string, docNumber: string): Promise<Guest | null> {
    const id = this.normalizeDocument(docNumber);
    // ID composto para garantir isolamento por propriedade mesmo usando o CPF como base
    const docRef = doc(db, "properties", propertyId, "guests", id);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Guest;
    }
    return null;
  },

  /**
   * Cria ou atualiza um hóspede
   */
  async upsertGuest(propertyId: string, guestData: Omit<Guest, "updatedAt">) {
    const id = this.normalizeDocument(guestData.id);
    const docRef = doc(db, "properties", propertyId, "guests", id);

    await setDoc(docRef, {
      ...guestData,
      id, // Garante o ID normalizado
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return id;
  }
};