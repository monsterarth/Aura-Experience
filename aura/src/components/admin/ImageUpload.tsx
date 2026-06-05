import React, { useState, useRef } from 'react';
import { Camera, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';

interface ImageUploadProps {
    value?: string;
    onUploadSuccess: (url: string) => void;
    className?: string;
    path?: string;
    stayId?: string;
    accessCode?: string;
    /** Limite de tamanho em MB (padrão 5). */
    maxSizeMb?: number;
    /**
     * Upload direto navegador → Supabase Storage via URL assinada.
     * Use para arquivos grandes (ex.: imagem do mapa em alta resolução) que
     * ultrapassam o limite de ~4.5MB de corpo das serverless functions da Vercel.
     */
    direct?: boolean;
}

export function ImageUpload({ value, onUploadSuccess, className = '', path = 'profiles', stayId, accessCode, maxSizeMb = 5, direct = false }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate type and size
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor, selecione uma imagem válida.');
            return;
        }
        if (file.size > maxSizeMb * 1024 * 1024) {
            toast.error(`A imagem excede o limite de ${maxSizeMb}MB.`);
            return;
        }

        setIsUploading(true);

        try {
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
                const { error } = await sb.storage
                    .from('images')
                    .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
                if (error) throw error;

                onUploadSuccess(publicUrl);
                toast.success('Imagem enviada com sucesso!');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);
            if (stayId) formData.append('stayId', stayId);
            if (accessCode) formData.append('accessCode', accessCode);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Falha no upload da imagem.');
            }

            const result = await response.json();
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

            {value ? (
                <>
                    <img src={value} alt="Preview" className="w-full h-full object-cover" />
                    <div
                        className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {isUploading ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Camera className="w-8 h-8 text-white" />}
                    </div>
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
