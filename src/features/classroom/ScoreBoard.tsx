import { useEffect } from "react";
import { Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 점수판 — 점수판 웹(code/score-board)의 '일반' 모드를 옮겨 왔다. 점수입력판에서 누구 경기인지 고른 뒤 뜨는 화면이다.
 * 화면 반을 누르면 +1, 바깥쪽 [−]는 −1. 위 가운데(`top`)에 [다시 고르기]·[경기 끝] 같은 버튼을 얹는다.
 * 점수는 부모(ScoreInputView)가 갖고 기기에 저장한다 — 태블릿이 잠들거나 새로고침돼도 남는다.
 * 컬링·야구 모드는 실제로 리그에 쓸 때 하나씩 옮긴다(hq/DECISIONS 2026-10-02).
 */

// 리그 교사 입력 화면과 같은 팀 색: 팀 A = 앰버, 팀 B = 바이올렛(RecordMatch ACCENT). 흰 글자가 읽히게 한 단계 진하게.
export const TEAM_A = "#d97706";
export const TEAM_B = "#7c3aed";

export function ScoreBoard({ a, b, nameA, nameB, onAdd, top }: {
  a: number; b: number;
  nameA: string; nameB: string;
  /** team 0 = 팀 A, 1 = 팀 B. 빠르게 연달아 눌러도 빠짐없이 더해지도록 부모가 최신 값에 더한다. */
  onAdd: (team: 0 | 1, d: number) => void;
  top?: React.ReactNode;
}) {
  // 경기 중 화면 꺼짐 방지(점수판 웹과 같은 Wake Lock). 안 되는 기기는 그냥 넘어간다.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const req = async () => {
      try { lock = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* 무시 */ }
    };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex select-none bg-black">
      <Half name={nameA} score={a} color={TEAM_A} side="left"
        onPlus={() => onAdd(0, 1)} onMinus={() => onAdd(0, -1)} />
      <Half name={nameB} score={b} color={TEAM_B} side="right"
        onPlus={() => onAdd(1, 1)} onMinus={() => onAdd(1, -1)} />
      {top && <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2">{top}</div>}
    </div>
  );
}

function Half({ name, score, color, side, onPlus, onMinus }: {
  name: string; score: number; color: string; side: "left" | "right";
  onPlus: () => void; onMinus: () => void;
}) {
  return (
    <div role="button" aria-label={`${name} 득점`} onClick={onPlus}
      className="relative flex w-1/2 flex-col items-center overflow-hidden pt-20 text-white active:brightness-110"
      style={{ background: color, textShadow: "0 2px 12px rgba(0,0,0,.35)" }}>
      <div className="max-w-[90%] truncate text-[clamp(1.75rem,5vw,4rem)] font-extrabold">{name}</div>
      <div className="flex flex-1 items-center justify-center text-[clamp(8rem,34vw,32rem)] font-black leading-[0.85] tabular-nums">
        {score}
      </div>
      <button type="button" aria-label={`${name} 1점 빼기`}
        onClick={(e) => { e.stopPropagation(); onMinus(); }}
        className={cn("absolute top-1/2 flex size-20 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 backdrop-blur active:bg-black/45",
          side === "left" ? "left-6" : "right-6")}>
        <Minus className="size-10" />
      </button>
    </div>
  );
}
