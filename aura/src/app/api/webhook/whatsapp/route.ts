import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, contactNumber, text, direction } = body;

    // Validação básica de segurança
    if (!propertyId || !contactNumber || !text) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${contactNumber} para a propriedade ${propertyId}`);

    // 1. Referência ao documento do contacto (para a Barra Lateral do Chat)
    const contactRef = adminDb
      .collection("properties")
      .doc(propertyId)
      .collection("communications")
      .doc(contactNumber);

    // 2. Guardar a mensagem na subcoleção de histórico
    await contactRef.collection("messages").add({
      text,
      sender: direction === "inbound" ? "guest" : "hotel", // inbound = Hóspede, outbound = Hotel
      timestamp: FieldValue.serverTimestamp(),
      status: direction === "inbound" ? "delivered" : "sent"
    });

    // 3. Atualizar o último contacto na barra lateral (Last Message e Unread Count)
    await contactRef.set({
      contactNumber: contactNumber,
      lastMessage: text,
      updatedAt: FieldValue.serverTimestamp(),
      // Se a mensagem for do hóspede, incrementa o contador de não lidas. Se for do hotel, zera.
      unread: direction === "inbound" ? FieldValue.increment(1) : 0,
      // Se quiser, pode adicionar lógica para pesquisar o nome do hóspede na coleção 'guests' aqui
      name: "Hóspede " + contactNumber.slice(-4) // Nome temporário até cruzar com a base de dados
    }, { merge: true });

    return NextResponse.json({ success: true, message: "Mensagem guardada no Firestore com sucesso." });
    
  } catch (error: any) {
    console.error("❌ Erro no Webhook do WhatsApp:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}