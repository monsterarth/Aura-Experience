import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { AuditService } from '@/services/audit-service';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    // Auth: apenas super_admin — extraído da sessão, não do body
    const auth = await requireAuth(['super_admin']);
    if (isAuthError(auth)) return auth;

    try {
        const propertyId = params.id;
        if (!propertyId) {
            return NextResponse.json({ error: 'Property ID missing' }, { status: 400 });
        }

        const {
            action, // 'purge', 'reset_defaults', 'delete_property'
            targets // Array of strings like ['stays', 'guests', 'messages']
        } = await request.json();

        if (!action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // actorId/actorName agora vêm da sessão autenticada
        const actorId = auth.staff.id;
        const actorName = auth.staff.fullName;

        if (action === 'delete_property') {
            // DELETE EVERYTHING
            const allTables = [
                'messages', 'stays', 'guests', 'cabins', 'structures',
                'structure_bookings', 'housekeeping_tasks', 'maintenance_tasks',
                'survey_responses', 'automation_rules', 'message_templates', 'checklists'
            ];

            for (const table of allTables) {
                await supabaseAdmin.from(table).delete().eq('propertyId', propertyId);
            }

            // Delete staff links
            await supabaseAdmin.from('staff').update({ propertyId: null, active: false }).eq('propertyId', propertyId);

            // Delete property
            const { error: deleteError } = await supabaseAdmin.from('properties').delete().eq('id', propertyId);
            if (deleteError) throw deleteError;

            return NextResponse.json({ success: true, message: 'Property deleted successfully' });
        }

        if (action === 'purge' && Array.isArray(targets)) {
            for (const target of targets) {
                // Basic protection to ensure we only delete from allowed tables
                const allowedTargets = [
                    'messages', 'stays', 'guests', 'housekeeping_tasks',
                    'maintenance_tasks', 'survey_responses', 'structure_bookings',
                    'cabins', 'structures'
                ];
                if (allowedTargets.includes(target)) {
                    const { error } = await supabaseAdmin.from(target).delete().eq('propertyId', propertyId);
                    if (error) console.error(`Error purging ${target}:`, error);
                }
            }

            await AuditService.log({
                propertyId: propertyId,
                userId: actorId,
                userName: actorName,
                action: 'DELETE',
                entity: 'PROPERTY' as any,
                entityId: propertyId,
                details: `Executado PURGE (Limpeza de Dados) nas tabelas: ${targets.join(', ')}`
            });

            return NextResponse.json({ success: true, message: 'Data purged successfully' });
        }

        if (action === 'reset_defaults') {
            // 1. Wipe current templates
            await supabaseAdmin.from('automation_rules').delete().eq('propertyId', propertyId);
            await supabaseAdmin.from('message_templates').delete().eq('propertyId', propertyId);
            await supabaseAdmin.from('checklists').delete().eq('propertyId', propertyId);

            // 2. Fetch SYSTEM_DEFAULTS
            const { data: defaultRules } = await supabaseAdmin.from('automation_rules').select('*').eq('propertyId', 'SYSTEM_DEFAULTS');
            const { data: defaultMessages } = await supabaseAdmin.from('message_templates').select('*').eq('propertyId', 'SYSTEM_DEFAULTS');
            const { data: defaultChecklists } = await supabaseAdmin.from('checklists').select('*').eq('propertyId', 'SYSTEM_DEFAULTS');

            // 3. Inject clones
            if (defaultMessages && defaultMessages.length > 0) {
                const clones = defaultMessages.map(m => ({ ...m, propertyId, id: crypto.randomUUID() }));
                await supabaseAdmin.from('message_templates').insert(clones);
            }

            if (defaultRules && defaultRules.length > 0) {
                const clones = defaultRules.map(r => ({ ...r, propertyId })); // rules use ENUM as ID usually, so we keep the same ID
                await supabaseAdmin.from('automation_rules').upsert(clones);
            }

            if (defaultChecklists && defaultChecklists.length > 0) {
                const clones = defaultChecklists.map(c => ({ ...c, propertyId, id: crypto.randomUUID() }));
                await supabaseAdmin.from('checklists').insert(clones);
            }

            await AuditService.log({
                propertyId: propertyId,
                userId: actorId,
                userName: actorName,
                action: 'UPDATE',
                entity: 'PROPERTY' as any,
                entityId: propertyId,
                details: `Padrões do sistema (SYSTEM_DEFAULTS) restaurados com sucesso.`
            });

            return NextResponse.json({ success: true, message: 'Defaults restored successfully' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('[API Purge Error]:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
