import { supabase, db } from "@/lib/supabase";
import { SurveyResponse, SurveyResponseWithStay, SurveyTemplate, Stay, SurveyCategoryItem } from "@/types/aura";
import { computeSurveyMetrics, normalizeSurveyAnswers } from "@/lib/survey-metrics";

export interface SurveyInsight {
  id: string;
  propertyId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string;
  positiveInsight: {
    title: string;
    text: string;
  };
  attentionInsight: {
    title: string;
    text: string;
  };
  createdAt: string;
}

export class SurveyService {
  static async getStayContextForFeedback(stayId: string): Promise<{ stay: Stay; propertyId: string } | null> {
    try {
      const { data } = await supabase
        .from('stays')
        .select('*')
        .eq('id', stayId)
        .maybeSingle();

      if (!data) return null;
      return { stay: data as Stay, propertyId: data.propertyId };
    } catch (error) {
      console.error("Erro ao buscar contexto da estadia:", error);
      return null;
    }
  }

  static async hasSurveyForStay(propertyId: string, stayId: string): Promise<boolean> {
    try {
      // db(): pelo navegador do hóspede (anon) a RLS de survey_responses devolve
      // contagem zero, o que fazia o portal concluir "ainda não respondeu" e
      // continuar convidando quem já tinha respondido.
      const { count } = await db()
        .from('survey_responses')
        .select('id', { count: 'exact', head: true })
        .eq('propertyId', propertyId)
        .eq('stayId', stayId);

      return (count ?? 0) > 0;
    } catch (error) {
      return false;
    }
  }

  static async getActiveTemplate(propertyId: string): Promise<SurveyTemplate | null> {
    try {
      const { data } = await supabase
        .from('survey_templates')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('isDefault', true)
        .maybeSingle();

      return data ? (data as SurveyTemplate) : null;
    } catch (error) {
      return null;
    }
  }

  static async getCategories(propertyId: string): Promise<SurveyCategoryItem[]> {
    try {
      const { data } = await supabase
        .from('survey_categories')
        .select('*')
        .eq('propertyId', propertyId)
        .order('name', { ascending: true });

      if (!data || data.length === 0) {
        const defaultCategories = ["Geral", "Governança", "Recepção", "Café da Manhã", "Conforto"];
        const inserts = defaultCategories.map(name => ({
          id: crypto.randomUUID(),
          propertyId,
          name,
        }));

        await supabase.from('survey_categories').insert(inserts);
        return inserts as any[];
      }

      return data as SurveyCategoryItem[];
    } catch (error) {
      return [];
    }
  }

  static async addCategory(propertyId: string, name: string): Promise<SurveyCategoryItem | null> {
    const id = crypto.randomUUID();
    const payload = { id, propertyId, name };
    const { error } = await supabase.from('survey_categories').insert(payload);
    return error ? null : (payload as any);
  }

  static async updateCategory(propertyId: string, categoryId: string, name: string): Promise<boolean> {
    const { error } = await supabase.from('survey_categories').update({ name }).eq('id', categoryId);
    return !error;
  }

  static async deleteCategory(propertyId: string, categoryId: string): Promise<boolean> {
    const { error } = await supabase.from('survey_categories').delete().eq('id', categoryId).eq('propertyId', propertyId);
    return !error;
  }

