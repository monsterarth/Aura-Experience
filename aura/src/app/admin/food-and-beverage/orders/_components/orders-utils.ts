// Regras puras dos pedidos F&B: itens, agrupamento por categoria, status e ticket térmico.
import type { Tone } from "@/lib/admin-tokens";
import type { FBOrder, FBCategory, FBMenuItem } from "@/types/aura";

export type OrderItem = any;
export type ItemGroup = { label: string; items: OrderItem[] };
export type StayInfo = { cabinName: string; guestName: string };

export const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function getRegularItems(order: FBOrder): OrderItem[] {
  return (order.items as OrderItem[]).filter(it => it.menuItemId !== "guest_observations");
}
export function getObservations(order: FBOrder): OrderItem | null {
  return (order.items as OrderItem[]).find(it => it.menuItemId === "guest_observations") ?? null;
}

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending:   { label: "Pendente",   tone: "amber" },
  preparing: { label: "Preparando", tone: "blue" },
  delivered: { label: "Entregue",   tone: "green" },
  cancelled: { label: "Cancelado",  tone: "red" },
};
export function orderStatus(s: string) { return ORDER_STATUS[s] ?? { label: s, tone: "neutral" as Tone }; }

/**
 * Agrupa itens por categoria: primeiro os "à la carte" (sem categoria conhecida),
 * depois cada categoria na ordem; dentro da categoria, hóspedes nomeados antes dos itens da mesa.
 */
export function groupByCategory(items: OrderItem[], categories: FBCategory[], menuItems: FBMenuItem[]): ItemGroup[] {
  const menuItemMap = new Map(menuItems.map(m => [m.id, m]));
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  const byCategoryId: Record<string, OrderItem[]> = {};
  const alaCarte: OrderItem[] = [];
  for (const it of items) {
    const menuItem = menuItemMap.get(it.menuItemId);
    const cat = menuItem ? categoryMap.get(menuItem.categoryId) : undefined;
    if (!cat) alaCarte.push(it);
    else { (byCategoryId[cat.id] ||= []).push(it); }
  }
  const groups: ItemGroup[] = [];
  if (alaCarte.length > 0) groups.push({ label: "À la carte", items: alaCarte });
  for (const cat of categories) {
    const catItems = byCategoryId[cat.id];
    if (catItems && catItems.length > 0) {
      groups.push({
        label: cat.name,
        items: [
          ...catItems.filter(it => it.guestName).sort((a, b) => (a.guestName ?? "").localeCompare(b.guestName ?? "")),
          ...catItems.filter(it => !it.guestName),
        ],
      });
    }
  }
  return groups;
}

/** HTML do ticket térmico (80mm) impresso em janela separada. */
export function buildThermalHTML(order: FBOrder, cabinName: string, propertyName: string, groups: ItemGroup[]): string {
  const obs = getObservations(order);
  const itemsHTML = groups.map(({ label, items }, gi) => `
        <div style="margin-bottom:${gi < groups.length - 1 ? "8px" : "0"}">
            <div style="font-weight:900;font-size:10px;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:2px;margin-bottom:4px;letter-spacing:0.08em;color:#555;">
                ${label}
            </div>
            <div style="padding-left:4px;">
                ${items.map((it: OrderItem) => `
                    <div style="margin-bottom:4px;">
                        <div style="font-weight:700;">
                            <span style="background:#000;color:#fff;padding:0 4px;border-radius:3px;margin-right:4px;font-size:11px;">${it.quantity}×</span>
                            ${String(it.name).toUpperCase()}
                            ${it.guestName ? `<span style="font-weight:400;font-size:10px;color:#444;margin-left:4px;">→ ${it.guestName}</span>` : ""}
                        </div>
                        ${it.flavor ? `<div style="padding-left:24px;font-size:11px;color:#333;">Sabor: ${it.flavor}</div>` : ""}
                    </div>
                `).join("")}
            </div>
        </div>
    `).join("");

  const obsHTML = obs?.notes ? `
        <div style="border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
            <div style="font-weight:900;font-size:11px;text-transform:uppercase;margin-bottom:2px;">OBSERVAÇÕES:</div>
            <div style="font-size:11px;white-space:pre-wrap;">${obs.notes}</div>
        </div>
    ` : "";

  const deliveryDateStr = order.deliveryDate
    ? new Date(order.deliveryDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
    : "";
  const totalStr = fmtBRL(order.totalPrice);
  const createdStr = new Date(order.createdAt || "").toLocaleString("pt-BR");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 4mm; background: #fff; color: #000; font-family: monospace; font-size: 12px; line-height: 1.4; width: 80mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div style="text-align:center;padding-bottom:8px;margin-bottom:8px;border-bottom:2px dashed #000;">
    <div style="font-weight:900;font-size:15px;text-transform:uppercase;letter-spacing:0.05em;">${propertyName}</div>
    <div style="font-weight:700;font-size:13px;">CAFÉ DA MANHÃ</div>
    <div style="font-size:11px;margin-top:2px;">Pedido #${order.id.substring(0, 6).toUpperCase()}</div>
    <div style="font-size:10px;color:#444;">${createdStr}</div>
  </div>
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-weight:900;font-size:26px;border:3px solid #000;display:inline-block;padding:4px 10px;border-radius:8px;letter-spacing:-0.02em;line-height:1.1;word-break:break-word;max-width:100%;">
      ${cabinName}
    </div>
    ${order.deliveryTime ? `<div style="font-weight:700;font-size:16px;margin-top:6px;">Entrega: ${order.deliveryTime}</div>` : ""}
    ${deliveryDateStr ? `<div style="font-size:11px;color:#555;">${deliveryDateStr}</div>` : ""}
  </div>
  <div style="border-top:2px dashed #000;border-bottom:2px dashed #000;padding:8px 0;margin-bottom:8px;">
    ${itemsHTML}
  </div>
  ${obsHTML}
  <div style="text-align:center;font-weight:700;font-size:12px;margin-bottom:8px;">TOTAL: ${totalStr}</div>
  <div style="text-align:center;font-size:10px;color:#666;border-top:1px dashed #ccc;padding-top:4px;">★ Bom Apetite ★</div>
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
      setTimeout(function() { window.close(); }, 4000);
    };
  </script>
</body>
</html>`;
}
