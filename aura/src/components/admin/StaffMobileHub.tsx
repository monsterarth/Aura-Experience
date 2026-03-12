// src/components/admin/StaffMobileHub.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Staff } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { EventService } from "@/services/event-service";
import { StaffService } from "@/services/staff-service";
import { Event } from "@/types/aura";
import { ImageUpload } from "./ImageUpload";
import { 
  ClipboardList, 
  Calendar as CalendarIcon, 
  UserCircle, 
  LogOut, 
  Camera,
  MapPin,
  Clock,
  Sparkles,
  PartyPopper,
  Save,
  KeyRound,
  Eye,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface StaffMobileHubProps {
  propertyId: string;
  userData: Staff;
  renderTasks: () => React.ReactNode;
}

type TabType = 'tasks' | 'calendar' | 'profile';

export function StaffMobileHub({ propertyId, userData, renderTasks }: StaffMobileHubProps) {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col max-w-md mx-auto shadow-2xl border-x border-border relative">
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col relative w-full h-[calc(100dvh-72px)]">
        {activeTab === 'tasks' && (
          <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-left-4 fade-in duration-300">
            {renderTasks()}
          </div>
        )}
        
        {activeTab === 'calendar' && (
          <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-right-4 fade-in duration-300">
             <CalendarTab propertyId={propertyId} />
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar animate-in zoom-in-95 fade-in duration-300">
            <ProfileTab userData={userData} propertyId={propertyId} onLogout={handleLogout} />
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="absolute bottom-0 w-full bg-card/90 backdrop-blur-xl border-t border-border p-2 px-6 flex justify-between items-center z-50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] h-[72px] safe-area-bottom">
        
        <button 
          onClick={() => setActiveTab('tasks')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'tasks' ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"
          )}
        >
          <div className={cn("p-2 rounded-2xl transition-all", activeTab === 'tasks' ? "bg-primary/10 shadow-inner" : "bg-transparent")}>
            <ClipboardList size={22} className={activeTab === 'tasks' ? "fill-primary/20" : ""} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Tarefas</span>
        </button>

        <button 
          onClick={() => setActiveTab('calendar')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'calendar' ? "text-blue-500 scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"
          )}
        >
          <div className={cn("p-2 rounded-2xl transition-all", activeTab === 'calendar' ? "bg-blue-500/10 shadow-inner" : "bg-transparent")}>
            <CalendarIcon size={22} className={activeTab === 'calendar' ? "fill-blue-500/20" : ""} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Agenda</span>
        </button>

        <button 
          onClick={() => setActiveTab('profile')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'profile' ? "text-teal-500 scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"
          )}
        >
          <div className={cn("p-2 rounded-2xl transition-all", activeTab === 'profile' ? "bg-teal-500/10 shadow-inner" : "bg-transparent")}>
            <UserCircle size={22} className={activeTab === 'profile' ? "fill-teal-500/20" : ""} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Perfil</span>
        </button>
      </nav>

    </div>
  );
}

// ==========================================
// CALENDAR TAB
// ==========================================

