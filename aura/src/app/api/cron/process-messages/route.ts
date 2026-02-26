import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collectionGroup, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc, query, where, Timestamp } from "firebase/firestore";
import { WhatsAppMessage } from "@/types/aura";

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Permite 60s de execução na Vercel

// Função utilitária para fazer o código "dormir" (Delay)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1); // Margem de segurança
    const timeLimit = Timestamp.fromDate(now);

    const queueQuery = query(
      collectionGroup(db, "messages"),
      where("status", "==", "pending"),
      where("scheduledFor", "<=", timeLimit)
    );
    
    const snapshot = await getDocs(queueQuery);
    
    if (snapshot.empty) {
      return NextResponse.json({ success: true, processed: 0, message: "Fila vazia. Nenhuma ação necessária." });
    }

    let successCount = 0;
    let failCount = 0;

    // PROTEÇÃO ANTI-SPAM E ANTI-TIMEOUT: Pegamos no máximo 15 mensagens por vez
    // Se a fila tiver 50, ele processa 15 agora, e daqui a 5 min o Cron processa mais 15.
    const docsToProcess = snapshot.docs.slice(0, 15);

    for (const msgDoc of docsToProcess) {
      const msg = { id: msgDoc.id, ...msgDoc.data() } as WhatsAppMessage;
      const messageRef = msgDoc.ref; 

      await updateDoc(messageRef, { status: 'processing' });

      try {
        const propertyDoc = await getDoc(doc(db, "properties", msg.propertyId));
        if (!propertyDoc.exists()) throw new Error("Propriedade não encontrada");
        
        const propertySettings = propertyDoc.data()?.settings;
        if (!propertySettings?.whatsappEnabled || !propertySettings?.whatsappConfig?.apiUrl) {
          throw new Error("WhatsApp não configurado ou desligado na propriedade.");
        }

        const { apiUrl, token } = propertySettings.whatsappConfig;
        const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

        const response = await fetch(`${baseUrl}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': token 
          },
          body: JSON.stringify({
            number: msg.to,
            message: msg.body
          })
        });

if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = "Erro na API do WhatsApp Docker";
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch (e) {
            errorMessage = errorText; 
          }
          throw new Error(errorMessage);
        }

        // 🔥 A MÁGICA DA DESDUPLICAÇÃO:
        const responseData = await response.json();
        const metaMessageId = responseData.messageId;
        if (metaMessageId) {
          const finalMessageRef = doc(db, "properties", msg.propertyId, "messages", metaMessageId);
          await setDoc(finalMessageRef, {
            ...msg,
            id: metaMessageId,
            status: 'sent',
            attempts: msg.attempts + 1,
            lastAttemptAt: Timestamp.now(),
            errorMessage: null
          });
          await deleteDoc(messageRef);
        } else {
          // Fallback caso a API não retorne o ID
          await updateDoc(messageRef, {
            status: 'sent',
            attempts: msg.attempts + 1,
            lastAttemptAt: Timestamp.now(),
            errorMessage: null
          });
        }
        
        successCount++;

        // PROTEÇÃO ANTI-SPAM (A MÁGICA ACONTECE AQUI)
        // Faz o sistema pausar entre 2 e 4 segundos de forma aleatória antes de ir para a próxima mensagem
        const humanDelay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
        await sleep(humanDelay);

      } catch (error: any) {
        console.error(`Erro ao enviar mensagem ${msg.id}:`, error.message);
        const nextAttempts = msg.attempts + 1;
        
        if (nextAttempts >= 3) {
          await updateDoc(messageRef, {
            status: 'failed',
            attempts: nextAttempts,
            lastAttemptAt: Timestamp.now(),
            errorMessage: error.message || "Erro desconhecido"
          });
        } else {
          const retryTime = new Date();
          retryTime.setMinutes(retryTime.getMinutes() + 5); 
          
          await updateDoc(messageRef, {
            status: 'pending',
            attempts: nextAttempts,
            scheduledFor: Timestamp.fromDate(retryTime),
            lastAttemptAt: Timestamp.now(),
            errorMessage: `Falha na tentativa ${nextAttempts}: ${error.message}`
          });
        }
        failCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: docsToProcess.length,
      leftInQueue: snapshot.size - docsToProcess.length, // Diz quantas ficaram de fora para a próxima rodada
      results: { sent: successCount, delayed_or_failed: failCount }
    });

  } catch (error: any) {
    console.error("Erro no Processador da Fila (Cron):", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}