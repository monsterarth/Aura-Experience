// scripts/import-cabins.js

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// Carrega as credenciais
const serviceAccount = require("../service-account.json"); 

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function importCabins(propertySlug, csvFileName) {
  if (!propertySlug || !csvFileName) {
    console.error("❌ Erro: Forneça o SLUG da propriedade e o NOME DO ARQUIVO CSV.");
    console.log("Exemplo: node scripts/import-cabins.js fazenda-do-rosa cabins.csv");
    process.exit(1);
  }

  console.log(`🔍 Buscando propriedade com slug: "${propertySlug}"...`);

  try {
    // 1. Encontrar a Propriedade
    let propertyId = propertySlug;
    let propertyRef = db.collection("properties").doc(propertySlug);
    let propertySnap = await propertyRef.get();

    if (!propertySnap.exists) {
        const querySnapshot = await db.collection("properties")
            .where("slug", "==", propertySlug)
            .limit(1)
            .get();
        
        if (querySnapshot.empty) {
            console.error(`❌ Propriedade "${propertySlug}" não encontrada.`);
            process.exit(1);
        }
        propertyId = querySnapshot.docs[0].id;
    }

    console.log(`✅ Propriedade encontrada! ID: ${propertyId}`);
    
    // 2. Ler e processar o arquivo CSV
    const filePath = path.join(__dirname, '..', csvFileName);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Arquivo CSV não encontrado no caminho: ${filePath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    
    const cabinsToInsert = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; 

      const cols = line.split(';');

      const number = cols[0]?.trim();
      const category = cols[1]?.trim();
      const name = cols[2]?.trim();
      const capacity = parseInt(cols[3]?.trim()) || 2;
      const allowedSetupsStr = cols[4]?.trim();
      const wifiSsid = cols[5]?.trim();
      const wifiPassword = cols[6]?.trim();
      
      const equipmentTypes = cols[8]?.split(',').map(s => s.trim()).filter(Boolean) || [];
      const equipmentModels = cols[9]?.split(',').map(s => s.trim()).filter(Boolean) || [];
      const equipmentManuals = cols[10]?.split(',').map(s => s.trim()).filter(Boolean) || [];

      const equipment = [];
      for (let eqIdx = 0; eqIdx < equipmentTypes.length; eqIdx++) {
          equipment.push({
              id: `EQ_${Date.now()}_${i}_${eqIdx}`,
              type: equipmentTypes[eqIdx] || "",
              model: equipmentModels[eqIdx] || "",
              manualUrl: equipmentManuals[eqIdx] || ""
          });
      }

      const allowedSetups = allowedSetupsStr ? allowedSetupsStr.split(',').map(s => s.trim()) : ["Padrão"];

      const cabinData = {
          propertyId: propertyId,
          number: number,
          category: category,
          name: name,
          capacity: capacity,
          status: 'available',
          allowedSetups: allowedSetups,
          wifi: {
              ssid: wifiSsid || "",
              password: wifiPassword || ""
          },
          equipment: equipment,
          updatedAt: admin.firestore.FieldValue.serverTimestamp() // Mantendo consistência com o service
      };

      cabinsToInsert.push(cabinData);
    }

    console.log(`📦 Encontradas ${cabinsToInsert.length} unidades no CSV. Iniciando inserção...`);

    // 3. Inserir no Firebase em Lote (Batch) na Subcoleção Correta
    const batch = db.batch();
    
    // CORREÇÃO: Apontando para a subcoleção dentro da propriedade
    const cabinsRef = db.collection("properties").doc(propertyId).collection("cabins");
    
    cabinsToInsert.forEach((cabin) => {
        const newCabinRef = cabinsRef.doc(); // Gera o ID na subcoleção correta
        batch.set(newCabinRef, {
            ...cabin,
            id: newCabinRef.id
        });
    });

    await batch.commit();

    console.log("\n===========================================");
    console.log(`✨ SUCESSO! ${cabinsToInsert.length} unidades importadas na propriedade ${propertyId}.`);
    console.log("===========================================");
    
  } catch (error) {
    console.error("❌ Erro durante a importação:", error);
  }
}

const slug = process.argv[2];
const fileName = process.argv[3];
importCabins(slug, fileName);