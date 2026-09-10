'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

/* ================================================================== */
/*  공통 타입 / 설정 (운동 목록 화면 + AI 코칭 화면이 함께 사용)              */
/* ================================================================== */

type ExerciseType = 'PUSHUP' | 'SQUAT' | 'LUNGE' | 'SITUP' | 'JUMPING_JACK' | 'PLANK' | 'BURPEE' | 'LEG_RAISE';

interface ExerciseConfig {
  name: string;
  shortName: string;
  icon: string;
  defaultTarget: number;
  downThreshold: number;
  upThreshold: number;
  torsoMinAngle: number;
  guideText: string;
}

interface WorkoutRecord {
  id: number;
  exercise: string;
  reps: number;
  goodReps: number;
  score: number;
  duration: number;
  date: string;
}

interface WorkoutStats {
  totalWorkouts: number;
  totalReps: number;
  averageScore: number;
  totalDuration: number;
  exerciseStats: Record<string, { count: number; totalReps: number; avgScore: number; totalDuration: number }>;
  dailyData: Array<{ date: string; count: number; totalReps: number; avgScore: number }>;
  weeklyData: Array<{ week: number; count: number; totalReps: number; avgScore: number }>;
}

function calculateStats(history: WorkoutRecord[]): WorkoutStats {
  const stats: WorkoutStats = {
    totalWorkouts: history.length,
    totalReps: history.reduce((sum, r) => sum + r.goodReps, 0),
    averageScore: history.length > 0 ? history.reduce((sum, r) => sum + r.score, 0) / history.length : 0,
    totalDuration: history.reduce((sum, r) => sum + r.duration, 0),
    exerciseStats: {},
    dailyData: [],
    weeklyData: [],
  };

  const exerciseMap: Record<string, { count: number; totalReps: number; totalScore: number; totalDuration: number }> = {};
  history.forEach((record) => {
    if (!exerciseMap[record.exercise]) {
      exerciseMap[record.exercise] = { count: 0, totalReps: 0, totalScore: 0, totalDuration: 0 };
    }
    exerciseMap[record.exercise].count++;
    exerciseMap[record.exercise].totalReps += record.goodReps;
    exerciseMap[record.exercise].totalScore += record.score;
    exerciseMap[record.exercise].totalDuration += record.duration;
  });

  Object.entries(exerciseMap).forEach(([exercise, data]) => {
    stats.exerciseStats[exercise] = {
      count: data.count,
      totalReps: data.totalReps,
      avgScore: data.count > 0 ? data.totalScore / data.count : 0,
      totalDuration: data.totalDuration,
    };
  });

  return stats;
}

const EXERCISE_CONFIGS: Record<ExerciseType, ExerciseConfig> = {
  PUSHUP: {
    name: '푸시업 (Push-up)',
    shortName: '푸시업',
    icon: '💪',
    defaultTarget: 10,
    downThreshold: 110,
    upThreshold: 145,
    torsoMinAngle: 135,
    guideText: '팔을 충분히 굽히고 몸을 일직선으로 유지하세요.',
  },
  SQUAT: {
    name: '스쿼트 (Squat)',
    shortName: '스쿼트',
    icon: '🦵',
    defaultTarget: 10,
    downThreshold: 115,
    upThreshold: 150,
    torsoMinAngle: 120,
    guideText: '무릎을 충분히 낮추고 천천히 일어나세요.',
  },
  LUNGE: {
    name: '런지 (Lunge)',
    shortName: '런지',
    icon: '🏃',
    defaultTarget: 10,
    downThreshold: 105,
    upThreshold: 155,
    torsoMinAngle: 115,
    guideText: '앞쪽 무릎을 천천히 굽히고 상체를 바르게 세우세요.',
  },
  SITUP: {
    name: '윗몸일으키기 (Sit-up)',
    shortName: '윗몸일으키기',
    icon: '🔥',
    defaultTarget: 10,
    downThreshold: 125,
    upThreshold: 70,
    torsoMinAngle: 60,
    guideText: '복부에 힘을 주고 천천히 상체를 일으켜주세요.',
  },
  JUMPING_JACK: {
    name: '점핑잭 (Jumping Jack)',
    shortName: '점핑잭',
    icon: '⭐',
    defaultTarget: 10,
    downThreshold: 0,
    upThreshold: 1,
    torsoMinAngle: 140,
    guideText: '팔과 다리를 충분히 벌렸다가 다시 모아주세요.',
  },
  PLANK: {
    name: '플랭크 (Plank)',
    shortName: '플랭크',
    icon: '📏',
    defaultTarget: 30,
    downThreshold: 0,
    upThreshold: 1,
    torsoMinAngle: 165,
    guideText: '몸을 일직선으로 유지하고 버티세요.',
  },
  BURPEE: {
    name: '버피 (Burpee)',
    shortName: '버피',
    icon: '💥',
    defaultTarget: 10,
    downThreshold: 80,
    upThreshold: 170,
    torsoMinAngle: 130,
    guideText: '푸시업 자세로 내려갔다가 점프하며 일어나세요.',
  },
  LEG_RAISE: {
    name: '레그레이즈 (Leg Raise)',
    shortName: '레그레이즈',
    icon: '🦵⬆️',
    defaultTarget: 10,
    downThreshold: 120,
    upThreshold: 50,
    torsoMinAngle: 135,
    guideText: '누운 자세에서 다리를 천천히 올렸다 내려주세요.',
  },
};

const EXERCISE_SEARCH_ALIASES: Record<ExerciseType, string[]> = {
  PUSHUP: ['pushup', 'push-up', 'push up', '푸시업', '푸쉬업', '푸쉬', '팔굽혀펴기', '팔굽혀펴'],
  SQUAT: ['squat', '스쿼트', '스쿼'],
  LUNGE: ['lunge', '런지'],
  SITUP: ['situp', 'sit-up', 'sit up', '윗몸일으키기', '윗몸일으키', '윗몸', '싯업'],
  JUMPING_JACK: ['jumpingjack', 'jumping-jack', 'jumping jack', 'jump jack', '점핑잭', '점핑', '팔벌려뛰기'],
  PLANK: ['plank', '플랭크', '플랭'],
  BURPEE: ['burpee', '버피', '버피'],
  LEG_RAISE: ['legraise', 'leg-raise', 'leg raise', '레그레이즈', '다리올리기', '다리올리'],
};

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
];

