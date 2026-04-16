// src/app/api/chatwoot/sso/route.ts
// Gera um magic link HMAC para autenticar o staff no Chatwoot via SSO.
// O link expira em 60 segundos e redireciona direto para o Chatwoot logado.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const ssoSecret = process.env.CHATWOOT_SSO_SECRET;
  const chatwootUrl = process.env.CHATWOOT_URL;

  if (!ssoSecret || !chatwootUrl) {
    return NextResponse.json(
      { error: "Chatwoot SSO não configurado no servidor." },
      { status: 500 }
    );
  }

  const email = auth.email;
  const expiresAt = Math.floor(Date.now() / 1000) + 60; // 60s expiry

  const data = `${email}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", ssoSecret)
    .update(data)
    .digest("hex");

  const url = `${chatwootUrl}/custom_sso_login?email=${encodeURIComponent(email)}&expires_at=${expiresAt}&signature=${signature}`;

  return NextResponse.json({ url });
}
