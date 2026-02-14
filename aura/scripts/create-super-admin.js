// scripts/create-super-admin.js
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Carrega as variáveis do .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error("❌ ERRO: FIREBASE_PRIVATE_KEY não encontrada no .env.local");
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
const auth = admin.auth();

async function createSuperAdmin() {
  // --- CONFIGURAÇÃO DA CONTA ---
  const adminData = {
    email: "arth.frank@gmail.com", // Mude para o seu e-mail de teste
    password: "c05mOlun@", // Mude para sua senha de teste
    fullName: "Arthur Petry"
  };

  console.log(`🚀 Iniciando criação do Super Admin: ${adminData.email}...`);

  try {
    // 1. Criar o usuário no Firebase Authentication
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: adminData.email,
        password: adminData.password,
        displayName: adminData.fullName,
      });
      console.log(`✅ Usuário criado no Auth (UID: ${userRecord.uid})`);
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        userRecord = await auth.getUserByEmail(adminData.email);
        console.log(`ℹ️ Usuário já existia no Auth. Atualizando perfil no Firestore...`);
      } else {
        throw e;
      }
    }

    // 2. Criar/Atualizar o perfil no Firestore com Role super_admin
    await db.collection('users').doc(userRecord.uid).set({
      fullName: adminData.fullName,
      email: adminData.email,
      role: 'super_admin',
      propertyId: null, // Super Admin não é preso a uma propriedade
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✅ Perfil Super Admin configurado no Firestore.`);

    // 3. Log de Auditoria
    await db.collection('audit_logs').add({
      propertyId: "SYSTEM",
      userId: "SYSTEM_INIT",
      userName: "Aura System",
      action: "USER_CREATE",
      entity: "USER",
      entityId: userRecord.uid,
      details: "Primeiro Super Admin criado via script de inicialização.",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("\n✨ TUDO PRONTO!");
    console.log(`E-mail: ${adminData.email}`);
    console.log(`Senha: ${adminData.password}`);
    console.log("\nAcesse agora: http://localhost:3000/admin/login");

  } catch (error) {
    console.error("❌ Erro ao criar Super Admin:", error);
  } finally {
    process.exit();
  }
}

createSuperAdmin();