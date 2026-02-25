import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, messageId, type, ack, reaction } = body;

    if (!propertyId || !messageId || !type) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    const messagesRef = adminDb.collection("properties").doc(propertyId).collection("messages");

    // Busca a mensagem (tanto as que chegaram de fora, quanto as que nós enviamos por API)
    let msgDoc = await messagesRef.doc(messageId).get();
    
    if (!msgDoc.exists) {
      const querySnap = await messagesRef.where("messageIdApi", "==", messageId).limit(1).get();
      if (!querySnap.empty) {
        msgDoc = querySnap.docs[0];
      } else {
        return NextResponse.json({ error: "Mensagem não encontrada no banco." }, { status: 404 });
      }
    }

    // Aplica a atualização cirúrgica
    if (type === "ack") {
      // 1=Enviado, 2=Entregue, 3=Lido, 4=Áudio Reproduzido
      await msgDoc.ref.update({ statusApi: ack });
    } else if (type === "reaction") {
      await msgDoc.ref.update({ reaction: reaction });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Erro no Webhook de Status:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}