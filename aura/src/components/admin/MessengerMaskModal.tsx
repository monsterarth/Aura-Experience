"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { StaffService } from "@/services/staff-service";
import { toast } from "sonner";

const COLOR_OPTIONS = [
  { key: 'yellow',  label: 'Âmbar',   swatch: 'bg-amber-400',   bubble: 'bg-amber-500 text-white' },
  { key: 'blue',    label: 'Azul',    swatch: 'bg-blue-400',    bubble: 'bg-blue-500 text-white' },
  { key: 'green',   label: 'Verde',   swatch: 'bg-emerald-400', bubble: 'bg-emerald-500 text-white' },
  { key: 'purple',  label: 'Roxo',    swatch: 'bg-violet-400',  bubble: 'bg-violet-500 text-white' },
  { key: 'rose',    label: 'Rosa',    swatch: 'bg-rose-400',    bubble: 'bg-rose-500 text-white' },
  { key: 'orange',  label: 'Laranja', swatch: 'bg-orange-400',  bubble: 'bg-orange-500 text-white' },
  { key: 'teal',    label: 'Teal',    swatch: 'bg-teal-400',    bubble: 'bg-teal-500 text-white' },
  { key: 'slate',   label: 'Padrão',  swatch: 'bg-slate-400',   bubble: 'bg-slate-600 text-white' },
] as const;

interface MessengerMaskModalProps {
  onClose: () => void;
  onSave: (name: string, color: string) => void;
}

export function MessengerMaskModal({ onClose, onSave }: MessengerMaskModalProps) {
  const { userData } = useAuth();
  const [messengerName, setMessengerName] = useState(userData?.messengerName ?? '');
  const [messengerColor, setMessengerColor] = useState(userData?.messengerColor ?? 'slate');
  const [loading, setLoading] = useState(false);

  const selectedColor = COLOR_OPTIONS.find(c => c.key === messengerColor) ?? COLOR_OPTIONS[7];

  const handleSave = async () => {
    if (!userData) return;
    setLoading(true);
    try {
      await StaffService.updateStaff(userData.id, {
        messengerName: messengerName.trim(),
        messengerColor,
      });
      toast.success('Máscara atualizada com sucesso!');
      onSave(messengerName.trim(), messengerColor);
      onClose();
    } catch {
      toast.error('Erro ao salvar máscara.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold">Minha Máscara de Mensageiro</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="field-label">Nome de exibição</label>
            <input
              type="text"
              value={messengerName}
              onChange={e => setMessengerName(e.target.value)}
              placeholder="Ex: Arthur P"
              className="field-input"
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">
              Aparecerá como prefixo em negrito antes de cada mensagem enviada.
            </p>
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <label className="field-label">Cor do tema</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color.key}
                  title={color.label}
                  onClick={() => setMessengerColor(color.key)}
                  className={`w-9 h-9 rounded-full transition-all ring-2 ring-offset-2 ring-offset-card ${
                    color.swatch
                  } ${
                    messengerColor === color.key
                      ? 'ring-foreground scale-110 shadow-md'
                      : 'ring-transparent hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-2">
            <label className="field-label">Prévia</label>
            <div className="flex justify-end">
              <div className={`${selectedColor.bubble} rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-sm text-sm`}>
                <span className="font-bold">{messengerName.trim() || 'Você'}:</span>{' '}
                <span className="opacity-80">sua mensagem aqui...</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              formato WhatsApp: <code className="font-mono">*{messengerName.trim() || 'Você'}:*</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Máscara
          </Button>
        </div>
      </div>
    </div>
  );
}
