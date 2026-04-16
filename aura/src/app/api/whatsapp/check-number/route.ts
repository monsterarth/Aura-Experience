// src/app/api/whatsapp/check-number/route.ts
import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { number, propertyId } = await req.json();

    if (!number) {
      return NextResponse.json({ error: "O número é obrigatório" }, { status: 400 });
    }

    let apiUrl = process.env.EVOLUTION_API_URL;
    let apiKey = process.env.EVOLUTION_API_KEY;
    let instanceName = process.env.EVOLUTION_INSTANCE;

    if (propertyId) {
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("settings")
        .eq("id", propertyId)
        .single();

      const cfg = property?.settings?.whatsappConfig;
      if (cfg) {
        apiUrl = cfg.apiUrl || apiUrl;
        apiKey = cfg.apiKey || apiKey;
        instanceName =
          cfg.instanceName ||
          cfg.instances?.[0]?.instanceName ||
          instanceName;
      }
    }

    if (!apiUrl || !apiKey || !instanceName) {
      return NextResponse.json({ error: "Configuração da Evolution API ausente no servidor." }, { status: 500 });
    }

    const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

    const response = await fetch(`${baseUrl}/chat/whatsappNumbers/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ numbers: [number] }),
    });

    if (!response.ok) {
      throw new Error(`Evolution API respondeu com status: ${response.status}`);
    }

    const data = await response.json();
    // Evolution returns an array: [{ exists: true, jid: "...", number: "..." }]
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ exists: result?.exists ?? false });

  } catch (error: any) {
    console.error("[Check Number API] Error:", error);
    return NextResponse.json(
      { error: "Falha ao conectar com a Evolution API", details: error.message },
      { status: 500 }
    );
  }
}
