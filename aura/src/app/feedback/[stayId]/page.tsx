"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SurveyService } from "@/services/survey-service";
import { Stay, SurveyTemplate, SurveyQuestion } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Star, Send, Loader2, Gift } from "lucide-react";

export default function GuestFeedbackPage() {
  const params = useParams();
  const stayId = params.stayId as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stayContext, setStayContext] = useState<{ stay: Stay; propertyId: string } | null>(null);
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadData() {
      if (!stayId) return;
      
      const context = await SurveyService.getStayContextForFeedback(stayId);
      if (!context) {
        setError("Estadia não encontrada ou link expirado.");
        setLoading(false);
        return;
      }

      // Correção: acessando context.stay.id
      const alreadyAnswered = await SurveyService.hasSurveyForStay(context.propertyId, context.stay.id);
      if (alreadyAnswered) {
        setSuccess(true);
        // Precisamos do template para mostrar a recompensa se o hóspede recarregar a página
        const activeTemplate = await SurveyService.getActiveTemplate(context.propertyId);
        setTemplate(activeTemplate);
        setLoading(false);
        return;
      }

      const activeTemplate = await SurveyService.getActiveTemplate(context.propertyId);
      if (!activeTemplate || activeTemplate.questions.length === 0) {
        setError("Nenhuma pesquisa ativa no momento.");
        setLoading(false);
        return;
      }

      activeTemplate.questions.sort((a, b) => a.position - b.position);

      setStayContext(context);
      setTemplate(activeTemplate);
      setLoading(false);
    }

    loadData();
  }, [stayId]);

  const handleAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const isFormValid = () => {
    if (!template) return false;
    // Sem regra de obrigatoriedade por enquanto para simplificar o preenchimento,
    // mas garante que ao menos uma pergunta foi respondida
    return Object.keys(answers).length > 0;
  };

  const handleSubmit = async () => {
    if (!stayContext || !template || !isFormValid()) return;
    
    setSubmitting(true);
    setError(null);

    const result = await SurveyService.submitSurvey(
      stayContext.propertyId,
      stayContext.stay.id,
      stayContext.stay.guestId,
      template,
      answers
    );

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || "Ocorreu um erro inesperado.");
    }
    
    setSubmitting(false);
  };

  const renderNPS = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 animate-in fade-in slide-in-from-bottom-2">
      <h3 className="text-lg font-semibold text-foreground mb-1 text-center">{q.text}</h3>
      {q.description && <p className="text-sm text-muted-foreground text-center mb-4">{q.description}</p>}
      
      <div className="grid grid-cols-11 gap-1 mb-2 mt-4">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <button
            key={num}
            onClick={() => handleAnswer(q.id, num)}
            className={`
              h-10 sm:h-12 flex items-center justify-center rounded-md text-sm font-semibold transition-all
              ${answers[q.id] === num 
                ? 'bg-primary text-primary-foreground scale-110 shadow-md ring-2 ring-primary ring-offset-2' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}
            `}
          >
            {num}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
        <span>0 - Não recomendaria</span>
        <span>10 - Com certeza</span>
      </div>
    </div>
  );

  const renderRating = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 bg-card border rounded-xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 text-center">
      <h3 className="text-base font-medium text-foreground mb-1">{q.text}</h3>
      {q.description && <p className="text-xs text-muted-foreground mb-3">{q.description}</p>}
      <div className="flex gap-2 justify-center mt-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleAnswer(q.id, star)}
            className="p-2 transition-transform hover:scale-110 focus:outline-none"
          >
            <Star 
              className={`w-8 h-8 ${
                (answers[q.id] || 0) >= star 
                  ? "fill-yellow-400 text-yellow-400" 
                  : "text-muted-foreground/30"
              }`} 
            />
          </button>
        ))}
      </div>
    </div>
  );

  const renderTextarea = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 animate-in fade-in slide-in-from-bottom-2">
      <h3 className="text-base font-medium text-foreground mb-1">{q.text}</h3>
      {q.description && <p className="text-xs text-muted-foreground mb-3">{q.description}</p>}
      <Textarea 
        placeholder="Digite aqui seu feedback..."
        className="resize-none min-h-[120px] bg-background border-input shadow-sm"
        value={answers[q.id] || ""}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleAnswer(q.id, e.target.value)}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">Preparando sua pesquisa...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-500">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Muito Obrigado!</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">
          Sua avaliação foi registrada com sucesso. Ela é fundamental para continuarmos melhorando.
        </p>

        {/* Bloco Dinâmico da Recompensa */}
        {template?.reward?.hasReward && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 max-w-sm w-full animate-in fade-in slide-in-from-bottom-4">
            <Gift className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-emerald-900 font-semibold mb-2">Um presente para você</h3>
            <p className="text-emerald-700 text-sm">{template.reward.description}</p>
          </div>
        )}
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold text-destructive mb-2">Ops!</h1>
        <p className="text-muted-foreground">{error || "Não conseguimos carregar a pesquisa."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <header className="bg-card py-4 px-6 text-center border-b sticky top-0 z-10 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {template.title || "Pesquisa de Satisfação"}
        </h1>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-6 flex flex-col mt-4">
        {template.questions.map((q) => {
          if (q.type === 'nps') return renderNPS(q);
          if (q.type === 'rating') return renderRating(q);
          if (q.type === 'long_text' || q.type === 'short_text') return renderTextarea(q);
          return null; 
        })}

        <div className="mt-6">
          <Button 
            size="lg" 
            className="w-full h-14 text-base font-semibold shadow-md rounded-xl"
            onClick={handleSubmit}
            disabled={submitting || !isFormValid()}
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enviando...</>
            ) : (
              <>Enviar Avaliação <Send className="w-5 h-5 ml-2" /></>
            )}
          </Button>
          {!isFormValid() && (
            <p className="text-xs text-center text-muted-foreground mt-3">
              Por favor, responda pelo menos uma pergunta para enviar.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}