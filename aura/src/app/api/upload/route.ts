import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { clientIp, isRateLimited, logAttempt } from '@/lib/login-attempts';
import { UPLOAD_CACHE_CONTROL } from '@/lib/upload-cache';

const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf', // notas fiscais / documentos de patrimônio
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const WEDDING_RATE_MAX = 10;      // tentativas de código do casal por IP/15min
const WEDDING_FAIL_DELAY_MS = 1500;

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const stayId = formData.get('stayId') as string;
        const accessCode = formData.get('accessCode') as string;
        const assetCode = formData.get('assetCode') as string;
        const weddingCode = formData.get('weddingCode') as string;

        // Auth authorization
        let isAuthorized = false;
        let imagesOnly = false;
        const auth = await requireAuth();

        if (!isAuthError(auth)) {
            isAuthorized = true; // Equipe autenticada
        } else if (weddingCode && /^\d{6}$/.test(weddingCode)) {
            // Site dos noivos: só o código do CASAL (coupleCode) autoriza — é a
            // credencial do painel de personalização. Convidado (guestCode) não
            // sobe nada. Site precisa estar no ar e o casamento confirmado.
            //
            // Mesmo estrangulamento das outras superfícies do site (o código de
            // 6 dígitos é enumerável): rate-limit por IP + delay no erro, senão
            // este branch vira oráculo grátis de enumeração do coupleCode.
            const ip = clientIp(request.headers);
            if (await isRateLimited(ip, WEDDING_RATE_MAX)) {
                return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
            }
            const { data: weddingCheck } = await supabaseAdmin
                .from('weddings')
                .select('id')
                .eq('coupleCode', weddingCode)
                .eq('siteEnabled', true)
                .eq('status', 'confirmed')
                .maybeSingle();

            if (weddingCheck) {
                isAuthorized = true; imagesOnly = true;
            } else {
                await logAttempt(ip, false);
                await new Promise((r) => setTimeout(r, WEDDING_FAIL_DELAY_MS));
                return NextResponse.json({ error: 'Não autorizado. Acesso negado para upload.' }, { status: 401 });
            }
        } else if (stayId && accessCode) {
            // Verifica se o hóspede tem uma hospedagem válida para autorizar o upload de fotos do relato
            const { data: stayCheck } = await supabaseAdmin
                .from('stays')
                .select('id')
                .eq('id', stayId)
                .eq('accessCode', accessCode)
                .single();

            if (stayCheck) isAuthorized = true;
        } else if (assetCode) {
            // Plaqueta de patrimônio: quem está com o QR na frente do equipamento
            // pode anexar a foto do defeito. O código é a única credencial, e só
            // habilita upload — nenhuma leitura de dado do ativo acontece aqui.
            const { data: assetCheck } = await supabaseAdmin
                .from('assets')
                .select('id')
                .eq('publicCode', assetCode.toUpperCase())
                .maybeSingle();

            if (assetCheck) isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Não autorizado. Acesso negado para upload.' }, { status: 401 });
        }

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

        // O painel dos noivos só sobe FOTO raster. SVG fica de fora: é servido
        // do bucket público com o content-type do cliente e executaria script
        // se aberto direto (XSS armazenado numa credencial anônima).
        if (imagesOnly && (!file.type.startsWith('image/') || file.type === 'image/svg+xml')) {
            return NextResponse.json({ error: 'Apenas imagens (JPG, PNG, WebP) são aceitas.' }, { status: 400 });
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
                cacheControl: UPLOAD_CACHE_CONTROL,
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
