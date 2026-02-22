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

    // Referência direta à RAIZ de mensagens da propriedade
    const messagesRef = adminDb.collection("properties").doc(propertyId).collection("messages");

    // ==========================================
    // 🛡️ BARREIRA ANTI-ECO (DESDUPLICAÇÃO)
    // ==========================================
    if (direction === "outbound") {
      const recentMessages = await messagesRef
        .where("contactId", "==", contactNumber)
        .where("direction", "==", "outbound")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!recentMessages.empty) {
        const lastMsg = recentMessages.docs[0].data();
        
        // Compara com 'body' que é o padrão do nosso novo CRM
        if (lastMsg.body === text) {
          let isRecent = false;
          if (lastMsg.createdAt) {
            const msgTime = lastMsg.createdAt.toDate();
            const diffSeconds = (Date.now() - msgTime.getTime()) / 1000;
            if (diffSeconds < 30) isRecent = true;
          } else {
            isRecent = true;
          }

          if (isRecent) {
            console.log(`♻️ [WEBHOOK] Eco de API identificado e bloqueado para ${contactNumber}.`);
            return NextResponse.json({ success: true, message: "Eco do sistema ignorado com sucesso." });
          }
        }
      }
    }
    // ==========================================

    // 1. Guardar a mensagem na RAIZ exatamente como o CRM lê
    const newMsgRef = messageId ? messagesRef.doc(messageId) : messagesRef.doc();
    
    await newMsgRef.set({
      id: newMsgRef.id,
      propertyId,
      contactId: contactNumber,
      to: direction === "outbound" ? contactNumber : propertyId,
      from: direction === "inbound" ? contactNumber : propertyId,
      body: text, // CRM usa 'body' em vez de 'text'
      direction: direction === "inbound" ? "inbound" : "outbound", // CRM usa 'direction'
      isAutomated: false,
      status: direction === "inbound" ? "delivered" : "sent",
      createdAt: FieldValue.serverTimestamp(), // CRM usa 'createdAt'
      ...(messageId && { messageIdApi: messageId })
    }, { merge: true });

    // 2. Atualizar a Barra Lateral (Pasta 'communications' dita a ordem da lista)
    const communicationRef = adminDb.collection("properties").doc(propertyId).collection("communications").doc(contactNumber);
    await communicationRef.set({
      lastMessage: text,
      updatedAt: FieldValue.serverTimestamp(),
      unread: direction === "inbound" ? FieldValue.increment(1) : 0,
    }, { merge: true });

    // 3. (Opcional) Garantir que existe na Agenda, se for um número novo que mandou mensagem
    const contactRef = adminDb.collection("properties").doc(propertyId).collection("contacts").doc(contactNumber);
    const contactSnap = await contactRef.get();
    if (!contactSnap.exists) {
        await contactRef.set({
            id: contactNumber,
            name: "+" + contactNumber,
            phone: contactNumber,
            isGuest: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    return NextResponse.json({ success: true, message: "Mensagem guardada no Firestore com sucesso." });
    
  } catch (error: any) {
    console.error("❌ Erro no Webhook do WhatsApp:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}