//src/app/admin/comunicacao/automations/settings/page.tsx

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { AutomationService } from "@/services/automation-service";
import { AutomationRule, MessageTemplate } from "@/types/aura";
import { Button } from "@/components/ui/button";
import { 
  Settings, 
  ArrowLeft, 
  FileText, 
  Plus, 
  Save, 
  Trash2, 
  Wand2,
  Clock,
  Zap,
  Loader2,
  X,
  Edit2
} from "lucide-react";

const AVAILABLE_VARIABLES = [
  { key: "{{guest_name}}", label: "Primeiro Nome", desc: "Ex: Arthur" },
  { key: "{{guest_full_name}}", label: "Nome Completo", desc: "Ex: Arthur Petry" },
  { key: "{{cabin_name}}", label: "Nome da Cabana", desc: "Ex: 01 - Praia" },
  { key: "{{portal_link}}", label: "Link do Portal", desc: "Acesso ao Pré Check-in" },
  { key: "{{access_code}}", label: "Código de Acesso", desc: "Senha de 5 dígitos" },
  { key: "{{survey_link}}", label: "Link do NPS", desc: "Pesquisa de Satisfação" },
  { key: "{{wifi_ssid}}", label: "Rede Wi-Fi", desc: "Nome da rede da cabana" },
  { key: "{{wifi_password}}", label: "Senha Wi-Fi", desc: "Senha da rede" },
];

const TRIGGER_DETAILS: Record<string, { label: string, desc: string }> = {
  'pre_checkin_48h': { label: 'Pré Check-in (48h)', desc: 'Enviado 2 dias antes da chegada programada.' },
  'pre_checkin_24h': { label: 'Pré Check-in (24h)', desc: 'Enviado 1 dia antes da chegada.' },
  'welcome_checkin': { label: 'Boas-vindas', desc: 'Disparado assim que a recepção clica em "Fazer Check-in".' },
  'pre_checkout': { label: 'Instruções de Saída', desc: 'Enviado às 18h do dia anterior à saída.' },
  'checkout_thanks': { label: 'Agradecimento', desc: 'Disparado quando a conta é encerrada (Check-out).' },
  'nps_survey': { label: 'Pesquisa NPS', desc: 'Enviado X horas após a saída do hóspede.' },
};

