import { CommunicationCenter } from "@/components/admin/CommunicationCenter"; // ajuste o caminho se necessário

export default function PaginaDeComunicacao() {
  return (
    <main className="p-6 flex flex-col gap-6 h-screen">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comunicação</h1>
        <p className="text-muted-foreground">
          Gerencie o atendimento no WhatsApp diretamente pela plataforma.
        </p>
      </div>

      {/* O Componente do Chat */}
      <CommunicationCenter propertyId="fazenda-modelo-aura" />
    </main>
  );
}