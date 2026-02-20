// src/app/check-in/form/[stayId]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { fetchCEP } from "@/lib/utils-checkin";
import { 
  Loader2, CheckCircle2, User, MapPin, 
  Dog, ArrowRight, Edit3, ChevronDown, 
  Users, Plane, AlertCircle, Plus, Trash2, Clock, CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const countries = [
  { name: "Brasil", flag: "🇧🇷", ddi: "+55" },
  { name: "Estados Unidos", flag: "🇺🇸", ddi: "+1" },
  { name: "Argentina", flag: "🇦🇷", ddi: "+54" },
  { name: "Portugal", flag: "🇵🇹", ddi: "+351" },
  { name: "Uruguai", flag: "🇺🇾", ddi: "+598" },
  { name: "Chile", flag: "🇨🇱", ddi: "+56" },
  { name: "Paraguai", flag: "🇵🇾", ddi: "+595" },
  { name: "Outro", flag: "🌍", ddi: "" },
];

export default function UnifiedPreCheckin() {
  const { stayId } = useParams();
  const router = useRouter();
  
  // Controle de Fluxo
  const [step, setStep] = useState<'loading' | 'error' | 'group_manager' | 'already_done' | 'form' | 'success'>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [timeWarning, setTimeWarning] = useState<{type: 'early' | 'late', message: string} | null>(null);
  
  // Estados de Dados
  const [propertyData, setPropertyData] = useState<any>(null);
  const [guest, setGuest] = useState<any>({ 
    address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", complement: "" }, 
    document: { number: "" }, 
    nationality: "Brasil", fullName: "", birthDate: "", gender: "", phone: "", email: ""
  });
  
  const [stay, setStay] = useState<any>({ 
    transportation: 'Carro', 
    petDetails: { species: 'Cachorro', weight: 5, name: "", breed: "" },
    lastCity: "", nextCity: "", vehiclePlate: "", expectedArrivalTime: "",
    additionalGuests: [], counts: { adults: 1, children: 0, babies: 0 }
  });
  
  const [cabin, setCabin] = useState<any>(null);
  const [groupStays, setGroupStays] = useState<any[]>([]);

  // Estados de UI
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCountrySelect, setShowCountrySelect] = useState(false);
  const [searchCountry, setSearchCountry] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        if (!stayId) {
            setStep('error');
            return;
        }

        const targetPropertyId = await StayService.findPropertyIdByStayId(stayId as string);
        if (!targetPropertyId) {
            toast.error("Hospedagem não encontrada.");
            setStep('error');
            return;
        }

        const data = await StayService.getStayWithGuestAndCabin(targetPropertyId, stayId as string);
        
        if (data) {
            setGuest((prev: any) => ({ ...prev, ...data.guest, address: { ...prev.address, ...(data.guest?.address || {}) }, document: { ...prev.document, ...(data.guest?.document || {}) }}));
            setStay((prev: any) => ({ ...prev, ...data.stay, propertyId: targetPropertyId, petDetails: { ...prev.petDetails, ...(data.stay?.petDetails || {}) }, additionalGuests: data.stay.additionalGuests || [], counts: data.stay.counts || { adults: 1, children: 0, babies: 0 }}));
            setCabin(data.cabin);
            
            // Simula resgate de dados da propriedade
            if ((data as any).property) setPropertyData((data as any).property);

            // Verificação de Grupo Inteligente
            if (data.stay.groupId) {
                const allStays = await StayService.getGroupStays(data.stay.accessCode);
                setGroupStays(allStays);
                
                const urlParams = new URLSearchParams(window.location.search);
                const fromGroup = urlParams.get('fromGroup');

                if (allStays.length > 1 && !fromGroup) {
                    setStep('group_manager');
                    return; 
                }
            }

            // Inteligência: Já preencheu? 
            const isAlreadyFilled = !!data.stay.expectedArrivalTime && !!data.guest?.document?.number;
            
            if (isAlreadyFilled) {
                setStep('already_done');
            } else {
                setStep('form');
            }
        } else {
            setStep('error');
        }
      } catch (error) {
        console.error("Erro ao carregar:", error);
        toast.error("Erro ao carregar dados.");
        setStep('error');
      }
    }
    loadData();
  }, [stayId]);

  const handleCEPChange = async (cep: string) => {
    setGuest((prev: any) => ({ ...prev, address: { ...prev.address, zipCode: cep } }));
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8 && guest.nationality === "Brasil") {
      setLoadingCep(true);
      try {
          const data = await fetchCEP(cleanCep);
          if (data && !data.erro) {
            setGuest((prev: any) => ({
              ...prev,
              address: { ...prev.address, street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "", zipCode: cleanCep, country: "Brasil" }
            }));
            toast.success("Endereço localizado!");
          }
      } catch (err) {} finally { setLoadingCep(false); }
    }
  };

  const validateForm = () => {
    const errors = [];
    if (!guest.fullName) errors.push("Nome Completo");
    if (!guest.document?.number) errors.push("Documento");
    if (!guest.birthDate) errors.push("Nascimento");
    if (!guest.gender) errors.push("Gênero");
    if (!guest.address?.zipCode) errors.push("CEP");
    if (!guest.address?.street) errors.push("Logradouro");
    if (!guest.address?.number) errors.push("Número (Endereço)");
    if (!guest.address?.neighborhood) errors.push("Bairro");
    if (!guest.address?.city) errors.push("Cidade");
    if (!guest.address?.state) errors.push("Estado");
    if (!stay.lastCity) errors.push("Cidade de Origem");
    if (!stay.nextCity) errors.push("Próximo Destino");
    if (!stay.expectedArrivalTime) errors.push("Horário Previsto de Chegada");
    stay.additionalGuests?.forEach((g: any, index: number) => {
        if (!g.fullName) errors.push(`Nome do Acompanhante #${index + 1}`);
        if (!g.document && g.type === 'adult') errors.push(`Documento do Acompanhante #${index + 1}`);
    });
    return errors;
  };

  // Função que executa o salvamento de fato no banco
  const executeSave = async () => {
    setIsSaving(true);
    try {
      await StayService.completePreCheckin(stay.propertyId, stayId as string, stay, guest);
      setStep('success');
    } catch (error: any) {
      alert(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Interceptador para avaliar o horário antes de salvar
  const handleSaveIntercept = async (e: React.FormEvent) => {
    e.preventDefault();
    const emptyErrors = validateForm();
    if (emptyErrors.length > 0) {
        alert(`Faltam os seguintes campos:\n\n- ${emptyErrors.join("\n- ")}`);
        return;
    }

    // Configurações da Propriedade (com fallbacks)
    const checkInTime = propertyData?.settings?.checkInTime || "14:00";
    const receptionEndTime = propertyData?.settings?.receptionEndTime || "20:00";
    const arrTime = stay.expectedArrivalTime;

    // Se o aviso ainda NÃO foi exibido/confirmado, avaliamos:
    if (!timeWarning) {
        // Checagem 1: Early Check-in
        if (arrTime < checkInTime) {
            let msg = propertyData?.settings?.earlyCheckInMessage || `Prezado(a) Hospede. Vimos que sua chegada está prevista para [expectedArrivalTime]. Por padrão nosso check in é sempre a partir das [checkintime], porém fazemos sempre o possível para liberar a sua acomodação antecipadamente. Para garantir um Early Check in entre em contato com a recepção.`;
            msg = msg.replace(/\[expectedArrivalTime\]/g, arrTime).replace(/\[checkintime\]/g, checkInTime);
            setTimeWarning({ type: 'early', message: msg });
            return; // Pausa o fluxo para exibir o modal
        }

        // Checagem 2: Late Check-in
        if (arrTime > receptionEndTime) {
            let msg = propertyData?.settings?.lateCheckInMessage || `Prezado(a) Hospede. Vimos que sua chegada está prevista para [expectedArrivalTime]. O horário de funcionamento da recepção encerra as [receptionendtime], mas não se preocupe.\nNossa guarita funciona 24 horas e um de nossos porteiros estará a disposição para recebê-los acompanhá-los até a sua acomodação. Avise a recepção caso necessite de arranjos especiais.`;
            msg = msg.replace(/\[expectedArrivalTime\]/g, arrTime).replace(/\[receptionendtime\]/g, receptionEndTime);
            setTimeWarning({ type: 'late', message: msg });
            return; // Pausa o fluxo para exibir o modal
        }
    }

    // Se passou liso (ou se já confirmou o modal), salva!
    executeSave();
  };

  // --- RENDERIZAÇÃO POR ETAPAS ---
  
  if (step === 'loading') {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={40}/></div>;
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 animate-in fade-in zoom-in duration-300">
          <AlertCircle size={64} className="mx-auto text-destructive opacity-80" />
          <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Erro ao carregar</h1>
          <p className="text-muted-foreground">Não foi possível encontrar os dados desta reserva. Verifique se o link está correto ou entre em contato com a recepção.</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    const pendingStays = groupStays.filter(s => !s.expectedArrivalTime && s.id !== stayId);

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6 animate-in zoom-in duration-300 w-full">
          <CheckCircle2 size={80} className="mx-auto text-green-500" />
          <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Check-in Concluído!</h1>
          <p className="text-muted-foreground">Sua ficha foi enviada com sucesso para a nossa equipe.</p>
          
          <div className="p-4 bg-secondary rounded-2xl border border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Seu Código de Reserva</p>
              <p className="text-3xl font-black text-primary tracking-widest mt-2">{stay.accessCode}</p>
          </div>

          <div className="pt-4 space-y-3">
            {groupStays.length > 1 && pendingStays.length > 0 ? (
                <div className="space-y-4 bg-primary/5 border border-primary/20 p-6 rounded-3xl">
                    <p className="text-sm font-medium text-foreground">
                        Você ainda possui <strong>{pendingStays.length} acomodação(ões)</strong> pendentes de check-in neste grupo.
                    </p>
                    <button onClick={() => setStep('group_manager')} className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                        Preencher Próxima Unidade
                    </button>
                </div>
            ) : (
                <button 
                  onClick={() => window.open(`https://wa.me/${propertyData?.phone?.replace(/\D/g, '') || ''}`, '_blank')} 
                  className="w-full py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                >
                    Falar com a Recepção no WhatsApp
                </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'already_done') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8 animate-in fade-in duration-300">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
            <CheckCircle size={48} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-foreground uppercase tracking-tighter">Ficha Pronta!</h1>
            <p className="text-muted-foreground">Identificamos que seu pré-check-in já foi preenchido.</p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={() => setStep('form')} className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20">
              Revisar / Alterar Dados
            </button>
            <button 
                onClick={() => window.open(`https://wa.me/${propertyData?.phone?.replace(/\D/g, '') || ''}`, '_blank')} 
                className="w-full py-4 bg-secondary text-foreground font-bold rounded-2xl hover:bg-accent transition-all"
            >
                Falar com a Recepção
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'group_manager') {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center justify-center space-y-8">
        <div className="text-center space-y-2">
          <Users size={48} className="mx-auto text-primary mb-2" />
          <h1 className="text-3xl font-black uppercase tracking-tighter">Reserva de Grupo</h1>
          <p className="text-muted-foreground italic">Identificamos {groupStays.length} acomodações. Qual delas você deseja preencher agora?</p>
        </div>
        <div className="grid gap-4 w-full max-w-md">
          {groupStays.map((s) => {
            const isStayDone = !!s.expectedArrivalTime; 
            return (
            <button 
              key={s.id} 
              onClick={() => {
                if (s.id !== stayId) window.location.href = `/check-in/form/${s.id}?fromGroup=1`;
                else setStep(isStayDone ? 'already_done' : 'form');
              }}
              className={cn(
                "p-6 rounded-[32px] border text-left transition-all flex justify-between items-center group shadow-sm",
                s.id === stayId ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-secondary hover:bg-accent hover:border-primary/40"
              )}
            >
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Unidade</p>
                <p className="text-xl font-black text-foreground">{s.cabinName || "Acomodação"}</p>
                <span className={cn("text-[9px] font-bold uppercase mt-2 inline-block px-2 py-1 rounded", isStayDone ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600")}>
                    {isStayDone ? "Preenchido" : "Pendente"}
                </span>
              </div>
              <ArrowRight size={20} className={cn("transition-transform group-hover:translate-x-1", s.id === stayId ? "text-primary" : "text-muted-foreground")} />
            </button>
          )})}
        </div>
      </main>
    );
  }

  const defaultPetPolicy = `A pousada é Pet Friendly e teremos o maior prazer em receber seu pet! Porém temos algumas regrinhas, que devem ser respeitadas. Aceitamos pets de micro e pequeno porte até 15kg em todas as acomodações, sendo um por cabana. Para aceitarmos a reserva de pet é necessário um prévio contato com a recepção, assinatura da política pet e o pagamento da taxa de hospedagem de pet.`;
  const petPolicyText = propertyData?.petPolicyText || propertyData?.settings?.petPolicyText || defaultPetPolicy;

  return (
    <main className="min-h-screen bg-background text-foreground p-6 pb-24 font-sans relative">
      <form onSubmit={handleSaveIntercept} className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-700">
        
        {/* 1. Identidade Titular */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <User size={20} className="text-primary"/> 1. Titular da Reserva
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">Nacionalidade *</label>
              <button 
                type="button"
                onClick={() => setShowCountrySelect(!showCountrySelect)}
                className="w-full bg-secondary border border-border p-4 rounded-2xl flex items-center justify-between hover:border-primary/50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {countries.find(c => c.name === guest.nationality)?.flag || "🏳️"} {guest.nationality || "Selecione..."}
                </span>
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>

              {showCountrySelect && (
                <div className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-2xl z-50 shadow-2xl overflow-hidden animate-in slide-in-from-top-2">
                  <input 
                    className="w-full p-4 bg-secondary border-b border-border outline-none text-sm text-foreground placeholder:text-muted-foreground"
                    placeholder="Pesquisar país..."
                    value={searchCountry}
                    onChange={e => setSearchCountry(e.target.value)}
                    autoFocus
                  />
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {countries.filter(c => c.name.toLowerCase().includes(searchCountry.toLowerCase())).map(c => (
                      <button 
                        key={c.name} type="button"
                        onClick={() => { setGuest({...guest, nationality: c.name}); setShowCountrySelect(false); }}
                        className="w-full p-4 text-left hover:bg-accent flex items-center gap-3 text-sm font-medium transition-colors"
                      >
                        <span>{c.flag}</span> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">
                 {guest.nationality === "Brasil" ? "CPF *" : "Passaporte / ID *"}
              </label>
              <input 
                value={guest.document?.number || ""} 
                onChange={e => setGuest({...guest, document: { ...guest.document, number: e.target.value }})}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm"
                placeholder={guest.nationality === "Brasil" ? "000.000.000-00" : "Documento"}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome Completo *</label>
            <div className="flex gap-2">
              <input 
                readOnly={!isEditingName}
                value={guest.fullName || ""}
                onChange={e => setGuest({...guest, fullName: e.target.value})}
                className={cn(
                    "flex-1 bg-secondary p-4 rounded-2xl outline-none transition-all text-sm font-medium", 
                    isEditingName ? "border border-primary focus:border-primary" : "border border-border opacity-80"
                )}
              />
              <button 
                type="button" 
                onClick={() => setIsEditingName(!isEditingName)} 
                className="p-4 bg-secondary rounded-2xl text-primary border border-border hover:bg-accent transition-colors"
              >
                <Edit3 size={18}/>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Nascimento *</label>
                <input type="date" 
                value={guest.birthDate || ""}
                onChange={e => setGuest({...guest, birthDate: e.target.value})}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none text-sm font-medium focus:border-primary/50 transition-colors [color-scheme:light] dark:[color-scheme:dark]" 
                />
             </div>
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Gênero *</label>
                <select 
                value={guest.gender || ""}
                onChange={e => setGuest({...guest, gender: e.target.value})}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none text-sm font-medium focus:border-primary/50 transition-colors appearance-none"
                >
                <option value="" disabled>Selecione...</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
                <option value="O">Outro</option>
                </select>
             </div>
          </div>
        </section>

        {/* 2. Acompanhantes */}
        <section className="space-y-6">
            <div className="flex justify-between items-center border-b border-border pb-4">
                <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
                    <Users size={20} className="text-primary"/> 2. Acompanhantes
                </h3>
            </div>
            
            <div className="space-y-4">
                {stay.additionalGuests?.map((g: any, idx: number) => (
                    <div key={idx} className="bg-secondary border border-border p-4 rounded-2xl space-y-4 animate-in slide-in-from-left">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-primary bg-background border border-border px-3 py-1.5 rounded-lg">
                                {g.type === 'adult' ? "Adulto" : g.type === 'child' ? "Criança" : "Free (Bebê)"}
                            </span>
                            <button type="button" onClick={() => {
                                setStay((prev: any) => ({ ...prev, additionalGuests: prev.additionalGuests.filter((_: any, i: number) => i !== idx) }));
                            }} className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors"><Trash2 size={16}/></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Nome Completo *</label>
                                <input 
                                    value={g.fullName} 
                                    onChange={e => {
                                        const newGuests = [...stay.additionalGuests];
                                        newGuests[idx].fullName = e.target.value;
                                        setStay({ ...stay, additionalGuests: newGuests });
                                    }}
                                    className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Documento {g.type === 'adult' ? '*' : '(Opcional)'}</label>
                                <input 
                                    value={g.document} 
                                    onChange={e => {
                                        const newGuests = [...stay.additionalGuests];
                                        newGuests[idx].document = e.target.value;
                                        setStay({ ...stay, additionalGuests: newGuests });
                                    }}
                                    className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    <button type="button" onClick={() => setStay((p: any) => ({...p, additionalGuests: [...p.additionalGuests, {id: Date.now().toString(), type: 'adult', fullName: "", document: ""}]}))} className="flex-1 min-w-[120px] py-3 bg-secondary border border-border hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all">
                        <Plus size={14}/> Adulto
                    </button>
                    <button type="button" onClick={() => setStay((p: any) => ({...p, additionalGuests: [...p.additionalGuests, {id: Date.now().toString(), type: 'child', fullName: "", document: ""}]}))} className="flex-1 min-w-[120px] py-3 bg-secondary border border-border hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all">
                        <Plus size={14}/> Criança
                    </button>
                    <button type="button" onClick={() => setStay((p: any) => ({...p, additionalGuests: [...p.additionalGuests, {id: Date.now().toString(), type: 'free', fullName: "", document: ""}]}))} className="flex-1 min-w-[120px] py-3 bg-secondary border border-border hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all">
                        <Plus size={14}/> Bebê
                    </button>
                </div>
                
                <div className="bg-primary/5 border border-primary/20 p-3 rounded-xl mt-2">
                    <p className="text-[10px] text-primary/80 font-medium text-center">
                        <strong>Adulto:</strong> 18+ anos | <strong>Criança:</strong> 6 a 17 anos | <strong>Free (Bebê):</strong> Até 5 anos
                    </p>
                </div>
            </div>
        </section>

        {/* 3. Residência */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <MapPin size={20} className="text-primary"/> 3. Residência
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">CEP / Zip *</label>
              <div className="relative">
                <input 
                    value={guest.address?.zipCode || ""}
                    onChange={e => handleCEPChange(e.target.value)} 
                    className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                    placeholder="00000-000"
                />
                {loadingCep && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
              </div>
            </div>
            
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Logradouro (Rua/Av) *</label>
              <input 
                value={guest.address?.street || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, street: e.target.value}})}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
              />
            </div>
            
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Número *</label>
              <input 
                value={guest.address?.number || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, number: e.target.value}})} 
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                placeholder="S/N"
              />
            </div>
            
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Complemento</label>
              <input 
                value={guest.address?.complement || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, complement: e.target.value}})} 
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
              />
            </div>

            <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Bairro *</label>
                <input 
                    value={guest.address?.neighborhood || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, neighborhood: e.target.value}})} 
                    className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                />
            </div>
            <div className="md:col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Cidade *</label>
                <input 
                    value={guest.address?.city || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, city: e.target.value}})} 
                    className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                />
            </div>
            <div className="md:col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Estado (UF) *</label>
                <input 
                    value={guest.address?.state || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, state: e.target.value}})} 
                    className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                    maxLength={2}
                />
            </div>
          </div>
        </section>

        {/* 4. Viagem & Logística */}
        <section className="bg-secondary/30 border border-border p-8 rounded-[40px] space-y-8">
          <div className="space-y-6">
             <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2 text-foreground">
                <Plane size={20} className="text-primary"/> 4. Viagem
             </h3>
             
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Horário Previsto de Chegada *</label>
                <div className="flex items-center gap-2 bg-background border border-border p-4 rounded-2xl focus-within:border-primary/50 transition-colors">
                    <Clock size={18} className="text-primary"/>
                    <input 
                        type="time"
                        value={stay.expectedArrivalTime || ""}
                        onChange={e => setStay({...stay, expectedArrivalTime: e.target.value})}
                        className="bg-transparent outline-none text-foreground font-bold w-full [color-scheme:light] dark:[color-scheme:dark]"
                    />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col">
                        <span>Origem (Cidade/UF) *</span>
                        <span className="text-[8px] font-normal opacity-70 normal-case mb-1 mt-0.5">De onde você está vindo? (Última hospedagem/casa)</span>
                    </label>
                    <input 
                    placeholder="Ex: São Paulo/SP" 
                    value={stay.lastCity || ""}
                    onChange={e => setStay({...stay, lastCity: e.target.value})}
                    className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col">
                        <span>Destino (Cidade/UF) *</span>
                        <span className="text-[8px] font-normal opacity-70 normal-case mb-1 mt-0.5">Para onde vai após o check-out?</span>
                    </label>
                    <input 
                    placeholder="Ex: Florianópolis/SC" 
                    value={stay.nextCity || ""}
                    onChange={e => setStay({...stay, nextCity: e.target.value})}
                    className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors" 
                    />
                </div>
             </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-primary">Meio de Transporte</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {['Carro', 'Onibus', 'Avião', 'Navio', 'Outro'].map(m => (
                <button 
                  key={m} type="button"
                  onClick={() => setStay({...stay, transportation: m})}
                  className={cn("p-3 rounded-xl border text-[9px] font-black uppercase transition-all", stay.transportation === m ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-background border-border text-muted-foreground hover:bg-accent")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {stay.transportation === 'Carro' && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Placa do Veículo</label>
              <input value={stay.vehiclePlate || ""} onChange={e => setStay({...stay, vehiclePlate: e.target.value.toUpperCase()})} placeholder="ABC1D23" className="w-full bg-background border border-border p-5 rounded-3xl font-mono text-2xl tracking-widest text-primary text-center focus:border-primary/50 outline-none transition-colors" />
            </div>
          )}

          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Montagem da Unidade: {cabin?.name}</p>
            <div className="grid grid-cols-1 gap-3">
              {(cabin?.allowedSetups || ["Casal Padrão"]).map((setup: string) => (
                <button 
                  key={setup} type="button"
                  onClick={() => setStay({...stay, roomSetupNotes: setup})}
                  className={cn("p-4 rounded-2xl border text-left text-sm font-bold transition-all", stay.roomSetupNotes === setup ? "bg-foreground text-background border-foreground shadow-md" : "bg-background border-border text-muted-foreground hover:bg-accent")}
                >
                  {setup}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Pets */}
        <section className="bg-orange-500/5 border border-orange-500/20 p-8 rounded-[40px] space-y-6">
          <label className="flex items-center gap-4 cursor-pointer group">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-colors", stay.hasPet ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "bg-background border border-orange-500/20 text-orange-500")}>
              <Dog size={24} />
            </div>
            <div className="flex-1">
              <p className="font-black text-lg text-foreground">Viajando com Pet?</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Consulte nossa política</p>
            </div>
            <input type="checkbox" checked={stay.hasPet} onChange={e => setStay({...stay, hasPet: e.target.checked})} className="w-6 h-6 accent-orange-500 rounded-lg cursor-pointer" />
          </label>

          {stay.hasPet && (
            <div className="space-y-6 animate-in zoom-in duration-300">
              
              <div className="text-xs text-orange-600/90 bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 leading-relaxed font-medium">
                  {petPolicyText}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input 
                placeholder="Nome do Pet" 
                value={stay.petDetails?.name || ""}
                onChange={e => setStay({...stay, petDetails: {...stay.petDetails, name: e.target.value}})}
                className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground" 
                />
                <input 
                placeholder="Raça" 
                value={stay.petDetails?.breed || ""}
                onChange={e => setStay({...stay, petDetails: {...stay.petDetails, breed: e.target.value}})}
                className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground" 
                />
                <select 
                 value={stay.petDetails?.species || "Cachorro"}
                 onChange={e => setStay({...stay, petDetails: {...stay.petDetails, species: e.target.value}})}
                 className="bg-background border border-border p-4 rounded-2xl text-sm outline-none focus:border-orange-500/50 transition-colors text-foreground appearance-none"
                >
                  <option>Cachorro</option>
                  <option>Gato</option>
                  <option>Outro</option>
                </select>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold uppercase text-orange-600">
                  <span>Peso: {stay.petDetails?.weight || 5}kg</span>
                </div>
                <input 
                  type="range" min="1" max="40" 
                  value={stay.petDetails?.weight || 5} 
                  onChange={e => setStay({...stay, petDetails: {...stay.petDetails, weight: parseInt(e.target.value)}})}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-600 text-xs font-medium">
            <AlertCircle size={16} className="shrink-0" />
            <p>Todos os campos marcados com <strong>*</strong> são obrigatórios para emissão da FNRH.</p>
        </div>

        <button 
          type="submit" 
          disabled={isSaving}
          className="w-full py-8 bg-primary text-primary-foreground font-black text-2xl uppercase tracking-widest rounded-[32px] hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl shadow-primary/20"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : "Finalizar Check-in"}
        </button>

      </form>

      {/* MODAL DE AVISO DE HORÁRIO (INTERCEPTADOR) */}
      {timeWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className="bg-card border border-border w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 text-center">
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm", timeWarning.type === 'early' ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500")}>
              <Clock size={40} />
            </div>
            
            <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground">Aviso sobre o Horário</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {timeWarning.message}
                </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => {
                  setTimeWarning(null);
                  executeSave(); // O usuário confirmou, agora salva de verdade
                }} 
                className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                Estou ciente, Enviar
              </button>
              <button 
                type="button" 
                onClick={() => setTimeWarning(null)} 
                className="w-full py-4 bg-secondary text-foreground font-bold rounded-2xl hover:bg-accent transition-all"
              >
                Voltar e alterar horário
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}