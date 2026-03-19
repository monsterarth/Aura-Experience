import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request): Promise<NextResponse> {
    // Auth: qualquer staff autenticado pode fazer upload
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        // Validação de tamanho
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'Arquivo excede o limite de 5MB.' }, { status: 400 });
        }

        // Validação de tipo MIME
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: `Tipo de arquivo não permitido: ${file.type}. Apenas imagens são aceitas.` },
                { status: 400 }
            );
        }

        // Rejeitar extensões perigosas (defesa em profundidade)
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const DANGEROUS_EXTENSIONS = ['exe', 'js', 'html', 'htm', 'php', 'sh', 'bat', 'cmd', 'ps1', 'msi'];
        if (DANGEROUS_EXTENSIONS.includes(ext)) {
            return NextResponse.json({ error: 'Extensão de arquivo não permitida.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = file.name;

        // Generate a unique path to avoid collisions
        const uniqueFilename = `${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
        const filePath = `public/${uniqueFilename}`;

        // Uses the admin service role to bypass RLS bucket restrictions for server uploads
        const { data, error } = await supabaseAdmin.storage
            .from('images')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('images')
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrl, pathname: filePath });
    } catch (error) {
        console.error('Error uploading to Supabase Storage:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
