"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StaffScrap } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { createClientBrowser } from "@/lib/supabase-browser";
import { MessageCircle, Send, Trash2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

const EMOJI_PRESETS = ["❤️", "😂", "👏", "🙌", "🔥", "😮", "😢", "👀"];

const ROLE_META: Record<string, { badge: string; color: string }> = {
  super_admin: { badge: "Super Admin", color: "#9b6dff" },
  admin:       { badge: "Admin",       color: "#4ec9d4" },
  hr:          { badge: "RH",          color: "#60a5fa" },
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
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

interface Props {
  profileStaffId: string;
  isOwnProfile: boolean;
  propertyId: string;
}

export function ScrapWall({ profileStaffId, isOwnProfile, propertyId }: Props) {
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

  useEffect(() => {
    fetchScraps();
  }, [fetchScraps]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClientBrowser();
    const channel = supabase
      .channel(`scraps_${profileStaffId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "staff_scraps",
        filter: `toStaffId=eq.${profileStaffId}`,
      }, () => fetchScraps())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "staff_scrap_reactions",
      }, () => fetchScraps())
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
      // Optimistic update via realtime — no need to refetch manually
    } catch {
      toast.error("Erro ao reagir.");
    }
  };

  const getReactionGroups = (reactions: StaffScrap["reactions"]) => {
    if (!reactions?.length) return {};
    return reactions.reduce((acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
      acc[r.emoji].count++;
      if (r.staffId === userData?.id) acc[r.emoji].hasOwn = true;
      return acc;
    }, {} as Record<string, { count: number; hasOwn: boolean }>);
  };

  const T = {
    grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
    g1: "#9b6dff", g2: "#4ec9d4",
  };

  const canDelete = (scrap: StaffScrap) =>
    scrap.fromStaffId === userData?.id ||
    userData?.role === "admin" ||
    userData?.role === "super_admin";

  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <MessageCircle size={16} style={{ color: T.g2, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          Recados
        </span>
        {scraps.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 800,
            background: T.grad, color: "#fff",
            borderRadius: 999, padding: "1px 8px", marginLeft: 4,
          }}>
            {scraps.length}
          </span>
        )}
      </div>

      {/* New scrap input */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg,rgba(155,109,255,0.2),rgba(78,201,212,0.2))",
            border: `1px solid ${ROLE_META[userData?.role ?? ""]?.color ?? T.g2}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 900,
            color: ROLE_META[userData?.role ?? ""]?.color ?? T.g2,
            overflow: "hidden",
          }}>
            {userData?.profilePictureUrl ? (
              <img src={userData.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 10, objectFit: "cover" }} />
            ) : (
              <span>{getInitials(userData?.fullName ?? "?")}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
              placeholder={isOwnProfile ? "Escreva algo no seu mural…" : `Escreva um recado para ${userData?.fullName?.split(" ")[0]}…`}
              maxLength={1000}
              rows={2}
              style={{
                width: "100%", resize: "none",
                background: "var(--muted)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "10px 12px",
                fontSize: 13, color: "var(--foreground)",
                fontFamily: "inherit", lineHeight: 1.5,
                outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: message.length > 900 ? "#f87171" : "var(--muted-foreground)" }}>
                {message.length}/1000
              </span>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px",
                  background: message.trim() ? T.grad : "var(--border)",
                  color: message.trim() ? "#fff" : "var(--muted-foreground)",
                  border: "none", borderRadius: 8, cursor: message.trim() ? "pointer" : "default",
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                  transition: "opacity .15s",
                }}
              >
                {submitting ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scraps list */}
      <div style={{ padding: "8px 0" }}>
        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
            Carregando recados…
          </div>
        ) : scraps.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <MessageCircle size={32} style={{ color: "var(--muted-foreground)", margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "var(--muted-foreground)", margin: 0, fontWeight: 600 }}>
              Nenhum recado ainda
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
              Seja o primeiro a escrever!
            </p>
          </div>
        ) : (
          scraps.map((scrap) => {
            const from = scrap.fromStaff;
            const fromRole = ROLE_META[from?.role ?? ""] ?? { badge: from?.role ?? "Staff", color: T.g2 };
            const reactionGroups = getReactionGroups(scrap.reactions);

            return (
              <div key={scrap.id} style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex", gap: 12,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: "linear-gradient(135deg,rgba(155,109,255,0.15),rgba(78,201,212,0.15))",
                  border: `1px solid ${fromRole.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: fromRole.color,
                  overflow: "hidden",
                }}>
                  {from?.profilePictureUrl ? (
                    <img src={from.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 10, objectFit: "cover" }} />
                  ) : (
                    <span>{getInitials(from?.fullName ?? "?")}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)" }}>
                      {from?.fullName ?? "Funcionário"}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: ".04em",
                      textTransform: "uppercase", padding: "2px 7px",
                      borderRadius: 999, lineHeight: 1.6,
                      background: `${fromRole.color}18`,
                      color: fromRole.color,
                      border: `1px solid ${fromRole.color}33`,
                    }}>
                      {fromRole.badge}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: "auto" }}>
                      {timeAgo(scrap.createdAt as string)}
                    </span>
                    {canDelete(scrap) && (
                      <button
                        onClick={() => handleDelete(scrap.id)}
                        disabled={deletingId === scrap.id}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--muted-foreground)", padding: 2, display: "flex", borderRadius: 4,
                          opacity: deletingId === scrap.id ? 0.4 : 0.6,
                        }}
                        title="Apagar recado"
                      >
                        {deletingId === scrap.id
                          ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                          : <Trash2 size={12} />
                        }
                      </button>
                    )}
                  </div>

                  {/* Message */}
                  <p style={{
                    fontSize: 13, color: "var(--foreground)",
                    lineHeight: 1.6, margin: 0,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {scrap.message}
                  </p>

                  {/* Reactions */}
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    {/* Existing reactions */}
                    {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(scrap.id, emoji)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 8px", borderRadius: 999, cursor: "pointer",
                          background: hasOwn ? "rgba(155,109,255,0.12)" : "var(--muted)",
                          border: `1px solid ${hasOwn ? "rgba(155,109,255,0.35)" : "var(--border)"}`,
                          fontSize: 13, fontFamily: "inherit",
                        }}
                      >
                        <span>{emoji}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: hasOwn ? "#9b6dff" : "var(--muted-foreground)" }}>
                          {count}
                        </span>
                      </button>
                    ))}

                    {/* Add reaction — emoji picker */}
                    {EMOJI_PRESETS.map(emoji => {
                      const alreadyShown = emoji in reactionGroups;
                      if (alreadyShown) return null;
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReact(scrap.id, emoji)}
                          style={{
                            padding: "3px 6px", borderRadius: 999, cursor: "pointer",
                            background: "transparent", border: "1px solid transparent",
                            fontSize: 14, fontFamily: "inherit", opacity: 0.4,
                            transition: "opacity .15s, border-color .15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--border)"; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.borderColor = "transparent"; }}
                          title={`Reagir com ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Load more */}
        {hasMore && (
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => {
                setLoadingMore(true);
                fetchScraps(scraps.length, true).finally(() => setLoadingMore(false));
              }}
              disabled={loadingMore}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "var(--muted)", border: "1px solid var(--border)",
                borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)",
                fontFamily: "inherit",
              }}
            >
              {loadingMore ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <ChevronDown size={13} />}
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
