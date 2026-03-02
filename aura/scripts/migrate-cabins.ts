import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Carregar variáveis do .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// Setup Firebase
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Setup Supabase (usa Service Role para bypassar permissões/RLS via Node)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("🚀 Iniciando migração da coleção 'Cabins' do Firebase para Supabase...");

    try {
        const propsSnap = await getDocs(collection(db, "properties"));
        let totalMigrated = 0;

        for (const prop of propsSnap.docs) {
            const propertyId = prop.id;
            const cabinsSnap = await getDocs(collection(db, "properties", propertyId, "cabins"));

            if (cabinsSnap.empty) {
                console.log(`[!] Propriedade ${propertyId} vazia. Pulando.`);
                continue;
            }

            console.log(`[+] Encontradas ${cabinsSnap.size} cabanas na propriedade ${propertyId}. Migrando...`);

            for (const cabinDoc of cabinsSnap.docs) {
                const data = cabinDoc.data();

                // Conversão dos tipos complexos do firebase pra postgres
                const payload = {
                    id: cabinDoc.id,
                    propertyId: propertyId,
                    number: data.number || "-",
                    category: data.category || "Desconhecida",
                    name: data.name || `${data.number} - ${data.category}`,
                    capacity: data.capacity || 2,
                    status: data.status || "available",
                    allowedSetups: data.allowedSetups || [],
                    currentStayId: data.currentStayId || null,
                    wifi: data.wifi || null,
                    equipment: data.equipment || [],
                    housekeepingItems: data.housekeepingItems || [],
                    createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toISOString() : new Date().toISOString(),
                };

                const { error } = await supabase
                    .from('cabins')
                    .upsert(payload, { onConflict: 'id' });

                if (error) {
                    console.error(`❌ Erro ao migrar Cabana ${cabinDoc.id}:`, error);
                } else {
                    totalMigrated++;
                }
            }
        }

        console.log(`✅ Migração concluída! Foram transferidas ${totalMigrated} cabanas.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
}

run();
