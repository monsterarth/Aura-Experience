// src/app/api/whatsapp/check-number/route.ts
import { NextResponse } from 'next/server';

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'http://localhost:3001';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || 'Fazenda@2025';

export async function POST(req: Request) {
  try {
    const { number } = await req.json();

    if (!number) {
      return NextResponse.json({ error: 'O número é obrigatório' }, { status: 400 });
    }

    const response = await fetch(`${WHATSAPP_API_URL}/api/check-number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': WHATSAPP_API_KEY,
      },
      body: JSON.stringify({ number }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API respondeu com status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('[WhatsApp Check Number API] Error:', error);
    return NextResponse.json(
      { error: 'Falha ao conectar com o serviço WhatsApp', details: error.message },
      { status: 500 }
    );
  }
}