const STORAGE_KEY = 'chowifit-workout-history';

/* ================================================================== */
/*  wger 공개 운동 API (인증 불필요) — https://wger.de/en/software/api  */
/* ================================================================== */

const WGER_BASE = 'https://wger.de/api/v2';

interface WgerCategory {
  id: number;
  name: string;
}

interface WgerMuscle {
  id: number;
  name: string;
  name_en: string;
}

interface WgerExercise {
  id: number;
  uuid?: string;
  name?: string | null;
  description?: string | null;
  category: number;
  muscles?: number[];
  muscles_secondary?: number[];
  equipment?: number[];
}

interface WgerExerciseDetail {
  id: number;
  category?: { id: number; name: string };
  muscles?: { id: number; name_en: string; name: string }[];
  muscles_secondary?: { id: number; name_en: string; name: string }[];
  equipment?: { id: number; name: string }[];
  translations?: { language: number; name: string; description: string }[];
}

const SUPPORTED_EXERCISES: {
  type: ExerciseType;
  name: string;
  icon: string;
  blurb: string;
}[] = [
  {
    type: 'PUSHUP',
    name: '푸시업',
    icon: '💪',
    blurb: '팔꿈치와 몸의 정렬을 분석해 반복 횟수와 자세를 알려줘요.',
  },
  {
    type: 'SQUAT',
    name: '스쿼트',
    icon: '🦵',
    blurb: '무릎과 엉덩이 각도를 추적해 실시간으로 자세를 교정해줘요.',
  },
  {
    type: 'LUNGE',
    name: '런지',
    icon: '🏃',
    blurb: '무릎 각도와 상체 정렬을 분석해 올바른 런지 동작을 도와줘요.',
  },
  {
    type: 'SITUP',
    name: '윗몸일으키기',
    icon: '🔥',
    blurb: '상체와 다리의 움직임을 분석해 반복 횟수를 세어줘요.',
  },
  {
    type: 'JUMPING_JACK',
    name: '점핑잭',
    icon: '⭐',
    blurb: '팔과 다리의 벌어짐을 분석해 점핑잭 횟수를 세어줘요.',
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  Abs: '🔥',
  Arms: '💪',
  Back: '🧗',
  Calves: '🦶',
  Cardio: '❤️',
  Chest: '🎯',
  Legs: '🦵',
  Shoulders: '🏋️',
};

// 이름이 없거나 undefined/null 인 레코드가 와도 절대 죽지 않도록 방어
function detectSupportedExercise(name?: string | null): ExerciseType | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if ((n.includes('push') && n.includes('up')) || n.includes('푸시')) return 'PUSHUP';
  if (n.includes('squat') || n.includes('스쿼트')) return 'SQUAT';
  if (n.includes('lunge') || n.includes('런지')) return 'LUNGE';
  if (n.includes('sit-up') || n.includes('sit up') || n.includes('situp') || n.includes('윗몸')) return 'SITUP';
  if (n.includes('jumping jack') || n.includes('jump jack') || n.includes('점핑잭')) return 'JUMPING_JACK';
  return null;
}

