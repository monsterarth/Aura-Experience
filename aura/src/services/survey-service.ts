import { supabase } from "@/lib/supabase";
import { SurveyResponse, SurveyTemplate, Stay, SurveyCategoryItem } from "@/types/aura";

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
      const { count } = await supabase
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
    const { error } = await supabase.from('survey_categories').delete().eq('id', categoryId);
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
    const { error } = await supabase.from('survey_templates').delete().eq('id', templateId);
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

      const answers = Object.entries(answersRecord).map(([questionId, value]) => ({ questionId, value }));

      let npsScore: number | undefined = undefined;
      let totalRating = 0;
      let ratingCount = 0;
      let isDetractor = false;
      const categoryRatings: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};

      answers.forEach(ans => {
        const question = template.questions.find(q => q.id === ans.questionId);
        if (!question) return;

        const value = Number(ans.value);
        if (question.type === 'nps' && !isNaN(value)) {
          npsScore = value;
          if (value <= 6) isDetractor = true;
        }

        if (question.type === 'rating' && !isNaN(value)) {
          totalRating += value;
          ratingCount += 1;
          if (value <= 2) isDetractor = true;

          const categoryKey = question.categoryName || "Geral";
          if (!categoryRatings[categoryKey]) { categoryRatings[categoryKey] = 0; categoryCounts[categoryKey] = 0; }
          categoryRatings[categoryKey] += value;
          categoryCounts[categoryKey] += 1;
        }
      });

      Object.keys(categoryRatings).forEach(cat => { categoryRatings[cat] = Number((categoryRatings[cat] / categoryCounts[cat]).toFixed(1)); });
      const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : undefined;

      const id = crypto.randomUUID();
      await supabase.from('survey_responses').insert({
        id, propertyId, stayId, guestId, templateId: template.id, answers,
        metrics: { npsScore, averageRating, categoryRatings, isDetractor }
      });

      await supabase.from('stays').update({ hasSurvey: true, npsScore: npsScore || null }).eq('id', stayId);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Falha ao enviar sua avaliação. Tente novamente." };
    }
  }

  static async getResponses(propertyId: string): Promise<SurveyResponse[]> {
    const { data } = await supabase.from('survey_responses').select('*').eq('propertyId', propertyId).order('createdAt', { ascending: false });
    return (data || []) as SurveyResponse[];
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