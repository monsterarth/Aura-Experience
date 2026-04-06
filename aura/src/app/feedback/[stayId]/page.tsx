"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Stay, SurveyTemplate, SurveyQuestion } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Star, Send, Loader2, Gift } from "lucide-react";

type Lang = 'pt' | 'en' | 'es';

const ui = {
  pt: {
    title: "Pesquisa de Satisfação",
    submit: "Enviar Avaliação",
    submitting: "Enviando...",
    validationHint: "Por favor, responda pelo menos uma pergunta para enviar.",
    thankYou: "Muito Obrigado!",
    thankYouSub: "Sua avaliação foi registrada. Ela é fundamental para continuarmos melhorando.",
    giftTitle: "Um presente para você",
    npsLow: "0 - Não recomendaria",
    npsHigh: "10 - Com certeza",
    textPlaceholder: "Digite aqui seu feedback...",
    errorNotFound: "Estadia não encontrada ou link expirado.",
    errorNoSurvey: "Nenhuma pesquisa ativa no momento.",
    errorLoad: "Não conseguimos carregar a pesquisa.",
    oops: "Ops!",
  },
  en: {
    title: "Satisfaction Survey",
    submit: "Submit Review",
    submitting: "Submitting...",
    validationHint: "Please answer at least one question to submit.",
    thankYou: "Thank You!",
    thankYouSub: "Your review has been recorded. It helps us keep improving.",
    giftTitle: "A gift for you",
    npsLow: "0 - Would not recommend",
    npsHigh: "10 - Definitely would",
    textPlaceholder: "Type your feedback here...",
    errorNotFound: "Stay not found or link has expired.",
    errorNoSurvey: "No active survey at the moment.",
    errorLoad: "We could not load the survey.",
    oops: "Oops!",
  },
  es: {
    title: "Encuesta de Satisfacción",
    submit: "Enviar Evaluación",
    submitting: "Enviando...",
    validationHint: "Por favor, responde al menos una pregunta para enviar.",
    thankYou: "¡Muchas Gracias!",
    thankYouSub: "Tu evaluación fue registrada. Nos ayuda a seguir mejorando.",
    giftTitle: "Un regalo para ti",
    npsLow: "0 - No recomendaría",
    npsHigh: "10 - Con seguridad",
    textPlaceholder: "Escribe tu opinión aquí...",
    errorNotFound: "Estadía no encontrada o enlace expirado.",
    errorNoSurvey: "No hay encuesta activa en este momento.",
    errorLoad: "No pudimos cargar la encuesta.",
    oops: "¡Ups!",
  },
};

