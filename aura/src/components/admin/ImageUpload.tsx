import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { compressImage } from '@/lib/image-compress';
import { UPLOAD_CACHE_CONTROL } from '@/lib/upload-cache';

interface ImageUploadProps {
    value?: string;
    onUploadSuccess: (url: string) => void;
    className?: string;
    path?: string;
    stayId?: string;
    accessCode?: string;
    /**
     * Código da plaqueta de patrimônio (publicCode). Autoriza o upload sem sessão
     * para quem está com o QR na frente do equipamento. Incompatível com `direct`
     * — a rota de URL assinada exige sessão.
     */
    assetCode?: string;
    /** Limite de tamanho em MB (padrão 5). */
    maxSizeMb?: number;
    /**
     * Como a prévia preenche a caixa. 'cover' (padrão) corta para preencher —
     * certo para foto. 'contain' mostra a imagem inteira — obrigatório para
     * LOGO, senão a marca aparece cortada e parece que o upload deu errado.
     */
    fit?: 'cover' | 'contain';
    /**
     * Upload direto navegador → Supabase Storage via URL assinada.
     * Use para arquivos grandes (ex.: imagem do mapa em alta resolução) que
     * ultrapassam o limite de ~4.5MB de corpo das serverless functions da Vercel.
     */
    direct?: boolean;
    /**
     * Lado maior máximo após a compressão (padrão 1920px). Suba só onde a
     * resolução extra é funcional — ex.: o mapa do resort, que tem zoom.
     */
    compressMaxDim?: number;
    /**
     * Não baixa a imagem atual até a pessoa pedir — mostra um "Ver foto" no lugar
     * da prévia. Use só onde o acervo antigo é pesado (patrimônio: até 21MB por
     * ativo, e o lote de ago/2026 não entra em cache nenhum). Pode sair quando
     * esse acervo for recomprimido.
     */
    deferPreview?: boolean;
}

export function ImageUpload({ value, onUploadSuccess, className = '', path = 'profiles', stayId, accessCode, assetCode, maxSizeMb = 5, fit = 'cover', direct = false, compressMaxDim, deferPreview = false }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Com deferPreview, o <img> só entra no DOM depois do clique — é o que evita
    // o download. Uma imagem recém-enviada já está no navegador, então mostrar
    // não custa nada e a pessoa precisa ver o que acabou de subir.
    const showImage = !!value && (!deferPreview || previewOpen);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const original = event.target.files?.[0];
        if (!original) return;

        if (!original.type.startsWith('image/')) {
            toast.error('Por favor, selecione uma imagem válida.');
            return;
        }
        // Trava só o absurdo ANTES de comprimir: o limite de verdade (maxSizeMb)
        // é aplicado ao arquivo comprimido — uma foto de celular de 12MB vira
        // ~400KB e tem que passar.
        if (original.size > 40 * 1024 * 1024) {
            toast.error('A imagem excede o limite de 40MB.');
            return;
        }

        setIsUploading(true);

        try {
            // Compressão no navegador (1920px/WebP por padrão) — motivo: fotos de
            // câmera cruas estouraram o egress do Supabase em ago/2026.
            const file = await compressImage(original, { maxDim: compressMaxDim });

            if (file.size > maxSizeMb * 1024 * 1024) {
                toast.error(`A imagem excede o limite de ${maxSizeMb}MB mesmo comprimida.`);
                return;
            }
            if (direct) {
                // 1) Autoriza e gera URL assinada (não trafega o arquivo pela função)
                const signRes = await fetch('/api/upload/signed-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: file.name, contentType: file.type }),
                });
                if (!signRes.ok) {
                    const e = await signRes.json().catch(() => ({}));
                    throw new Error(e.error || 'Falha ao autorizar o upload.');
                }
                const { token, path: storagePath, publicUrl } = await signRes.json();

                // 2) Envia o arquivo direto ao bucket usando o token assinado
                const sb = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    { auth: { persistSession: false, autoRefreshToken: false } },
                );
                // cacheControl é OBRIGATÓRIO aqui: diferente do upload() multipart,
                // o uploadToSignedUrl não tem padrão — sem ele o header sai como
                // `max-age=undefined`, que é inválido, e o objeto deixa de entrar
                // no CDN (CF-Cache-Status: MISS) e no cache do navegador. Foi assim
                // que 407MB de fotos de patrimônio passaram a ser rebaixadas
                // inteiras a cada abertura de ficha em ago/2026.
                const { error } = await sb.storage
                    .from('images')
                    .uploadToSignedUrl(storagePath, token, file, {
                        contentType: file.type,
                        cacheControl: UPLOAD_CACHE_CONTROL,
                    });
                if (error) throw error;

                setPreviewOpen(true);
                onUploadSuccess(publicUrl);
                toast.success('Imagem enviada com sucesso!');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);
            if (stayId) formData.append('stayId', stayId);
            if (accessCode) formData.append('accessCode', accessCode);
            if (assetCode) formData.append('assetCode', assetCode);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Falha no upload da imagem.');
            }

            const result = await response.json();
            setPreviewOpen(true);
            onUploadSuccess(result.url);
            toast.success('Imagem enviada com sucesso!');
        } catch (error: any) {
            toast.error(error.message || 'Erro ao processar imagem.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = ''; // Reset input
            }
        }
    };

    return (
        <div className={`relative w-full h-full flex items-center justify-center bg-muted/20 ${className}`}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />

            {showImage ? (
                <>
                    <img src={value} alt="Preview" className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                    <div
                        className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {isUploading ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Camera className="w-8 h-8 text-white" />}
                    </div>
                </>
            ) : value ? (
                <>
                    <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors w-full h-full"
                        title="A foto é pesada — carrega só quando você pede"
                    >
                        <ImageIcon className="w-7 h-7" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Ver foto</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Trocar imagem"
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer w-full h-full"
                >
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                        <>
                            <UploadCloud className="w-8 h-8 mb-2" />
                            <span className="text-xs font-semibold">Carregar Imagem</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
