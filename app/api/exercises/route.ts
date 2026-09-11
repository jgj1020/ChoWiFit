import { NextResponse } from 'next/server';

const WGER_BASE = 'https://wger.de/api/v2';

interface WgerApiResponse {
  results?: any[];
  next?: string | null;
}

export async function GET() {
  try {
    const exercises: any[] = [];
    let nextUrl: string | null = `${WGER_BASE}/exercise/?language=2&status=2&limit=100&format=json`;
    let pageCount = 0;

    while (nextUrl && pageCount < 10) {
      const response: Response = await fetch(nextUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`wger API 오류 (${response.status})`);
      }

      const data: WgerApiResponse = await response.json();
      exercises.push(...(data.results ?? []));
      nextUrl = data.next ?? null;
      pageCount += 1;
    }

    const clean = exercises.filter(
      (exercise: any) =>
        typeof exercise?.name === 'string' && exercise.name.trim().length > 0
    );

    return NextResponse.json({ results: clean });
  } catch (error) {
    console.error('운동 목록 API 오류:', error);
    return NextResponse.json(
      { results: [], error: '운동 목록을 불러오지 못했습니다.' },
      { status: 502 }
    );
  }
}
