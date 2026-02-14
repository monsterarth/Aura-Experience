// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

/**
 * Inicializa o Firebase Admin SDK usando as variáveis de ambiente.
 * O replace(/\\n/g, '\n') é necessário para tratar as quebras de linha da chave privada.
 */
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log("[Aura Admin] SDK Inicializado com sucesso.");
  } catch (error) {
    console.error("[Aura Admin] Erro ao inicializar SDK:", error);
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };