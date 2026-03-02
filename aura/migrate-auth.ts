import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function migrateAuth() {
    console.log("Starting Auth Migration to Supabase...");

    // 1. Fetch all staff members
    const { data: staffList, error: fetchError } = await supabaseAdmin.from('staff').select('*');

    if (fetchError || !staffList) {
        console.error("Failed to fetch staff:", fetchError);
        return;
    }

    console.log(`Found ${staffList.length} staff members to migrate.`);

    for (const staff of staffList) {
        try {
            console.log(`Processing ${staff.email}...`);

            // Check if user already exists in Auth to prevent duplicates on rerun
            const { data: { users }, error: authSearchError } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = users.find((u: any) => u.email === staff.email);

            let newUserId;

            if (existingUser) {
                console.log(`User ${staff.email} already exists in Auth. Linking ID...`);
                newUserId = existingUser.id;
            } else {
                // Create user in Supabase Auth
                const { data: userResponse, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: staff.email,
                    password: 'Aura@2026',
                    email_confirm: true,
                    user_metadata: {
                        fullName: staff.fullName,
                        role: staff.role
                    }
                });

                if (createError || !userResponse.user) {
                    console.error(`Failed to create Auth user for ${staff.email}:`, createError);
                    continue;
                }

                newUserId = userResponse.user.id;
                console.log(`Auth user created. New ID: ${newUserId}`);
            }

            // Update the staff table with the new Supabase Auth UUID
            if (staff.id !== newUserId) {
                const { error: updateError } = await supabaseAdmin
                    .from('staff')
                    .update({ id: newUserId })
                    .eq('id', staff.id);

                if (updateError) {
                    console.error(`Failed to update staff ID for ${staff.email}:`, updateError);
                } else {
                    console.log(`Successfully migrated staff ID for ${staff.email}.`);
                }
            } else {
                console.log(`Staff ID for ${staff.email} is already up to date.`);
            }

        } catch (err) {
            console.error(`Unexpected error processing ${staff.email}:`, err);
        }
    }

    console.log("Migration completed!");
}

migrateAuth();
