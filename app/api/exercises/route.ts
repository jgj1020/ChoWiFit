import { NextResponse } from 'next/server';

const WGER_BASE = 'https://wger.de/api/v2';

interface WgerApiResponse {
  results?: unknown[];
  next?: string | null;
}

interface WgerExerciseRecord {
  name?: unknown;
  [key: string]: unknown;
}

export async function GET() {
  try {
    const exercises: WgerExerciseRecord[] = [];
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
      const results = Array.isArray(data.results)
        ? data.results.filter((item): item is WgerExerciseRecord => Boolean(item && typeof item === 'object'))
        : [];

      exercises.push(...results);
      nextUrl = data.next ?? null;
      pageCount += 1;
    }

    const clean = exercises.filter(
      (exercise) =>
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
