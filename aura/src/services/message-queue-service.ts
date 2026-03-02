import { supabaseAdmin } from "@/lib/supabase";

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
  private static tableName = "message_queue";

  static async enqueueMessage(data: Omit<MessageJob, "status" | "retryCount" | "createdAt" | "id">) {
    const id = crypto.randomUUID();

    const newJob = {
      ...data,
      id,
      status: "pending",
      retryCount: 0,
      scheduledFor: data.scheduledFor.toISOString(),
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from(this.tableName).insert(newJob);
    if (error) throw error;

    return id;
  }

  static async getPendingMessages(limitCount = 50): Promise<MessageJob[]> {
    const now = new Date().toISOString();

    const { data } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .in('status', ['pending', 'failed'])
      .lte('scheduledFor', now)
      .limit(limitCount);

    if (!data) return [];

    return data
      .map((job: any) => ({
        ...job,
        scheduledFor: new Date(job.scheduledFor),
        createdAt: new Date(job.createdAt)
      }))
      .filter((job: MessageJob) => job.retryCount < job.maxRetries);
  }

  static async updateMessageStatus(
    jobId: string,
    status: "processing" | "sent" | "failed",
    errorLog?: string
  ) {
    // In Supabase SQL we don't have atomic incremental without RPC, 
    // but we can query first since message processing is usually per-message sync.
    const { data: job } = await supabaseAdmin.from(this.tableName).select('retryCount').eq('id', jobId).single();
    if (!job) return;

    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === "failed") {
      updateData.retryCount = job.retryCount + 1;
      if (errorLog) updateData.errorLog = errorLog;
    }

    await supabaseAdmin.from(this.tableName).update(updateData).eq('id', jobId);
  }
}