function CalendarTab({ propertyId }: { propertyId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        // Fetch all upcoming published events
        const data = await EventService.getPublishedEvents(propertyId, today);
        setEvents(data);
      } catch (error) {
        toast.error("Erro ao carregar a agenda.");
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [propertyId]);

  return (
    <div className="flex flex-col h-full bg-background pb-8">
      <header className="bg-blue-600 dark:bg-blue-900 text-white p-6 rounded-b-[2.5rem] shadow-lg shrink-0 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 text-white/10 rotate-12">
            <CalendarIcon size={120} />
        </div>
        <div className="relative z-10">
            <h1 className="text-3xl font-black tracking-tight mb-2">Agenda Aura</h1>
            <p className="text-white/80 text-sm font-medium pr-10">Fique por dentro de todos os eventos e datas importantes da propriedade.</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {loading ? (
             <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p className="font-bold text-xs uppercase tracking-widest">Carregando Calendário...</p>
             </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center opacity-50 space-y-3">
             <CalendarIcon size={40} className="text-muted-foreground" />
             <p className="text-sm font-bold uppercase tracking-widest">Nenhum evento agendado</p>
          </div>
        ) : (
          events.map(event => (
            <EventCard key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
    
    // Select Icon and Color based on Event Category
    const getCategoryStyles = (category: Event['category']) => {
        switch (category) {
            case 'wedding': return { bg: 'bg-rose-500/10 text-rose-600 border-rose-500/20', icon: PartyPopper, label: 'Casamento' };
            case 'gastronomy': return { bg: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: Sparkles, label: 'Gastronomia' };
            case 'sports': return { bg: 'bg-teal-500/10 text-teal-600 border-teal-500/20', icon: Sparkles, label: 'Bem-Estar & Esportes' };
            case 'nightlife': return { bg: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20', icon: PartyPopper, label: 'Música & Festa' };
            case 'culture': return { bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Sparkles, label: 'Cultura Local' };
            default: return { bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: CalendarIcon, label: 'Evento' };
        }
    };

    const style = getCategoryStyles(event.category);
    const Icon = style.icon;

    // Formatting Dates
    const [year, month, day] = event.startDate.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

    return (
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {event.imageUrl && (
                <div className="w-full h-32 relative">
                    <Image src={event.imageUrl} alt={event.title} fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div className="absolute bottom-3 left-3 flex gap-2">
                         <span className={cn("px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg backdrop-blur-md", style.bg.replace('/10', '/80').replace('text-', 'text-white border-'))}>
                             {style.label}
                         </span>
                    </div>
                </div>
            )}
            <div className="flex">
                 {/* Left Date Column */}
                <div className="w-20 shrink-0 bg-secondary/50 border-r border-border flex flex-col items-center justify-center py-4">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{dayName}</span>
                    <span className="text-3xl font-black text-foreground leading-none">{day}</span>
                    <span className="text-[10px] font-bold uppercase text-primary tracking-widest">{monthName}</span>
                </div>
                
                {/* Right Content */}
                <div className="p-4 flex-1">
                    {!event.imageUrl && (
                         <span className={cn("px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded mb-2 inline-block border", style.bg)}>
                             {style.label}
                         </span>
                    )}
                    <h3 className="font-bold text-lg leading-tight mb-1 text-foreground">{event.title}</h3>
                    {event.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{event.description}</p>}
                    
                    <div className="flex flex-col gap-1.5 mt-auto">
                        {event.startTime && (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                <Clock size={12} className={style.bg.split(' ')[1]} /> 
                                <span>{event.startTime} {event.endTime ? `- ${event.endTime}` : ''}</span>
                            </div>
                        )}
                        {event.location && (
                             <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                 <MapPin size={12} className={style.bg.split(' ')[1]} /> 
                                 <span className="truncate">{event.location}</span>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==========================================
// PROFILE TAB
// ==========================================

function ProfileTab({ userData, propertyId, onLogout }: { userData: Staff, propertyId: string, onLogout: () => void }) {
    const [name, setName] = useState(userData.fullName);
    const [profileImage, setProfileImage] = useState(userData.profilePictureUrl || "");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updates: Partial<Staff> = { fullName: name };
            if (profileImage !== userData.profilePictureUrl) {
                updates.profilePictureUrl = profileImage;
            }

            // Atualizar senha no Supabase Auth se foi fornecida
            if (password.trim() !== "") {
                const { error: authError } = await supabase.auth.updateUser({ password });
                if (authError) throw new Error("Erro ao atualizar a senha: " + authError.message);
            }

            await StaffService.updateStaff(userData.id, updates);
            toast.success("Perfil atualizado com sucesso!");
            setPassword(""); // Limpa pra não ficar mostrando
        } catch (error: any) {
            toast.error(error.message || "Erro ao salvar perfil.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col h-full bg-background pb-8">
            <header className="bg-teal-600 dark:bg-teal-900 text-white p-6 rounded-b-[2.5rem] shadow-lg shrink-0 relative overflow-hidden pb-10">
                <div className="absolute -right-6 -top-6 text-white/10 rotate-12">
                    <UserCircle size={150} />
                </div>
                <div className="relative z-10 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight mb-2">Meu Perfil</h1>
                        <p className="text-white/80 text-sm font-medium">Configure as suas informações pessoais e credenciais.</p>
                    </div>
                    <button onClick={onLogout} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl backdrop-blur-md transition-colors" title="Sair do Sistema">
                         <LogOut size={20} />
                    </button>
                </div>
            </header>

            <div className="p-6 space-y-8 -mt-6 relative z-20">
                
                <form onSubmit={handleSave} className="bg-card border border-border p-6 rounded-3xl shadow-xl space-y-6">
                     
                     <div className="flex flex-col items-center">
                         <div className="relative mb-4">
                             {profileImage ? (
                                <img src={profileImage} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-background shadow-md" />
                             ) : (
                                <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center border-4 border-background shadow-md">
                                     <UserCircle size={48} className="text-muted-foreground" />
                                </div>
                             )}
                             <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-2 rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform">
                                  <Camera size={16} />
                                  <div className="absolute inset-0 opacity-0 overflow-hidden cursor-pointer">
                                      {/* O ImageUpload cuida do input type=file secretamente */}
                                      <ImageUpload onUploadSuccess={(url) => setProfileImage(url)} className="h-full w-full" />
                                  </div>
                             </div>
                         </div>
                         <h2 className="text-xl font-black">{name || "Usuário"}</h2>
                         <p className="text-xs font-bold uppercase tracking-widest text-primary mt-1">{userData.role}</p>
                     </div>

                     <div className="space-y-4">
                         <div className="space-y-1.5">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome de Exibição</label>
                             <div className="relative">
                                 <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                 <input 
                                     type="text" 
                                     value={name}
                                     onChange={(e) => setName(e.target.value)}
                                     required
                                     className="w-full bg-secondary/50 border border-border p-3.5 pl-11 rounded-2xl text-foreground font-bold outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                 />
                             </div>
                         </div>

                         <div className="space-y-1.5">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">E-mail Cadastrado</label>
                             <input 
                                 type="text" 
                                 value={userData.email}
                                 disabled
                                 className="w-full bg-secondary/30 border border-border/50 p-3.5 rounded-2xl text-muted-foreground font-mono text-sm outline-none cursor-not-allowed"
                             />
                             <p className="text-[10px] text-muted-foreground pl-1">Para alterar o e-mail, fale com a recepção.</p>
                         </div>

                         <div className="space-y-1.5 pt-4 border-t border-border">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Redefinir Senha</label>
                             <div className="relative group">
                                 <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                                 <input 
                                     type={showPassword ? "text" : "password"}
                                     value={password}
                                     onChange={(e) => setPassword(e.target.value)}
                                     placeholder="Deixe em branco para manter"
                                     className="w-full bg-secondary/50 border border-border p-3.5 pl-11 pr-11 rounded-2xl text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-sm placeholder:font-medium"
                                 />
                                 <button
                                     type="button"
                                     onClick={() => setShowPassword(!showPassword)}
                                     className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                 >
                                     {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                 </button>
                             </div>
                         </div>
                     </div>

                     <button 
                         type="submit"
                         disabled={saving}
                         className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                     >
                         {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save size={16} /> Salvar Alterações</>}
                     </button>
                </form>
            </div>
        </div>
    )
}
