import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, contactNumber, text, direction, messageId } = body;

    // Validação básica de segurança
    if (!propertyId || !contactNumber || !text) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${contactNumber} para a propriedade ${propertyId} | Direção: ${direction}`);

    // 1. Referência ao documento do contacto
    const contactRef = adminDb
      .collection("properties")
      .doc(propertyId)
      .collection("communications")
      .doc(contactNumber);

// ==========================================
    // 🛡️ BARREIRA ANTI-ECO (DESDUPLICAÇÃO OTIMIZADA COM ÍNDICE)
    // ==========================================
    if (direction === "outbound") {
      const recentMessages = await contactRef
        .collection("messages")
        .where("sender", "==", "hotel")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (!recentMessages.empty) {
        const lastMsg = recentMessages.docs[0].data();
        
        if (lastMsg.text === text) {
          // Checa se a mensagem original foi escrita há menos de 30 segundos
          let isRecent = false;
          if (lastMsg.timestamp) {
            const msgTime = lastMsg.timestamp.toDate();
            const diffSeconds = (Date.now() - msgTime.getTime()) / 1000;
            if (diffSeconds < 30) isRecent = true;
          } else {
            // Se o timestamp for null (ainda está pendente de gravação no server)
            isRecent = true;
          }

          if (isRecent) {
            console.log(`♻️ [WEBHOOK] Eco de API identificado e bloqueado para ${contactNumber}. O ecrã já está atualizado.`);
            return NextResponse.json({ success: true, message: "Eco do sistema ignorado com sucesso." });
          }
        }
      }
    }
    // ==========================================

    // 2. Guardar a mensagem na subcoleção de histórico
    // Agora as mensagens do telemóvel físico vão passar por aqui perfeitamente
    await contactRef.collection("messages").add({
      text,
      sender: direction === "inbound" ? "guest" : "hotel",
      timestamp: FieldValue.serverTimestamp(),
      status: direction === "inbound" ? "delivered" : "sent",
      ...(messageId && { messageIdApi: messageId })
    });

    // 3. Atualizar o último contacto na barra lateral
    await contactRef.set({
      contactNumber: contactNumber,
      lastMessage: text,
      updatedAt: FieldValue.serverTimestamp(),
      // Zera o contador se a equipa responder pelo telemóvel físico
      unread: direction === "inbound" ? FieldValue.increment(1) : 0,
      name: "Hóspede " + contactNumber.slice(-4) 
    }, { merge: true });

    return NextResponse.json({ success: true, message: "Mensagem guardada no Firestore com sucesso." });
    
  } catch (error: any) {
    console.error("❌ Erro no Webhook do WhatsApp:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}