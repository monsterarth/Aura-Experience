"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Bot, MessageSquare, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { ChecklistSettingsModal } from "@/components/admin/ChecklistSettingsModal";

export default function GlobalTemplatesPage() {
    const router = useRouter();
    const { isSuperAdmin } = useAuth();

    const [activeTab, setActiveTab] = useState<'automations' | 'messages' | 'checklists'>('checklists');

    if (!isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-center space-y-4">
                <ShieldCheck className="text-red-500" size={64} />
                <h1 className="text-2xl font-black text-foreground">Acesso Restrito</h1>
                <p className="text-muted-foreground">Esta área é exclusiva para Super Admins da Aura Engine.</p>
                <button
                    onClick={() => router.push('/admin/core/dashboard')}
                    className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl"
                >
                    Voltar ao Dashboard
                </button>
            </div>
        );
    }

    // O pulo do gato: forçamos o ID 'SYSTEM_DEFAULTS' para que os modais gravem os dados na base global
    const systemPropertyId = 'SYSTEM_DEFAULTS';

    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-8 min-h-screen">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-3 bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <Bot className="text-primary" /> Templates Aura
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium mt-1">
                            Crie e edite as Automações, Mensagens e Checklists Padrão que novas propriedades usarão.
                        </p>
                    </div>
                </div>
            </header>

            {/* Navegação por Abas */}
            <div className="flex border-b border-border gap-8 overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setActiveTab('checklists')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap", activeTab === 'checklists' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                    <ShieldCheck size={16} /> Checklists Base
                </button>
                <button
                    disabled
                    onClick={() => setActiveTab('automations')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap opacity-50 cursor-not-allowed")}
                    title="Em breve. Use a página de Automações tradicional injetando código."
                >
                    <Bot size={16} /> Automações Globais (Em Breve)
                </button>
                <button
                    disabled
                    onClick={() => setActiveTab('messages')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap opacity-50 cursor-not-allowed")}
                    title="Em breve."
                >
                    <MessageSquare size={16} /> Templates de Mensagem (Em Breve)
                </button>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'checklists' && (
                    <div className="bg-card border border-border rounded-[32px] overflow-hidden">
                        <div className="p-6 bg-secondary/50 border-b border-border">
                            <h2 className="text-lg font-bold">Checklists Operacionais Padrão</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                As regras definidas aqui servem de molde para limpezas e manutenções em hotéis recém-criados.
                            </p>
                        </div>
                        <div className="p-8">
                            {/* 
                        Renderizamos o ChecklistSettingsModal como um componente inline, 
                        passando o ID Fake, o que o faz ler/gravar na tabela como os hotéis normais
                     */}
                            <ChecklistSettingsModal
                                isOpen={true}
                                onClose={() => { }}
                                // @ts-ignore: Permite o componente rodar como view inline
                                isInline={true}
                                overridePropertyId={systemPropertyId}
                            />
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
