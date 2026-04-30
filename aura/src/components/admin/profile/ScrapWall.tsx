"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StaffScrap } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { createClientBrowser } from "@/lib/supabase-browser";
import { MessageCircle, Send, Trash2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const EMOJI_PRESETS = ["❤️", "😂", "👏", "🙌", "🔥", "😮", "😢", "👀"];

const ROLE_META: Record<string, { badge: string; color: string }> = {
  super_admin: { badge: "Super Admin", color: "#9b6dff" },
  admin:       { badge: "Admin",       color: "#4ec9d4" },
  hr:          { badge: "Gestão",       color: "#60a5fa" },
  reception:   { badge: "Recepção",    color: "#2dd4bf" },
  governance:  { badge: "Governança",  color: "#c084fc" },
  kitchen:     { badge: "Cozinha",     color: "#fb923c" },
  maintenance: { badge: "Manutenção",  color: "#f59e0b" },
  marketing:   { badge: "Marketing",   color: "#a3e635" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

interface Props {
  profileStaffId: string;
  isOwnProfile: boolean;
  propertyId: string;
}

export function ScrapWall({ profileStaffId, isOwnProfile }: Props) {
  const { userData } = useAuth();
  const [scraps, setScraps] = useState<StaffScrap[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchScraps = useCallback(async (offset = 0, append = false) => {
    try {
      const res = await fetch(`/api/admin/scraps?toStaffId=${profileStaffId}&offset=${offset}`);
      const data = await res.json();
      if (data.scraps) {
        setScraps(prev => append ? [...prev, ...data.scraps] : data.scraps);
        setHasMore(data.hasMore);
      }
    } catch {
      toast.error("Erro ao carregar recados.");
    } finally {
      setLoading(false);
    }
  }, [profileStaffId]);

  useEffect(() => { fetchScraps(); }, [fetchScraps]);

  useEffect(() => {
    const supabase = createClientBrowser();
    const channel = supabase
      .channel(`scraps_${profileStaffId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_scraps", filter: `toStaffId=eq.${profileStaffId}` }, () => fetchScraps())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_scrap_reactions" }, () => fetchScraps())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileStaffId, fetchScraps]);

  const handleSubmit = async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/scraps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStaffId: profileStaffId, message: message.trim() }),
      });
      if (!res.ok) throw new Error();
      setMessage("");
      textareaRef.current?.focus();
    } catch {
      toast.error("Erro ao enviar recado.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (scrapId: string) => {
    setDeletingId(scrapId);
    try {
      const res = await fetch(`/api/admin/scraps?scrapId=${scrapId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Erro ao apagar recado.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleReact = async (scrapId: string, emoji: string) => {
    try {
      await fetch("/api/admin/scraps/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapId, emoji }),
      });
    } catch {
      toast.error("Erro ao reagir.");
    }
  };

  const getReactionGroups = (reactions: StaffScrap["reactions"]) => {
    if (!reactions?.length) return {} as Record<string, { count: number; hasOwn: boolean }>;
    return reactions.reduce((acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
      acc[r.emoji].count++;
      if (r.staffId === userData?.id) acc[r.emoji].hasOwn = true;
      return acc;
    }, {} as Record<string, { count: number; hasOwn: boolean }>);
  };

  const canDelete = (scrap: StaffScrap) =>
    scrap.fromStaffId === userData?.id ||
    userData?.role === "admin" ||
    userData?.role === "super_admin";

  const myRoleColor = ROLE_META[userData?.role ?? ""]?.color ?? "#4ec9d4";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <MessageCircle size={16} className="text-cyan-400 flex-shrink-0" />
        <span className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">
          Recados
        </span>
        {scraps.length > 0 && (
          <span
            className="text-[11px] font-extrabold text-white rounded-full px-2 py-0.5 ml-1"
            style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
          >
            {scraps.length}
          </span>
        )}
      </div>

      {/* Compose */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex gap-3">
          {/* My avatar */}
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black overflow-hidden"
            style={{
              background: "linear-gradient(135deg,rgba(155,109,255,0.2),rgba(78,201,212,0.2))",
              border: `1px solid ${myRoleColor}44`,
              color: myRoleColor,
            }}
          >
            {userData?.profilePictureUrl ? (
              <img src={userData.profilePictureUrl} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
              getInitials(userData?.fullName ?? "?")
            )}
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
              placeholder={isOwnProfile ? "Escreva algo no seu mural…" : `Deixe um recado…`}
              maxLength={1000}
              rows={2}
              className="w-full resize-none bg-muted border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-[11px] ${message.length > 900 ? "text-red-400" : "text-muted-foreground"}`}>
                {message.length}/1000
              </span>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-50"
                style={{
                  background: message.trim()
                    ? "linear-gradient(135deg,#9b6dff,#4ec9d4)"
                    : "var(--border)",
                  color: message.trim() ? "#fff" : "var(--muted-foreground)",
                }}
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div>
        {loading ? (
          <p className="text-center text-[13px] text-muted-foreground py-6">
            Carregando recados…
          </p>
        ) : scraps.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-muted-foreground">
            <MessageCircle size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-semibold">Nenhum recado ainda</p>
            <p className="text-xs mt-1">Seja o primeiro a escrever!</p>
          </div>
        ) : (
          scraps.map(scrap => {
            const from = scrap.fromStaff;
            const fromRole = ROLE_META[from?.role ?? ""] ?? { badge: from?.role ?? "Staff", color: "#4ec9d4" };
            const reactionGroups = getReactionGroups(scrap.reactions);

            return (
              <div key={scrap.id} className="flex gap-3 px-5 py-4 border-b border-border last:border-b-0">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg,rgba(155,109,255,0.12),rgba(78,201,212,0.12))",
                    border: `1px solid ${fromRole.color}44`,
                    color: fromRole.color,
                  }}
                >
                  {from?.profilePictureUrl ? (
                    <img src={from.profilePictureUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    getInitials(from?.fullName ?? "?")
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[13px] font-extrabold text-foreground">
                      {from?.fullName ?? "Funcionário"}
                    </span>
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${fromRole.color}18`,
                        color: fromRole.color,
                        border: `1px solid ${fromRole.color}33`,
                      }}
                    >
                      {fromRole.badge}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {timeAgo(scrap.createdAt as string)}
                    </span>
                    {canDelete(scrap) && (
                      <button
                        onClick={() => handleDelete(scrap.id)}
                        disabled={deletingId === scrap.id}
                        className="text-muted-foreground opacity-50 hover:opacity-100 p-0.5 flex rounded transition-opacity disabled:opacity-30"
                        title="Apagar recado"
                      >
                        {deletingId === scrap.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                      </button>
                    )}
                  </div>

                  {/* Message */}
                  <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {scrap.message}
                  </p>

                  {/* Reactions */}
                  <div className="flex items-center flex-wrap gap-1 mt-2">
                    {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(scrap.id, emoji)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          background: hasOwn ? "rgba(155,109,255,0.12)" : "var(--muted)",
                          border: `1px solid ${hasOwn ? "rgba(155,109,255,0.35)" : "var(--border)"}`,
                        }}
                      >
                        <span className="text-sm">{emoji}</span>
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: hasOwn ? "#9b6dff" : "var(--muted-foreground)" }}
                        >
                          {count}
                        </span>
                      </button>
                    ))}

                    {EMOJI_PRESETS.filter(e => !(e in reactionGroups)).map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(scrap.id, emoji)}
                        className="px-1.5 py-0.5 rounded-full text-sm opacity-30 hover:opacity-100 border border-transparent hover:border-border transition-all"
                        title={`Reagir com ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {hasMore && (
          <div className="flex justify-center px-5 py-3">
            <button
              onClick={() => {
                setLoadingMore(true);
                fetchScraps(scraps.length, true).finally(() => setLoadingMore(false));
              }}
              disabled={loadingMore}
              className="flex items-center gap-1.5 px-4 py-2 bg-muted border border-border rounded-lg text-xs font-bold text-muted-foreground cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />}
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