  static async createTemplate(
    propertyId: string,
    templateData: Omit<SurveyTemplate, "id" | "propertyId" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      if (templateData.isDefault) {
        await supabase.from('survey_templates').update({ isDefault: false }).eq('propertyId', propertyId).eq('isDefault', true);
      }

      const id = crypto.randomUUID();
      const payload = {
        ...templateData,
        id,
        propertyId,
      };

      const { error } = await supabase.from('survey_templates').insert(payload);
      if (error) throw error;

      return { success: true, templateId: id };
    } catch (error) {
      console.error("Erro interno ao criar template:", error);
      return { success: false, error: "Falha ao salvar a pesquisa." };
    }
  }

  static async getTemplates(propertyId: string): Promise<SurveyTemplate[]> {
    try {
      const { data } = await supabase
        .from('survey_templates')
        .select('*')
        .eq('propertyId', propertyId)
        .order('isDefault', { ascending: false });

      return (data || []) as SurveyTemplate[];
    } catch (error) {
      return [];
    }
  }

  static async setDefaultTemplate(propertyId: string, templateId: string): Promise<boolean> {
    try {
      await supabase.from('survey_templates').update({ isDefault: false }).eq('propertyId', propertyId);
      await supabase.from('survey_templates').update({ isDefault: true }).eq('id', templateId);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async deleteTemplate(propertyId: string, templateId: string): Promise<boolean> {
    const { error } = await supabase.from('survey_templates').delete().eq('id', templateId).eq('propertyId', propertyId);
    return !error;
  }

  static async getTemplateById(propertyId: string, templateId: string): Promise<SurveyTemplate | null> {
    const { data } = await supabase.from('survey_templates').select('*').eq('id', templateId).maybeSingle();
    return data ? (data as SurveyTemplate) : null;
  }

  static async updateTemplate(
    propertyId: string,
    templateId: string,
    templateData: Omit<SurveyTemplate, "id" | "propertyId" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (templateData.isDefault) {
        await supabase.from('survey_templates').update({ isDefault: false }).eq('propertyId', propertyId);
      }
      await supabase.from('survey_templates').update(templateData).eq('id', templateId);
      return { success: true };
    } catch (error) {
      console.error("Erro interno ao atualizar template:", error);
      return { success: false, error: "Falha ao atualizar a pesquisa." };
    }
  }

  static async submitSurvey(
    propertyId: string,
    stayId: string,
    guestId: string,
    template: SurveyTemplate,
    answersRecord: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (await this.hasSurveyForStay(propertyId, stayId)) {
        return { success: false, error: "Esta pesquisa já foi respondida." };
      }

      // Destaque livre longo vira comentário (chip precisa ser rótulo) — igual à rota do hóspede.
      const answers = normalizeSurveyAnswers(
        Object.entries(answersRecord).map(([questionId, value]) => ({ questionId, value }))
      );
      const metrics = computeSurveyMetrics(template, answers);

      const id = crypto.randomUUID();
      await supabase.from('survey_responses').insert({
        id, propertyId, stayId, guestId, templateId: template.id, answers, metrics
      });

      await supabase.from('stays').update({ hasSurvey: true, npsScore: metrics.npsScore ?? null }).eq('id', stayId);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Falha ao enviar sua avaliação. Tente novamente." };
    }
  }

  static async getResponses(propertyId: string): Promise<SurveyResponse[]> {
    const { data } = await supabase.from('survey_responses').select('*').eq('propertyId', propertyId).order('createdAt', { ascending: false });
    return (data || []) as SurveyResponse[];
  }

  // Respostas + contexto da estadia (cabana, hóspede, datas). O painel mostra a cabana
  // e ordena por check-out: o id da reserva não diz nada para quem lê o card.
  static async getResponsesWithStay(propertyId: string): Promise<SurveyResponseWithStay[]> {
    const client = db();
    const { data } = await client
      .from('survey_responses').select('*').eq('propertyId', propertyId)
      .order('createdAt', { ascending: false });

    const responses = (data || []) as SurveyResponse[];
    if (!responses.length) return [];

    const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter(Boolean) as string[]));

    const stayIds = uniq(responses.map(r => r.stayId));
    if (!stayIds.length) return responses as SurveyResponseWithStay[];

    const { data: staysData } = await client
      .from('stays').select('id, cabinId, guestId, checkIn, checkOut').in('id', stayIds);
    const stays = (staysData || []) as { id: string; cabinId: string | null; guestId: string | null; checkIn: string; checkOut: string }[];

    const cabinIds = uniq(stays.map(s => s.cabinId));
    const guestIds = uniq(stays.map(s => s.guestId));

    const [cabinsRes, guestsRes] = await Promise.all([
      cabinIds.length ? client.from('cabins').select('id, name').in('id', cabinIds) : Promise.resolve({ data: [] }),
      guestIds.length ? client.from('guests').select('id, fullName').in('id', guestIds) : Promise.resolve({ data: [] }),
    ]);

    const cabinName = new Map<string, string>();
    for (const c of ((cabinsRes.data || []) as { id: string; name: string }[])) cabinName.set(c.id, c.name);
    const guestName = new Map<string, string>();
    for (const g of ((guestsRes.data || []) as { id: string; fullName: string }[])) guestName.set(g.id, g.fullName);

    const stayById = new Map(stays.map(s => [s.id, s]));

    return responses.map(r => {
      const stay = stayById.get(r.stayId);
      if (!stay) return r as SurveyResponseWithStay;
      return {
        ...r,
        cabinName: stay.cabinId ? cabinName.get(stay.cabinId) : undefined,
        guestName: stay.guestId ? guestName.get(stay.guestId) : undefined,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
      } as SurveyResponseWithStay;
    });
  }

  static async getLatestInsight(propertyId: string, period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'): Promise<SurveyInsight | null> {
    const { data } = await supabase
      .from('survey_insights')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('period', period)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? (data as SurveyInsight) : null;
  }
}