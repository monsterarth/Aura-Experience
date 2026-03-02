//src\app\api\chat\send\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
      await supabaseAdmin.from("messages").update({
        status: "failed",
        errorMessage: errorData.error || "Falha na comunicação com a API do WhatsApp"
      }).eq('id', messageId);
      return NextResponse.json({ error: "Falha ao enviar via WhatsApp Motor" }, { status: response.status });
    }

    const data = await response.json();

    await supabaseAdmin.from("messages").update({
      status: "sent",
      messageIdApi: data.messageId
    }).eq('id', messageId);

    return NextResponse.json({ success: true, messageId: data.messageId });

  } catch (error: any) {
    if (requestBody && requestBody.propertyId && requestBody.messageId) {
      try {
        await supabaseAdmin.from('messages').update({ status: "failed", errorMessage: "Servidor offline (Timeout)" }).eq('id', requestBody.messageId);
      } catch (updateError) {
        console.error("Falha ao atualizar fallback de erro");
      }
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}