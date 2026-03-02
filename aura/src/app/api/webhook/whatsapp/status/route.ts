import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, messageId, type, ack, reaction } = body;

    if (!propertyId || !messageId || !type) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    let { data: msgDoc } = await supabaseAdmin.from('messages').select('id').eq('propertyId', propertyId).eq('id', messageId).single();

    if (!msgDoc) {
      const { data: qSnap } = await supabaseAdmin.from('messages').select('id').eq('propertyId', propertyId).eq('messageIdApi', messageId).single();
      if (qSnap) {
        msgDoc = qSnap;
      } else {
        return NextResponse.json({ error: "Mensagem não encontrada no banco." }, { status: 404 });
      }
    }

    // Aplica a atualização cirúrgica
    if (type === "ack") {
      // 1=Enviado, 2=Entregue, 3=Lido, 4=Áudio Reproduzido
      await supabaseAdmin.from('messages').update({ statusApi: ack }).eq('id', msgDoc.id);
    } else if (type === "reaction") {
      await supabaseAdmin.from('messages').update({ reaction: reaction }).eq('id', msgDoc.id);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Erro no Webhook de Status:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}