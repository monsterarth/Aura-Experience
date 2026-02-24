import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  let requestBody;
  
  try {
    requestBody = await req.json();
    const { propertyId, messageId, number, message } = requestBody;

    if (!propertyId || !messageId || !number || !message) {
      return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
    }

    const dockerUrl = process.env.WHATSAPP_DOCKER_URL || "http://187.77.57.154:3001";
    const apiKey = process.env.WHATSAPP_API_KEY || "Fazenda@2025";

    // UNIFICADO: Aponta diretamente para a raiz (messages)
    const messageRef = adminDb
      .collection("properties")
      .doc(propertyId)
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
      await messageRef.update({ 
        status: "failed",
        errorMessage: errorData.error || "Falha na comunicação com a API do WhatsApp"
      });
      return NextResponse.json({ error: "Falha ao enviar via WhatsApp Motor" }, { status: response.status });
    }

    const data = await response.json();
    
    await messageRef.update({ 
      status: "sent",
      messageIdApi: data.messageId 
    });

    return NextResponse.json({ success: true, messageId: data.messageId });

  } catch (error: any) {
    if (requestBody && requestBody.propertyId && requestBody.messageId) {
      try {
        await adminDb
          .collection("properties")
          .doc(requestBody.propertyId)
          .collection("messages")
          .doc(requestBody.messageId)
          .update({ status: "failed", errorMessage: "Servidor offline (Timeout)" });
      } catch (updateError) {
        console.error("Falha ao atualizar fallback de erro");
      }
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}