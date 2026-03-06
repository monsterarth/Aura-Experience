require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('survey_templates').insert({
        id: "test-id",
        propertyId: "test-property",
        title: "Test",
        isDefault: false,
        questions: [],
        reward: { hasReward: false, type: "", description: "" }
    });

    console.log("Insert Test Result:");
    console.log({ data, error });
}

check();
