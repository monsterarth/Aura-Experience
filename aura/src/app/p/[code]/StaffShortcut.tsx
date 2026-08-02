// src/app/p/[code]/StaffShortcut.tsx
// Se quem escaneou for da equipe, oferece o atalho para a ficha completa.
//
// Usa getSession() e não getUser(): getSession lê o localStorage, sem ida ao
// servidor de Auth — a página da plaqueta precisa pintar rápido no Wi-Fi da mata.
// Errar aqui é inofensivo: o link só leva a uma tela de login.
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function StaffShortcut({ assetId }: { assetId: string }) {
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then((res: { data: { session: unknown | null } }) => { if (alive) setIsStaff(!!res.data.session); })
      .catch(() => { });
    return () => { alive = false; };
  }, []);

  if (!isStaff) return null;

  return (
    <Link
      href={`/admin/patrimonio/${assetId}`}
      className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-5 py-3 text-sm font-bold text-[var(--fg)]"
    >
      Abrir ficha completa <ExternalLink size={14} />
    </Link>
  );
}
