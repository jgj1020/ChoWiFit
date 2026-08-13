'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type ExerciseType = 'PUSHUP' | 'SQUAT';

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
};

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
];

const STORAGE_KEY = 'chowifit-workout-history';

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('PUSHUP');
  const [targetReps, setTargetReps] = useState(10);

  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
  const savedResultRef = useRef(false);

  const config = EXERCISE_CONFIGS[selectedExercise];
  const isGoalReached = goodReps >= targetReps;
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
    if (!isGoalReached || !isWorkoutStarted || savedResultRef.current) return;

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
    savedResultRef.current = false;
  };

  const handleExerciseChange = (type: ExerciseType) => {
    setSelectedExercise(type);
    setTargetReps(EXERCISE_CONFIGS[type].defaultTarget);
    setIsWorkoutStarted(false);
    resetExerciseState();
  };

  const startWorkout = () => {
    setCameraStarted(true);
    setIsWorkoutStarted(true);
    setWorkoutStartTime(Date.now());
    setElapsedSeconds(0);
    setFeedback('좋아요! 자세를 잡고 운동을 시작하세요.');
    savedResultRef.current = false;
  };

  const resetWorkout = () => {
    setIsWorkoutStarted(false);
    setCameraStarted(false);
    setFeedbackVisible(true);
    resetExerciseState();
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = (seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  useEffect(() => {
    if (!isScriptLoaded) return;

    let animationFrameId: number;
    let poseInstance: any = null;
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
          modelComplexity: 1,
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

          let activeAngle = 180;
          let currentTorsoAngle = 180;
          let isGoodForm = true;

          if (shoulder && hip && knee) {
            if (
              selectedExercise === 'PUSHUP' &&
              elbow &&
              wrist
            ) {
              activeAngle = getSmoothedAngle(
                calculateAngle(shoulder, elbow, wrist)
              );

              currentTorsoAngle = calculateAngle(
                shoulder,
                hip,
                knee
              );

              if (currentTorsoAngle < config.torsoMinAngle) {
                isGoodForm = false;
              }
            } else if (
              selectedExercise === 'SQUAT' &&
              ankle
            ) {
              activeAngle = getSmoothedAngle(
                calculateAngle(hip, knee, ankle)
              );

              currentTorsoAngle = calculateAngle(
                shoulder,
                hip,
                knee
              );

              if (currentTorsoAngle < config.torsoMinAngle) {
                isGoodForm = false;
              }
            }

            setCurrentAngle(activeAngle);
            setTorsoAngle(currentTorsoAngle);
            setIsGoodFormUI(isGoodForm);

            if (isWorkoutStarted && !isGoalReached) {
              const now = Date.now();

              if (
                activeAngle <= config.downThreshold &&
                !isDownRef.current
              ) {
                isDownRef.current = true;
                downTimestampRef.current = now;
                wasFormGoodDuringDownRef.current = isGoodForm;
              }

              if (isDownRef.current && !isGoodForm) {
                wasFormGoodDuringDownRef.current = false;
              }

              if (
                activeAngle >= config.upThreshold &&
                isDownRef.current &&
                now - downTimestampRef.current > 200
              ) {
                setReps((prev) => prev + 1);

                // 초보자는 자세가 조금 흔들려도 반복은 인정합니다.
                // 자세의 완성도는 goodReps/점수에서 별도로 평가합니다.
                if (
                  wasFormGoodDuringDownRef.current &&
                  isGoodForm
                ) {
                  setGoodReps((prev) => prev + 1);
                } else {
                  // 완전히 잘못된 동작이 아니라면 운동 횟수는 인정합니다.
                  // 초보자도 운동 흐름이 끊기지 않도록 합니다.
                  setGoodReps((prev) => prev + 1);
                }

                isDownRef.current = false;
              }

              const nextFeedback = !isGoodForm
              ? selectedExercise === 'PUSHUP'
                ? '거의 좋아요! 허리와 엉덩이를 조금 더 일직선으로 유지해보세요.'
                : '거의 좋아요! 가슴을 조금 더 펴고 천천히 내려가보세요.'
              : activeAngle <= config.downThreshold
                ? '좋아요! 충분히 내려갔어요.'
                : activeAngle >= config.upThreshold
                  ? '🟢 좋아요! 한 번 완료됐어요.'
                  : config.guideText;

            // 카메라 프레임마다 문구가 깜빡이지 않도록 잠깐 유지합니다.
            if (nextFeedback !== feedback) {
              setFeedbackVisible(false);
              window.setTimeout(() => {
                setFeedback(nextFeedback);
                setFeedbackVisible(true);
              }, 350);
            }
            }
          }

          const neonColor = isGoodForm
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

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: 640,
              height: 480,
              facingMode: 'user',
            },
          });

        videoElement.srcObject = stream;
        await videoElement.play();

        const processFrame = async () => {
          if (isUnmounted) return;

          if (
            poseInstance &&
            videoElement.readyState >= 2
          ) {
            await poseInstance.send({ image: videoElement });
          }

          animationFrameId =
            requestAnimationFrame(processFrame);
        };

        processFrame();
      } catch (err) {
        console.error('카메라/AI 로딩 오류:', err);
        setCameraError(
          '카메라를 사용할 수 없습니다. 브라우저의 카메라 권한을 확인해주세요.'
        );
      }
    };

    startPoseTracking();

    return () => {
      isUnmounted = true;

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      if (poseInstance) {
        poseInstance.close();
      }

      if (
        videoRef.current &&
        videoRef.current.srcObject
      ) {
        const stream =
          videoRef.current.srcObject as MediaStream;

        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    isScriptLoaded,
    selectedExercise,
    isWorkoutStarted,
    isGoalReached,
    feedback,
  ]);

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setIsScriptLoaded(true)}
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div>
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
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="mb-4 grid grid-cols-2 gap-3">
              {(Object.keys(EXERCISE_CONFIGS) as ExerciseType[]).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => handleExerciseChange(type)}
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
                    onClick={() =>
                      setTargetReps((prev) =>
                        Math.max(1, prev - 1)
                      )
                    }
                    className="h-9 w-9 rounded-xl bg-slate-800 text-lg font-black text-cyan-400 hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-xl font-black">
                    {targetReps}
                  </span>
                  <button
                    onClick={() =>
                      setTargetReps((prev) => prev + 1)
                    }
                    className="h-9 w-9 rounded-xl bg-slate-800 text-lg font-black text-cyan-400 hover:bg-slate-700"
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

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-2 border-cyan-500/30 bg-slate-900 shadow-[0_0_35px_rgba(0,255,204,0.12)]">
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

            {!isLoaded && !cameraError && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
                  <p className="font-bold text-cyan-400">
                    AI 자세 분석 준비 중...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    카메라 권한을 허용해주세요.
                  </p>
                </div>
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

            {isLoaded && (
              <>
                <div className="absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2">
                  <div className="rounded-2xl border border-cyan-500/40 bg-slate-950/85 px-5 py-2 backdrop-blur">
                    <p className="text-[9px] font-black tracking-widest text-cyan-400">
                      CURRENT REPS
                    </p>
                    <p className="text-2xl font-black">
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
                      className={`text-sm font-black text-white transition-opacity duration-300 ${
                        feedbackVisible ? 'opacity-100' : 'opacity-40'
                      }`}
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

                    <div className="ml-auto rounded-xl bg-slate-950/80 px-3 py-2 text-right backdrop-blur">
                      <p className="text-[9px] font-bold text-slate-500">TIP</p>
                      <p className="max-w-[150px] truncate text-[10px] text-slate-300">
                        {config.guideText}
                      </p>
                    </div>
                  </div>
                </div>

                {!isWorkoutStarted && !isGoalReached && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/95 p-7 text-center shadow-2xl">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10 text-4xl">
                        {config.icon}
                      </div>

                      <p className="mt-5 text-xs font-black tracking-widest text-cyan-400">
                        READY TO WORKOUT
                      </p>
                      <h2 className="mt-2 text-2xl font-black">
                        {config.shortName}
                      </h2>

                      <div className="mt-5 rounded-2xl bg-slate-950 p-4">
                        <p className="text-xs text-slate-500">오늘의 목표</p>
                        <p className="mt-1 text-3xl font-black text-white">
                          {targetReps}
                          <span className="ml-1 text-sm text-slate-500">회</span>
                        </p>
                      </div>

                      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left">
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
                        className="mt-5 w-full rounded-2xl bg-cyan-400 py-3.5 font-black text-slate-950 shadow-[0_0_25px_rgba(0,255,204,0.2)] transition hover:bg-cyan-300"
                      >
                        카메라 시작하고 운동하기 →
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
                  ['01', '운동 선택', '푸시업 또는 스쿼트를 선택하세요.'],
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