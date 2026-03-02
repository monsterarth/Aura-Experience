import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
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
    console.log("🚀 Iniciando migração de Configurações e Usuários do Firebase para Supabase...");

    try {
        // 1. MIGRAR USUÁRIOS -> STAFF
        console.log("👥 Migrando coleção de usuários (staff)...");
        const usersSnap = await getDocs(collection(db, "users"));
        let staffMigrated = 0;
        for (const userDoc of usersSnap.docs) {
            const data = userDoc.data();
            const payload = {
                id: userDoc.id,
                propertyId: data.propertyId || "default",
                fullName: data.fullName || "Usuário",
                email: data.email || "",
                role: data.role || "admin",
                active: data.active !== undefined ? data.active : true,
                createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
            };
            const { error: staffErr } = await supabase.from('staff').upsert(payload, { onConflict: 'id' });
            if (staffErr) console.error(`❌ Erro em user ${userDoc.id}:`, staffErr);
            else staffMigrated++;
        }
        console.log(`✅ Foram transferidos ${staffMigrated} membros da equipe.`);


        // 2. MIGRAR PROPRIEDADES, REGRAS, TEMPLATES E CHECKLISTS
        console.log("🏢 Migrando Propriedades e Sub-coleções...");
        const propsSnap = await getDocs(collection(db, "properties"));
        let propsMigrated = 0;

        for (const prop of propsSnap.docs) {
            const propertyId = prop.id;
            const pData = prop.data();

            // Migrar property base
            const propPayload = {
                id: propertyId,
                name: pData.name || "Aura Property",
                slug: pData.slug || propertyId,
                logoUrl: pData.logoUrl || null,
                theme: pData.theme || {},
                settings: pData.settings || {},
                createdAt: pData.createdAt ? new Date(pData.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
            };
            await supabase.from('properties').upsert(propPayload, { onConflict: 'id' });
            propsMigrated++;

            // MIGRAR REGRAS DE AUTOMAÇÃO
            const rulesSnap = await getDocs(collection(db, "properties", propertyId, "automation_rules"));
            for (const doc of rulesSnap.docs) {
                const data = doc.data();
                const payload = {
                    id: doc.id,
                    propertyId: propertyId,
                    triggerEvent: data.triggerEvent || doc.id,
                    templateId: data.templateId || null,
                    active: data.active || false,
                    delayMinutes: data.delayMinutes || 0,
                    createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toISOString() : new Date().toISOString()
                };
                await supabase.from('automation_rules').upsert(payload, { onConflict: 'id' });
            }

            // MIGRAR TEMPLATES DE MENSAGEM
            const templatesSnap = await getDocs(collection(db, "properties", propertyId, "message_templates"));
            for (const doc of templatesSnap.docs) {
                const data = doc.data();
                const payload = {
                    id: doc.id,
                    propertyId: propertyId,
                    name: data.name || doc.id,
                    body: data.body || "",
                    createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toISOString() : new Date().toISOString()
                };
                await supabase.from('message_templates').upsert(payload, { onConflict: 'id' });
            }

            // MIGRAR CHECKLISTS DE GOVERNANÇA
            const checkSnap = await getDocs(collection(db, "properties", propertyId, "checklists"));
            for (const doc of checkSnap.docs) {
                const data = doc.data();
                const payload = {
                    id: doc.id,
                    propertyId: propertyId,
                    title: data.title || doc.id,
                    type: data.type || "turnover",
                    items: data.items || [],
                    createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toISOString() : new Date().toISOString()
                };
                await supabase.from('checklists').upsert(payload, { onConflict: 'id' });
            }

            console.log(`[+] Propriedade ${propertyId} (Rules, Templates, Checklists) sincronizada.`);
        }

        console.log(`✅ Migração concluída! Foram transferidas ${propsMigrated} propriedades.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
}

run();
