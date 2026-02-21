// src/app/api/chat/send/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  let requestBody;
  
  try {
    requestBody = await req.json();
    const { propertyId, contactId, messageId, number, message } = requestBody;

    if (!propertyId || !contactId || !messageId || !number || !message) {
      return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
    }

    const dockerUrl = process.env.WHATSAPP_DOCKER_URL || "http://127.0.0.1:3001";
    const apiKey = process.env.WHATSAPP_API_KEY || "sua_chave_secreta_aqui";

    console.log(`[API Next.js] Disparando mensagem ${messageId} para o Docker da propriedade: ${propertyId}`);

    // Referência segura do documento via Server-Side Admin SDK
    const messageRef = adminDb
      .collection("properties")
      .doc(propertyId)
      .collection("communications")
      .doc(contactId)
      .collection("messages")
      .doc(messageId);

    const response = await fetch(`${dockerUrl}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ number, message })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Erro desconhecido no Docker" }));
      console.error("❌ Erro do Docker:", errorData);
      
      // Docker respondeu, mas com erro (ex: número inválido)
      await messageRef.update({ 
        status: "failed",
        errorMessage: errorData.error || "Falha na comunicação com a API do WhatsApp"
      });

      return NextResponse.json({ error: "Falha ao enviar via WhatsApp Motor" }, { status: response.status });
    }

    const data = await response.json();
    
    // Sucesso absoluto! O Docker confirmou o envio.
    await messageRef.update({ 
      status: "sent",
      messageIdApi: data.messageId // Guardamos a referência oficial da Meta
    });

    return NextResponse.json({ success: true, messageId: data.messageId });

  } catch (error: any) {
    console.error("❌ Erro interno na API de Envio:", error.message);
    
    // Fallback: Se o fetch() falhar totalmente (ex: Docker offline / Timeout)
    if (requestBody && requestBody.propertyId && requestBody.contactId && requestBody.messageId) {
      try {
        await adminDb
          .collection("properties")
          .doc(requestBody.propertyId)
          .collection("communications")
          .doc(requestBody.contactId)
          .collection("messages")
          .doc(requestBody.messageId)
          .update({ 
            status: "failed", 
            errorMessage: "Servidor de comunicação offline (Timeout)" 
          });
      } catch (updateError) {
        console.error("Falha ao atualizar fallback de erro:", updateError);
      }
    }

    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}