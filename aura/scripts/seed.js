// scripts/seed.js
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Carrega as variáveis do .env.local com caminho absoluto
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ ERRO: FIREBASE_PRIVATE_KEY não encontrada.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function runSeed() {
  console.log("🌱 Aura Engine: Mockando dados complexos...");

  const propertyId = "fazenda-modelo-aura";
  const propertySlug = "fazenda-modelo";

  try {
    // 1. Garantir que a Propriedade existe
    await db.collection('properties').doc(propertyId).set({
      name: "Fazenda Modelo Aura",
      slug: propertySlug,
      primaryColor: "221.2 83.2% 53.3%", // Azul Aura
      secondaryColor: "24.6 95% 53.1%",
      settings: {
        hasBreakfast: true,
        hasKDS: true,
        whatsappEnabled: true
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Limpar cabanas antigas dessa propriedade
    const cabinsRef = db.collection('cabins');
    const oldCabins = await cabinsRef.where('propertyId', '==', propertyId).get();
    const batch = db.batch();
    oldCabins.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log("🗑️  Cabanas antigas removidas.");

    // 3. Criar Cabanas com Montagens Complexas (allowedSetups)
    const newCabins = [
      {
        name: "Suíte Master VIP",
        capacity: 2,
        status: "available",
        propertyId: propertyId,
        allowedSetups: [
          "Cama King Size (Padrão)",
          "Duas Camas de Solteiro",
          "Cama King + Berço Lateral"
        ]
      },
      {
        name: "Cabana Familiar do Lago",
        capacity: 4,
        status: "available",
        propertyId: propertyId,
        allowedSetups: [
          "Cama Casal + 2 Camas Extra Solteiro na Sala",
          "4 Camas de Solteiro",
          "Cama Casal + 1 Solteiro + 1 Berço"
        ]
      },
      {
        name: "Refúgio da Mata (Pet Friendly)",
        capacity: 2,
        status: "available",
        propertyId: propertyId,
        allowedSetups: [
          "Cama Casal Padrão",
          "Cama Casal + Kit Pet (Caminha ao lado)"
        ]
      }
    ];

    for (const cabin of newCabins) {
      await cabinsRef.add({
        ...cabin,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ ${newCabins.length} Cabanas criadas com configurações de montagem.`);
    console.log("\n🚀 MOCK CONCLUÍDO!");
    console.log("Agora o Pré-check-in mostrará as opções de montagem corretas por unidade.");

  } catch (error) {
    console.error("❌ Erro no seed:", error);
  } finally {
    process.exit();
  }
}

runSeed();