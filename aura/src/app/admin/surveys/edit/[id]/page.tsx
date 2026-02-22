"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { SurveyService } from "@/services/survey-service";
import { SurveyQuestion, SurveyQuestionType, SurveyReward, SurveyCategoryItem } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { 
  Plus, Trash2, Save, ArrowLeft, ArrowUp, ArrowDown, Gift, Settings, ListOrdered, Loader2, X, CircleDot, CheckSquare
} from "lucide-react";

export default function EditSurveyTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const { property } = useProperty();
  const templateId = params.id as string;

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  
  const [categories, setCategories] = useState<SurveyCategoryItem[]>([]);
  const [isQuickCreateModalOpen, setIsQuickCreateModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingQuestionIndex, setPendingQuestionIndex] = useState<number | null>(null);

  const [reward, setReward] = useState<SurveyReward>({ hasReward: false, type: "", description: "" });
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!property?.id || !templateId) return;
      const fetchedCats = await SurveyService.getCategories(property.id);
      setCategories(fetchedCats);

      const data = await SurveyService.getTemplateById(property.id, templateId);
      if (data) {
        setTitle(data.title);
        setIsDefault(data.isDefault);
        setReward(data.reward || { hasReward: false, type: "", description: "" });
        setQuestions((data.questions || []).sort((a, b) => a.position - b.position));
      } else {
        router.push("/admin/surveys");
      }
      setInitialLoading(false);
    }
    loadData();
  }, [property?.id, templateId, router]);

  const addQuestion = () => {
    const defaultCat = categories.length > 0 ? categories[0] : { id: "general", name: "Geral" };
    setQuestions([...questions, {
      id: crypto.randomUUID(), position: questions.length, text: "", description: "", type: "rating", categoryId: defaultCat.id, categoryName: defaultCat.name
    }]);
  };

  const updateQuestion = (index: number, field: keyof SurveyQuestion, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    if (field === 'type' && (value === 'single_choice' || value === 'multiple_choice')) {
      if (!newQuestions[index].options || newQuestions[index].options?.length === 0) {
        newQuestions[index].options = ["Opção 1", "Opção 2"];
      }
    }
    setQuestions(newQuestions);
  };

  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    if (!newQuestions[qIndex].options) newQuestions[qIndex].options = [];
    newQuestions[qIndex].options!.push("");
    setQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options![optIndex] = value;
    setQuestions(newQuestions);
  };

  const removeOption = (qIndex: number, optIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options!.splice(optIndex, 1);
    setQuestions(newQuestions);
  };

  const handleCategorySelectChange = (index: number, value: string) => {
    if (value === "NEW_CATEGORY") {
      setPendingQuestionIndex(index); setIsQuickCreateModalOpen(true);
    } else {
      const selectedCat = categories.find(c => c.id === value);
      if (selectedCat) {
        const newQuestions = [...questions];
        newQuestions[index].categoryId = selectedCat.id;
        newQuestions[index].categoryName = selectedCat.name;
        setQuestions(newQuestions);
      }
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!property?.id || !newCategoryName.trim() || pendingQuestionIndex === null) return;
    const newCat = await SurveyService.addCategory(property.id, newCategoryName);
    if (newCat) {
      setCategories([...categories, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      const newQuestions = [...questions];
      newQuestions[pendingQuestionIndex].categoryId = newCat.id;
      newQuestions[pendingQuestionIndex].categoryName = newCat.name;
      setQuestions(newQuestions);
    }
    setIsQuickCreateModalOpen(false); setNewCategoryName(""); setPendingQuestionIndex(null);
  };

  const removeQuestion = (index: number) => setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, position: i })));

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;
    const newQuestions = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[targetIndex];
    newQuestions[targetIndex] = temp;
    setQuestions(newQuestions.map((q, i) => ({ ...q, position: i })));
  };

  const handleSave = async () => {
    if (!property?.id || !templateId) return;
    if (!title.trim() || questions.length === 0) return;

    setSaving(true);
    const result = await SurveyService.updateTemplate(property.id, templateId, { title, isDefault, questions, reward });
    if (result.success) router.push("/admin/surveys"); else { alert(result.error); setSaving(false); }
  };

  if (initialLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20 relative">
      <header className="flex items-center justify-between px-6 py-4 bg-background border-b sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="w-5 h-5" /></Button>
          <div><h1 className="text-xl font-bold tracking-tight text-foreground">Editar Pesquisa</h1><p className="text-sm text-muted-foreground">{title}</p></div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">{saving ? "Salvando..." : <><Save className="w-4 h-4" /> Atualizar</>}</Button>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold flex items-center gap-2"><ListOrdered className="w-5 h-5 text-primary" /> Perguntas</h2></div>
          <div className="space-y-4">
            {questions.map((q, index) => (
              <div key={q.id} className="bg-background border rounded-xl p-5 shadow-sm relative group">
                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, 'up')} disabled={index === 0}><ArrowUp className="w-4 h-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, 'down')} disabled={index === questions.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                  <Button variant="destructive" size="icon" className="h-8 w-8 ml-2" onClick={() => removeQuestion(index)}><Trash2 className="w-4 h-4" /></Button>
                </div>

                <div className="pr-32 grid gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5"><label className="text-sm font-medium">Pergunta {index + 1}</label><input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={q.text} onChange={(e) => updateQuestion(index, 'text', e.target.value)} /></div>
                    <div className="space-y-1.5"><label className="text-sm font-medium">Tipo de Resposta</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={q.type} onChange={(e) => updateQuestion(index, 'type', e.target.value as SurveyQuestionType)}><option value="nps">NPS (0 a 10)</option><option value="rating">Estrelas (1 a 5)</option><option value="single_choice">Escolha Única (Radio)</option><option value="multiple_choice">Múltipla Escolha (Checkbox)</option><option value="short_text">Texto Curto</option><option value="long_text">Texto Longo</option></select></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Descrição / Dica</label><input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground" value={q.description || ""} onChange={(e) => updateQuestion(index, 'description', e.target.value)} /></div>
                    <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Categoria (BI)</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={q.categoryId || ""} onChange={(e) => handleCategorySelectChange(index, e.target.value)}><option value="" disabled>Selecione...</option>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}<option value="NEW_CATEGORY" className="font-semibold text-primary">+ Criar nova...</option></select></div>
                  </div>
                  
                  {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                    <div className="col-span-1 md:col-span-3 bg-muted/30 p-4 rounded-lg border border-dashed mt-2 animate-in fade-in zoom-in duration-300">
                      <label className="text-sm font-medium mb-3 block flex items-center gap-2">{q.type === 'single_choice' ? <CircleDot className="w-4 h-4 text-primary"/> : <CheckSquare className="w-4 h-4 text-primary"/>} Alternativas de Resposta</label>
                      <div className="space-y-2">
                        {(q.options || []).map((opt, optIndex) => (
                          <div key={optIndex} className="flex items-center gap-2"><input type="text" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={opt} onChange={(e) => updateOption(index, optIndex, e.target.value)} placeholder={`Opção ${optIndex + 1}`} /><Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeOption(index, optIndex)}><Trash2 className="w-4 h-4" /></Button></div>
                        ))}
                        <Button variant="outline" size="sm" className="mt-2 text-xs h-8" onClick={() => addOption(index)}><Plus className="w-3 h-3 mr-1" /> Adicionar Opção</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full border-dashed h-12 gap-2" onClick={addQuestion}><Plus className="w-4 h-4" /> Adicionar Pergunta</Button>
        </div>

        <div className="space-y-6">
          <div className="bg-background border rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-3"><Settings className="w-5 h-5 text-primary" /> Configurações</h2>
            <div className="space-y-2"><label className="text-sm font-medium">Título da Pesquisa</label><input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="space-y-0.5"><label className="text-sm font-medium">Pesquisa Padrão</label></div><input type="checkbox" className="w-5 h-5 accent-primary" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /></div>
          </div>
          <div className="bg-background border rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-3"><Gift className="w-5 h-5 text-emerald-500" /> Recompensa</h2>
            <div className="flex items-center justify-between p-3 border border-emerald-100 rounded-lg bg-emerald-50/50"><div className="space-y-0.5"><label className="text-sm font-medium text-emerald-900">Oferecer Recompensa</label></div><input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={reward.hasReward} onChange={(e) => setReward({ ...reward, hasReward: e.target.checked })} /></div>
            {reward.hasReward && (
              <div className="space-y-4 animate-in fade-in">
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reward.type} onChange={(e) => setReward({ ...reward, type: e.target.value as any })}><option value="" disabled>Selecione...</option><option value="discount">Cupom</option><option value="freebie">Brinde</option></select>
                <textarea className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" value={reward.description} onChange={(e) => setReward({ ...reward, description: e.target.value })} />
              </div>
            )}
          </div>
        </div>
      </main>
      
      {isQuickCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5 border-b pb-2"><h2 className="text-lg font-bold">Nova Categoria</h2><Button variant="ghost" size="icon" onClick={() => setIsQuickCreateModalOpen(false)}><X className="w-5 h-5" /></Button></div>
            <input type="text" autoFocus className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm mb-4" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nome..." />
            <Button onClick={handleQuickCreateCategory} disabled={!newCategoryName.trim()} className="w-full">Criar e Selecionar</Button>
          </div>
        </div>
      )}
    </div>
  );
}