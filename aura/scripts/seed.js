const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function cleanSubcollection(propertyId, subcollectionName) {
  const ref = db.collection('properties').doc(propertyId).collection(subcollectionName);
  const snapshot = await ref.get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`  - Subcoleção [${subcollectionName}] limpa.`);
}

async function runSeed() {
  console.log("🌱 Aura Engine: Recriando ecossistema de dados...");

  const propertyId = "fazenda-modelo-aura";

  try {
    // 1. Limpeza Profunda (Subcoleções)
    await cleanSubcollection(propertyId, 'cabins');
    await cleanSubcollection(propertyId, 'stays');
    await cleanSubcollection(propertyId, 'guests');

    // 2. Mock de Hóspedes (Base para as Estadias)
    const guests = [
      { id: "11122233344", fullName: "Ricardo Alvarenga", phone: "+5511999998888", email: "ricardo@email.com", nationality: "Brasil" },
      { id: "55566677788", fullName: "Elena Rodriguez", phone: "+5491122334455", email: "elena@global.com", nationality: "Argentina" },
      { id: "99988877766", fullName: "John Smith", phone: "+14155550199", email: "john@tech.com", nationality: "Estados Unidos" }
    ];

    for (const g of guests) {
      await db.collection('properties').doc(propertyId).collection('guests').doc(g.id).set({
        ...g,
        document: { type: g.nationality === "Brasil" ? "CPF" : "Passaporte", number: g.id },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Mock de Cabanas (Categorias e Unidades)
    const cabinSpecs = [
      { name: "01 - Praia 2 dormitórios", capacity: 4, category: "Praia", status: "occupied", setups: ["Casal + 2 Solteiros", "4 Solteiros"] },
      { name: "05 - Praia 1 dormitório", capacity: 2, category: "Praia", status: "available", setups: ["Casal Padrão", "2 Solteiros"] },
      { name: "15 - Jardim 2 dormitórios", capacity: 4, category: "Jardim", status: "available", setups: ["2 Casais", "1 Casal + 2 Solteiros"] },
      { name: "12 - Bem estar 1 dormitório", capacity: 2, category: "Bem-Estar", status: "cleaning", setups: ["Cama King + Ofurô"] }
    ];

    const cabinDocs = [];
    for (const spec of cabinSpecs) {
      const ref = db.collection('properties').doc(propertyId).collection('cabins').doc();
      const cabinData = {
        id: ref.id,
        propertyId,
        name: spec.name,
        capacity: spec.capacity,
        status: spec.status,
        allowedSetups: spec.setups,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(cabinData);
      cabinDocs.push(cabinData);
    }

    // 4. Mock de Estadias (Andamento, Encerrada e Futura)
    const now = new Date();
    const stays = [
      {
        cabinIdx: 0, // Ocupada
        guestId: "11122233344",
        status: "active",
        checkIn: now,
        checkOut: new Date(now.getTime() + (86400000 * 3)), // +3 dias
        accessCode: "B4H2K"
      },
      {
        cabinIdx: 1, // Encerrada recentemente
        guestId: "55566677788",
        status: "finished",
        checkIn: new Date(now.getTime() - (86400000 * 5)),
        checkOut: new Date(now.getTime() - 3600000), // Saída há 1h
        accessCode: "XP90J"
      },
      {
        cabinIdx: 2, // Futura (Pendente)
        guestId: "99988877766",
        status: "pending",
        checkIn: new Date(now.getTime() + (86400000 * 1)), // Chega amanhã
        checkOut: new Date(now.getTime() + (86400000 * 4)),
        accessCode: "Z7Q2W"
      }
    ];

    for (const s of stays) {
      const stayId = uuidv4();
      await db.collection('properties').doc(propertyId).collection('stays').doc(stayId).set({
        id: stayId,
        propertyId,
        guestId: s.guestId,
        cabinId: cabinDocs[s.cabinIdx].id,
        status: s.status,
        accessCode: s.accessCode,
        checkIn: admin.firestore.Timestamp.fromDate(s.checkIn),
        checkOut: admin.firestore.Timestamp.fromDate(s.checkOut),
        counts: { adults: 2, children: 0, babies: 0 },
        transportation: "Carro",
        hasPet: s.cabinIdx === 0,
        petDetails: s.cabinIdx === 0 ? { name: "Thor", weight: 12, species: "Cachorro" } : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log("✅ Dados mockados com sucesso seguindo a hierarquia properties/{id}/...");
  } catch (e) {
    console.error("❌ Erro no seed:", e);
  } finally {
    process.exit();
  }
}

runSeed();