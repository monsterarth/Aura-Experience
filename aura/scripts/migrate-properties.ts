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
    console.log("🚀 Iniciando migração das coleções de Propriedades e Estruturas...");

    try {
        const propsSnap = await getDocs(collection(db, "properties"));
        let totalProps = 0;
        let totalStructures = 0;

        for (const prop of propsSnap.docs) {
            const propertyId = prop.id;
            const data = prop.data();

            console.log(`[+] Migrando propriedade: ${data.name || propertyId}`);

            const propPayload = {
                id: propertyId,
                name: data.name || "Sem Nome",
                slug: data.slug || propertyId,
                logoUrl: data.logoUrl || null,
                theme: data.theme || {},
                settings: data.settings || {},
                createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
            };

            const { error: propError } = await supabase
                .from('properties')
                .upsert(propPayload, { onConflict: 'id' });

            if (propError) {
                console.error(`❌ Erro ao migrar Propriedade ${propertyId}:`, propError);
                continue; // if property fails, structures might fail due to FKs etc
            } else {
                totalProps++;
            }

            // Agora migrando Estruturas associadas
            const structuresSnap = await getDocs(collection(db, "properties", propertyId, "structures"));

            if (!structuresSnap.empty) {
                console.log(`    ↳ Encontradas ${structuresSnap.size} estruturas. Migrando...`);
                for (const structDoc of structuresSnap.docs) {
                    const structData = structDoc.data();

                    const structPayload = {
                        id: structDoc.id,
                        propertyId: propertyId,
                        name: structData.name || "Sem nome",
                        category: structData.category || "Geral",
                        description: structData.description || null,
                        visibility: structData.visibility || 'guest_auto_approve',
                        capacity: structData.capacity || 1,
                        status: structData.status || 'available',
                        operatingHours: structData.operatingHours || {},
                        imageUrl: structData.imageUrl || null,
                        units: structData.units || [],
                        bookingType: structData.bookingType || 'fixed_slots',
                        requiresTurnover: structData.requiresTurnover || false,
                        housekeepingChecklist: structData.housekeepingChecklist || [],
                        createdAt: structData.createdAt ? new Date(structData.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    };

                    const { error: structError } = await supabase
                        .from('structures')
                        .upsert(structPayload, { onConflict: 'id' });

                    if (structError) {
                        console.error(`    ❌ Erro ao migrar Estrutura ${structDoc.id}:`, structError);
                    } else {
                        totalStructures++;
                    }
                }
            }
        }

        console.log(`✅ Migração concluída! Foram transferidas ${totalProps} propriedades e ${totalStructures} estruturas.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
}

run();
