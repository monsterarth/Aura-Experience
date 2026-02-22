"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { SurveyService } from "@/services/survey-service";
import { SurveyTemplate, SurveyCategoryItem } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Trash2, 
  Star, 
  Gift, 
  FileText, 
  CheckCircle2, 
  Loader2,
  ListOrdered,
  Pencil,
  Settings2,
  X,
  Edit2,
  Save
} from "lucide-react";

export default function SurveysManagementPage() {
  const router = useRouter();
  const { property } = useProperty();
  
  // Estados das Pesquisas
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Estados das Categorias (Modal)
  const [categories, setCategories] = useState<SurveyCategoryItem[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!property?.id) return;
    setLoading(true);
    const [templatesData, categoriesData] = await Promise.all([
      SurveyService.getTemplates(property.id),
      SurveyService.getCategories(property.id)
    ]);
    setTemplates(templatesData);
    setCategories(categoriesData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [property?.id]);

  // --- Ações de Pesquisas ---
  const handleSetDefault = async (templateId: string) => {
    if (!property?.id) return;
    setActionLoading(`default-${templateId}`);
    
    const success = await SurveyService.setDefaultTemplate(property.id, templateId);
    if (success) await fetchData(); 
    else alert("Erro ao definir como padrão.");
    
    setActionLoading(null);
  };

  const handleDelete = async (templateId: string, isDefault: boolean) => {
    if (!property?.id) return;
    if (isDefault) {
      alert("Você não pode excluir a pesquisa padrão atual. Defina outra como padrão primeiro.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir esta pesquisa?")) return;

    setActionLoading(`delete-${templateId}`);
    const success = await SurveyService.deleteTemplate(property.id, templateId);
    
    if (success) setTemplates(templates.filter(t => t.id !== templateId));
    else alert("Erro ao excluir pesquisa.");
    
    setActionLoading(null);
  };

  // --- Ações de Categorias ---
  const handleSaveCategory = async () => {
    if (!property?.id || !categoryInput.trim()) return;
    
    if (editingCategoryId) {
      const success = await SurveyService.updateCategory(property.id, editingCategoryId, categoryInput);
      if (success) {
        setCategories(categories.map(c => c.id === editingCategoryId ? { ...c, name: categoryInput } : c));
      }
    } else {
      const newCat = await SurveyService.addCategory(property.id, categoryInput);
      if (newCat) {
        setCategories([...categories, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }
    setCategoryInput("");
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!property?.id) return;
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;

    const success = await SurveyService.deleteCategory(property.id, id);
    if (success) setCategories(categories.filter(c => c.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-5 bg-background border-b sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Star className="w-6 h-6 text-primary" />
            Pesquisas de Satisfação (NPS)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os formulários de feedback enviados aos hóspedes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)} className="gap-2 shadow-sm">
            <Settings2 className="w-4 h-4" /> Categorias
          </Button>
          <Button onClick={() => router.push('/admin/surveys/new')} className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Nova Pesquisa
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p>Carregando pesquisas...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 bg-background border border-dashed rounded-2xl shadow-sm text-center p-6 animate-in fade-in">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Nenhuma pesquisa criada</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Você ainda não possui formulários de feedback. Crie sua primeira pesquisa para começar.
            </p>
            <Button onClick={() => router.push('/admin/surveys/new')} size="lg" className="gap-2">
              <Plus className="w-5 h-5" /> Criar Primeira Pesquisa
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            {templates.map((template) => (
              <div 
                key={template.id} 
                className={`flex flex-col bg-background rounded-xl p-5 shadow-sm border transition-all ${
                  template.isDefault ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-foreground line-clamp-1 pr-2" title={template.title}>
                    {template.title}
                  </h3>
                  {template.isDefault && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Padrão
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3 mb-6 flex-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ListOrdered className="w-4 h-4" />
                    <span>{template.questions?.length || 0} perguntas no formulário</span>
                  </div>
                  
                  {template.reward?.hasReward ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                      <Gift className="w-4 h-4" />
                      <span>Recompensa ativa</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
                      <Gift className="w-4 h-4" />
                      <span>Sem recompensa</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-4 border-t mt-auto">
                  {!template.isDefault && (
                    <Button 
                      variant="outline" 
                      className="text-sm h-9 flex-1"
                      disabled={actionLoading === `default-${template.id}`}
                      onClick={() => handleSetDefault(template.id)}
                    >
                      {actionLoading === `default-${template.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Definir Padrão"
                      )}
                    </Button>
                  )}
                  
                  <div className="flex items-center gap-1 ml-auto">
                    <Button 
                      variant="ghost" 
                      className="h-9 px-3 text-muted-foreground hover:text-primary"
                      onClick={() => router.push(`/admin/surveys/edit/${template.id}`)}
                      title="Editar pesquisa"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>

                    <Button 
                      variant="ghost" 
                      className="h-9 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={template.isDefault || actionLoading === `delete-${template.id}`}
                      onClick={() => handleDelete(template.id, template.isDefault)}
                    >
                      {actionLoading === `delete-${template.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DE GERENCIAMENTO DE CATEGORIAS */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background rounded-xl p-6 w-full max-w-md shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h2 className="text-lg font-bold text-foreground">Categorias (Métricas)</h2>
              <Button variant="ghost" size="icon" onClick={() => {
                setIsCategoryModalOpen(false);
                setEditingCategoryId(null);
                setCategoryInput("");
              }}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-6">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/10 group">
                  <span className="font-medium text-sm">{cat.name}</span>
                  <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setEditingCategoryId(cat.id);
                      setCategoryInput(cat.name);
                    }}>
                      <Edit2 className="w-3.5 h-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteCategory(cat.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4 border-t mt-auto">
              <input 
                type="text" 
                placeholder="Nova categoria..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveCategory()}
              />
              <Button onClick={handleSaveCategory} disabled={!categoryInput.trim()} className="h-10">
                {editingCategoryId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}