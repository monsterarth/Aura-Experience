// src/services/survey-service.ts
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  collectionGroup,
  limit,
  writeBatch,
  deleteDoc,
  getDoc,
  updateDoc,
  orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SurveyResponse, SurveyTemplate, Stay, SurveyCategoryItem } from "@/types/aura";

// NOVA INTERFACE PARA OS INSIGHTS DO N8N
export interface SurveyInsight {
  id: string;
  propertyId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: any; // Timestamp
  endDate: any;   // Timestamp
  positiveInsight: {
    title: string;
    text: string;
  };
  attentionInsight: {
    title: string;
    text: string;
  };
  createdAt: any; // Timestamp
}

export class SurveyService {
  /**
   * Localiza a estadia globalmente pelo ID via CollectionGroup
   */
  static async getStayContextForFeedback(stayId: string): Promise<{ stay: Stay; propertyId: string } | null> {
    try {
      const staysQuery = query(
        collectionGroup(db, "stays"),
        where("id", "==", stayId)
      );
      
      const snapshot = await getDocs(staysQuery);
      
      if (snapshot.empty) return null;
      
      const stayDoc = snapshot.docs[0];
      const propertyId = stayDoc.ref.parent.parent?.id;
      
      if (!propertyId) return null;

      return {
        stay: { id: stayDoc.id, ...stayDoc.data() } as Stay,
        propertyId
      };
    } catch (error) {
      console.error("Erro ao buscar contexto da estadia:", error);
      return null;
    }
  }

  /**
   * Verifica se já existe uma resposta para esta estadia
   */
  static async hasSurveyForStay(propertyId: string, stayId: string): Promise<boolean> {
    try {
      const surveyRef = collection(db, "properties", propertyId, "survey_responses");
      const q = query(surveyRef, where("stayId", "==", stayId), limit(1));
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error("Erro ao verificar pesquisa existente:", error);
      return false; 
    }
  }

