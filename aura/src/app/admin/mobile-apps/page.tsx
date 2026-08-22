"use client";

import { useRouter } from "next/navigation";
import { Smartphone, ExternalLink, ArrowRight, Key } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T, alpha } from "@/lib/admin-tokens";
import { PageShell, PageHeader, Card, Dialog, Input, Button } from "@/components/aura";

const APPS = [
  { id: "diretoria",  label: "Diretoria",          description: "Dashboard estratégico para proprietários e diretores",    color: "#9b6dff", icon: "staff" },
  { id: "governanta", label: "Governança",       description: "Gestão de quartos, tarefas e equipe de governança",   color: "#c084fc", icon: "staff" },
  { id: "maid",       label: "Camareira",        description: "App da camareira — checklist de limpeza e arrumação",  color: "#4ec9d4", icon: "staff" },
  { id: "manutencao",     label: "Manutenção — Técnico",      description: "App do técnico — receber, iniciar e finalizar OS",              color: "#f59e0b", icon: "staff" },
  { id: "manutencao-ops", label: "Manutenção — Coordenador", description: "Criar OS, atribuir técnicos e validar ordens de serviço finalizadas", color: "#fb923c", icon: "staff" },
  { id: "houseman",   label: "Mensageiro",       description: "Tarefas de áreas comuns e apoio operacional",          color: "#fb923c", icon: "staff" },
  { id: "garcom",     label: "Garçom",           description: "Pedidos de mesa, café salão e comandas",              color: "#60a5fa", icon: "staff" },
  { id: "hospede",    label: "Portal do Hóspede", description: "Visualize o portal do hóspede com um código de reserva", color: "#2dd4bf", icon: "guest" },
];

function GuestCodeDialog({ open, onConfirm, onClose }: { open: boolean; onConfirm: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: code.trim().length > 0, escape: false });
  useEffect(() => { if (open) setCode(""); }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length >= 5) onConfirm(code.trim().toUpperCase());
  };

  return (
    <Dialog open={open} onClose={requestClose} presentation="auto" size="sm" icon={Key} iconTone="green" title="Portal do Hóspede" subtitle="Digite o código de acesso da reserva" panelProps={guardProps}
      footer={<Button type="submit" form="guest-code-form" variant="primary" fullWidth iconRight={ArrowRight} disabled={code.length < 5}>Abrir preview</Button>}>
      <form id="guest-code-form" onSubmit={handleSubmit}>
        <Input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ex: A3KN7PQ2"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          style={{ textAlign: "center", fontSize: 24, fontWeight: 900, letterSpacing: ".3em", textTransform: "uppercase", height: 56 }}
        />
      </form>
    </Dialog>
  );
}

function MobileAppsContent() {
  const router = useRouter();
  const [showGuestModal, setShowGuestModal] = useState(false);

  const handleAppClick = (id: string) => {
    if (id === "hospede") setShowGuestModal(true);
    else router.push(`/admin/mobile-apps/${id}`);
  };

  const handleGuestConfirm = (code: string) => {
    setShowGuestModal(false);
    router.push(`/admin/mobile-apps/hospede?code=${code}`);
  };

  return (
    <PageShell>
      <PageHeader icon={Smartphone} title="Apps Mobile" subtitle="Visualize e teste os aplicativos móveis da equipe operacional." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 12 }}>
        {APPS.map((app) => (
          <Card key={app.id} interactive onClick={() => handleAppClick(app.id)} style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: alpha(app.color, 25) }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: alpha(app.color, 12), color: app.color }}>
              {app.icon === "guest" ? <Key size={20} /> : <Smartphone size={20} />}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{app.label}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{app.description}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, marginTop: "auto", color: app.color }}>
              <ExternalLink size={12} />
              {app.id === "hospede" ? "Inserir código" : "Abrir preview"}
            </div>
          </Card>
        ))}
      </div>

      <GuestCodeDialog open={showGuestModal} onConfirm={handleGuestConfirm} onClose={() => setShowGuestModal(false)} />
    </PageShell>
  );
}

export default function MobileAppsPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <MobileAppsContent />
    </RoleGuard>
  );
}
