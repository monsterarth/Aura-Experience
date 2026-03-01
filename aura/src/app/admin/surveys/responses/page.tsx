// src/app/admin/surveys/responses/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { SurveyResponse, SurveyTemplate } from "@/types/aura";
import { SurveyService, SurveyInsight } from "@/services/survey-service"; 
import { Button } from "@/components/ui/button";
import { 
  Star, 
  TrendingUp, 
  AlertTriangle, 
  MessageSquare, 
  Megaphone, 
  Heart,
  Smile,
  Frown,
  Loader2,
  CalendarDays,
  Download,
  Sparkles,
  Inbox,
  Clock,
  Bot,
  Search,
  LayoutList,
  X,
  FileText
} from "lucide-react";

export default function SurveysDashboardPage() {
  const { property } = useProperty();
  
  // Estados de Dados
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [latestInsight, setLatestInsight] = useState<SurveyInsight | null>(null);
  const [loading, setLoading] = useState(true);

  // Estados do Modal de Visualização Individual
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponse | null>(null);

  // Estados do Chat Sob Demanda (Aura AI)
  const [askStartDate, setAskStartDate] = useState("");
  const [askEndDate, setAskEndDate] = useState("");
  const [askPrompt, setAskPrompt] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  // Busca os dados brutos, os templates (para ler as perguntas) e o Insight SEMANAL do n8n
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!property?.id) return;
      setLoading(true);
      try {
        const [responsesData, insightData, templatesData] = await Promise.all([
          SurveyService.getResponses(property.id),
          SurveyService.getLatestInsight(property.id, 'weekly'),
          SurveyService.getTemplates(property.id)
        ]);
        
        setResponses(responsesData);
        setLatestInsight(insightData);
        setTemplates(templatesData);
      } catch (error) {
        console.error("Erro ao buscar dados do dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [property?.id]);

  // Motor de Cálculo de KPIs Quantitativos
  const dashboardData = useMemo(() => {
    if (!responses.length) return null;

    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let totalNpsScores = 0;
    let sumRatings = 0;
    let totalRatings = 0;

    const categoryAggregator: Record<string, { sum: number; count: number }> = {};

    responses.forEach(res => {
      if (res.metrics?.npsScore !== undefined) {
        totalNpsScores++;
        if (res.metrics.npsScore >= 9) promoters++;
        else if (res.metrics.npsScore >= 7) passives++;
        else detractors++;
      }
      if (res.metrics?.averageRating !== undefined) {
        sumRatings += res.metrics.averageRating;
        totalRatings++;
      }

      // Agregador para a Média por Categorias
      if (res.metrics?.categoryRatings) {
        Object.entries(res.metrics.categoryRatings).forEach(([cat, score]) => {
          if (!categoryAggregator[cat]) categoryAggregator[cat] = { sum: 0, count: 0 };
          categoryAggregator[cat].sum += score;
          categoryAggregator[cat].count++;
        });
      }
    });

    const nps = totalNpsScores > 0 ? Math.round(((promoters - detractors) / totalNpsScores) * 100) : 0;
    const avgRating = totalRatings > 0 ? (sumRatings / totalRatings).toFixed(1) : "0.0";
    
    // Calcula a média final e ordena da maior para a menor nota
    const categoryAverages = Object.entries(categoryAggregator)
      .map(([name, data]) => ({ name, avg: data.sum / data.count }))
      .sort((a, b) => b.avg - a.avg);

    return {
      nps,
      totalResponses: responses.length,
      promoters, passives, detractors,
      promotersPerc: totalNpsScores > 0 ? Math.round((promoters / totalNpsScores) * 100) : 0,
      passivesPerc: totalNpsScores > 0 ? Math.round((passives / totalNpsScores) * 100) : 0,
      detractorsPerc: totalNpsScores > 0 ? Math.round((detractors / totalNpsScores) * 100) : 0,
      avgRating,
      categoryAverages
    };
  }, [responses]);

  // Lógica da Análise Sob Demanda (Aura AI)
  const handleAskAI = async () => {
    if (!askStartDate || !askEndDate || !askPrompt.trim()) {
      alert("Por favor, preencha as datas e a pergunta.");
      return;
    }

    setAskLoading(true);
    setAskAnswer(null);

    const start = new Date(askStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(askEndDate);
    end.setHours(23, 59, 59, 999);

    const filteredResponses = responses.filter(r => {
      const rDate = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return rDate >= start && rDate <= end;
    });

    const textComments = filteredResponses
      .map(r => r.answers.find(a => typeof a.value === 'string')?.value)
      .filter(Boolean);

    try {
      const res = await fetch('/api/ai/ask-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: askPrompt, comments: textComments })
      });

      const data = await res.json();
      setAskAnswer(data.error ? "Ocorreu um erro ao processar a requisição com a IA." : data.answer);
    } catch (error) {
      console.error("Erro ao falar com Aura AI:", error);
      setAskAnswer("Falha de conexão com os servidores da IA.");
    } finally {
      setAskLoading(false);
    }
  };

  const getNpsColor = (score: number) => {
    if (score >= 75) return "text-emerald-500";
    if (score >= 50) return "text-yellow-500";
    return "text-rose-500";
  };

  // Funções Auxiliares para o Modal e Cards
  const getQuestionText = (templateId: string, questionId: string) => {
    const template = templates.find(t => t.id === templateId);
    return template?.questions.find(q => q.id === questionId)?.text || "Pergunta não encontrada";
  };

  const getQuestionType = (templateId: string, questionId: string) => {
    const template = templates.find(t => t.id === templateId);
    return template?.questions.find(q => q.id === questionId)?.type;
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-muted/20">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm font-medium animate-pulse">Sincronizando painel executivo...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20 overflow-y-auto custom-scrollbar">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between px-6 py-6 bg-background border-b sticky top-0 z-10 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Dashboard de Avaliações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inteligência de dados e feedback dos hóspedes em tempo real
          </p>
        </div>
        {responses.length > 0 && (
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 shadow-sm bg-background">
              <CalendarDays className="w-4 h-4" /> Últimos 30 dias
            </Button>
            <Button className="gap-2 shadow-sm">
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {responses.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-96 bg-background border border-dashed rounded-2xl shadow-sm text-center p-6 animate-in fade-in">
             <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
               <Inbox className="w-8 h-8" />
             </div>
             <h2 className="text-xl font-bold text-foreground mb-2">Aguardando Avaliações</h2>
             <p className="text-muted-foreground max-w-md mb-6">
               Nenhum hóspede respondeu às pesquisas ainda. Assim que houver volume, o painel será preenchido e a IA poderá analisar os dados.
             </p>
           </div>
        ) : (
          <>
            {/* ==========================================
                BLOCO 1: KPIs GERAIS & MÉDIAS POR CATEGORIA
                ========================================== */}
            {dashboardData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4">
                
                {/* Média de Satisfação */}
                <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Satisfação Geral</h3>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-black tracking-tighter text-foreground">{dashboardData.avgRating}</span>
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 mb-1" />
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    Média de todas as perguntas
                  </div>
                </div>

                {/* Net Promoter Score */}
                <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Heart className="w-16 h-16" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Net Promoter Score (NPS)</h3>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className={`text-4xl font-black tracking-tighter ${getNpsColor(dashboardData.nps)}`}>
                      {dashboardData.nps}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">pontos</span>
                  </div>
                  <div className="mt-4 text-xs font-medium bg-muted/50 w-fit px-2.5 py-1 rounded-md text-muted-foreground">
                    Zona de {dashboardData.nps >= 75 ? 'Excelência' : dashboardData.nps >= 50 ? 'Qualidade' : 'Aperfeiçoamento'}
                  </div>
                </div>

                {/* Termômetro NPS */}
                <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col lg:col-span-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Termômetro de Hóspedes</h3>
                    <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {dashboardData.totalResponses} Respostas
                    </span>
                  </div>
                  <div className="h-4 w-full flex rounded-full overflow-hidden mt-2 bg-muted">
                    <div style={{ width: `${dashboardData.promotersPerc}%` }} className="bg-emerald-500 h-full transition-all duration-1000" />
                    <div style={{ width: `${dashboardData.passivesPerc}%` }} className="bg-yellow-400 h-full transition-all duration-1000" />
                    <div style={{ width: `${dashboardData.detractorsPerc}%` }} className="bg-rose-500 h-full transition-all duration-1000" />
                  </div>
                  <div className="flex justify-between mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Smile className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium">{dashboardData.promotersPerc}% Promotores</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-medium">{dashboardData.passivesPerc}% Neutros</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Frown className="w-4 h-4 text-rose-500" />
                      <span className="font-medium">{dashboardData.detractorsPerc}% Detratores</span>
                    </div>
                  </div>
                </div>

                {/* DESEMPENHO POR CATEGORIA (O NOVO BLOCO) */}
                {dashboardData.categoryAverages.length > 0 && (
                  <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col lg:col-span-4 mt-2">
                    <div className="flex items-center gap-2 mb-5 border-b pb-3">
                      <LayoutList className="w-5 h-5 text-primary" />
                      <h3 className="text-base font-bold text-foreground">Desempenho por Categoria</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                      {dashboardData.categoryAverages.map(cat => (
                        <div key={cat.name} className="flex flex-col gap-2">
                          <div className="flex justify-between items-center text-sm font-medium">
                            <span className="truncate pr-2 text-muted-foreground">{cat.name}</span>
                            <span className="flex items-center gap-1 font-bold text-foreground">
                              {cat.avg.toFixed(1)} <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 -mt-0.5" />
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden border border-white/5">
                            <div 
                              style={{ width: `${(cat.avg / 5) * 100}%` }} 
                              className={`h-full transition-all duration-1000 ${cat.avg >= 4.5 ? 'bg-emerald-500' : cat.avg >= 3.5 ? 'bg-yellow-400' : 'bg-rose-500'}`} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
                BLOCO 2: AURA AI (ANÁLISE SOB DEMANDA)
                ========================================== */}
            <div className="bg-background rounded-2xl p-6 border shadow-sm animate-in fade-in slide-in-from-bottom-5">
              <div className="flex items-center gap-2 mb-6">
                <Bot className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Aura AI: Pergunte aos Dados</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Data Inicial</label>
                  <input 
                    type="date" 
                    value={askStartDate}
                    onChange={(e) => setAskStartDate(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Data Final</label>
                  <input 
                    type="date" 
                    value={askEndDate}
                    onChange={(e) => setAskEndDate(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Sua Pergunta</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Ex: Houve reclamações de barulho ou Wi-Fi?"
                      value={askPrompt}
                      onChange={(e) => setAskPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <Button onClick={handleAskAI} disabled={askLoading || !askPrompt} className="gap-2">
                      {askLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Pesquisar
                    </Button>
                  </div>
                </div>
              </div>

              {askAnswer && (
                <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-5 relative">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground mb-1">Análise da Aura AI</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {askAnswer}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ==========================================
                BLOCO 3: FEEDBACKS RECENTES (MURAL)
                ========================================== */}
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  Mural de Avaliações
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {responses.map((response) => {
                  const isDetractor = response.metrics?.isDetractor;
                  
                  // Busca TODAS as respostas de texto curtas e longas
                  const textAnswersList = response.answers.filter(a => {
                     const type = getQuestionType(response.templateId, a.questionId);
                     return (type === 'short_text' || type === 'long_text') && a.value?.trim();
                  });

                  return (
                    <div 
                      key={response.id} 
                      className={`bg-background rounded-xl border flex flex-col shadow-sm transition-all hover:shadow-md hover:border-primary/40 ${
                        isDetractor ? 'border-rose-500/30 bg-rose-500/5' : 'border-border'
                      }`}
                    >
                      {/* Cabecalho do Card */}
                      <div className="p-5 pb-4 border-b border-white/5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                              Reserva: {response.stayId.slice(0, 6).toUpperCase()}
                              {isDetractor && (
                                <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                  Detrator
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(response.createdAt?.toDate ? response.createdAt.toDate() : response.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-md border border-white/5 shadow-inner">
                            <Star className={`w-3.5 h-3.5 ${response.metrics?.npsScore && response.metrics.npsScore >= 9 ? 'text-emerald-500 fill-emerald-500' : response.metrics?.npsScore && response.metrics.npsScore >= 7 ? 'text-yellow-400 fill-yellow-400' : 'text-rose-500 fill-rose-500'}`} />
                            <span className="text-sm font-bold">{response.metrics?.npsScore || response.metrics?.averageRating || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Corpo do Card: Exibe os textos */}
                      <div className="p-5 flex-1 flex flex-col gap-3">
                        {textAnswersList.length > 0 ? (
                          textAnswersList.map(textAns => (
                            <div key={textAns.questionId} className="bg-muted/50 p-3 rounded-lg border border-white/5">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                {getQuestionText(response.templateId, textAns.questionId)}
                              </span>
                              <p className="text-sm text-foreground/90 italic leading-relaxed line-clamp-3">
                                "{textAns.value}"
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-4 italic">
                            Sem comentários por escrito.
                          </div>
                        )}
                      </div>

                      {/* Rodapé do Card: Ações */}
                      <div className="p-4 pt-0 mt-auto">
                        <Button 
                          variant={isDetractor ? 'destructive' : 'secondary'} 
                          className="w-full h-9 text-xs font-bold shadow-sm"
                          onClick={() => setSelectedResponse(response)}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Abrir Avaliação
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ==========================================
          MODAL: VISUALIZAÇÃO COMPLETA DA AVALIAÇÃO
          ========================================== */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden">
            
            {/* Cabecalho Modal */}
            <div className="flex justify-between items-center p-6 bg-muted/30 border-b">
              <div>
                <h2 className="text-lg font-black text-foreground">Ficha de Avaliação</h2>
                <p className="text-sm text-muted-foreground">ID da Reserva: {selectedResponse.stayId}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedResponse(null)} className="rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Corpo Modal */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              
              {/* Highlight Metrics */}
              <div className="flex gap-4 mb-6">
                {selectedResponse.metrics?.npsScore !== undefined && (
                  <div className="bg-muted/50 rounded-xl p-4 flex-1 border border-white/5 text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Nota NPS</p>
                    <span className={`text-3xl font-black ${getNpsColor(selectedResponse.metrics.npsScore)}`}>
                      {selectedResponse.metrics.npsScore}
                    </span>
                  </div>
                )}
                {selectedResponse.metrics?.averageRating !== undefined && (
                  <div className="bg-muted/50 rounded-xl p-4 flex-1 border border-white/5 text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Média (Estrelas)</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-3xl font-black text-foreground">{selectedResponse.metrics.averageRating}</span>
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Perguntas e Respostas Individuais */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold border-b pb-2 mb-4">Respostas Individuais</h3>
                
                {selectedResponse.answers.map(ans => {
                  const type = getQuestionType(selectedResponse.templateId, ans.questionId);
                  const text = getQuestionText(selectedResponse.templateId, ans.questionId);

                  return (
                    <div key={ans.questionId} className="bg-muted/20 p-4 rounded-xl border border-border">
                      <p className="text-sm font-medium text-foreground mb-2">{text}</p>
                      
                      {type === 'rating' ? (
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star} 
                              className={`w-4 h-4 ${star <= Number(ans.value) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`} 
                            />
                          ))}
                        </div>
                      ) : type === 'nps' ? (
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${getNpsColor(Number(ans.value))} bg-muted`}>
                          {ans.value}
                        </span>
                      ) : type === 'short_text' || type === 'long_text' ? (
                        <p className="text-sm text-muted-foreground italic bg-background p-3 rounded-lg border">
                          "{ans.value || 'Sem resposta.'}"
                        </p>
                      ) : (
                        <span className="text-sm text-muted-foreground font-medium">{ans.value}</span>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Rodape Modal */}
            <div className="p-4 bg-muted/30 border-t flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Avaliação enviada em {new Date(selectedResponse.createdAt?.toDate ? selectedResponse.createdAt.toDate() : selectedResponse.createdAt).toLocaleString('pt-BR')}
              </span>
              <Button onClick={() => setSelectedResponse(null)} className="h-9 px-6">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}