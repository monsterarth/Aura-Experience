"use client";

import { useState, useEffect } from "react";
import { Staff } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { StaffService } from "@/services/staff-service";
import { PersonalScheduleCard } from "./PersonalScheduleCard";
import { PreferencesCard } from "./PreferencesCard";
import { ScrapWall } from "./ScrapWall";
import { ImageUpload } from "@/components/admin/ImageUpload";
import {
  Pencil, Check, X, Phone, Mail, Calendar,
  Clock, Loader2, UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

const ROLE_META: Record<string, { label: string; short: string; color: string; badgeBg: string; badgeBorder: string }> = {
  super_admin: { label: "Super Admin",      short: "SA", color: "#9b6dff", badgeBg: "rgba(155,109,255,0.12)", badgeBorder: "rgba(155,109,255,0.28)" },
  admin:       { label: "Administrador",    short: "AD", color: "#4ec9d4", badgeBg: "rgba(78,201,212,0.12)",  badgeBorder: "rgba(78,201,212,0.28)"  },
  hr:          { label: "Recursos Humanos", short: "RH", color: "#60a5fa", badgeBg: "rgba(96,165,250,0.1)",   badgeBorder: "rgba(96,165,250,0.28)"  },
  reception:   { label: "Recepção",         short: "RC", color: "#2dd4bf", badgeBg: "rgba(45,212,191,0.1)",   badgeBorder: "rgba(45,212,191,0.28)"  },
  governance:  { label: "Governança",       short: "GV", color: "#c084fc", badgeBg: "rgba(192,132,252,0.1)",  badgeBorder: "rgba(192,132,252,0.28)" },
  kitchen:     { label: "Cozinha",          short: "CZ", color: "#fb923c", badgeBg: "rgba(251,146,60,0.1)",   badgeBorder: "rgba(251,146,60,0.28)"  },
  maintenance: { label: "Manutenção",       short: "MT", color: "#f59e0b", badgeBg: "rgba(245,158,11,0.1)",   badgeBorder: "rgba(245,158,11,0.28)"  },
  marketing:   { label: "Marketing",        short: "MK", color: "#a3e635", badgeBg: "rgba(163,230,53,0.08)",  badgeBorder: "rgba(163,230,53,0.22)"  },
};

function getRoleMeta(role?: string | null) {
  return ROLE_META[role ?? ""] ?? { label: role ?? "Staff", short: "ST", color: "#4ec9d4", badgeBg: "rgba(78,201,212,0.1)", badgeBorder: "rgba(78,201,212,0.28)" };
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const SCHEDULE_LABELS: Record<string, string> = {
  "5x2": "5×2 (folga fixa)",
  "12x36": "12×36",
  "6x1": "6×1",
  "custom": "Personalizada",
};

interface Props {
  staffId: string;
  isOwnProfile: boolean;
}

export function ProfileView({ staffId, isOwnProfile }: Props) {
  const { userData: authUser, refreshUserData } = useAuth();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<"fullName" | "bio" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    // Load via getStaffByProperty and filter — or fetch via API
    fetch(`/api/admin/staff?staffId=${staffId}`)
      .then(r => r.json())
      .then(data => {
        if (data.staff) setStaff(data.staff);
      })
      .catch(() => toast.error("Erro ao carregar perfil."))
      .finally(() => setLoading(false));
  }, [staffId]);

  // If own profile, keep staff in sync with authUser so preference changes reflect immediately
  useEffect(() => {
    if (isOwnProfile && authUser) setStaff(authUser);
  }, [isOwnProfile, authUser]);

  const startEdit = (field: "fullName" | "bio") => {
    setEditingField(field);
    setEditValue(staff?.[field] ?? "");
  };

  const saveField = async () => {
    if (!editingField || !staff) return;
    setSaving(true);
    try {
      await StaffService.updateStaff(staff.id, { [editingField]: editValue.trim() });
      setStaff(prev => prev ? { ...prev, [editingField]: editValue.trim() } : prev);
      if (isOwnProfile) await refreshUserData();
      setEditingField(null);
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (url: string) => {
    if (!staff) return;
    try {
      await StaffService.updateStaff(staff.id, { profilePictureUrl: url });
      setStaff(prev => prev ? { ...prev, profilePictureUrl: url } : prev);
      if (isOwnProfile) await refreshUserData();
    } catch {
      toast.error("Erro ao salvar foto.");
    }
  };

  const T = {
    grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
    gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.12) 0%,rgba(78,201,212,0.12) 100%)",
    g1: "#9b6dff", g2: "#4ec9d4",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: T.g2 }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!staff) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: "var(--muted-foreground)" }}>
        <UserCircle2 size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.3 }} />
        <p style={{ fontSize: 16, fontWeight: 700 }}>Perfil não encontrado</p>
      </div>
    );
  }

  const roleMeta = getRoleMeta(staff.role);
  const days = daysSince(staff.hireDate);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>

      {/* Hero Banner */}
      <div style={{
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginBottom: 0,
        border: "1px solid var(--border)",
        borderBottom: "none",
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }}>
        {/* Banner */}
        <div style={{
          height: 140,
          background: `linear-gradient(135deg, ${roleMeta.color}33 0%, rgba(78,201,212,0.2) 100%)`,
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 24px 0",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle at 20% 50%, rgba(155,109,255,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(78,201,212,0.1) 0%, transparent 50%)",
          }} />
        </div>
      </div>

      {/* Profile Card */}
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderTop: "none",
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderRadius: "var(--radius)",
        padding: "0 24px 24px",
        marginBottom: 16,
        position: "relative",
      }}>
        {/* Avatar — overlapping banner */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingTop: 0, marginTop: -44, marginBottom: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {isOwnProfile ? (
              <ImageUpload
                value={staff.profilePictureUrl ?? undefined}
                onUploadSuccess={handlePhotoUpload}
                path={`staff/${staff.id}`}
              />
            ) : (
              <div style={{
                width: 88, height: 88, borderRadius: 20,
                background: T.gradSoft,
                border: `3px solid var(--card)`,
                outline: `2px solid ${roleMeta.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 900, color: roleMeta.color,
                overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}>
                {staff.profilePictureUrl ? (
                  <img src={staff.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 18 }} />
                ) : (
                  <span>{roleMeta.short}</span>
                )}
              </div>
            )}
          </div>

          {/* Name & role */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            {editingField === "fullName" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveField(); if (e.key === "Escape") setEditingField(null); }}
                  style={{
                    fontSize: 22, fontWeight: 900, background: "var(--muted)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "4px 10px", color: "var(--foreground)", fontFamily: "inherit",
                    outline: "none", flex: 1, minWidth: 0,
                  }}
                />
                <button onClick={saveField} disabled={saving} style={{ background: "none", border: "none", cursor: "pointer", color: T.g2, padding: 4, display: "flex" }}>
                  {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={16} />}
                </button>
                <button onClick={() => setEditingField(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4, display: "flex" }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--foreground)", margin: 0, lineHeight: 1.2 }}>
                  {staff.fullName}
                </h1>
                {isOwnProfile && (
                  <button onClick={() => startEdit("fullName")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4, display: "flex", opacity: 0.6 }}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".05em",
                textTransform: "uppercase", padding: "3px 10px",
                borderRadius: 999, lineHeight: 1.6,
                background: roleMeta.badgeBg, color: roleMeta.color,
                border: `1px solid ${roleMeta.badgeBorder}`,
              }}>
                {roleMeta.label}
              </span>
              {days !== null && (
                <span style={{
                  fontSize: 11, color: "var(--muted-foreground)",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Calendar size={11} />
                  Aqui há {days} {days === 1 ? "dia" : "dias"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Na Equipe",   value: days !== null ? `${days}d` : "—",         sub: staff.hireDate ? formatDate(staff.hireDate) : "Data não definida" },
            { label: "Escala",      value: SCHEDULE_LABELS[staff.scheduleType ?? ""] ?? "Não config.",  sub: "Tipo de escala" },
            { label: "Cargo",       value: roleMeta.short,                            sub: roleMeta.label },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "12px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                {stat.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Bio */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Bio
            </span>
            {isOwnProfile && editingField !== "bio" && (
              <button onClick={() => startEdit("bio")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2, display: "flex", opacity: 0.6 }}>
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingField === "bio" ? (
            <div>
              <textarea
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={3}
                maxLength={300}
                style={{
                  width: "100%", resize: "none",
                  background: "var(--muted)", border: "1px solid var(--border)",
                  borderRadius: 10, padding: "10px 12px",
                  fontSize: 13, color: "var(--foreground)",
                  fontFamily: "inherit", lineHeight: 1.5,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={saveField} disabled={saving} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", background: T.grad, color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                }}>
                  {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={12} />}
                  Salvar
                </button>
                <button onClick={() => setEditingField(null)} style={{
                  padding: "6px 12px", background: "var(--muted)", border: "1px solid var(--border)",
                  borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", fontFamily: "inherit",
                }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p style={{
              fontSize: 13, color: staff.bio ? "var(--foreground)" : "var(--muted-foreground)",
              lineHeight: 1.6, margin: 0,
              fontStyle: staff.bio ? "normal" : "italic",
            }}>
              {staff.bio || (isOwnProfile ? "Clique no lápis para adicionar uma bio…" : "Sem bio.")}
            </p>
          )}
        </div>

        {/* Contact chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {staff.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--muted)", borderRadius: 999, border: "1px solid var(--border)" }}>
              <Mail size={12} style={{ color: "var(--muted-foreground)" }} />
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{staff.email}</span>
            </div>
          )}
          {staff.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--muted)", borderRadius: 999, border: "1px solid var(--border)" }}>
              <Phone size={12} style={{ color: "var(--muted-foreground)" }} />
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{staff.phone}</span>
            </div>
          )}
          {staff.birthDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--muted)", borderRadius: 999, border: "1px solid var(--border)" }}>
              <Clock size={12} style={{ color: "var(--muted-foreground)" }} />
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{formatDate(staff.birthDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Personal Schedule */}
      {staff.propertyId && (
        <div style={{ marginBottom: 16 }}>
          <PersonalScheduleCard staff={staff} propertyId={staff.propertyId} />
        </div>
      )}

      {/* Preferences — own profile only */}
      {isOwnProfile && authUser && (
        <div style={{ marginBottom: 16 }}>
          <PreferencesCard userData={authUser} onRefresh={refreshUserData} />
        </div>
      )}

      {/* Scrap Wall */}
      {staff.propertyId && (
        <ScrapWall
          profileStaffId={staff.id}
          isOwnProfile={isOwnProfile}
          propertyId={staff.propertyId}
        />
      )}
    </div>
  );
}
