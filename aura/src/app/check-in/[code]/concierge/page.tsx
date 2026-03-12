"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { ConciergeService } from "@/services/concierge-service";
import { Stay, Property, ConciergeItem, ConciergeRequest } from "@/types/aura";
import { submitConciergeRequest } from "@/app/actions/concierge-actions";
import { toggleGuestDND } from "@/app/actions/dnd-actions";
import {
  Loader2, ArrowLeft, Plus, Minus, ShoppingBag, Package,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, RotateCcw, XCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";

// --- Theme Helper ---
function hexToHSL(hex: string): string {
  if (!hex) return '0 0% 0%';
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getThemeStyles(propertyData?: Property | null): React.CSSProperties {
  const theme = propertyData?.theme;
  if (!theme) return {};
  const c = theme.colors;
  if (!c) return {};
  return {
    '--primary': hexToHSL(c.primary),
    '--primary-foreground': hexToHSL(c.onPrimary),
    '--secondary': hexToHSL(c.secondary),
    '--secondary-foreground': hexToHSL(c.onSecondary),
    '--background': hexToHSL(c.background),
    '--card': hexToHSL(c.surface),
    '--card-foreground': hexToHSL(c.textMain),
    '--foreground': hexToHSL(c.textMain),
    '--muted': hexToHSL(c.secondary),
    '--muted-foreground': hexToHSL(c.textMuted),
    '--accent': hexToHSL(c.accent),
    '--border': hexToHSL(c.accent),
    '--radius': theme.shape?.radius || '0.5rem',
  } as React.CSSProperties;
}

// --- i18n ---
const translations = {
  pt: {
    pageTitle: 'Concierge',
    back: 'Voltar',
    consumption: 'Consumo',
    loan: 'Empréstimo',
    included: (n: number) => n === 1 ? `${n} incluso na hospedagem` : `${n} inclusos na hospedagem`,
    free: 'Grátis',
    requestItem: 'Solicitar',
    requesting: 'Solicitando...',
    requestSent: 'Pedido enviado!',
    orderHistory: 'Histórico de Pedidos',
    notes: 'Observações (opcional)',
    notesPlaceholder: 'Ex: Entregar à noite',
    statusPending: 'Aguardando',
    statusDelivered: 'Entregue',
    statusReturned: 'Devolvido',
    statusLost: 'Extraviado',
    dndActiveAlert: 'Seu DND está ativo',
    dndActiveDesc: 'O modo Não Perturbe está ativo. Deseja receber o item mesmo assim?',
    allowEntry: 'Sim, entregar agora',
    cancel: 'Cancelar',
    noItems: 'Nenhum item disponível no momento.',
    qty: 'Qtd',
    lossWarning: (price: string) => `Multa por extravio: R$${price}`,
    loadingError: 'Erro ao carregar dados.',
  },
  en: {
    pageTitle: 'Concierge',
    back: 'Back',
    consumption: 'Consumption',
    loan: 'Loan',
    included: (n: number) => n === 1 ? `${n} included in your stay` : `${n} included in your stay`,
    free: 'Free',
    requestItem: 'Request',
    requesting: 'Requesting...',
    requestSent: 'Request sent!',
    orderHistory: 'Order History',
    notes: 'Notes (optional)',
    notesPlaceholder: 'E.g. Deliver at night',
    statusPending: 'Pending',
    statusDelivered: 'Delivered',
    statusReturned: 'Returned',
    statusLost: 'Lost',
    dndActiveAlert: 'DND is active',
    dndActiveDesc: 'Do Not Disturb mode is on. Do you want to receive the item anyway?',
    allowEntry: 'Yes, deliver now',
    cancel: 'Cancel',
    noItems: 'No items available at the moment.',
    qty: 'Qty',
    lossWarning: (price: string) => `Loss penalty: $${price}`,
    loadingError: 'Error loading data.',
  },
  es: {
    pageTitle: 'Conserjería',
    back: 'Volver',
    consumption: 'Consumo',
    loan: 'Préstamo',
    included: (n: number) => n === 1 ? `${n} incluido en tu estadía` : `${n} incluidos en tu estadía`,
    free: 'Gratis',
    requestItem: 'Solicitar',
    requesting: 'Solicitando...',
    requestSent: '¡Solicitud enviada!',
    orderHistory: 'Historial de Pedidos',
    notes: 'Notas (opcional)',
    notesPlaceholder: 'Ej: Entregar por la noche',
    statusPending: 'Pendiente',
    statusDelivered: 'Entregado',
    statusReturned: 'Devuelto',
    statusLost: 'Extraviado',
    dndActiveAlert: 'DND está activo',
    dndActiveDesc: 'El modo No Molestar está activo. ¿Deseas recibir el artículo de todas formas?',
    allowEntry: 'Sí, entregar ahora',
    cancel: 'Cancelar',
    noItems: 'No hay artículos disponibles en este momento.',
    qty: 'Cant.',
    lossWarning: (price: string) => `Penalización por extravío: $${price}`,
    loadingError: 'Error al cargar datos.',
  },
};

function getItemName(item: ConciergeItem, lang: 'pt' | 'en' | 'es'): string {
  if (lang === 'en' && item.name_en) return item.name_en;
  if (lang === 'es' && item.name_es) return item.name_es;
  return item.name;
}

function getItemDesc(item: ConciergeItem, lang: 'pt' | 'en' | 'es'): string | undefined {
  if (lang === 'en' && item.description_en) return item.description_en;
  if (lang === 'es' && item.description_es) return item.description_es;
  return item.description;
}

export default function ConciergePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [stay, setStay] = useState<Stay | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [items, setItems] = useState<ConciergeItem[]>([]);
  const [requests, setRequests] = useState<ConciergeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'pt' | 'en' | 'es'>('pt');

  // Per-item state: quantity + notes
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  // DND dialog
  const [dndPending, setDndPending] = useState<{ itemId: string; qty: number; note: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    const init = async () => {
      try {
        const stays = await StayService.getStaysByAccessCode(code);
        if (!stays || stays.length === 0) { setLoading(false); return; }
        const stayData = stays[0] as Stay;
        setStay(stayData);

        const [propData, itemsData, reqData, stayFull] = await Promise.all([
          PropertyService.getPropertyById(stayData.propertyId),
          ConciergeService.getConciergeItems(stayData.propertyId),
          ConciergeService.getConciergeRequestsForStay(stayData.propertyId, stayData.id),
          StayService.getStayWithGuestAndCabin(stayData.propertyId, stayData.id),
        ]);

        setProperty(propData);
        setItems(itemsData);
        setRequests(reqData);

        // Set language from guest preference
        const guestLang = (stayFull as any)?.guest?.preferredLanguage;
        if (guestLang && ['pt', 'en', 'es'].includes(guestLang)) {
          setLang(guestLang as 'pt' | 'en' | 'es');
        }

        // Default quantities to 1
        const defaultQty: Record<string, number> = {};
        itemsData.forEach(item => { defaultQty[item.id] = 1; });
        setQuantities(defaultQty);
      } catch {
        toast.error(t.loadingError);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [code]);

  const handleQty = (itemId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(1, (prev[itemId] || 1) + delta),
    }));
  };

  const handleSubmit = async (itemId: string, forceDelivery = false) => {
    if (!stay) return;
    const qty = quantities[itemId] || 1;
    const note = notes[itemId] || '';

    setSubmitting(prev => ({ ...prev, [itemId]: true }));
    try {
      const result = await submitConciergeRequest(stay.id, code, itemId, qty, note || undefined);

      if (result.dndActive && !forceDelivery) {
        setDndPending({ itemId, qty, note });
        return;
      }

      if (!result.success) {
        toast.error(result.error || 'Erro ao enviar pedido.');
        return;
      }

      toast.success(t.requestSent);
      // Refresh requests
      const updated = await ConciergeService.getConciergeRequestsForStay(stay.propertyId, stay.id);
      setRequests(updated);
      // Reset quantity
      setQuantities(prev => ({ ...prev, [itemId]: 1 }));
      setNotes(prev => ({ ...prev, [itemId]: '' }));
    } catch {
      toast.error('Erro ao enviar pedido.');
    } finally {
      setSubmitting(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleDndAccept = async () => {
    if (!stay || !dndPending) return;
    // Disable DND then submit
    await toggleGuestDND(stay.id, code, null);
    setDndPending(null);
    await handleSubmit(dndPending.itemId, true);
  };

  const consumptionItems = items.filter(i => i.category === 'consumption');
  const loanItems = items.filter(i => i.category === 'loan');

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: t.statusPending, cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      delivered: { label: t.statusDelivered, cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
      returned: { label: t.statusReturned, cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      lost: { label: t.statusLost, cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    };
    const s = map[status] || map.pending;
    return (
      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', s.cls)}>
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const themeStyles = getThemeStyles(property);

  const ItemCard = ({ item }: { item: ConciergeItem }) => {
    const qty = quantities[item.id] || 1;
    const note = notes[item.id] || '';
    const isSubmitting = submitting[item.id];
    const priceLabel = item.price === 0 ? t.free : `R$ ${item.price.toFixed(2).replace('.', ',')}`;

    return (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {item.image_url && (
          <div className="relative w-full h-36">
            <Image src={item.image_url} alt={getItemName(item, lang)} fill className="object-cover" />
          </div>
        )}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-foreground">{getItemName(item, lang)}</h3>
              {getItemDesc(item, lang) && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{getItemDesc(item, lang)}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-bold text-primary">{priceLabel}</span>
              {item.category === 'loan' && item.loss_price && item.loss_price > 0 && (
                <p className="text-[10px] text-red-400 mt-0.5">{t.lossWarning(item.loss_price.toFixed(2).replace('.', ','))}</p>
              )}
            </div>
          </div>

          {item.included_qty > 0 && (
            <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
              <CheckCircle2 size={10} />
              {t.included(item.included_qty)}
            </div>
          )}

          <input
            type="text"
            value={note}
            onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
            placeholder={t.notesPlaceholder}
            className="w-full text-xs bg-secondary border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-secondary rounded-xl p-1">
              <button
                onClick={() => handleQty(item.id, -1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-border transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-bold w-6 text-center">{qty}</span>
              <button
                onClick={() => handleQty(item.id, 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-border transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            <button
              onClick={() => handleSubmit(item.id)}
              disabled={isSubmitting}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 size={14} className="animate-spin" />{t.requesting}</>
              ) : t.requestItem}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background" style={themeStyles}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center bg-secondary rounded-xl hover:bg-border transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        {property?.logoUrl && (
          <div className="relative w-8 h-8 rounded-lg overflow-hidden">
            <Image src={property.logoUrl} alt={property.name} fill className="object-cover" />
          </div>
        )}
        <h1 className="text-sm font-bold uppercase tracking-wider text-foreground flex-1">{t.pageTitle}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t.noItems}</p>
          </div>
        ) : (
          <>
            {/* Consumption Section */}
            {consumptionItems.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingBag size={16} className="text-primary" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-foreground/60">{t.consumption}</h2>
                </div>
                <div className="space-y-4">
                  {consumptionItems.map(item => <ItemCard key={item.id} item={item} />)}
                </div>
              </section>
            )}

            {/* Loan Section */}
            {loanItems.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Package size={16} className="text-primary" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-foreground/60">{t.loan}</h2>
                </div>
                <div className="space-y-4">
                  {loanItems.map(item => <ItemCard key={item.id} item={item} />)}
                </div>
              </section>
            )}
          </>
        )}

        {/* Order History */}
        {requests.length > 0 && (
          <section>
            <button
              onClick={() => setShowHistory(prev => !prev)}
              className="flex items-center gap-2 w-full text-left mb-3"
            >
              <h2 className="text-xs font-black uppercase tracking-widest text-foreground/60 flex-1">{t.orderHistory}</h2>
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showHistory && (
              <div className="space-y-2">
                {requests.map(req => (
                  <div key={req.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {req.quantity}x {req.item ? getItemName(req.item, lang) : req.itemId}
                      </p>
                      {req.notes && (
                        <p className="text-[11px] text-muted-foreground truncate">{req.notes}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(req.createdAt).toLocaleTimeString(lang === 'pt' ? 'pt-BR' : lang, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {statusBadge(req.status)}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* DND Alert Dialog */}
      {dndPending && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
                <AlertCircle size={20} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">{t.dndActiveAlert}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t.dndActiveDesc}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDndPending(null)}
                className="flex-1 bg-secondary text-foreground rounded-xl py-3 text-xs font-bold uppercase tracking-wide hover:bg-border transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleDndAccept}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
              >
                {t.allowEntry}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
