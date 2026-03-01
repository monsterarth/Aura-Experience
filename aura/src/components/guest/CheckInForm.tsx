// src/components/guest/CheckInForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Loader2, CheckCircle2, User, Phone, Mail, FileText, Home } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Cabin } from "@/types/aura";

const checkInSchema = z.object({
  fullName: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  document: z.string().min(5, "Documento obrigatório"),
  cabinId: z.string().min(1, "Selecione sua unidade"),
  totalGuests: z.number().min(1, "Mínimo 1 pessoa"),
});

type CheckInFormData = z.infer<typeof checkInSchema>;

export const CheckInForm = () => {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cabins, setCabins] = useState<Cabin[]>([]);

  const { register, handleSubmit, formState: { errors } } = useForm<CheckInFormData>({
    resolver: zodResolver(checkInSchema),
    defaultValues: { totalGuests: 2 }
  });

  useEffect(() => {
    const fetchCabins = async () => {
      if (!property?.id) return;
      const q = query(collection(db, "cabins"), where("propertyId", "==", property.id));
      const snap = await getDocs(q);
      setCabins(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cabin)));
    };
    fetchCabins();
  }, [property]);

  const onSubmit = async (data: CheckInFormData) => {
    if (!property) return;
    setIsSubmitting(true);
    try {
      // No Aura, o titular é sempre criado/atualizado
      const guestId = data.document.replace(/\D/g, "");

      await StayService.createStayRecord({
        propertyId: property.id,
        guestId: guestId,
        cabinConfigs: [{
          cabinId: data.cabinId,
          adults: data.totalGuests,
          children: 0,
          babies: 0
        }],
        checkIn: new Date(), // Simulação de check-in imediato
        checkOut: new Date(Date.now() + 86400000),
        sendAutomations: false,
        actorId: "GUEST_PORTAL",
        actorName: data.fullName
      });

      toast.success("Check-in enviado!");
      setIsSuccess(true);
    } catch (error: any) {
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input {...register("fullName")} placeholder="Nome Completo" className="p-4 rounded-2xl border bg-background" />
          <input {...register("document")} placeholder="CPF" className="p-4 rounded-2xl border bg-background" />
          <input {...register("phone")} placeholder="WhatsApp" className="p-4 rounded-2xl border bg-background" />
          <input {...register("email")} placeholder="E-mail" className="p-4 rounded-2xl border bg-background" />
          <select {...register("cabinId")} className="p-4 rounded-2xl border bg-background">
            <option value="">Selecione sua Cabana</option>
            {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" {...register("totalGuests", { valueAsNumber: true })} className="p-4 rounded-2xl border bg-background" />
        </div>
        <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl">
          {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : "Finalizar Check-in"}
        </button>
      </form>
    </div>
  );
};
