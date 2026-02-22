"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { SurveyService } from "@/services/survey-service";
import { SurveyQuestion, SurveyQuestionType, SurveyReward, SurveyCategoryItem } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft, 
  ArrowUp, 
  ArrowDown, 
  Gift, 
  Settings, 
  ListOrdered,
  X
} from "lucide-react";

export default function CreateSurveyTemplatePage() {
  const router = useRouter();
  const { property } = useProperty();

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("Pesquisa Pós-Estadia");
  const [isDefault, setIsDefault] = useState(true);
  
  const [categories, setCategories] = useState<SurveyCategoryItem[]>([]);
  
  // Estado para Criação Rápida de Categoria
  const [isQuickCreateModalOpen, setIsQuickCreateModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingQuestionIndex, setPendingQuestionIndex] = useState<number | null>(null);

  const [reward, setReward] = useState<SurveyReward>({
    hasReward: false,
    type: "",
    description: ""
  });

  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);

  useEffect(() => {
    async function fetchCategories() {
      if (!property?.id) return;
      const fetchedCats = await SurveyService.getCategories(property.id);
      setCategories(fetchedCats);
      
      const defaultCat = fetchedCats.length > 0 ? fetchedCats[0] : { id: "general", name: "Geral" };
      
      setQuestions([
        {
          id: crypto.randomUUID(),
          position: 0,
          text: "Em uma escala de 0 a 10, o quanto você recomendaria nossa pousada?",
          description: "Sua opinião é muito importante para nós.",
          type: "nps",
          categoryId: defaultCat.id,
          categoryName: defaultCat.name
        }
      ]);
    }
    fetchCategories();
  }, [property?.id]);

  // --- Manipulação de Perguntas ---
  const addQuestion = () => {
    const defaultCat = categories.length > 0 ? categories[0] : { id: "general", name: "Geral" };
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        position: questions.length,
        text: "",
        description: "",
        type: "rating",
        categoryId: defaultCat.id,
        categoryName: defaultCat.name
      }
    ]);
  };

  const updateQuestion = (index: number, field: keyof SurveyQuestion, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setQuestions(newQuestions);
  };

  const handleCategorySelectChange = (index: number, value: string) => {
    if (value === "NEW_CATEGORY") {
      setPendingQuestionIndex(index);
      setIsQuickCreateModalOpen(true);
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
      const updatedCats = [...categories, newCat].sort((a, b) => a.name.localeCompare(b.name));
      setCategories(updatedCats);
      
      const newQuestions = [...questions];
      newQuestions[pendingQuestionIndex].categoryId = newCat.id;
      newQuestions[pendingQuestionIndex].categoryName = newCat.name;
      setQuestions(newQuestions);
    }
    
    setIsQuickCreateModalOpen(false);
    setNewCategoryName("");
    setPendingQuestionIndex(null);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    const reordered = newQuestions.map((q, i) => ({ ...q, position: i }));
    setQuestions(reordered);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;

    const newQuestions = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[targetIndex];
    newQuestions[targetIndex] = temp;

    const reordered = newQuestions.map((q, i) => ({ ...q, position: i }));
    setQuestions(reordered);
  };

  const handleSave = async () => {
    if (!property?.id) return;
    if (!title.trim()) { alert("O título é obrigatório."); return; }
    if (questions.length === 0) { alert("Adicione pelo menos uma pergunta."); return; }

    setLoading(true);
    const result = await SurveyService.createTemplate(property.id, {
      title, isDefault, questions, reward
    });

    if (result.success) router.push("/admin/surveys"); 
    else { alert(result.error); setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20 relative">
      <header className="flex items-center justify-between px-6 py-4 bg-background border-b sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Nova Pesquisa</h1>
            <p className="text-sm text-muted-foreground">Crie um modelo de formulário</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={loading} className="gap-2">
          {loading ? "Salvando..." : <><Save className="w-4 h-4" /> Salvar Pesquisa</>}
        </Button>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna Esquerda: Construtor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-primary" />
              Perguntas do Formulário
            </h2>
          </div>

          <div className="space-y-4">
            {questions.map((q, index) => (
              <div key={q.id} className="bg-background border rounded-xl p-5 shadow-sm relative group animate-in fade-in">
                
                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, 'up')} disabled={index === 0}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, 'down')} disabled={index === questions.length - 1}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="icon" className="h-8 w-8 ml-2" onClick={() => removeQuestion(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="pr-32 grid gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-sm font-medium">Pergunta {index + 1}</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Como você avalia a limpeza?"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={q.text}
                        onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Tipo de Resposta</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={q.type}
                        onChange={(e) => updateQuestion(index, 'type', e.target.value as SurveyQuestionType)}
                      >
                        <option value="nps">NPS (0 a 10)</option>
                        <option value="rating">Estrelas (1 a 5)</option>
                        <option value="short_text">Texto Curto</option>
                        <option value="long_text">Texto Longo</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Descrição / Dica (Opcional)</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Considere o banheiro e as roupas de cama"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
                        value={q.description || ""}
                        onChange={(e) => updateQuestion(index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Categoria (BI)</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={q.categoryId || ""}
                        onChange={(e) => handleCategorySelectChange(index, e.target.value)}
                      >
                        <option value="" disabled>Selecione...</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                        <option value="NEW_CATEGORY" className="font-semibold text-primary">
                          + Criar nova...
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full border-dashed h-12 gap-2" onClick={addQuestion}>
            <Plus className="w-4 h-4" /> Adicionar Pergunta
          </Button>
        </div>

        {/* Coluna Direita: Configurações */}
        <div className="space-y-6">
          <div className="bg-background border rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-3">
              <Settings className="w-5 h-5 text-primary" /> Configurações
            </h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">Título da Pesquisa</label>
              <input 
                type="text" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Pesquisa Padrão</label>
                <p className="text-xs text-muted-foreground">Enviar no check-out</p>
              </div>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-primary cursor-pointer"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
            </div>
          </div>

          <div className="bg-background border rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-3">
              <Gift className="w-5 h-5 text-emerald-500" /> Recompensa
            </h2>
            <div className="flex items-center justify-between p-3 border border-emerald-100 rounded-lg bg-emerald-50/50">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-emerald-900">Oferecer Recompensa</label>
                <p className="text-xs text-emerald-600">Ao finalizar a pesquisa</p>
              </div>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500 cursor-pointer"
                checked={reward.hasReward}
                onChange={(e) => setReward({ ...reward, hasReward: e.target.checked })}
              />
            </div>

            {reward.hasReward && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo de Recompensa</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={reward.type}
                    onChange={(e) => setReward({ ...reward, type: e.target.value as any })}
                  >
                    <option value="" disabled>Selecione um tipo...</option>
                    <option value="discount">Cupom de Desconto</option>
                    <option value="freebie">Brinde na Próxima Estadia</option>
                    <option value="points">Pontos / Fidelidade</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mensagem da Recompensa</label>
                  <textarea 
                    placeholder="Ex: Use o cupom VOLTESEMPRE..."
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    value={reward.description}
                    onChange={(e) => setReward({ ...reward, description: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE CRIAÇÃO RÁPIDA DE CATEGORIA */}
      {isQuickCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-foreground">Nova Categoria</h2>
              <Button variant="ghost" size="icon" className="-mr-2" onClick={() => {
                setIsQuickCreateModalOpen(false);
                setNewCategoryName("");
                setPendingQuestionIndex(null);
              }}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Nome da Categoria</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Ex: Recreação Infantil"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickCreateCategory()}
                />
              </div>
              <Button onClick={handleQuickCreateCategory} disabled={!newCategoryName.trim()} className="w-full">
                Criar e Selecionar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}