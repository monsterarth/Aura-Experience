// src/app/api/cron/daily-housekeeping/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: Request) {
  // NOTA: Em produção no Vercel, o ideal é proteger esta rota validando o CRON_SECRET
  // const authHeader = req.headers.get('authorization');
  // if (process.env.VERCEL_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new NextResponse('Unauthorized', { status: 401 });
  // }

  console.log("🤖 [CRON] Iniciando motor de geração de Tarefas Diárias de Governança...");

  try {
    const propertiesSnap = await adminDb.collection("properties").get();
    let tasksCreated = 0;

    for (const propDoc of propertiesSnap.docs) {
      const propertyId = propDoc.id;

      // 1. Busca todas as estadias "Ativas" (Hóspedes atualmente na pousada)
      const activeStaysSnap = await adminDb
        .collection("properties")
        .doc(propertyId)
        .collection("stays")
        .where("status", "==", "active")
        .get();

      // Configura o início e fim do dia atual (Meia-noite de hoje)
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      
      for (const stayDoc of activeStaysSnap.docs) {
        const stay = stayDoc.data();
        if (!stay.checkOut || !stay.cabinId) continue;

        const checkOutDate = stay.checkOut.toDate();

        // 2. Filtro de Inteligência: Ele sai hoje?
        // Compara a data de checkout com a data de hoje formatada (YYYY-MM-DD)
        const isCheckingOutToday = checkOutDate.toISOString().split('T')[0] === startOfDay.toISOString().split('T')[0];
        
        // Se o hóspede fizer check-out hoje, NÃO criamos a diária (A recepção vai dar checkout e gerar o Turnover)
        if (isCheckingOutToday) {
          continue; 
        }

        // 3. Trava Anti-Duplicação: Garante que não foi criada outra tarefa 'daily' para esta cabana HOJE
        const existingTasks = await adminDb
          .collection("properties")
          .doc(propertyId)
          .collection("housekeeping_tasks")
          .where("cabinId", "==", stay.cabinId)
          .where("type", "==", "daily")
          .where("createdAt", ">=", startOfDay)
          .get();

        if (!existingTasks.empty) {
          continue; // Já existe uma tarefa diária para hoje. Ignora.
        }

        // 4. Cria a Tarefa Diária
        const taskId = uuidv4();
        await adminDb
          .collection("properties")
          .doc(propertyId)
          .collection("housekeeping_tasks")
          .doc(taskId)
          .set({
            id: taskId,
            propertyId: propertyId,
            cabinId: stay.cabinId,
            stayId: stayDoc.id, // Vinculado para a camareira poder lançar o consumo do frigobar!
            type: 'daily',
            status: 'pending',
            checklist: [],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

        tasksCreated++;
      }
    }

    console.log(`✅ [CRON] Sucesso! ${tasksCreated} novas tarefas diárias foram geradas.`);
    return NextResponse.json({ success: true, message: "Tarefas geradas com sucesso", tasksCreated });

  } catch (error: any) {
    console.error("❌ [CRON] Falha na rotina matinal de governança:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}