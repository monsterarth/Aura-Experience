// src/components/guest/CheckInForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Cabin } from "@/types/aura";

const checkInSchema = z.object({
  fullName: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  documentType: z.string().min(1, "Selecione o tipo de documento"),
  documentNumber: z.string().min(5, "Documento obrigatório"),
  gender: z.string().min(1, "Selecione o gênero"),
  nationality: z.string().min(1, "Selecione a nacionalidade"),
  cabinId: z.string().min(1, "Selecione sua unidade"),
  totalGuests: z.number().min(1, "Mínimo 1 pessoa"),
});

type CheckInFormData = z.infer<typeof checkInSchema>;

const selectClass = "w-full p-4 rounded-2xl border border-border bg-background text-sm outline-none focus:border-primary/50 transition-colors appearance-none";
const inputClass = "w-full p-4 rounded-2xl border border-border bg-background text-sm outline-none focus:border-primary/50 transition-colors";

export const CheckInForm = () => {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [fnrhDomains, setFnrhDomains] = useState<{
    tiposDocumento: FnrhDomain[];
    generos: FnrhDomain[];
    nacionalidades: FnrhDomain[];
  } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<CheckInFormData>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      totalGuests: 2,
      documentType: "CPF",
      nationality: "Brasileira",
      gender: "NAO_INFORMADO",
    }
  });

  useEffect(() => {
    if (!property?.id) return;

    supabase.from('cabins').select('*').eq('propertyId', property.id)
      .then(({ data }: { data: Cabin[] | null }) => setCabins(data || []));

    Promise.all([
      FnrhService.getTiposDocumento(),
      FnrhService.getGeneros(),
      FnrhService.getNacionalidades(),
    ]).then(([tiposDocumento, generos, nacionalidades]) => {
      setFnrhDomains({ tiposDocumento, generos, nacionalidades });
    });
  }, [property?.id]);

  const onSubmit = async (data: CheckInFormData) => {
    if (!property) return;
    setIsSubmitting(true);
    try {
      const guestId = data.documentNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");

      await StayService.createStayRecord({
        propertyId: property.id,
        guestId,
        cabinConfigs: [{
          cabinId: data.cabinId,
          adults: data.totalGuests,
          children: 0,
          babies: 0
        }],
        checkIn: new Date(),
        checkOut: new Date(Date.now() + 86400000),
        sendAutomations: false,
        actorId: "GUEST_PORTAL",
        actorName: data.fullName
      });

      toast.success("Check-in enviado!");
      setIsSuccess(true);
    } catch {
      toast.error("Erro ao processar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (propLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

  if (isSuccess) return (
    <div className="bg-card p-10 rounded-[32px] text-center space-y-4">
      <CheckCircle2 size={60} className="mx-auto text-green-500" />
      <h2 className="text-2xl font-bold">Sucesso!</h2>
      <p className="text-muted-foreground">Seu check-in foi registrado no sistema.</p>
    </div>
  );

  return (
    <div className="bg-card p-6 md:p-10 rounded-[32px] border border-border shadow-2xl space-y-8">
      <h1 className="text-3xl font-black text-center">Check-in Digital</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Nome */}
        <div>
          <input {...register("fullName")} placeholder="Nome Completo" className={inputClass} />
          {errors.fullName && <p className="text-xs text-red-400 mt-1">{errors.fullName.message}</p>}
        </div>

        {/* Documento: tipo + número */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <select {...register("documentType")} className={selectClass}>
              {fnrhDomains?.tiposDocumento.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            {errors.documentType && <p className="text-xs text-red-400 mt-1">{errors.documentType.message}</p>}
          </div>
          <div>
            <input {...register("documentNumber")} placeholder="Número do documento" className={inputClass} />
            {errors.documentNumber && <p className="text-xs text-red-400 mt-1">{errors.documentNumber.message}</p>}
          </div>
        </div>

        {/* Gênero + Nacionalidade */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <select {...register("gender")} className={selectClass}>
              <option value="" disabled>Gênero</option>
              {fnrhDomains?.generos.map(g => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
            {errors.gender && <p className="text-xs text-red-400 mt-1">{errors.gender.message}</p>}
          </div>
          <div>
            <select {...register("nationality")} className={selectClass}>
              <option value="" disabled>Nacionalidade</option>
              {fnrhDomains?.nacionalidades.map(n => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
            {errors.nationality && <p className="text-xs text-red-400 mt-1">{errors.nationality.message}</p>}
          </div>
        </div>

        {/* Contato */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <input {...register("phone")} placeholder="WhatsApp (+55...)" className={inputClass} />
            {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <input {...register("email")} placeholder="E-mail" className={inputClass} />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
          </div>
        </div>

        {/* Cabana + Hóspedes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <select {...register("cabinId")} className={selectClass}>
              <option value="">Selecione sua Cabana</option>
              {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.cabinId && <p className="text-xs text-red-400 mt-1">{errors.cabinId.message}</p>}
          </div>
          <div>
            <input
              type="number"
              {...register("totalGuests", { valueAsNumber: true })}
              placeholder="Nº de hóspedes"
              className={inputClass}
            />
            {errors.totalGuests && <p className="text-xs text-red-400 mt-1">{errors.totalGuests.message}</p>}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Finalizar Check-in"}
        </button>
      </form>
    </div>
  );
};
