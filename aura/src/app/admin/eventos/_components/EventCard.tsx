"use client";

import React from "react";
import { Calendar, Clock, MapPin, Tag, Star, Eye, EyeOff, Edit2, ExternalLink, Trash2 } from "lucide-react";
import type { Event } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import { Card, Pill, IconButton } from "@/components/aura";
import { CATEGORY_ICONS, STATUS_LABELS, STATUS_TONE, TYPE_LABELS, TYPE_TONE, formatDatePT } from "./eventos-utils";

export function EventCard({ event, onEdit, onTogglePublish, onDelete }: {
  event: Event; onEdit: () => void; onTogglePublish: () => void; onDelete: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[event.category];
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <div className="flex flex-col sm:flex-row" style={{ minWidth: 0 }}>
        {/* Imagem */}
        <div className="h-36 sm:h-auto sm:w-36" style={{ position: "relative", flexShrink: 0, background: T.glass2, overflow: "hidden" }}>
          {event.imageUrl ? (
            <img src={event.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted2 }}>
              <CategoryIcon size={32} />
            </div>
          )}
          {event.featured && (
            <span title="Destaque" style={{ position: "absolute", top: 8, left: 8, width: 22, height: 22, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}>
              <Star size={11} color="#fff" fill="#fff" />
            </span>
          )}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, minWidth: 0, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone={STATUS_TONE[event.status]} label={STATUS_LABELS[event.status]} />
            {TYPE_LABELS[event.type] && <Pill tone={TYPE_TONE[event.type]} label={TYPE_LABELS[event.type]} />}
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: T.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Calendar size={11} /> {formatDatePT(event.startDate)}{event.endDate && event.endDate !== event.startDate && ` → ${formatDatePT(event.endDate)}`}
            </span>
            {event.startTime && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</span>}
            {event.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><MapPin size={11} /> {event.location}</span>}
            {event.priceDescription && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Tag size={11} /> {event.priceDescription}</span>}
          </div>
        </div>

        {/* Ações — sempre visíveis (toque não tem hover) */}
        <div className="flex flex-row sm:flex-col justify-end sm:justify-center" style={{ gap: 2, padding: "6px 10px 10px", flexShrink: 0 }}>
          <IconButton icon={event.status === "published" ? EyeOff : Eye} label={event.status === "published" ? "Despublicar" : "Publicar"} variant="ghost" tone="green" onClick={onTogglePublish} />
          <IconButton icon={Edit2} label="Editar" variant="ghost" onClick={onEdit} />
          {event.externalUrl && <IconButton icon={ExternalLink} label="Abrir link externo" variant="ghost" tone="blue" href={event.externalUrl} />}
          <IconButton icon={Trash2} label="Cancelar evento" variant="ghost" tone="red" onClick={onDelete} />
        </div>
      </div>
    </Card>
  );
}
