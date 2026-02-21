import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { propertyId, number, message } = await req.json();

    if (!propertyId || !number || !message) {
      return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
    }

    // 🏗️ ARQUITETURA SAAS: 
    // No futuro, aqui você fará uma busca no banco: "Qual é a URL do Docker desta propertyId?"
    // Como estamos em ambiente local, vamos apontar direto para o nosso motor atual.
    const dockerUrl = process.env.WHATSAPP_DOCKER_URL || "http://127.0.0.1:3001";
    const apiKey = process.env.WHATSAPP_API_KEY || "sua_chave_secreta_aqui";

    console.log(`[API Next.js] Disparando mensagem para o Docker da propriedade: ${propertyId}`);

    const response = await fetch(`${dockerUrl}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ number, message })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Erro do Docker:", errorData);
      return NextResponse.json({ error: "Falha ao enviar via WhatsApp Motor" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, messageId: data.messageId });

  } catch (error: any) {
    console.error("❌ Erro interno na API de Envio:", error.message);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}