"use client";

import { useState } from "react";
// Ajuste o caminho do import da action se for diferente no seu projeto
import { scheduleWhatsAppMessage } from "@/actions/whatsapp-actions"; 
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Removi o guestNumber das props, pois vamos fixar no código como você pediu
export function TestWhatsAppButton({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    
    const msg = `🚀 Olá! O seu pré check-in no Aura Experience foi confirmado. Seu código de acesso é: 1A2B3. Teste para o número final 6590!`;
    const numeroTeste = "553191096590"; // O número que você pediu para testar

    try {
      const res = await scheduleWhatsAppMessage({
        propertyId,
        to: numeroTeste,
        body: msg,
      });

      if (res.success) {
        toast.success("Mensagem salva na fila com sucesso!");
        console.log("Job ID criado:", res.jobId);
      } else {
        toast.error("Falha ao enfileirar: " + res.error);
      }
    } catch (error) {
      toast.error("Erro interno ao chamar o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm my-4 flex flex-col items-start gap-4">
      <div>
        <h3 className="text-lg font-semibold">Painel de Teste de Comunicação</h3>
        <p className="text-sm text-muted-foreground">
          Enviando para o número fixo: <strong>5531991096590</strong>
        </p>
      </div>
      <Button 
        onClick={handleSend} 
        disabled={loading} 
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        {loading ? "Processando..." : "Testar Disparo WhatsApp"}
      </Button>
    </div>
  );
}
