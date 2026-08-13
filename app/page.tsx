'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type ExerciseType = 'PUSHUP' | 'SQUAT';

interface ExerciseConfig {
  name: string;
  defaultTarget: number;
  downThreshold: number;  // 내려가야 하는 최소 관절 각도 (푸시업 95도 이하)
  upThreshold: number;    // 올라와야 하는 최소 관절 각도 (푸시업 155도 이상)
  torsoMinAngle: number;  // 몸통/허리 일직선 최소 각도 (150도)
  guideText: string;
}

const EXERCISE_CONFIGS: Record<ExerciseType, ExerciseConfig> = {
  PUSHUP: {
    name: '푸시업 (Push-up)',
    defaultTarget: 10,
    downThreshold: 95,   // 팔꿈치를 95도 이하로 굽혀야 내려감 인정
    upThreshold: 155,    // 팔을 155도 이상 곧게 펴야 1회 완료
    torsoMinAngle: 150,  // 허리/엉덩이가 굽혀지지 않도록 150도 이상 유지
    guideText: '팔을 90도까지 깊게 굽히고 허리를 직진으로 유지하세요',
  },
  SQUAT: {
    name: '스쿼트 (Squat)',
    defaultTarget: 10,
    downThreshold: 100,  // 무릎을 100도 이하로 낮춰야 내려감 인정
    upThreshold: 160,    // 무릎을 완전히 펴야 1회 완료
    torsoMinAngle: 135,  // 상체 숙임 과도 유무 판단
    guideText: '무릎을 90도 근처까지 충분히 낮추고 일어나세요',
  },
};

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28]
];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('PUSHUP');
  const [targetReps, setTargetReps] = useState<number>(10); // 목표 횟수 설정

  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // 운동 현황
  const [reps, setReps] = useState(0);
  const [goodReps, setGoodReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [isGoodFormUI, setIsGoodFormUI] = useState(true);

  // 정밀 상태 제어 Ref
  const isDownRef = useRef(false);
  const downTimestampRef = useRef<number>(0);
  const wasFormGoodDuringDownRef = useRef(true);
  const angleHistoryRef = useRef<number[]>([]);

  // 2D 관절 각도 계산
  const calculateAngle = (p1: any, p2: any, p3: any) => {
    if (!p1 || !p2 || !p3) return 180;
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
      angle = 360.0 - angle;
    }
    return Math.round(angle);
  };

  // 프레임 노이즈 스무딩 필터
  const getSmoothedAngle = (rawAngle: number) => {
    angleHistoryRef.current.push(rawAngle);
    if (angleHistoryRef.current.length > 5) angleHistoryRef.current.shift();
    const sum = angleHistoryRef.current.reduce((acc, curr) => acc + curr, 0);
    return Math.round(sum / angleHistoryRef.current.length);
  };

  const handleExerciseChange = (type: ExerciseType) => {
    setSelectedExercise(type);
    setTargetReps(EXERCISE_CONFIGS[type].defaultTarget);
    setReps(0);
    setGoodReps(0);
    setCurrentAngle(null);
    isDownRef.current = false;
    wasFormGoodDuringDownRef.current = true;
  };

  const isGoalReached = goodReps >= targetReps;

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
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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

          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          if (results.poseLandmarks) {
            const lm = results.poseLandmarks;

            const rightVis = (lm[12]?.visibility || 0) + (lm[14]?.visibility || 0) + (lm[16]?.visibility || 0);
            const leftVis = (lm[11]?.visibility || 0) + (lm[13]?.visibility || 0) + (lm[15]?.visibility || 0);
            const isRightSide = rightVis >= leftVis;

            const shoulder = isRightSide ? lm[12] : lm[11];
            const elbow = isRightSide ? lm[14] : lm[13];
            const wrist = isRightSide ? lm[16] : lm[15];
            const hip = isRightSide ? lm[24] : lm[23];
            const knee = isRightSide ? lm[26] : lm[25];
            const ankle = isRightSide ? lm[28] : lm[27];

            const config = EXERCISE_CONFIGS[selectedExercise];
            let activeAngle = 180;
            let torsoAngle = 180;
            let isGoodForm = true;

            if (shoulder && hip && knee) {
              if (selectedExercise === 'PUSHUP' && elbow && wrist) {
                activeAngle = getSmoothedAngle(calculateAngle(shoulder, elbow, wrist));
                torsoAngle = calculateAngle(shoulder, hip, knee);

                // 코어(어깨-골반-무릎) 각도가 150도 미만으로 무너지면 자세 경고
                if (torsoAngle < config.torsoMinAngle) {
                  isGoodForm = false;
                }
              } else if (selectedExercise === 'SQUAT' && ankle) {
                activeAngle = getSmoothedAngle(calculateAngle(hip, knee, ankle));
                torsoAngle = calculateAngle(shoulder, hip, knee);

                if (torsoAngle < config.torsoMinAngle) {
                  isGoodForm = false;
                }
              }

              setCurrentAngle(activeAngle);
              setIsGoodFormUI(isGoodForm);

              const now = Date.now();

              // 1. 하강 단계 인지 (깊이 + 코어 상태 검증)
              if (activeAngle <= config.downThreshold && !isDownRef.current) {
                isDownRef.current = true;
                downTimestampRef.current = now;
                wasFormGoodDuringDownRef.current = isGoodForm;
              }

              // 하강 진행 중 자세 무너짐 추적
              if (isDownRef.current && !isGoodForm) {
                wasFormGoodDuringDownRef.current = false;
              }

              // 2. 상승 완료 및 카운팅 인정 (최소 0.2초 이상 하강 유지 조건 포함)
              if (
                activeAngle >= config.upThreshold &&
                isDownRef.current &&
                now - downTimestampRef.current > 200
              ) {
                setReps((prev) => prev + 1);
                // 내려갔다 오는 전 과정 동안 자세가 정확했을 때만 GOOD 카운트
                if (wasFormGoodDuringDownRef.current && isGoodForm) {
                  setGoodReps((prev) => prev + 1);
                }
                isDownRef.current = false;
              }
            }

            // 스켈레톤 색상 피드백
            const neonColor = isGoodForm ? '#00ffcc' : '#ff0055';

            canvasCtx.shadowColor = neonColor;
            canvasCtx.shadowBlur = 12;
            canvasCtx.strokeStyle = neonColor;
            canvasCtx.lineWidth = 4;
            canvasCtx.fillStyle = '#ffffff';

            POSE_CONNECTIONS.forEach(([i, j]) => {
              const pt1 = lm[i];
              const pt2 = lm[j];
              if (pt1 && pt2 && (pt1.visibility || 0) > 0.4 && (pt2.visibility || 0) > 0.4) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(pt1.x * canvasElement.width, pt1.y * canvasElement.height);
                canvasCtx.lineTo(pt2.x * canvasElement.width, pt2.y * canvasElement.height);
                canvasCtx.stroke();
              }
            });

            lm.forEach((pt: any, idx: number) => {
              if (idx >= 11 && (pt.visibility || 0) > 0.4) {
                canvasCtx.beginPath();
                canvasCtx.arc(pt.x * canvasElement.width, pt.y * canvasElement.height, 5, 0, 2 * Math.PI);
                canvasCtx.fill();
              }
            });
          }
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        videoElement.srcObject = stream;
        await videoElement.play();

        const processFrame = async () => {
          if (isUnmounted) return;
          if (poseInstance && videoElement.readyState >= 2) {
            await poseInstance.send({ image: videoElement });
          }
          animationFrameId = requestAnimationFrame(processFrame);
        };

        processFrame();
      } catch (err) {
        console.error("카메라/AI 로딩 오류:", err);
      }
    };

    startPoseTracking();

    return () => {
      isUnmounted = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (poseInstance) poseInstance.close();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isScriptLoaded, selectedExercise]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4 text-white font-sans">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setIsScriptLoaded(true)}
      />

      {/* 상단 컨트롤 영역 (운동 선택 + 목표 개수 조정) */}
      <div className="flex flex-col items-center mb-4 gap-3">
        <h1 className="text-2xl font-extrabold tracking-wider text-cyan-400">
          ChoWiFit <span className="text-xs font-normal text-slate-400">| Motion Coach</span>
        </h1>

        <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-xl border border-slate-800">
          {/* 운동 탭 */}
          <div className="flex gap-1.5">
            {(Object.keys(EXERCISE_CONFIGS) as ExerciseType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleExerciseChange(type)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedExercise === type
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(0,255,204,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {EXERCISE_CONFIGS[type].name}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-700" />

          {/* 목표 횟수 조정 버튼 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">목표 설정:</span>
            <button
              onClick={() => setTargetReps((prev) => Math.max(1, prev - 1))}
              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-sm font-black flex items-center justify-center"
            >
              -
            </button>
            <span className="text-sm font-black text-cyan-400 w-6 text-center">{targetReps}</span>
            <button
              onClick={() => setTargetReps((prev) => prev + 1)}
              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-sm font-black flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 비디오 및 HUD 영역 */}
      <div className="relative w-full max-w-[640px] h-[480px] rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(0,255,204,0.15)] bg-slate-900">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-30">
            <p className="text-cyan-400 animate-pulse font-medium text-base">
              카메라 및 AI 모델 연동 중...
            </p>
          </div>
        )}

        {isLoaded && (
          <>
            {/* 상단 툴바: 목표 개수(GOOD / TARGET) + 자세 안내 */}
            <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
              <div className="bg-slate-900/90 backdrop-blur border border-cyan-500/50 px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 shadow-lg pointer-events-auto">
                <div>
                  <p className="text-[9px] tracking-widest text-cyan-400 font-extrabold">GOAL</p>
                  <p className="text-xl font-black text-white leading-tight">
                    <span className="text-cyan-400">{goodReps}</span> / {targetReps}
                  </p>
                </div>
                <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="bg-cyan-400 h-full transition-all duration-300"
                    style={{
                      width: `${Math.min((goodReps / targetReps) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div
                  className={`px-4 py-1 rounded-full text-[11px] font-black tracking-widest border transition-all ${
                    isGoodFormUI
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_12px_rgba(0,255,204,0.3)]'
                      : 'bg-rose-500/20 border-rose-500 text-rose-500 shadow-[0_0_12px_rgba(255,0,85,0.3)]'
                  }`}
                >
                  {isGoodFormUI ? 'PERFECT FORM' : 'CHECK POSTURE'}
                </div>
                <p className="text-[10px] text-slate-200 bg-black/70 px-2.5 py-0.5 rounded-full backdrop-blur">
                  {EXERCISE_CONFIGS[selectedExercise].guideText}
                </p>
              </div>
            </div>

            {/* 목표 달성 완료 화면 */}
            {isGoalReached && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-30 flex flex-col items-center justify-center">
                <p className="text-3xl font-black text-cyan-400 mb-1">GOAL COMPLETE!</p>
                <p className="text-sm text-slate-300 mb-5">
                  목표 횟수({targetReps}회)를 성공적으로 완료했습니다!
                </p>
                <button
                  onClick={() => {
                    setReps(0);
                    setGoodReps(0);
                  }}
                  className="px-5 py-2 bg-cyan-500 text-slate-950 font-bold text-sm rounded-xl shadow-[0_0_20px_rgba(0,255,204,0.4)] hover:bg-cyan-400 transition"
                >
                  다시 시작하기
                </button>
              </div>
            )}

            {/* 하단 HUD 현황판 */}
            <div className="absolute bottom-3 left-3 z-20 flex gap-2">
              <div className="bg-slate-900/85 backdrop-blur border border-slate-700 px-3.5 py-1.5 rounded-xl text-center">
                <p className="text-[9px] tracking-widest text-slate-400 font-bold">REPS</p>
                <p className="text-xl font-black text-white leading-tight">{reps}</p>
              </div>
              <div className="bg-slate-900/85 backdrop-blur border border-cyan-500/40 px-3.5 py-1.5 rounded-xl text-center">
                <p className="text-[9px] tracking-widest text-cyan-400 font-bold">GOOD</p>
                <p className="text-xl font-black text-cyan-400 leading-tight">{goodReps}</p>
              </div>
              {currentAngle !== null && (
                <div className="bg-slate-900/85 backdrop-blur border border-slate-700 px-3.5 py-1.5 rounded-xl text-center">
                  <p className="text-[9px] tracking-widest text-slate-400 font-bold">ANGLE</p>
                  <p className="text-xl font-black text-amber-400 leading-tight">{currentAngle}°</p>
                </div>
              )}
            </div>
          </>
        )}

        <video
          ref={videoRef}
          className="absolute top-0 left-0 w-full h-full object-cover"
          playsInline
          muted
        />

        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute top-0 left-0 w-full h-full"
        />
      </div>
    </main>
  );
}