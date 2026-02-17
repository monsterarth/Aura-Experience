// scripts/apply-theme.js

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

// Configuração das Credenciais (Mesmo padrão do seu create-super-admin.js)
// Certifique-se de ter o arquivo service-account.json na raiz ou configure as variáveis de ambiente
const serviceAccount = require("../service-account.json"); 

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

// --- CONFIGURAÇÃO DO TEMA: OPÇÃO 1 "ESSÊNCIA DA TERRA" ---
const themeData = {
  colors: {
    // Marca principal (Marrom Camurça/Madeira)
    primary: "#A67C52",       
    onPrimary: "#FFFFFF",     
    
    // Secundária (Areia Suave)
    secondary: "#F0EBE3",     
    onSecondary: "#4A3B32",   
    
    // Detalhes (Verde Oliva - Natureza)
    accent: "#8C9A5B",        
    
    // Superfícies (Off-White/Casca de Ovo - Conforto visual)
    background: "#FAF9F6",    
    surface: "#FFFFFF",       
    
    // Texto (Preto Café - Sofisticação)
    textMain: "#2C2420",      
    textMuted: "#857F72",     
    
    // Feedback
    success: "#4E6E58",
    error: "#B94A48",
  },
  typography: {
    fontFamilyHeading: "Playfair Display", // Elegância com Serifa (como no guia)
    fontFamilyBody: "Inter",               // Leitura fácil
    baseSize: 16,
  },
  shape: {
    radius: "0.5rem", // Bordas levemente arredondadas
  },
};

async function applyTheme(propertySlug) {
  if (!propertySlug) {
    console.error("❌ Erro: Forneça o SLUG da propriedade como argumento.");
    console.log("Exemplo: node scripts/apply-theme.js pousada-vale-verde");
    process.exit(1);
  }

  console.log(`🔍 Buscando propriedade com slug: "${propertySlug}"...`);

  try {
    // 1. Tenta achar pelo ID direto (caso o slug seja o ID)
    let docRef = db.collection("properties").doc(propertySlug);
    let docSnap = await docRef.get();

    // 2. Se não achar pelo ID, busca pelo campo 'slug'
    if (!docSnap.exists) {
        const querySnapshot = await db.collection("properties")
            .where("slug", "==", propertySlug)
            .limit(1)
            .get();
        
        if (querySnapshot.empty) {
            console.error(`❌ Propriedade "${propertySlug}" não encontrada.`);
            process.exit(1);
        }
        docRef = querySnapshot.docs[0].ref;
        docSnap = querySnapshot.docs[0];
    }

    console.log(`✅ Propriedade encontrada: ${docSnap.data().name} (ID: ${docSnap.id})`);
    console.log("🎨 Aplicando tema 'Essência da Terra'...");

    await docRef.update({
        theme: themeData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("\n===========================================");
    console.log("✨ TEMA APLICADO COM SUCESSO!");
    console.log("===========================================");
    console.log("As cores foram atualizadas para a paleta orgânica.");
    console.log("Reinicie o seu servidor Next.js se as alterações não aparecerem imediatamente.");
    
  } catch (error) {
    console.error("❌ Erro ao atualizar tema:", error);
  }
}

// Pega o argumento da linha de comando
const slug = process.argv[2];
applyTheme(slug);