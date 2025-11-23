import { NextRequest, NextResponse } from 'next/server';
import { identifySpeakers } from '@/lib/speaker-identification';

export async function POST(request: NextRequest) {
  try {
    const { paragraphs, transcriptId } = await request.json();
    
    if (!paragraphs || paragraphs.length === 0) {
      return NextResponse.json({ error: 'No paragraphs provided' }, { status: 400 });
    }

    const mapping = await identifySpeakers(paragraphs, transcriptId);

    return NextResponse.json({ mapping });
    
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