function stripHtml(html?: string | null) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wger API 오류 (${res.status})`);
  return res.json();
}

/* ================================================================== */
/*  운동 목록 화면                                                      */
/* ================================================================== */

function CatalogView({
  onStart,
}: {
  onStart: (type: ExerciseType) => void;
}) {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('PUSHUP');
  const [allExercises, setAllExercises] = useState<WgerExercise[]>([]);
  const [muscleMap, setMuscleMap] = useState<Record<number, string>>({});
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<WgerExercise[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WgerExerciseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 첫 화면에 바로 보여줄 AI 자세 교정 운동입니다.
  // 나중에 운동을 더 추가하고 싶으면 SUPPORTED_EXERCISES에 항목만 추가하면 됩니다.
  const popularExercises = SUPPORTED_EXERCISES;

  // 전체 운동 목록은 화면 진입 시 한 번 받아서 '둘러보기'에 사용합니다.
  // 이 요청에는 API 키가 필요하지 않습니다.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLibraryLoading(true);
        setLibraryError('');

        const [exerciseRes, muscleRes] = await Promise.all([
          // 브라우저에서 wger를 직접 호출하지 않고 Next.js 서버 API를 통해 가져옵니다.
          // 이렇게 하면 CORS 문제와 오래된 검색 엔드포인트 문제를 피할 수 있습니다.
          fetchJson<{ results: WgerExercise[] }>('/api/exercises'),
          fetchJson<{ results: WgerMuscle[] }>(
            `${WGER_BASE}/muscle/?limit=50&format=json`
          ),
        ]);

        if (cancelled) return;

        const clean = (exerciseRes.results ?? []).filter(
          (ex) => typeof ex?.name === 'string' && ex.name.trim().length > 0
        );
        setAllExercises(clean);

        const map: Record<number, string> = {};
        (muscleRes.results ?? []).forEach((m) => {
          map[m.id] = m.name_en || m.name;
        });
        setMuscleMap(map);
      } catch (error) {
        console.error('전체 운동 목록 로딩 오류:', error);
        if (!cancelled) {
          setLibraryError(
            '전체 운동 목록을 불러오지 못했어요. 그래도 위의 AI 운동은 바로 사용할 수 있어요.'
          );
          setAllExercises([]);
        }
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 검색은 wger의 /exercise/search/에 의존하지 않습니다.
  // 최신 wger 릴리스에서 해당 엔드포인트가 제거되었기 때문에,
  // 서버에서 받아온 전체 운동 목록을 이름으로 검색합니다.
  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }

    const term = searchTerm.trim().toLowerCase();

    if (term.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);

    searchDebounceRef.current = window.setTimeout(() => {
      const results = allExercises.filter((exercise) => {
        const name = exercise.name?.toLowerCase() ?? '';
        const description = exercise.description?.toLowerCase() ?? '';
        return name.includes(term) || description.includes(term);
      });

      setSearchResults(results);
      setSearching(false);
    }, 200);

    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchTerm, allExercises]);

  useEffect(() => {
    if (detailId === null) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingDetail(true);
        const data = await fetchJson<WgerExerciseDetail>(
          `${WGER_BASE}/exerciseinfo/${detailId}/?format=json`
        );
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const selectedConfig = EXERCISE_CONFIGS[selectedExercise];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearchMode = normalizedSearch.length >= 2;
  const displayedExercises = isSearchMode
    ? (searchResults ?? [])
    : allExercises.slice(0, 24);

  const detailTranslation = useMemo(() => {
    if (!detail?.translations?.length) return null;
    return detail.translations.find((t) => t.language === 2) ?? detail.translations[0];
  }, [detail]);

  const selectSupportedExercise = (name?: string | null) => {
    const supported = detectSupportedExercise(name);
    if (!supported) return false;
    setSelectedExercise(supported);
    return true;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans">
      <header className="mx-auto max-w-6xl px-5 py-8">
        <p className="text-xs font-black tracking-widest text-cyan-400">CHOWIFIT</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
          오늘 할 운동을 선택하세요
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          운동을 선택하고 자세 교정 받기를 누르면 목표 횟수 설정 후 AI 코칭을 시작합니다.
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16">
        {/* ============================================================ */}
        {/* AI 자세 교정 운동 */}
        {/* ============================================================ */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-widest text-cyan-400">
                AI POSTURE COACH
              </p>
              <h2 className="mt-1 text-2xl font-black">운동 선택</h2>
              <p className="mt-1 text-xs text-slate-500">
                자주 하는 운동을 바로 고르거나 아래 검색창에서 운동을 찾아보세요.
              </p>
            </div>

            <div className="w-full lg:max-w-sm">
              <label className="mb-1.5 block text-[10px] font-black tracking-widest text-slate-500">
                운동 검색
              </label>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="예: push up, squat, lunge"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {popularExercises.map((ex) => {
              const selected = selectedExercise === ex.type && !isSearchMode;
              return (
                <button
                  key={ex.type}
                  type="button"
                  onClick={() => setSelectedExercise(ex.type)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_25px_rgba(0,255,204,0.08)]'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xl">{ex.icon}</span>
                    {selected && (
                      <span className="rounded-full bg-cyan-400 px-2 py-1 text-[8px] font-black text-slate-950">
                        선택됨
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-black">{ex.name}</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">AI 자세 교정</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-[10px] font-black tracking-widest text-slate-500">
                SELECTED EXERCISE
              </p>
              <p className="mt-1 text-lg font-black text-cyan-300">
                {selectedConfig.icon} {selectedConfig.shortName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onStart(selectedExercise)}
              className="rounded-2xl bg-cyan-400 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
            >
              자세 교정 받기 →
            </button>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 전체 운동 라이브러리 + 검색 */}
        {/* ============================================================ */}
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-widest text-cyan-400">
                EXERCISE LIBRARY
              </p>
              <h2 className="mt-1 text-xl font-black">
                {isSearchMode ? '검색한 운동' : '더 많은 운동 둘러보기'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {isSearchMode
                  ? `“${searchTerm}” 검색 결과를 보여줘요.`
                  : '아래에 운동 목록을 먼저 보여주고, 원하는 운동은 검색으로 더 찾을 수 있어요.'}
              </p>
            </div>
          </div>

          {libraryError && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-300">
              {libraryError}
            </div>
          )}

          {libraryLoading && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
                />
              ))}
            </div>
          )}

          {!libraryLoading && searching && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center text-xs text-slate-500">
              운동을 검색하는 중...
            </div>
          )}

          {!libraryLoading && !searching && isSearchMode && displayedExercises.length === 0 && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
              <p className="text-sm font-black text-slate-300">검색 결과가 없어요.</p>
              <p className="mt-1 text-xs text-slate-500">
                영문 운동 이름으로 검색해보세요. 예: squat, lunge, push up
              </p>
            </div>
          )}

          {!libraryLoading && !searching && !isSearchMode && displayedExercises.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center">
              <p className="text-sm font-black text-slate-300">전체 운동 목록을 불러오지 못했어요.</p>
              <p className="mt-1 text-xs text-slate-500">
                위 검색창에서 운동 이름을 검색해볼 수 있어요.
              </p>
            </div>
          )}

          {!libraryLoading && !searching && displayedExercises.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayedExercises.map((ex) => {
                const name = ex.name ?? '';
                const supported = detectSupportedExercise(name);
                const muscleNames = (ex.muscles ?? [])
                  .map((id) => muscleMap[id])
                  .filter(Boolean)
                  .slice(0, 2);
                const desc = stripHtml(ex.description);

                return (
                  <div
                    key={ex.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black leading-tight">{name}</p>
                        {supported ? (
                          <span className="shrink-0 rounded-full border border-cyan-400/50 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black text-cyan-300">
                            AI 지원
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[9px] font-black text-slate-500">
                            정보 보기
                          </span>
                        )}
                      </div>

                      {muscleNames.length > 0 && (
                        <p className="mt-1.5 text-[10px] text-slate-500">
                          {muscleNames.join(' · ')}
                        </p>
                      )}

                      <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-slate-400">
                        {desc || '운동 설명이 아직 없어요.'}
                      </p>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailId(ex.id)}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 py-2 text-[11px] font-bold text-slate-300 hover:border-slate-500"
                      >
                        자세히 보기
                      </button>

                      {supported && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectSupportedExercise(name)) {
                              onStart(supported);
                            }
                          }}
                          className="flex-1 rounded-xl bg-cyan-400 py-2 text-[11px] font-black text-slate-950 hover:bg-cyan-300"
                        >
                          자세 교정 받기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {detailId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setDetailId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6"
          >
            {loadingDetail && (
              <div className="py-10 text-center text-sm text-slate-500">불러오는 중...</div>
            )}

            {!loadingDetail && !detail && (
              <div className="py-10 text-center text-sm text-slate-500">
                상세 정보를 불러오지 못했어요.
              </div>
            )}

            {!loadingDetail && detail && detailTranslation && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-black">{detailTranslation.name || '이름 없음'}</h3>
                  <button
                    type="button"
                    onClick={() => setDetailId(null)}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    닫기
                  </button>
                </div>

                {detail.category && (
                  <p className="mt-1 text-xs text-cyan-400">{detail.category.name}</p>
                )}

                <p className="mt-4 text-sm leading-6 text-slate-300">
                  {stripHtml(detailTranslation.description) || '이 운동에 대한 설명이 아직 등록되지 않았어요.'}
                </p>

                {detectSupportedExercise(detailTranslation.name) && (
                  <button
                    type="button"
                    onClick={() => {
                      const supported = detectSupportedExercise(detailTranslation.name);
                      if (supported) {
                        setSelectedExercise(supported);
                        setDetailId(null);
                        onStart(supported);
                      }
                    }}
                    className="mt-5 w-full rounded-xl bg-cyan-400 py-3 text-sm font-black text-slate-950"
                  >
                    이 운동으로 자세 교정 받기 →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* ================================================================== */
/*  AI 자세 코칭 화면 (기존 기능 그대로)                                  */
/* ================================================================== */

function WorkoutView({
  initialExercise,
  onBack,
}: {
  initialExercise: ExerciseType;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>(initialExercise);
  const [targetReps, setTargetReps] = useState(
    EXERCISE_CONFIGS[initialExercise].defaultTarget
  );

  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [showHistory, setShowHistory] = useState<'none' | 'history' | 'stats'>('none');
  const [cameraStarted, setCameraStarted] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const [reps, setReps] = useState(0);
  const [goodReps, setGoodReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [torsoAngle, setTorsoAngle] = useState<number | null>(null);
  const [isGoodFormUI, setIsGoodFormUI] = useState(true);
  const [feedback, setFeedback] = useState('카메라 앞에 서서 운동을 시작해보세요.');
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [history, setHistory] = useState<WorkoutRecord[]>([]);

  const isDownRef = useRef(false);
  const downTimestampRef = useRef<number>(0);
  const wasFormGoodDuringDownRef = useRef(true);
  const angleHistoryRef = useRef<number[]>([]);

  // 자세가 한두 프레임 흔들려도 UI가 깜빡이지 않도록 안정화용 Ref
  const stableFormRef = useRef(true);
  const goodFormFramesRef = useRef(0);
  const badFormFramesRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);
  const lastFeedbackRef = useRef(
    '카메라 앞에 서서 운동을 시작해보세요.'
  );

  // MediaPipe는 한 번만 초기화하고, 아래 Ref로 최신 상태를 읽습니다.
  const isGoalReached = goodReps >= targetReps;

  const selectedExerciseRef = useRef(selectedExercise);
  const isWorkoutStartedRef = useRef(isWorkoutStarted);
  const isGoalReachedRef = useRef(isGoalReached);
  const targetRepsRef = useRef(targetReps);
  const poseBusyRef = useRef(false);

  useEffect(() => {
    selectedExerciseRef.current = selectedExercise;
  }, [selectedExercise]);

  useEffect(() => {
    isWorkoutStartedRef.current = isWorkoutStarted;
  }, [isWorkoutStarted]);

  useEffect(() => {
    isGoalReachedRef.current = isGoalReached;
  }, [isGoalReached]);

  useEffect(() => {
    targetRepsRef.current = targetReps;
  }, [targetReps]);
  const savedResultRef = useRef(false);

  const config = EXERCISE_CONFIGS[selectedExercise];
  const score =
    reps > 0
      ? Math.min(100, Math.round((goodReps / reps) * 100))
      : 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (!workoutStartTime || isGoalReached) return;

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - workoutStartTime) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [workoutStartTime, isGoalReached]);

  useEffect(() => {
    if (!isGoalReached || !isWorkoutStarted || reps <= 0 || goodReps <= 0 || savedResultRef.current) return;

    savedResultRef.current = true;
    setLastScore(score);

    const record: WorkoutRecord = {
      id: Date.now(),
      exercise: config.shortName,
      reps,
      goodReps,
      score,
      duration: elapsedSeconds,
      date: new Date().toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setHistory((prev) => {
      const next = [record, ...prev].slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [
    isGoalReached,
    isWorkoutStarted,
    config.shortName,
    reps,
    goodReps,
    score,
    elapsedSeconds,
  ]);

  const calculateAngle = (p1: any, p2: any, p3: any) => {
    if (!p1 || !p2 || !p3) return 180;

    const radians =
      Math.atan2(p3.y - p2.y, p3.x - p2.x) -
      Math.atan2(p1.y - p2.y, p1.x - p2.x);

    let angle = Math.abs((radians * 180) / Math.PI);

    if (angle > 180) angle = 360 - angle;

    return Math.round(angle);
  };

  const getSmoothedAngle = (rawAngle: number) => {
    angleHistoryRef.current.push(rawAngle);

    if (angleHistoryRef.current.length > 5) {
      angleHistoryRef.current.shift();
    }

    const sum = angleHistoryRef.current.reduce(
      (acc, curr) => acc + curr,
      0
    );

    return Math.round(sum / angleHistoryRef.current.length);
  };

  const resetExerciseState = () => {
    setReps(0);
    setGoodReps(0);
    setCurrentAngle(null);
    setTorsoAngle(null);
    setFeedback('카메라 앞에 서서 편하게 운동을 시작해보세요.');
    setWorkoutStartTime(null);
    setElapsedSeconds(0);

    isDownRef.current = false;
    downTimestampRef.current = 0;
    wasFormGoodDuringDownRef.current = true;
    angleHistoryRef.current = [];

    stableFormRef.current = true;
    goodFormFramesRef.current = 0;
    badFormFramesRef.current = 0;
    lastFeedbackRef.current = '카메라 앞에서 편하게 운동을 시작해보세요.';

    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    savedResultRef.current = false;
  };

  const handleExerciseChange = useCallback((type: ExerciseType) => {
    if (isWorkoutStartedRef.current) return;
    setSelectedExercise(type);
    const nextTarget = EXERCISE_CONFIGS[type].defaultTarget;
    setTargetReps(nextTarget);
    targetRepsRef.current = nextTarget;
    setCameraError('');
    setIsLoaded(false);
    setIsWorkoutStarted(false);
    setCameraStarted(false);
    resetExerciseState();
  }, []);

  const startWorkout = useCallback(() => {
    targetRepsRef.current = targetReps;
    setCameraError('');
    setCameraStarted(true);
    setIsWorkoutStarted(true);
    setWorkoutStartTime(Date.now());
    setElapsedSeconds(0);
    setFeedback('좋아요! 자세를 잡고 운동을 시작하세요.');
    savedResultRef.current = false;
  }, [targetReps]);

  const resetWorkout = useCallback(() => {
    setIsWorkoutStarted(false);
    setIsLoaded(false);
    setCameraStarted(false);
    setFeedbackVisible(true);
    resetExerciseState();
  }, []);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = (seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  useEffect(() => {
    if (!isScriptLoaded) return;

    let animationFrameId: number | null = null;
    let poseInstance: any = null;
    let stream: MediaStream | null = null;
    let isUnmounted = false;

    const startPoseTracking = async () => {
      try {
        if (!videoRef.current || !canvasRef.current) return;

        const videoElement = videoRef.current;
        const canvasElement = canvasRef.current;
        const canvasCtx = canvasElement.getContext('2d');

        if (!canvasCtx) return;

        const PoseClass = (window as any).Pose;
        if (!PoseClass) return;

        poseInstance = new PoseClass({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseInstance.setOptions({
          modelComplexity: 2,
          smoothLandmarks: true,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        poseInstance.onResults((results: any) => {
          if (isUnmounted) return;

          setIsLoaded(true);
          setCameraError('');

          canvasCtx.clearRect(
            0,
            0,
            canvasElement.width,
            canvasElement.height
          );

          if (!results.poseLandmarks) {
            setFeedback('몸 전체가 카메라에 보이도록 위치를 조정해주세요.');
            return;
          }

          const lm = results.poseLandmarks;

          const rightVis =
            (lm[12]?.visibility || 0) +
            (lm[14]?.visibility || 0) +
            (lm[16]?.visibility || 0);

          const leftVis =
            (lm[11]?.visibility || 0) +
            (lm[13]?.visibility || 0) +
            (lm[15]?.visibility || 0);

          const isRightSide = rightVis >= leftVis;

          const shoulder = isRightSide ? lm[12] : lm[11];
          const elbow = isRightSide ? lm[14] : lm[13];
          const wrist = isRightSide ? lm[16] : lm[15];
          const hip = isRightSide ? lm[24] : lm[23];
          const knee = isRightSide ? lm[26] : lm[25];
          const ankle = isRightSide ? lm[28] : lm[27];

          const activeExercise = selectedExerciseRef.current;
          const config = EXERCISE_CONFIGS[activeExercise];

          let activeAngle = 180;
          let currentTorsoAngle = 180;
          let isGoodForm = true;

          if (shoulder && hip && knee) {
            if (activeExercise === 'PUSHUP' && elbow && wrist) {
              activeAngle = getSmoothedAngle(calculateAngle(shoulder, elbow, wrist));
              currentTorsoAngle = calculateAngle(shoulder, hip, knee);
              if (currentTorsoAngle < config.torsoMinAngle) isGoodForm = false;
            } else if (activeExercise === 'SQUAT' && ankle) {
              activeAngle = getSmoothedAngle(calculateAngle(hip, knee, ankle));
              currentTorsoAngle = calculateAngle(shoulder, hip, knee);
              if (currentTorsoAngle < config.torsoMinAngle) isGoodForm = false;
            } else if (activeExercise === 'LUNGE' && ankle) {
              activeAngle = getSmoothedAngle(calculateAngle(hip, knee, ankle));
              currentTorsoAngle = calculateAngle(shoulder, hip, knee);
              if (currentTorsoAngle < config.torsoMinAngle) isGoodForm = false;
            } else if (activeExercise === 'SITUP') {
              activeAngle = getSmoothedAngle(calculateAngle(shoulder, hip, knee));
              currentTorsoAngle = activeAngle;
              if (activeAngle > 155) isGoodForm = false;
            }

            setCurrentAngle(activeAngle);
            setTorsoAngle(currentTorsoAngle);

            // MediaPipe 결과가 프레임마다 살짝 흔들려도
            // 색상/UI가 초록↔빨강으로 깜빡이지 않도록 3프레임 이상 유지합니다.
            if (isGoodForm) {
              goodFormFramesRef.current += 1;
              badFormFramesRef.current = 0;
            } else {
              badFormFramesRef.current += 1;
              goodFormFramesRef.current = 0;
            }

            if (
              !stableFormRef.current &&
              goodFormFramesRef.current >= 3
            ) {
              stableFormRef.current = true;
            }

            if (
              stableFormRef.current &&
              badFormFramesRef.current >= 3
            ) {
              stableFormRef.current = false;
            }

            const stableIsGoodForm = stableFormRef.current;
            setIsGoodFormUI(stableIsGoodForm);

            if (isWorkoutStartedRef.current && !isGoalReachedRef.current) {
              const now = Date.now();

              if (activeExercise === 'JUMPING_JACK') {
                const armsUp = wrist && shoulder && wrist.y < shoulder.y - 0.12;
                const legsOpen = Math.abs((lm[27]?.x ?? 0) - (lm[28]?.x ?? 0)) > 0.28;
                const jumpingOpen = !!armsUp && legsOpen;
                if (jumpingOpen && !isDownRef.current) {
                  isDownRef.current = true;
                  downTimestampRef.current = now;
                  wasFormGoodDuringDownRef.current = true;
                }
                if (isDownRef.current && !jumpingOpen && now - downTimestampRef.current > 200) {
                  setReps((prev) => prev + 1);
                  setGoodReps((prev) => prev + 1);
                  isDownRef.current = false;
                }
              } else {
                const downCondition = activeExercise === 'SITUP'
                  ? activeAngle <= config.upThreshold
                  : activeAngle <= config.downThreshold;
                const upCondition = activeExercise === 'SITUP'
                  ? activeAngle >= config.downThreshold
                  : activeAngle >= config.upThreshold;

                if (downCondition && !isDownRef.current) {
                  isDownRef.current = true;
                  downTimestampRef.current = now;
                  wasFormGoodDuringDownRef.current = isGoodForm;
                }
                if (isDownRef.current && !isGoodForm) wasFormGoodDuringDownRef.current = false;

                if (upCondition && isDownRef.current && now - downTimestampRef.current > 200) {
                  setReps((prev) => prev + 1);
                  setGoodReps((prev) => prev + 1);
                  isDownRef.current = false;
                }
              }

              const nextFeedback = !stableFormRef.current
                ? activeExercise === 'PUSHUP'
                  ? '거의 좋아요! 허리와 엉덩이를 일직선으로 유지해보세요.'
                  : activeExercise === 'SQUAT'
                    ? '거의 좋아요! 가슴을 펴고 천천히 내려가보세요.'
                    : activeExercise === 'LUNGE'
                      ? '앞쪽 무릎을 천천히 굽히고 상체를 세워보세요.'
                      : activeExercise === 'SITUP'
                        ? '복부에 힘을 주고 천천히 상체를 움직여보세요.'
                        : '팔과 다리를 충분히 벌려주세요.'
                : activeExercise === 'JUMPING_JACK'
                  ? '🟢 팔과 다리를 모았다가 다시 크게 벌려보세요.'
                  : activeAngle <= config.downThreshold
                    ? '좋아요! 충분히 내려갔어요.'
                    : activeAngle >= config.upThreshold
                      ? '🟢 좋아요! 한 번 완료됐어요.'
                      : config.guideText;

              // 같은 문구가 반복되는 동안에는 React state를 건드리지 않습니다.
              // 문구가 실제로 바뀔 때만 한 번 변경합니다.
              if (nextFeedback !== lastFeedbackRef.current) {
                lastFeedbackRef.current = nextFeedback;

                if (feedbackTimerRef.current !== null) {
                  window.clearTimeout(feedbackTimerRef.current);
                }

                feedbackTimerRef.current = window.setTimeout(() => {
                  setFeedback(nextFeedback);
                  feedbackTimerRef.current = null;
                }, 500);
              }
            }
          }

          const neonColor = stableFormRef.current
            ? '#00ffcc'
            : '#ff0055';

          canvasCtx.shadowColor = neonColor;
          canvasCtx.shadowBlur = 12;
          canvasCtx.strokeStyle = neonColor;
          canvasCtx.lineWidth = 4;
          canvasCtx.fillStyle = '#ffffff';

          POSE_CONNECTIONS.forEach(([i, j]) => {
            const pt1 = lm[i];
            const pt2 = lm[j];

            if (
              pt1 &&
              pt2 &&
              (pt1.visibility || 0) > 0.4 &&
              (pt2.visibility || 0) > 0.4
            ) {
              canvasCtx.beginPath();
              canvasCtx.moveTo(
                pt1.x * canvasElement.width,
                pt1.y * canvasElement.height
              );
              canvasCtx.lineTo(
                pt2.x * canvasElement.width,
                pt2.y * canvasElement.height
              );
              canvasCtx.stroke();
            }
          });

          lm.forEach((pt: any, idx: number) => {
            if (idx >= 11 && (pt.visibility || 0) > 0.4) {
              canvasCtx.beginPath();
              canvasCtx.arc(
                pt.x * canvasElement.width,
                pt.y * canvasElement.height,
                5,
                0,
                2 * Math.PI
              );
              canvasCtx.fill();
            }
          });
        });

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('이 브라우저에서는 카메라 기능을 사용할 수 없습니다.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            facingMode: { ideal: 'user' },
          },
          audio: false,
        });

        if (isUnmounted) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          return;
        }

        videoElement.srcObject = stream;
        videoElement.muted = true;
        videoElement.playsInline = true;
        await videoElement.play();
        if (!isUnmounted) setCameraReady(true);

        const processFrame = async () => {
          if (isUnmounted) return;

          if (
            poseInstance &&
            videoElement.readyState >= 2 &&
            !poseBusyRef.current
          ) {
            poseBusyRef.current = true;
            try {
              await poseInstance.send({ image: videoElement });
            } finally {
              poseBusyRef.current = false;
            }
          }

          animationFrameId =
            requestAnimationFrame(processFrame);
        };

        processFrame();
      } catch (err: any) {
        if (isUnmounted) return;
        console.error('카메라/AI 로딩 오류:', err);
        if (err?.name === 'NotReadableError') {
          setCameraError('카메라를 다른 앱이나 브라우저 탭에서 사용 중일 수 있습니다. 다른 카메라 사용 프로그램을 닫고 다시 연결해주세요.');
        } else if (err?.name === 'NotAllowedError') {
          setCameraError('카메라 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 카메라 권한을 허용해주세요.');
        } else if (err?.name === 'NotFoundError') {
          setCameraError('사용할 수 있는 카메라를 찾지 못했습니다. 카메라가 연결되어 있는지 확인해주세요.');
        } else {
          setCameraError('카메라를 사용할 수 없습니다. 브라우저의 카메라 권한과 다른 카메라 사용 프로그램을 확인해주세요.');
        }
        setCameraReady(false);
        setCameraStarted(false);
        setIsWorkoutStarted(false);
      }
    };

    startPoseTracking();

    return () => {
      isUnmounted = true;

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      if (poseInstance) {
        poseInstance.close();
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isScriptLoaded]);

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setIsScriptLoaded(true)}
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div>
          <button
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 transition hover:text-cyan-400"
          >
            ← 운동 목록으로
          </button>
          <h1 className="text-2xl font-black tracking-tight text-cyan-400">
            ChoWiFit
            <span className="ml-2 text-xs font-medium text-slate-500">
              | AI Motion Coach
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            AI가 운동 자세를 실시간으로 분석해드립니다.
          </p>
        </div>

        <button
          onClick={() => setShowHistory((prev) => !prev)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-400"
        >
          📊 운동 기록
        </button>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-10 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="mb-4 hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:block">
            <div className="mb-4 grid grid-cols-3 gap-3 lg:grid-cols-5">
              {(Object.keys(EXERCISE_CONFIGS) as ExerciseType[]).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => handleExerciseChange(type)}
                    disabled={isWorkoutStarted}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedExercise === type
                        ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_25px_rgba(0,255,204,0.08)]'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-2xl">
                      {EXERCISE_CONFIGS[type].icon}
                    </div>
                    <p className="mt-2 font-black">
                      {EXERCISE_CONFIGS[type].shortName}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      AI 자세 분석
                    </p>
                  </button>
                )
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400">
                  목표 횟수
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isWorkoutStarted) return;
                      setTargetReps((prev) => Math.max(1, prev - 1));
                    }}
                    disabled={isWorkoutStarted}
                    className={`h-9 w-9 rounded-xl bg-slate-800 text-lg font-black text-cyan-400 hover:bg-slate-700 ${isWorkoutStarted ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-xl font-black">
                    {targetReps}
                  </span>
                  <button
                    onClick={() => {
                      if (isWorkoutStarted) return;
                      setTargetReps((prev) => prev + 1);
                    }}
                    disabled={isWorkoutStarted}
                    className={`h-9 w-9 rounded-xl bg-slate-800 text-lg font-black text-cyan-400 hover:bg-slate-700 ${isWorkoutStarted ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 px-4 py-3">
                <p className="text-[10px] font-bold tracking-widest text-slate-500">
                  TODAY GUIDE
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  {config.guideText}
                </p>
              </div>
            </div>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-3xl border-2 border-cyan-500/30 bg-slate-900 shadow-[0_0_35px_rgba(0,255,204,0.12)] md:aspect-[4/3]">
            <video
              ref={videoRef}
              className="absolute left-0 top-0 h-full w-full object-cover"
              playsInline
              muted
            />

            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="absolute left-0 top-0 h-full w-full"
            />

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
                  <p className="font-bold text-cyan-400">
                    카메라 연결 중...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    카메라 권한을 허용해주세요.
                  </p>
                </div>
              </div>
            )}

            {cameraReady && !isLoaded && !cameraError && (
              <div className="absolute left-3 top-3 z-30 rounded-xl border border-amber-400/30 bg-slate-950/85 px-3 py-2 text-[10px] font-bold text-amber-300 backdrop-blur">
                🤖 AI 자세 분석 연결 중...
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/95 p-6 text-center">
                <div>
                  <div className="text-4xl">📷</div>
                  <p className="mt-3 font-black text-rose-400">
                    카메라 연결 실패
                  </p>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
                    {cameraError}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded-xl bg-cyan-400 px-5 py-2 text-sm font-black text-slate-950"
                  >
                    다시 연결하기
                  </button>
                </div>
              </div>
            )}

            {cameraReady && (
              <>
                <div className="absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2">
                  <div className="rounded-xl border border-cyan-500/40 bg-slate-950/85 px-3 py-1.5 backdrop-blur sm:rounded-2xl sm:px-5 sm:py-2">
                    <p className="text-[9px] font-black tracking-widest text-cyan-400">
                      CURRENT REPS
                    </p>
                    <p className="text-xl font-black sm:text-2xl">
                      <span className="text-cyan-400">
                        {goodReps}
                      </span>
                      <span className="text-sm text-slate-500"> / {targetReps}</span>
                    </p>
                  </div>

                  <div
                    className={`rounded-full border px-4 py-2 text-[10px] font-black tracking-widest ${
                      isGoodFormUI
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                        : 'border-rose-400 bg-rose-400/15 text-rose-300'
                    }`}
                  >
                    {isGoodFormUI
                      ? '● GOOD FORM'
                      : '● CHECK POSTURE'}
                  </div>
                </div>

                <div className="absolute bottom-3 left-3 right-3 z-20">
                  <div className="mb-2 rounded-xl border border-slate-700 bg-slate-950/85 px-4 py-2 backdrop-blur">
                    <p
                      className="text-xs font-black text-white transition-none opacity-100 sm:text-sm"
                    >
                      {feedback}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-slate-950/90 px-3 py-2 backdrop-blur">
                      <p className="text-[9px] font-bold text-slate-500">TIME</p>
                      <p className="text-sm font-black">
                        {formatTime(elapsedSeconds)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-950/90 px-3 py-2 backdrop-blur">
                      <p className="text-[9px] font-bold text-cyan-400">POSTURE</p>
                      <p className="text-sm font-black text-cyan-400">
                        {isGoodFormUI ? '좋아요' : '조금만 수정'}
                      </p>
                    </div>

                    <div className="ml-auto rounded-xl bg-slate-950/80 px-3 py-2 text-right backdrop-blur transition-all duration-300 hover:border-cyan-400/50 hover:bg-slate-950/60">
                      <p className="text-[9px] font-bold text-cyan-400/70">💡 TIP</p>
                      <p className="hidden max-w-[150px] truncate text-[10px] text-slate-200 sm:block">
                        {config.guideText}
                      </p>
                    </div>
                  </div>
                </div>

                {!isWorkoutStarted && !isGoalReached && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/95 p-5 text-center shadow-2xl sm:p-7">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-3xl sm:h-16 sm:w-16 sm:text-4xl">
                        {config.icon}
                      </div>

                      <p className="mt-3 text-[10px] font-black tracking-widest text-cyan-400 sm:mt-5">
                        READY TO WORKOUT
                      </p>
                      <h2 className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
                        {config.shortName}
                      </h2>

                      <div className="mt-3 rounded-2xl bg-slate-950 p-3 sm:mt-5 sm:p-4">
                        <p className="text-[10px] text-slate-500 sm:text-xs">오늘의 목표</p>
                        <p className="mt-1 text-2xl font-black text-white sm:text-3xl">
                          {targetReps}
                          <span className="ml-1 text-xs text-slate-500 sm:text-sm">회</span>
                        </p>
                      </div>

                      <div className="mt-2 hidden flex-col items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left sm:mt-4 sm:flex">
                        <span className="text-xl">📷</span>
                        <div>
                          <p className="text-xs font-black text-white">
                            카메라를 사용합니다
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">
                            운동 자세 분석을 위해 카메라가 필요합니다.
                            몸 전체가 보이도록 위치해주세요.
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={startWorkout}
                        className="mt-3 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-cyan-200 py-3 font-black text-slate-950 shadow-[0_0_25px_rgba(0,255,204,0.3)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_35px_rgba(0,255,204,0.4)] active:translate-y-0 sm:mt-5 sm:py-3.5"
                      >
                        🎬 운동 시작 →
                      </button>
                    </div>
                  </div>
                )}

                {isGoalReached && (
                  <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-md">
                    <div className="w-full max-w-sm rounded-3xl border border-cyan-500/30 bg-slate-900 p-6 text-center shadow-2xl">
                      <div className="text-4xl">🎉</div>
                      <p className="mt-3 text-xs font-black tracking-widest text-cyan-400">
                        WORKOUT COMPLETE
                      </p>
                      <h2 className="mt-1 text-3xl font-black">
                        운동 완료!
                      </h2>

                      <div className="mt-6 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl bg-slate-950 p-3">
                          <p className="text-[10px] text-slate-500">
                            횟수
                          </p>
                          <p className="mt-1 text-xl font-black">
                            {goodReps}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-950 p-3">
                          <p className="text-[10px] text-slate-500">
                            자세 점수
                          </p>
                          <p className="mt-1 text-xl font-black text-cyan-400">
                            {score}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-950 p-3">
                          <p className="text-[10px] text-slate-500">
                            운동 시간
                          </p>
                          <p className="mt-1 text-xl font-black">
                            {formatTime(elapsedSeconds)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-5 text-sm text-slate-300">
                        {score >= 90
                          ? '🔥 완벽해요! 자세가 정말 좋습니다.'
                          : score >= 70
                            ? '👍 좋아요! 다음에는 자세를 조금 더 신경 써보세요.'
                            : '💪 잘했어요! 다음 운동에서 조금씩 자세를 개선해봐요.'}
                      </p>

                      {history.length > 0 && history[0].exercise === config.shortName && (
                        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                          <p className="text-[10px] font-bold tracking-widest text-slate-500">
                            GROWTH
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            이전 기록과 비교하면서 꾸준히 성장해보세요 💪
                          </p>
                        </div>
                      )}

                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <button
                          onClick={resetWorkout}
                          className="rounded-2xl border border-slate-700 bg-slate-800 py-3 text-sm font-black text-white hover:bg-slate-700"
                        >
                          다시 운동
                        </button>
                        <button
                          onClick={() => {
                            resetWorkout();
                            setShowHistory(true);
                          }}
                          className="rounded-2xl bg-cyan-400 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300"
                        >
                          내 기록 보기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-black tracking-widest text-cyan-400">
              LIVE ANALYSIS
            </p>
            <h2 className="mt-2 text-lg font-black">
              실시간 자세 상태
            </h2>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3">
                <span className="text-xs text-slate-400">
                  AI 상태
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  {isLoaded ? '● 연결됨' : '● 준비 중'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3">
                <span className="text-xs text-slate-400">
                  현재 자세
                </span>
                <span
                  className={`text-xs font-bold ${
                    isGoodFormUI
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {isGoodFormUI ? '좋음' : '교정 필요'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3">
                <span className="text-xs text-slate-400">
                  관절 각도
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {isGoodFormUI ? '안정적이에요' : '조금 수정해보세요'}
                </span>
              </div>

              <div className="rounded-xl bg-slate-950 p-3">
                <p className="text-[10px] font-bold text-slate-500">
                  COACHING TIP
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {feedback}
                </p>
              </div>
            </div>
          </div>

          {showHistory ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black tracking-widest text-cyan-400">
                    HISTORY
                  </p>
                  <h2 className="mt-1 text-lg font-black">
                    운동 기록
                  </h2>
                </div>

                {history.length > 0 && (
                  <button
                    onClick={() => {
                      setHistory([]);
                      localStorage.removeItem(STORAGE_KEY);
                    }}
                    className="text-[10px] text-slate-500 hover:text-rose-400"
                  >
                    전체 삭제
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {history.length === 0 ? (
                  <div className="rounded-xl bg-slate-950 p-5 text-center text-xs text-slate-500">
                    아직 운동 기록이 없습니다.
                  </div>
                ) : (
                  history.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-xl bg-slate-950 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black">
                          {record.exercise}
                        </span>
                        <span className="text-xs font-black text-cyan-400">
                          {record.score}점
                        </span>
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                        <span>
                          {record.goodReps}회 성공
                        </span>
                        <span>
                          {formatTime(record.duration)}
                        </span>
                        <span>{record.date}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs font-black tracking-widest text-cyan-400">
                HOW IT WORKS
              </p>
              <h2 className="mt-2 text-lg font-black">
                ChoWiFit 사용 방법
              </h2>

              <div className="mt-4 space-y-3">
                {[
                  ['01', '운동 선택', '운동 목록에서 원하는 운동을 선택하세요.'],
                  ['02', '카메라 확인', '몸 전체가 화면에 보이도록 위치하세요.'],
                  ['03', 'AI 분석', '관절 움직임과 자세를 실시간 분석합니다.'],
                  ['04', '결과 확인', '횟수와 자세 점수를 확인하세요.'],
                ].map(([num, title, desc]) => (
                  <div
                    key={num}
                    className="flex gap-3"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-[10px] font-black text-cyan-400">
                      {num}
                    </div>
                    <div>
                      <p className="text-xs font-black">
                        {title}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4">
                <p className="text-xs font-black text-slate-300">
                  더 많은 운동도 준비 중이에요 🚧
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['런지', '플랭크', '버피'].map((exercise) => (
                    <span
                      key={exercise}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-[10px] font-bold text-slate-500"
                    >
                      {exercise}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  최상위 컴포넌트: 목록 화면 ↔ AI 코칭 화면 전환                         */
/* ================================================================== */

export default function Home() {
  const [view, setView] = useState<'catalog' | 'workout'>('catalog');
  const [startExercise, setStartExercise] = useState<ExerciseType>('PUSHUP');

  if (view === 'workout') {
    return (
      <WorkoutView
        initialExercise={startExercise}
        onBack={() => setView('catalog')}
      />
    );
  }

  return (
    <CatalogView
      onStart={(type) => {
        setStartExercise(type);
        setView('workout');
      }}
    />
  );
}