export default function AutomationSettingsPage() {
  const router = useRouter();
  const { property } = useProperty();
  
  const [activeTab, setActiveTab] = useState<'rules' | 'templates'>('rules');
  const [loading, setLoading] = useState(true);
  
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [savingRule, setSavingRule] = useState<string | null>(null);

  // Template Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<MessageTemplate> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchData = async () => {
    if (!property?.id) return;
    setLoading(true);
    const [fetchedRules, fetchedTemplates] = await Promise.all([
      AutomationService.getRules(property.id),
      AutomationService.getTemplates(property.id)
    ]);
    setRules(fetchedRules);
    setTemplates(fetchedTemplates);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [property?.id]);

  // --- Ações de Regras ---
  const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
    if (!property?.id) return;
    setSavingRule(ruleId);
    await AutomationService.updateRule(property.id, ruleId, { active: !currentStatus });
    setRules(rules.map(r => r.id === ruleId ? { ...r, active: !currentStatus } : r));
    setSavingRule(null);
  };

  const handleUpdateRuleData = async (ruleId: string, field: 'templateId' | 'delayMinutes', value: any) => {
    if (!property?.id) return;
    setSavingRule(ruleId);
    await AutomationService.updateRule(property.id, ruleId, { [field]: value });
    setRules(rules.map(r => r.id === ruleId ? { ...r, [field]: value } : r));
    setSavingRule(null);
  };

  // --- Ações de Templates ---
  const handleOpenTemplateModal = (template?: MessageTemplate) => {
    if (template) {
      setEditingTemplate(template);
    } else {
      setEditingTemplate({ name: "", body: "", variables: [] });
    }
    setIsTemplateModalOpen(true);
  };

  const insertVariable = (variableKey: string) => {
    if (!editingTemplate || !textareaRef.current) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const currentBody = editingTemplate.body || "";
    
    const newBody = currentBody.substring(0, start) + variableKey + currentBody.substring(end);
    
    setEditingTemplate({ ...editingTemplate, body: newBody });
    
    // Reposiciona o cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + variableKey.length;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleSaveTemplate = async () => {
    if (!property?.id || !editingTemplate?.name?.trim() || !editingTemplate?.body?.trim()) {
      alert("Preencha o nome e o texto da mensagem.");
      return;
    }
    
    const success = await AutomationService.saveTemplate(property.id, editingTemplate);
    if (success) {
      await fetchData(); // Recarrega para obter o ID caso seja novo
      setIsTemplateModalOpen(false);
    } else {
      alert("Erro ao salvar template.");
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!property?.id) return;
    // Verifica se está em uso
    const inUse = rules.some(r => r.templateId === templateId);
    if (inUse) {
      alert("Este template está sendo usado por uma regra ativa. Altere a regra antes de excluir.");
      return;
    }
    
    if (!confirm("Excluir este template definitivamente?")) return;
    
    const success = await AutomationService.deleteTemplate(property.id, templateId);
    if (success) setTemplates(templates.filter(t => t.id !== templateId));
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 pb-20">
      <header className="flex items-center justify-between px-6 py-5 bg-background border-b sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Settings className="w-6 h-6 text-primary" />
              Configurações de Automação
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gatilhos e Textos Dinâmicos da Fazenda
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        
        {/* Navegação de Abas */}
        <div className="flex space-x-1 bg-muted/50 p-1 rounded-xl mb-8 w-full max-w-md">
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'rules' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="w-4 h-4" />
            Gatilhos (Regras)
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'templates' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-4 h-4" />
            Textos (Templates)
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">A carregar configurações...</p>
          </div>
        ) : activeTab === 'rules' ? (
          
          /* ABA 1: REGRAS E GATILHOS */
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            {rules.map(rule => {
              const details = TRIGGER_DETAILS[rule.id] || { label: rule.id, desc: 'Gatilho do sistema' };
              
              return (
                <div key={rule.id} className={`bg-background border rounded-xl p-5 shadow-sm transition-all ${rule.active ? 'border-primary/40 ring-1 ring-primary/10' : 'opacity-75'}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    
                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-foreground">{details.label}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${rule.active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          {rule.active ? 'Ativado' : 'Desativado'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{details.desc}</p>
                    </div>

                    {/* Controles */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                      
                      <div className="space-y-1.5 w-full sm:w-56">
                        <label className="text-xs font-medium text-muted-foreground">Qual mensagem enviar?</label>
                        <select 
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                          value={rule.templateId}
                          onChange={(e) => handleUpdateRuleData(rule.id, 'templateId', e.target.value)}
                          disabled={savingRule === rule.id}
                        >
                          <option value="" disabled>Selecione um texto...</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1.5 w-full sm:w-32">
                        <label className="text-xs font-medium text-muted-foreground">Atraso (Delay)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pl-8 disabled:opacity-50"
                            value={rule.delayMinutes || 0}
                            onChange={(e) => handleUpdateRuleData(rule.id, 'delayMinutes', parseInt(e.target.value) || 0)}
                            disabled={savingRule === rule.id}
                          />
                          <Clock className="w-4 h-4 absolute left-2.5 top-3 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="flex items-center justify-end w-full sm:w-auto mt-4 sm:mt-0 pt-2 sm:pt-6">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={rule.active}
                            onChange={() => handleToggleRule(rule.id, rule.active)}
                            disabled={savingRule === rule.id || (!rule.templateId && !rule.active)}
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                      
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        ) : (
          
          /* ABA 2: TEMPLATES */
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">Biblioteca de Textos</h2>
              <Button onClick={() => handleOpenTemplateModal()} className="gap-2">
                <Plus className="w-4 h-4" /> Novo Texto
              </Button>
            </div>

            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-background border border-dashed rounded-xl text-center">
                <FileText className="w-10 h-10 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground">Nenhum texto criado</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">Crie modelos de mensagens para usar nos gatilhos da recepção.</p>
                <Button variant="outline" onClick={() => handleOpenTemplateModal()}>Criar Modelo</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(template => (
                  <div key={template.id} className="bg-background border rounded-xl p-5 shadow-sm flex flex-col">
                    <h3 className="font-bold text-foreground mb-2 line-clamp-1">{template.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1 bg-muted/30 p-3 rounded-lg border border-dashed">
                      {template.body}
                    </p>
                    <div className="flex items-center gap-2 pt-4 border-t">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenTemplateModal(template)}>
                        <Edit2 className="w-3.5 h-3.5 mr-2" /> Editar
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTemplate(template.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL DE EDIÇÃO DE TEMPLATE */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background rounded-xl w-full max-w-3xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
            
            <div className="flex justify-between items-center p-5 border-b bg-muted/10">
              <div>
                <h2 className="text-lg font-bold">Construtor de Mensagem</h2>
                <p className="text-xs text-muted-foreground">Use as variáveis abaixo para personalizar o texto.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsTemplateModalOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Editor Textual */}
              <div className="lg:col-span-2 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Nome de Identificação Interna</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Boas Vindas Praia 1"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
                    value={editingTemplate.name || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Texto do WhatsApp</label>
                  <textarea 
                    ref={textareaRef}
                    placeholder="Olá {{guest_name}}! Seja bem vindo à..."
                    className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm resize-none focus-visible:ring-1 focus-visible:ring-primary shadow-inner"
                    value={editingTemplate.body || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  />
                </div>
              </div>

              {/* Painel de Variáveis */}
              <div className="bg-muted/30 border rounded-lg p-4 space-y-3 h-fit sticky top-0">
                <h3 className="text-sm font-bold flex items-center gap-2 border-b pb-2">
                  <Wand2 className="w-4 h-4 text-primary" /> Variáveis Mágicas
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Clique para inserir no texto:
                </p>
                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                  {AVAILABLE_VARIABLES.map(v => (
                    <button 
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="flex flex-col items-start p-2 rounded-md border border-transparent hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                    >
                      <span className="text-xs font-mono font-bold text-primary">{v.key}</span>
                      <span className="text-[10px] text-muted-foreground">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <div className="p-5 border-t bg-muted/10 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsTemplateModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveTemplate} className="gap-2">
                <Save className="w-4 h-4" /> Salvar Modelo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}