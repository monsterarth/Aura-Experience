// src/app/api/upload/signed-url/route.ts
// Gera uma URL assinada para upload DIRETO do navegador → Supabase Storage.
// Necessário para arquivos grandes (ex.: imagem do mapa do resort em alta
// resolução), que não passam pelo limite de ~4.5MB de corpo das serverless
// functions da Vercel. O arquivo vai do browser direto ao bucket; aqui só
// autorizamos e devolvemos o token + a URL pública final.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Apenas equipe autenticada (este fluxo é usado no admin)
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { filename, contentType } = body as { filename?: string; contentType?: string };

    if (!filename || !contentType) {
        return NextResponse.json({ error: 'filename e contentType são obrigatórios.' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
        return NextResponse.json({ error: `Tipo de arquivo não permitido: ${contentType}.` }, { status: 400 });
    }

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const DANGEROUS_EXTENSIONS = ['exe', 'js', 'html', 'htm', 'php', 'sh', 'bat', 'cmd', 'ps1', 'msi'];
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
        return NextResponse.json({ error: 'Extensão de arquivo não permitida.' }, { status: 400 });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filePath = `public/${crypto.randomUUID()}-${safeName}`;

    const { data, error } = await supabaseAdmin.storage
        .from('images')
        .createSignedUploadUrl(filePath);

    if (error || !data) {
        return NextResponse.json({ error: error?.message || 'Falha ao gerar URL.' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from('images').getPublicUrl(filePath);

    return NextResponse.json({ token: data.token, path: data.path, publicUrl });
}
