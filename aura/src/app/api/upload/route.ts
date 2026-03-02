import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
        return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 });
    }

    try {
        const fileBuffer = await request.arrayBuffer();

        // Generate a unique path to avoid collisions
        const uniqueFilename = `${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
        const filePath = `public/${uniqueFilename}`;

        // Uses the admin service role to bypass RLS bucket restrictions for server uploads
        const { data, error } = await supabaseAdmin.storage
            .from('images')
            .upload(filePath, fileBuffer, {
                contentType: request.headers.get('content-type') || 'application/octet-stream',
                upsert: false
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('images')
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrl, pathname: filePath });
    } catch (error) {
        console.error('Error uploading to Supabase Storage:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
