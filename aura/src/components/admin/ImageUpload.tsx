import React, { useState, useRef } from 'react';
import { Camera, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

interface ImageUploadProps {
    value?: string;
    onUploadSuccess: (url: string) => void;
    className?: string;
}

export function ImageUpload({ value, onUploadSuccess, className = '' }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate type and size (max 5MB)
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor, selecione uma imagem válida.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('A imagem excede o limite de 5MB.');
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'profiles');

        try {
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
