import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
        return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 });
    }

    try {
        const blob = await put(filename, request.body as any, {
            access: 'public',
        });

        return NextResponse.json(blob);
    } catch (error) {
        console.error('Error uploading to Vercel Blob:', error);
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
}
