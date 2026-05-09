/**
 * Seed script: creates 5 concierge groups and 88 items for a given property.
 *
 * Usage:
 *   PROPERTY_ID=<uuid> npx ts-node --project tsconfig.json src/scripts/seed-concierge-items.ts
 *
 * All items are created with:
 *   availableForGuest: false, availableForMaid: true
 *   price: 0, included_qty: 0, stock_qty: null (unlimited)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROPERTY_ID = process.env.PROPERTY_ID || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}
if (!PROPERTY_ID) {
  console.error('Missing PROPERTY_ID env var. Usage: PROPERTY_ID=<uuid> npx ts-node ...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Groups ────────────────────────────────────────────────────────────────────

const GROUPS = [
  { name: 'Produtos de Limpeza', icon: '🧹', color: '#60a5fa', order: 1 },
  { name: 'Lavanderia',          icon: '🛏',  color: '#2dd4bf', order: 2 },
  { name: 'Insumos',             icon: '🧴',  color: '#9b6dff', order: 3 },
  { name: 'Equipamentos',        icon: '🪣',  color: '#f59e0b', order: 4 },
  { name: 'Frigobar',            icon: '🍺',  color: '#f87171', order: 5 },
] as const;

// ─── Items ─────────────────────────────────────────────────────────────────────

type ItemDef = { name: string; category: 'loan' | 'consumption'; group: string; emoji: string };

const ITEMS: ItemDef[] = [
  // Produtos de Limpeza
  { name: 'Desinfetante',      category: 'loan',        group: 'Produtos de Limpeza', emoji: '🧪' },
  { name: 'Cif',               category: 'loan',        group: 'Produtos de Limpeza', emoji: '🫧' },
  { name: 'Lustra Móveis',     category: 'loan',        group: 'Produtos de Limpeza', emoji: '✨' },
  { name: 'Veja',              category: 'loan',        group: 'Produtos de Limpeza', emoji: '🫧' },
  { name: 'Cera',              category: 'loan',        group: 'Produtos de Limpeza', emoji: '🪣' },
  { name: 'Detergente',        category: 'loan',        group: 'Produtos de Limpeza', emoji: '🧴' },
  { name: 'Shampoo',           category: 'loan',        group: 'Produtos de Limpeza', emoji: '🧴' },
  { name: 'Sabonete Líquido',  category: 'loan',        group: 'Produtos de Limpeza', emoji: '🫧' },
  { name: 'Saco de Lixo 30L',  category: 'consumption', group: 'Produtos de Limpeza', emoji: '🗑️' },

  // Lavanderia
  { name: 'Toalha de Banho',              category: 'loan', group: 'Lavanderia', emoji: '🛁' },
  { name: 'Toalha de Rosto',              category: 'loan', group: 'Lavanderia', emoji: '🧖' },
  { name: 'Toalha de Piso',               category: 'loan', group: 'Lavanderia', emoji: '🚿' },
  { name: 'Pano de Chão',                 category: 'loan', group: 'Lavanderia', emoji: '🧹' },
  { name: 'Lençol King',                  category: 'loan', group: 'Lavanderia', emoji: '🛏️' },
  { name: 'Lençol Solteiro',              category: 'loan', group: 'Lavanderia', emoji: '🛏️' },
  { name: 'Lençol Superking',             category: 'loan', group: 'Lavanderia', emoji: '🛏️' },
  { name: 'Lençol Queen',                 category: 'loan', group: 'Lavanderia', emoji: '🛏️' },
  { name: 'Colcha Branca King',           category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Colcha Branca Solteiro',       category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Colcha Marrom King',           category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Colcha Marrom Solteiro',       category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Fronha Lisa Branca',           category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Fronha Trabalhada Marrom',     category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Fronha Trabalhada Branca',     category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Manta Personalizada King',     category: 'loan', group: 'Lavanderia', emoji: '🧣' },
  { name: 'Manta Personalizada Solteiro', category: 'loan', group: 'Lavanderia', emoji: '🧣' },
  { name: 'Cobertor Jolitex Marrom King',     category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Cobertor Jolitex Marrom Solteiro', category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Edredon Branco King',          category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Edredon Branco Solteiro',      category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Douvet Branco King',           category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Douvet Branco Solteiro',       category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Douvet Branco Queen',          category: 'loan', group: 'Lavanderia', emoji: '🤍' },
  { name: 'Toalha de Praia',              category: 'loan', group: 'Lavanderia', emoji: '🏖️' },
  { name: 'Pano de Prato',               category: 'loan', group: 'Lavanderia', emoji: '🍽️' },
  { name: 'Pillow Top',                  category: 'loan', group: 'Lavanderia', emoji: '😴' },
  { name: 'Travesseiro',                 category: 'loan', group: 'Lavanderia', emoji: '😴' },
  { name: 'Kit Berço Menina',            category: 'loan', group: 'Lavanderia', emoji: '👶🏻' },
  { name: 'Kit Berço Menino',            category: 'loan', group: 'Lavanderia', emoji: '👶🏻' },
  { name: 'Kit Berço Neutro',            category: 'loan', group: 'Lavanderia', emoji: '👶🏻' },
  { name: 'Manta Sofá Cinza',            category: 'loan', group: 'Lavanderia', emoji: '🩶' },
  { name: 'Manta Sofá Bege',             category: 'loan', group: 'Lavanderia', emoji: '🤎' },
  { name: 'Manta Sofá Escura',           category: 'loan', group: 'Lavanderia', emoji: '🖤' },
  { name: 'Manta Sofá Azul',             category: 'loan', group: 'Lavanderia', emoji: '💙' },
  { name: 'Manta Sofá Verde',            category: 'loan', group: 'Lavanderia', emoji: '💚' },
  { name: 'Manta Sofá Laranja',          category: 'loan', group: 'Lavanderia', emoji: '🧡' },
  { name: 'Manta Sofá Listrada',         category: 'loan', group: 'Lavanderia', emoji: '🧣' },

  // Insumos
  { name: 'Esponja',              category: 'consumption', group: 'Insumos', emoji: '🧽' },
  { name: 'Fósforo',              category: 'consumption', group: 'Insumos', emoji: '🔥' },
  { name: 'Refil Mosquito',       category: 'consumption', group: 'Insumos', emoji: '🦟' },
  { name: 'Aparelho Mosquito',    category: 'loan',        group: 'Insumos', emoji: '🦟' },
  { name: 'Taça de Vinho Lisa',   category: 'loan',        group: 'Insumos', emoji: '🍷' },
  { name: 'Taça de Vinho Trabalhada', category: 'loan',    group: 'Insumos', emoji: '🍷' },
  { name: 'Taça de Espumante',    category: 'loan',        group: 'Insumos', emoji: '🥂' },
  { name: 'Copo Liso',            category: 'loan',        group: 'Insumos', emoji: '🥛' },
  { name: 'Copo Trabalhado',      category: 'loan',        group: 'Insumos', emoji: '🥛' },
  { name: 'Chá a Granel',         category: 'consumption', group: 'Insumos', emoji: '🍵' },
  { name: 'Sachê de Café a Granel', category: 'consumption', group: 'Insumos', emoji: '☕' },
  { name: 'Guardanapo de Papel',  category: 'consumption', group: 'Insumos', emoji: '🧻' },
  { name: 'Guardanapo de Pano',   category: 'loan',        group: 'Insumos', emoji: '🍽️' },
  { name: 'Grampo de Roupas',     category: 'loan',        group: 'Insumos', emoji: '🪢' },
  { name: 'Panela P',             category: 'loan',        group: 'Insumos', emoji: '🍳' },
  { name: 'Panela M',             category: 'loan',        group: 'Insumos', emoji: '🍳' },
  { name: 'Panela G',             category: 'loan',        group: 'Insumos', emoji: '🫕' },
  { name: 'Cama Extra',           category: 'loan',        group: 'Insumos', emoji: '🛏️' },
  { name: 'Colchão Extra',        category: 'loan',        group: 'Insumos', emoji: '🛏️' },
  { name: 'Garfo',                category: 'loan',        group: 'Insumos', emoji: '🍴' },
  { name: 'Faca',                 category: 'loan',        group: 'Insumos', emoji: '🔪' },
  { name: 'Colher',               category: 'loan',        group: 'Insumos', emoji: '🥄' },
  { name: 'Saladeira',            category: 'loan',        group: 'Insumos', emoji: '🥗' },
  { name: 'Frigideira Grande',    category: 'loan',        group: 'Insumos', emoji: '🍳' },
  { name: 'Liquidificador',       category: 'loan',        group: 'Insumos', emoji: '🧃' },
  { name: 'Sanduicheira',         category: 'loan',        group: 'Insumos', emoji: '🥪' },
  { name: 'Chaleira Elétrica',    category: 'loan',        group: 'Insumos', emoji: '☕' },
  { name: 'Ferro de Passar',      category: 'loan',        group: 'Insumos', emoji: '👔' },
  { name: 'Papel Higiênico',      category: 'consumption', group: 'Insumos', emoji: '🧻' },
  { name: 'Lenha',                category: 'consumption', group: 'Insumos', emoji: '🪵' },
  { name: 'Carvão',               category: 'consumption', group: 'Insumos', emoji: '🔥' },
  { name: 'Álcool',               category: 'consumption', group: 'Insumos', emoji: '🧪' },
  { name: 'Sal Grosso',           category: 'consumption', group: 'Insumos', emoji: '🧂' },

  // Equipamentos
  { name: 'Balde',    category: 'loan', group: 'Equipamentos', emoji: '🪣' },
  { name: 'Vassoura', category: 'loan', group: 'Equipamentos', emoji: '🧹' },
  { name: 'Rodo',     category: 'loan', group: 'Equipamentos', emoji: '🧹' },
  { name: 'Escovão',  category: 'loan', group: 'Equipamentos', emoji: '🪣' },

  // Frigobar
  { name: 'Água com Gás',     category: 'consumption', group: 'Frigobar', emoji: '💧' },
  { name: 'Água sem Gás',     category: 'consumption', group: 'Frigobar', emoji: '💧' },
  { name: 'Coca-Cola Normal', category: 'consumption', group: 'Frigobar', emoji: '🥤' },
  { name: 'Coca-Cola Zero',   category: 'consumption', group: 'Frigobar', emoji: '🥤' },
  { name: 'Corona',           category: 'consumption', group: 'Frigobar', emoji: '🍺' },
];

async function main() {
  console.log(`\n🌱 Seed concierge for property: ${PROPERTY_ID}\n`);

  // 1. Create groups
  console.log('Creating groups...');
  const groupIdMap: Record<string, string> = {};
  const now = new Date().toISOString();

  for (const g of GROUPS) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('concierge_groups').insert({
      id,
      propertyId: PROPERTY_ID,
      name: g.name,
      icon: g.icon,
      color: g.color,
      order: g.order,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (error) {
      console.error(`  ✗ Group "${g.name}": ${error.message}`);
    } else {
      groupIdMap[g.name] = id;
      console.log(`  ✓ ${g.icon} ${g.name} (${id})`);
    }
  }

  // 2. Insert items
  console.log('\nCreating items...');
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const groupId = groupIdMap[item.group];
    const { error } = await supabase.from('concierge_items').insert({
      id: crypto.randomUUID(),
      propertyId: PROPERTY_ID,
      name: item.name,
      category: item.category,
      price: 0,
      included_qty: 0,
      stock_qty: null,
      image_url: `emoji:${item.emoji}`,
      active: true,
      availableForGuest: false,
      availableForMaid: true,
      order: i,
      groupId: groupId || null,
      createdAt: now,
      updatedAt: now,
    });
    if (error) {
      console.error(`  ✗ "${item.name}": ${error.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${item.emoji} [${item.group}] ${item.name}`);
      ok++;
    }
  }

  console.log(`\n✅ Done — ${ok} items created, ${fail} failed.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