export default function GuestFeedbackPage() {
  const params = useParams();
  const stayId = params.stayId as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('pt');

  const [stayContext, setStayContext] = useState<{ stay: Stay; propertyId: string } | null>(null);
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const t = ui[lang];

  // Language-aware question field helpers
  const qText = (q: SurveyQuestion) =>
    (lang === 'en' && q.text_en) || (lang === 'es' && q.text_es) || q.text;
  const qDesc = (q: SurveyQuestion) =>
    (lang === 'en' && q.description_en) || (lang === 'es' && q.description_es) || q.description;
  const qOptions = (q: SurveyQuestion): string[] =>
    (lang === 'en' && q.options_en?.length ? q.options_en : null) ||
    (lang === 'es' && q.options_es?.length ? q.options_es : null) ||
    q.options || [];

  useEffect(() => {
    async function loadData() {
      if (!stayId) return;

      const res = await fetch(`/api/guest/survey?stayId=${stayId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Estadia não encontrada ou link expirado.");
        setLoading(false);
        return;
      }

      const { stay, alreadyAnswered, template: activeTemplate, preferredLanguage } = await res.json();

      // Detect language: guest preference → browser fallback
      const detectedLang: Lang = (['pt', 'en', 'es'].includes(preferredLanguage) ? preferredLanguage : null)
        ?? (typeof navigator !== 'undefined'
          ? navigator.language.slice(0, 2) === 'es' ? 'es' : navigator.language.slice(0, 2) === 'en' ? 'en' : 'pt'
          : 'pt');
      setLang(detectedLang);

      if (alreadyAnswered) {
        setSuccess(true);
        setTemplate(activeTemplate);
        setLoading(false);
        return;
      }

      if (!activeTemplate || activeTemplate.questions.length === 0) {
        setError(ui[detectedLang].errorNoSurvey);
        setLoading(false);
        return;
      }

      activeTemplate.questions.sort((a: SurveyQuestion, b: SurveyQuestion) => a.position - b.position);
      setStayContext({ stay: stay as Stay, propertyId: stay.propertyId });
      setTemplate(activeTemplate);
      setLoading(false);
    }
    loadData();
  }, [stayId]);

  const handleAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const isFormValid = () => Object.keys(answers).length > 0;

  const handleSubmit = async () => {
    if (!stayContext || !template || !isFormValid()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/guest/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stayId: stayContext.stay.id,
        guestId: stayContext.stay.guestId,
        templateId: template.id,
        answers,
        propertyId: stayContext.propertyId,
      }),
    });
    const result = await res.json();

    if (result.success) setSuccess(true);
    else setError(result.error || "Ocorreu um erro inesperado.");

    setSubmitting(false);
  };

  // --- RENDERIZADORES ---
  const renderNPS = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 animate-in fade-in slide-in-from-bottom-2">
      <h3 className="text-lg font-semibold text-foreground mb-1 text-center">{qText(q)}</h3>
      {qDesc(q) && <p className="text-sm text-muted-foreground text-center mb-4">{qDesc(q)}</p>}
      <div className="grid grid-cols-11 gap-1 mb-2 mt-4">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <button
            key={num} onClick={() => handleAnswer(q.id, num)}
            className={`h-10 sm:h-12 flex items-center justify-center rounded-md text-sm font-semibold transition-all
              ${answers[q.id] === num ? 'bg-primary text-primary-foreground scale-110 shadow-md ring-2 ring-primary ring-offset-2' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
          >
            {num}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
        <span>{t.npsLow}</span><span>{t.npsHigh}</span>
      </div>
    </div>
  );

  const renderRating = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 bg-card border rounded-xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 text-center">
      <h3 className="text-base font-medium text-foreground mb-1">{qText(q)}</h3>
      {qDesc(q) && <p className="text-xs text-muted-foreground mb-3">{qDesc(q)}</p>}
      <div className="flex gap-2 justify-center mt-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} onClick={() => handleAnswer(q.id, star)} className="p-2 transition-transform hover:scale-110 focus:outline-none">
            <Star className={`w-8 h-8 ${(answers[q.id] || 0) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </div>
    </div>
  );

  const renderTextarea = (q: SurveyQuestion) => (
    <div key={q.id} className="mb-8 animate-in fade-in slide-in-from-bottom-2">
      <h3 className="text-base font-medium text-foreground mb-1">{qText(q)}</h3>
      {qDesc(q) && <p className="text-xs text-muted-foreground mb-3">{qDesc(q)}</p>}
      <Textarea
        placeholder={t.textPlaceholder} className="resize-none min-h-[120px] bg-background border-input shadow-sm"
        value={answers[q.id] || ""} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleAnswer(q.id, e.target.value)}
      />
    </div>
  );

  const renderChoice = (q: SurveyQuestion, isMultiple: boolean) => {
    const currentAnswers = answers[q.id] || (isMultiple ? [] : "");
    const opts = qOptions(q);

    const toggleMultiple = (opt: string) => {
      let arr = Array.isArray(currentAnswers) ? [...currentAnswers] : [];
      if (arr.includes(opt)) arr = arr.filter((a: string) => a !== opt);
      else arr.push(opt);
      handleAnswer(q.id, arr);
    };

    return (
      <div key={q.id} className="mb-8 bg-card border rounded-xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <h3 className="text-base font-medium text-foreground mb-1">{qText(q)}</h3>
        {qDesc(q) && <p className="text-xs text-muted-foreground mb-4">{qDesc(q)}</p>}
        <div className="flex flex-col gap-3 text-left mt-2">
          {opts.map((opt, i) => {
            const isChecked = isMultiple ? (Array.isArray(currentAnswers) && currentAnswers.includes(opt)) : currentAnswers === opt;
            return (
              <label key={i} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${isChecked ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'hover:bg-muted/50 border-input'}`}>
                <input
                  type={isMultiple ? "checkbox" : "radio"}
                  name={`question-${q.id}`}
                  className="w-5 h-5 accent-primary cursor-pointer"
                  checked={isChecked}
                  onChange={() => isMultiple ? toggleMultiple(opt) : handleAnswer(q.id, opt)}
                />
                <span className={`text-sm ${isChecked ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>{opt}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center p-4"><Loader2 className="w-10 h-10 animate-spin text-primary mb-4" /></div>;

  if (success) {
    const rewardDesc = template?.reward
      ? (lang === 'en' && template.reward.description_en) || (lang === 'es' && template.reward.description_es) || template.reward.description
      : null;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 animate-in zoom-in"><CheckCircle2 className="w-10 h-10" /></div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t.thankYou}</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">{t.thankYouSub}</p>
        {template?.reward?.hasReward && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 max-w-sm w-full animate-in fade-in slide-in-from-bottom-4">
            <Gift className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-emerald-900 font-semibold mb-2">{t.giftTitle}</h3>
            <p className="text-emerald-700 text-sm">{rewardDesc}</p>
          </div>
        )}
      </div>
    );
  }

  if (error || !template) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold text-destructive mb-2">{t.oops}</h1>
      <p className="text-muted-foreground">{error || t.errorLoad}</p>
    </div>
  );

  const templateTitle = (lang === 'en' && template.title_en) || (lang === 'es' && template.title_es) || template.title || t.title;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <header className="bg-card py-4 px-6 text-center border-b sticky top-0 z-10 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{templateTitle}</h1>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-6 flex flex-col mt-4">
        {template.questions.map((q) => {
          if (q.type === 'nps') return renderNPS(q);
          if (q.type === 'rating') return renderRating(q);
          if (q.type === 'long_text' || q.type === 'short_text') return renderTextarea(q);
          if (q.type === 'single_choice') return renderChoice(q, false);
          if (q.type === 'multiple_choice') return renderChoice(q, true);
          return null;
        })}

        <div className="mt-6">
          <Button size="lg" className="w-full h-14 text-base font-semibold shadow-md rounded-xl" onClick={handleSubmit} disabled={submitting || !isFormValid()}>
            {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t.submitting}</> : <>{t.submit} <Send className="w-5 h-5 ml-2" /></>}
          </Button>
          {!isFormValid() && <p className="text-xs text-center text-muted-foreground mt-3">{t.validationHint}</p>}
        </div>
      </main>
    </div>
  );
}
