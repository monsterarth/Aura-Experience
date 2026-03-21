"use client";

import { useEffect, useState } from "react";
import { Contact } from "@/types/aura";
import { ContactService } from "@/services/contact-service";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Search, Trash2, Pencil, X, Save, Phone,
  Loader2, MessageCircle, ExternalLink, UserCheck, Tag
} from "lucide-react";
import { useRouter } from "next/navigation";

interface ContactsPanelProps {
  propertyId: string;
}

export function ContactsPanel({ propertyId }: ContactsPanelProps) {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<'all' | 'guests' | 'others'>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchContacts = async () => {
    setLoading(true);
    const data = await ContactService.listContacts(propertyId);
    setContacts(data);
    setLoading(false);
  };

  useEffect(() => { fetchContacts(); }, [propertyId]);

  const filtered = contacts.filter(c => {
    const matchesSearch = !searchTerm ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.id.includes(searchTerm);
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'guests' ? c.isGuest :
      !c.isGuest;
    return matchesSearch && matchesFilter;
  });

  const guestCount = contacts.filter(c => c.isGuest).length;
  const otherCount = contacts.filter(c => !c.isGuest).length;

  const startEdit = (c: Contact) => {
    if (c.isGuest) {
      toast.info("Hóspedes devem ser editados na página de Hóspedes.");
      router.push('/admin/guests');
      return;
    }
    setEditingId(c.id);
    setEditData({ name: c.name });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({ name: "" }); };

  const saveEdit = async () => {
    if (!editingId || !editData.name.trim()) return;
    setSaving(true);
    const ok = await ContactService.updateContact(propertyId, editingId, { name: editData.name.trim() });
    if (ok) {
      toast.success("Contato atualizado.");
      setContacts(prev => prev.map(c => c.id === editingId ? { ...c, name: editData.name.trim() } : c));
      cancelEdit();
    } else {
      toast.error("Erro ao salvar.");
    }
    setSaving(false);
  };

  const handleDelete = async (c: Contact) => {
    if (c.isGuest) { toast.error("Contatos de hóspedes não podem ser excluídos daqui."); return; }
    setDeletingId(c.id);
    const ok = await ContactService.deleteContact(propertyId, c.id);
    if (ok) {
      toast.success("Contato removido.");
      setContacts(prev => prev.filter(ct => ct.id !== c.id));
    } else {
      toast.error("Erro ao excluir.");
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts.length} contatos &mdash; {guestCount} hóspedes, {otherCount} avulsos
        </p>
      </div>

      {/* Barra de busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm border-none focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
        <div className="flex bg-muted/50 p-1 rounded-lg">
          {([
            { key: 'all', label: `Todos (${contacts.length})` },
            { key: 'guests', label: `Hóspedes (${guestCount})` },
            { key: 'others', label: `Avulsos (${otherCount})` },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs font-bold py-2 px-3 rounded-md transition-all ${
                filter === f.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum contato encontrado</p>
          {searchTerm && <p className="text-xs mt-1">Tente alterar o termo de busca.</p>}
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_180px_100px_120px] gap-4 px-4 py-2.5 bg-muted/30 border-b text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
            <span>Contato</span>
            <span>Telefone</span>
            <span>Tipo</span>
            <span className="text-right">Ações</span>
          </div>

          {filtered.map(c => {
            const isEditing = editingId === c.id;
            const isDeleting = deletingId === c.id;
            return (
              <div
                key={`${c.id}-${c.propertyId}`}
                className={`flex flex-col md:grid md:grid-cols-[1fr_180px_100px_120px] gap-2 md:gap-4 px-4 py-3 border-b last:border-b-0 items-start md:items-center transition-colors ${
                  isEditing ? 'bg-primary/5' : 'hover:bg-muted/20'
                }`}
              >
                {/* Nome */}
                <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                    c.isGuest ? 'bg-primary/15 text-primary ring-2 ring-primary/20' : 'bg-muted text-muted-foreground'
                  }`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.name}
                      onChange={e => setEditData({ name: e.target.value })}
                      className="flex-1 h-8 rounded-md border px-2 text-sm"
                      autoFocus
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      {c.isGuest && c.guestId && (
                        <p className="text-[10px] text-muted-foreground">Guest ID: {c.guestId.slice(0, 8)}...</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Telefone */}
                <div className="text-xs text-muted-foreground font-mono pl-12 md:pl-0">
                  +{c.phone}
                </div>

                {/* Tipo */}
                <div className="pl-12 md:pl-0">
                  {c.isGuest ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      <UserCheck className="w-3 h-3" /> Guest
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <Tag className="w-3 h-3" /> Avulso
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 justify-end w-full md:w-auto pl-12 md:pl-0">
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} disabled={saving}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" className="h-7 w-7" onClick={saveEdit} disabled={saving || !editData.name.trim()}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Abrir Chat"
                        onClick={() => router.push(`/admin/comunicacao?phone=${c.id}`)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title={c.isGuest ? "Editar em Hóspedes" : "Editar"}
                        onClick={() => startEdit(c)}
                      >
                        {c.isGuest ? <ExternalLink className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                      </Button>
                      {!c.isGuest && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Excluir"
                          onClick={() => handleDelete(c)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
