"use client";

// A tela de escalas virou a aba Escala de /admin/rh.
//
// A implementacao antiga (1.184 linhas) esta no historico do git, no commit anterior
// a este arquivo. Ela lia `staff_schedules`, `staff_schedule_overrides` e
// `staff_schedule_checkpoints`, que a migration `hr_fatia1_modelo.sql` zerou --
// entao mante-la de pe mostraria uma tela vazia com cara de bug.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EscalasRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/rh?tab=escala"); }, [router]);
  return null;
}
