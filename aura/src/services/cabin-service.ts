import { db } from "@/lib/firebase";
import { 
  collection, doc, setDoc, getDocs, 
  query, orderBy, deleteDoc, serverTimestamp 
} from "firebase/firestore";
import { Cabin } from "@/types/aura";

export const CabinService = {
  async getCabinsByProperty(propertyId: string): Promise<Cabin[]> {
    // Caminho: properties/{id}/cabins
    const cabinsRef = collection(db, "properties", propertyId, "cabins");
    const q = query(cabinsRef, orderBy("number", "asc")); // Ordena por número
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Cabin));
  },

  async saveCabin(propertyId: string, cabin: Partial<Cabin>) {
    const id = cabin.id || doc(collection(db, "unused")).id;
    const cabinRef = doc(db, "properties", propertyId, "cabins", id);
    
    // Força a regra do nome: "Número - Categoria"
    const finalName = `${cabin.number} - ${cabin.category}`;
    
    await setDoc(cabinRef, {
      ...cabin,
      id,
      name: finalName,
      propertyId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    return id;
  },

  async deleteCabin(propertyId: string, cabinId: string) {
    await deleteDoc(doc(db, "properties", propertyId, "cabins", cabinId));
  }
};