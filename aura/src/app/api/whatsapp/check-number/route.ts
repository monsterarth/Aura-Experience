// src/app/api/whatsapp/check-number/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { number, propertyId } = await req.json();

    if (!number) {
      return NextResponse.json({ error: 'O número é obrigatório' }, { status: 400 });
    }

    // Buscar URL do WhatsApp da propriedade
    let whatsappApiUrl = process.env.WHATSAPP_API_URL;
    let whatsappApiKey = process.env.WHATSAPP_API_KEY;

    if (propertyId) {
      const { data: property } = await supabaseAdmin
        .from('properties')
        .select('settings')
        .eq('id', propertyId)
        .single();

      whatsappApiUrl = property?.settings?.whatsappConfig?.apiUrl || whatsappApiUrl;
      whatsappApiKey = property?.settings?.whatsappConfig?.apiKey || whatsappApiKey;
    }

    if (!whatsappApiUrl || !whatsappApiKey) {
      return NextResponse.json({ error: 'Configuração do WhatsApp ausente no servidor.' }, { status: 500 });
    }

    const response = await fetch(`${whatsappApiUrl}/api/check-number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': whatsappApiKey,
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