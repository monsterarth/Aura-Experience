import { adminDb } from "@/lib/firebase-admin"; 
import { FieldValue } from "firebase-admin/firestore";

export interface MessageJob {
  id?: string;
  propertyId: string;
  to: string;
  body: string;
  scheduledFor: Date;
  status: "pending" | "processing" | "sent" | "failed";
  retryCount: number;
  maxRetries: number;
  errorLog?: string;
  createdAt: Date;
}

export class MessageQueueService {
  private static collectionName = "message_queue";

  /**
   * Adiciona uma nova mensagem à fila para ser processada.
   */
  static async enqueueMessage(data: Omit<MessageJob, "status" | "retryCount" | "createdAt" | "id">) {
    const queueRef = adminDb.collection(this.collectionName);
    
    const newJob: Omit<MessageJob, "id"> = {
      ...data,
      status: "pending",
      retryCount: 0,
      createdAt: new Date(),
    };

    const docRef = await queueRef.add(newJob);
    return docRef.id;
  }

  /**
   * Busca mensagens prontas para envio (Agendadas para o passado/agora e pendentes/falhas)
   */
  static async getPendingMessages(limitCount = 50): Promise<MessageJob[]> {
    const now = new Date();
    
    const snapshot = await adminDb.collection(this.collectionName)
      .where("status", "in", ["pending", "failed"])
      .where("scheduledFor", "<=", now)
      .limit(limitCount)
      .get();

    return snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() } as MessageJob))
      .filter((job: MessageJob) => job.retryCount < job.maxRetries);
  }

  /**
   * Atualiza o status de uma mensagem na fila
   */
  static async updateMessageStatus(
    jobId: string, 
    status: "processing" | "sent" | "failed", 
    errorLog?: string
  ) {
    const docRef = adminDb.collection(this.collectionName).doc(jobId);
    
    const updateData: any = {
      status,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (status === "failed") {
      updateData.retryCount = FieldValue.increment(1);
      if (errorLog) updateData.errorLog = errorLog;
    }

    await docRef.update(updateData);
  }
}