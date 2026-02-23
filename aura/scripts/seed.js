// scripts/seed.js

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Carrega as variáveis de ambiente
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
  console.log("🌱 Aura Engine: Recriando ecossistema de dados com as novas tipagens...");

  const propertyId = "pousada-aura";

  try {
    // 1. Limpeza Profunda (Subcoleções)
    await cleanSubcollection(propertyId, 'cabins');
    await cleanSubcollection(propertyId, 'stays');
    await cleanSubcollection(propertyId, 'guests');

    // 2. Mock de Hóspedes (Com todos os novos campos de endereço e perfil)
    const guests = [
      { 
        id: "11122233344", fullName: "Ricardo Alvarenga", phone: "5511999998888", email: "ricardo@email.com", nationality: "Brasil",
        birthDate: "1985-05-12", gender: "M", occupation: "Engenheiro de Software",
        address: { street: "Av Paulista", number: "1000", complement: "Apt 42", neighborhood: "Bela Vista", city: "São Paulo", state: "SP", zipCode: "01310-100", country: "Brasil" },
        allergies: ["Amendoim", "Frutos do Mar"]
      },
      { 
        id: "55566677788", fullName: "Elena Rodriguez", phone: "5491122334455", email: "elena@global.com", nationality: "Argentina",
        birthDate: "1990-08-22", gender: "F", occupation: "Arquiteta",
        address: { street: "Calle Falsa", number: "123", neighborhood: "Palermo", city: "Buenos Aires", state: "CABA", zipCode: "1425", country: "Argentina" },
        allergies: []
      },
      { 
        id: "99988877766", fullName: "John Smith", phone: "14155550199", email: "john@tech.com", nationality: "Estados Unidos",
        birthDate: "1978-11-30", gender: "M", occupation: "Investidor",
        address: { street: "Market St", number: "400", neighborhood: "Financial District", city: "San Francisco", state: "CA", zipCode: "94104", country: "Estados Unidos" },
        allergies: ["Lactose"]
      }
    ];

    for (const g of guests) {
      await db.collection('properties').doc(propertyId).collection('guests').doc(g.id).set({
        ...g,
        document: { type: g.nationality === "Brasil" ? "CPF" : "Passaporte", number: g.id },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Mock de Cabanas (Atualizado com number, wifi e equipment)
    const cabinSpecs = [
      { number: "01", category: "Praia", name: "01 - Praia 2 dormitórios", capacity: 4, status: "occupied", setups: ["double", "twin"] },
      { number: "05", category: "Praia", name: "05 - Praia 1 dormitório", capacity: 2, status: "available", setups: ["double"] },
      { number: "15", category: "Jardim", name: "15 - Jardim 2 dormitórios", capacity: 4, status: "cleaning", setups: ["double", "twin"] },
      { number: "12", category: "Bem-Estar", name: "12 - Bem estar 1 dormitório", capacity: 2, status: "maintenance", setups: ["double"] }
    ];

    const cabinDocs = [];
    for (const spec of cabinSpecs) {
      const ref = db.collection('properties').doc(propertyId).collection('cabins').doc();
      const cabinData = {
        id: ref.id,
        propertyId,
        number: spec.number,
        category: spec.category,
        name: spec.name,
        capacity: spec.capacity,
        status: spec.status,
        allowedSetups: spec.setups,
        wifi: { ssid: `Aura_${spec.number}`, password: "auraguest" },
        equipment: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(cabinData);
      cabinDocs.push(cabinData);
    }

    // 4. Mock de Estadias (Cobrindo todos os status do ciclo de vida)
    const now = new Date();
    
    const stays = [
      {
        // 1. ATIVA: Hospedado no momento
        cabinIdx: 0, guestId: "11122233344", status: "active",
        checkIn: now, checkOut: new Date(now.getTime() + (86400000 * 3)), accessCode: "B4H2K",
        roomSetup: "double", travelReason: "Turismo", hasOpenFolio: true
      },
      {
        // 2. PRE_CHECKIN_DONE: Chega amanhã, ficha já preenchida
        cabinIdx: 1, guestId: "55566677788", status: "pre_checkin_done",
        checkIn: new Date(now.getTime() + (86400000 * 1)), checkOut: new Date(now.getTime() + (86400000 * 4)), accessCode: "XP90J",
        roomSetup: "twin", travelReason: "Negocios", hasOpenFolio: false
      },
      {
        // 3. PENDING: Futura distante, aguardando envio de link
        cabinIdx: 1, guestId: "99988877766", status: "pending",
        checkIn: new Date(now.getTime() + (86400000 * 15)), checkOut: new Date(now.getTime() + (86400000 * 20)), accessCode: "Z7Q2W",
        roomSetup: "double", travelReason: "Turismo", hasOpenFolio: false
      },
      {
        // 4. FINISHED: Saiu hoje, cabana aguardando limpeza
        cabinIdx: 2, guestId: "11122233344", status: "finished",
        checkIn: new Date(now.getTime() - (86400000 * 3)), checkOut: new Date(now.getTime() - 3600000), accessCode: "FIN12",
        roomSetup: "double", travelReason: "Saude", hasOpenFolio: false
      }
    ];

    for (const s of stays) {
      const stayId = uuidv4();
      await db.collection('properties').doc(propertyId).collection('stays').doc(stayId).set({
        id: stayId,
        propertyId,
        groupId: null,
        guestId: s.guestId,
        cabinId: cabinDocs[s.cabinIdx].id,
        accessCode: s.accessCode,
        
        checkIn: admin.firestore.Timestamp.fromDate(s.checkIn),
        checkOut: admin.firestore.Timestamp.fromDate(s.checkOut),
        expectedArrivalTime: "14:00",
        vehiclePlate: "ABC-1234",
        roomSetup: s.roomSetup,
        roomSetupNotes: "Travesseiros extras solicitados.",
        
        counts: { adults: 2, children: 0, babies: 0 },
        additionalGuests: [],
        
        travelReason: s.travelReason,
        transportation: "Carro",
        lastCity: "Cidade Origem",
        nextCity: "Cidade Destino",
        
        hasPet: s.cabinIdx === 0,
        petDetails: s.cabinIdx === 0 ? { name: "Thor", weight: 12, species: "Cachorro" } : null,
        
        status: s.status,
        automationFlags: {
          send48h: s.status === 'pending',
          send24h: s.status === 'pending',
          preCheckinSent: s.status !== 'pending',
          remindersCount: 0
        },
        hasOpenFolio: s.hasOpenFolio,
        
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log("✅ Dados mockados com sucesso seguindo a nova tipagem `aura.ts`!");
  } catch (e) {
    console.error("❌ Erro no seed:", e);
  } finally {
    process.exit();
  }
}

runSeed();