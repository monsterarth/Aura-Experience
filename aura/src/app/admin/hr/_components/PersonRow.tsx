"use client";

import React from "react";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import type { PersonItem } from "./hr-utils";

/** Avatar quadrado com iniciais (ou foto) no tom do cargo. */
export function PersonAvatar({ person, size = 36, online }: { person: PersonItem; size?: number; online?: boolean }) {
  const t = toneOf(person.tone);
  return (
    <span style={{ position: "relative", flexShrink: 0, display: "inline-block" }}>
      <span style={{ width: size, height: size, borderRadius: Math.round(size * .3), background: t.bg, border: `1px solid ${t.border}`, color: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * .34), fontWeight: 900, overflow: "hidden" }}>
        {person.profilePictureUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={person.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : person.initials}
      </span>
      {online && <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", background: T.green, border: `2px solid ${T.card}` }} />}
    </span>
  );
}

/**
 * Linha de pessoa: avatar + nome/cargo + conteúdo à direita.
 * `tile` = cartãozinho glass (listas curtas); sem `tile` = linha com divisória (listas longas).
 */
export function PersonRow({ person, trailing, sub, tile, online, last }: {
  person: PersonItem; trailing?: React.ReactNode; sub?: React.ReactNode; tile?: boolean; online?: boolean; last?: boolean;
}) {
  const base: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
  const style: React.CSSProperties = tile
    ? { ...base, padding: "9px 12px", borderRadius: 12, background: T.glass, border: `1px solid ${T.border}` }
    : { ...base, padding: "11px 0", borderBottom: last ? "none" : `1px solid ${T.border}` };
  return (
    <div style={style}>
      <PersonAvatar person={person} size={tile ? 34 : 38} online={online} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub ?? person.role}</div>
      </div>
      {trailing && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>{trailing}</div>}
    </div>
  );
}