  /**
   * Busca o template de pesquisa ativo da propriedade
   */
  static async getActiveTemplate(propertyId: string): Promise<SurveyTemplate | null> {
    try {
      const templatesRef = collection(db, "properties", propertyId, "survey_templates");
      const q = query(templatesRef, where("isDefault", "==", true), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return null;
      
      const document = snapshot.docs[0];
      return { id: document.id, ...document.data() } as SurveyTemplate;
    } catch (error) {
      console.error("Erro ao buscar template ativo:", error);
      return null;
    }
  }

  // ==========================================
  // GERENCIAMENTO DE CATEGORIAS (BI)
  // ==========================================

  static async getCategories(propertyId: string): Promise<SurveyCategoryItem[]> {
    try {
      const catRef = collection(db, "properties", propertyId, "survey_categories");
      const snapshot = await getDocs(catRef);
      
      // Auto-Seed: Se não houver nenhuma categoria, cria as padrões
      if (snapshot.empty) {
        const defaultCategories = ["Geral", "Governança", "Recepção", "Café da Manhã", "Conforto"];
        const batch = writeBatch(db);
        const newCats: SurveyCategoryItem[] = [];
        
        for (const name of defaultCategories) {
          const newRef = doc(catRef);
          const catData = {
            propertyId,
            name,
            createdAt: serverTimestamp()
          };
          batch.set(newRef, catData);
          newCats.push({ id: newRef.id, ...catData } as SurveyCategoryItem);
        }
        await batch.commit();
        return newCats;
      }

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurveyCategoryItem))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Erro ao buscar categorias:", error);
      return [];
    }
  }

  static async addCategory(propertyId: string, name: string): Promise<SurveyCategoryItem | null> {
    try {
      const catRef = doc(collection(db, "properties", propertyId, "survey_categories"));
      const data = { propertyId, name, createdAt: serverTimestamp() };
      await setDoc(catRef, data);
      return { id: catRef.id, ...data } as SurveyCategoryItem;
    } catch (error) {
      console.error("Erro ao criar categoria:", error);
      return null;
    }
  }

  static async updateCategory(propertyId: string, categoryId: string, name: string): Promise<boolean> {
    try {
      const catRef = doc(db, "properties", propertyId, "survey_categories", categoryId);
      await updateDoc(catRef, { name });
      return true;
    } catch (error) {
      console.error("Erro ao atualizar categoria:", error);
      return false;
    }
  }

  static async deleteCategory(propertyId: string, categoryId: string): Promise<boolean> {
    try {
      const catRef = doc(db, "properties", propertyId, "survey_categories", categoryId);
      await deleteDoc(catRef);
      return true;
    } catch (error) {
      console.error("Erro ao deletar categoria:", error);
      return false;
    }
  }

  /**
   * Salva um novo Template de Pesquisa. 
   */
  static async createTemplate(
    propertyId: string,
    templateData: Omit<SurveyTemplate, "id" | "propertyId" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      if (templateData.isDefault) {
        const templatesRef = collection(db, "properties", propertyId, "survey_templates");
        const q = query(templatesRef, where("isDefault", "==", true));
        const snapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.update(docSnap.ref, { isDefault: false });
        });
        await batch.commit();
      }

      const newTemplateRef = doc(collection(db, "properties", propertyId, "survey_templates"));
      
      const newTemplate: Omit<SurveyTemplate, "id"> = {
        propertyId,
        ...templateData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(newTemplateRef, newTemplate);

      return { success: true, templateId: newTemplateRef.id };
    } catch (error) {
      console.error("Erro ao criar template de pesquisa:", error);
      return { success: false, error: "Falha ao salvar a pesquisa." };
    }
  }

  /**
   * Busca todos os templates de pesquisa da propriedade
   */
  static async getTemplates(propertyId: string): Promise<SurveyTemplate[]> {
    try {
      const templatesRef = collection(db, "properties", propertyId, "survey_templates");
      const snapshot = await getDocs(templatesRef);
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurveyTemplate))
        .sort((a, b) => {
          if (a.isDefault) return -1;
          if (b.isDefault) return 1;
          return 0;
        });
    } catch (error) {
      console.error("Erro ao buscar templates:", error);
      return [];
    }
  }

  /**
   * Define um template específico como o Padrão (isDefault = true)
   */
  static async setDefaultTemplate(propertyId: string, templateId: string): Promise<boolean> {
    try {
      const templatesRef = collection(db, "properties", propertyId, "survey_templates");
      const q = query(templatesRef, where("isDefault", "==", true));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      
      snapshot.docs.forEach((docSnap) => {
        if (docSnap.id !== templateId) {
          batch.update(docSnap.ref, { isDefault: false });
        }
      });

      const newDefaultRef = doc(db, "properties", propertyId, "survey_templates", templateId);
      batch.update(newDefaultRef, { isDefault: true });

      await batch.commit();
      return true;
    } catch (error) {
      console.error("Erro ao definir template padrão:", error);
      return false;
    }
  }

  static async deleteTemplate(propertyId: string, templateId: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, "properties", propertyId, "survey_templates", templateId));
      return true;
    } catch (error) {
      console.error("Erro ao deletar template:", error);
      return false;
    }
  }

  static async getTemplateById(propertyId: string, templateId: string): Promise<SurveyTemplate | null> {
    try {
      const docRef = doc(db, "properties", propertyId, "survey_templates", templateId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) return null;
      
      return { id: docSnap.id, ...docSnap.data() } as SurveyTemplate;
    } catch (error) {
      console.error("Erro ao buscar template por ID:", error);
      return null;
    }
  }

  static async updateTemplate(
    propertyId: string,
    templateId: string,
    templateData: Omit<SurveyTemplate, "id" | "propertyId" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (templateData.isDefault) {
        const templatesRef = collection(db, "properties", propertyId, "survey_templates");
        const q = query(templatesRef, where("isDefault", "==", true));
        const snapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          if (docSnap.id !== templateId) {
            batch.update(docSnap.ref, { isDefault: false });
          }
        });
        await batch.commit();
      }

      const templateRef = doc(db, "properties", propertyId, "survey_templates", templateId);
      
      await updateDoc(templateRef, {
        ...templateData,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Erro ao atualizar template de pesquisa:", error);
      return { success: false, error: "Falha ao atualizar a pesquisa." };
    }
  }

  /**
   * Processa as respostas e salva no banco de dados com as métricas pré-calculadas
   */
  static async submitSurvey(
    propertyId: string, 
    stayId: string, 
    guestId: string, 
    template: SurveyTemplate,
    answersRecord: Record<string, any> 
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const alreadyAnswered = await this.hasSurveyForStay(propertyId, stayId);
      if (alreadyAnswered) {
        return { success: false, error: "Esta pesquisa já foi respondida." };
      }

      const answers = Object.entries(answersRecord).map(([questionId, value]) => ({
        questionId,
        value
      }));

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

          // Alterado de categoryId para categoryName para legibilidade no Dashboard
          const categoryKey = question.categoryName || "Geral"; 

          if (!categoryRatings[categoryKey]) {
            categoryRatings[categoryKey] = 0;
            categoryCounts[categoryKey] = 0;
          }
          categoryRatings[categoryKey] += value;
          categoryCounts[categoryKey] += 1;
        }
      });

      Object.keys(categoryRatings).forEach(cat => {
        categoryRatings[cat] = Number((categoryRatings[cat] / categoryCounts[cat]).toFixed(1));
      });

      const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : undefined;

      const surveyRef = doc(collection(db, "properties", propertyId, "survey_responses"));
      
      const surveyData: Omit<SurveyResponse, "id"> = {
        propertyId,
        stayId,
        guestId,
        templateId: template.id,
        answers,
        metrics: {
          npsScore,
          averageRating,
          categoryRatings,
          isDetractor
        },
        createdAt: serverTimestamp()
      };

      await setDoc(surveyRef, surveyData);

      const stayRef = doc(db, "properties", propertyId, "stays", stayId);
await updateDoc(stayRef, {
  hasSurvey: true,
  npsScore: npsScore || null
});

      return { success: true };
    } catch (error) {
      console.error("Erro ao submeter pesquisa:", error);
      return { success: false, error: "Falha ao enviar sua avaliação. Tente novamente." };
    }
  }

  /**
   * Busca todas as respostas das pesquisas de uma propriedade
   */
  static async getResponses(propertyId: string): Promise<SurveyResponse[]> {
    try {
      const responsesRef = collection(db, "properties", propertyId, "survey_responses");
      const snapshot = await getDocs(responsesRef);

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurveyResponse))
        .sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA; // Ordena da mais recente para a mais antiga
        });
    } catch (error) {
      console.error("Erro ao buscar respostas:", error);
      return [];
    }
  }

  /**
   * NOVO: Busca o insight pré-processado pelo N8N mais recente de um determinado período
   */
  static async getLatestInsight(propertyId: string, period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'): Promise<SurveyInsight | null> {
    try {
      const insightsRef = collection(db, "properties", propertyId, "survey_insights");
      const q = query(
        insightsRef, 
        where("period", "==", period),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const docSnap = snapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as SurveyInsight;
    } catch (error) {
      console.error(`Erro ao buscar o último insight (${period}):`, error);
      return null;
    }
  }
}