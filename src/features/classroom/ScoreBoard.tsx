import { useEffect, useState } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 점수입력판 안의 점수판 — 점수판 웹(code/score-board)의 '일반' 모드를 옮겨 왔다.
 * 화면 반을 누르면 +1, 바깥쪽 [−]는 −1. 경기 끝에 [경기 끝]을 누르면 점수를 확인하고 기록한다.
 *
 * 경기 도중 태블릿이 잠들거나 새로고침돼도 점수가 남도록 이 기기에 줄(경기)별로 적어 둔다.
 * 서버에는 기록하는 순간 한 번만 보낸다(수파베이스 한도).
 * 컬링·야구 모드는 실제로 리그에 쓸 때 하나씩 옮긴다(hq/DECISIONS 2026-10-02).
 */

const RED = "#e53935";
const BLUE = "#1e88e5";
const saveKey = (id: string) => `score-board:${id}`;

function readSaved(id: string): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem(saveKey(id)) || "null");
    if (Array.isArray(v) && v.length === 2) return [Number(v[0]) || 0, Number(v[1]) || 0];
  } catch { /* 없으면 0:0 */ }
  return [0, 0];
}

function clearSavedScore(id: string) {
  try { localStorage.removeItem(saveKey(id)); } catch { /* 무시 */ }
}

export function ScoreBoard({ rowId, seq, nameA, nameB, onClose, onSubmit }: {
  rowId: string;
  seq: number;
  nameA: string;
  nameB: string;
  onClose: () => void;
  /** 성공하면 null, 실패하면 안내 문구 */
  onSubmit: (a: number, b: number) => Promise<string | null>;
}) {
  const [[a, b], setScores] = useState<[number, number]>(() => readSaved(rowId));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(saveKey(rowId), JSON.stringify([a, b])); } catch { /* 무시 */ }
  }, [rowId, a, b]);

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

  const bump = (team: 0 | 1, d: number) =>
    setScores(([x, y]) => (team === 0 ? [Math.max(0, Math.min(999, x + d)), y] : [x, Math.max(0, Math.min(999, y + d))]));

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const err = await onSubmit(a, b);
    if (err) { setMsg(err); setBusy(false); return; }
    clearSavedScore(rowId);
  };

  return (
    <div className="fixed inset-0 z-50 flex select-none bg-black">
      <Half name={nameA} score={a} color={RED} side="left" onPlus={() => bump(0, 1)} onMinus={() => bump(0, -1)} />
      <Half name={nameB} score={b} color={BLUE} side="right" onPlus={() => bump(1, 1)} onMinus={() => bump(1, -1)} />

      {/* 위 가운데: 줄 번호 · 닫기 · 경기 끝 */}
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2">
        <button type="button" onClick={onClose} aria-label="점수판 닫기"
          className="flex size-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur">
          <X className="size-6" />
        </button>
        <span className="rounded-full bg-black/35 px-4 py-2 text-lg font-black text-white backdrop-blur">#{seq}</span>
        <button type="button" onClick={() => { setMsg(null); setConfirming(true); }}
          className="rounded-full bg-white px-5 py-3 text-lg font-black text-black shadow-lg active:scale-95">
          경기 끝
        </button>
      </div>

      {confirming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4" onClick={busy ? undefined : () => setConfirming(false)}>
          <div className="w-full max-w-md rounded-2xl bg-background p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black text-foreground">이 점수로 기록할까요?</p>
            <p className="mt-4 text-3xl font-black tabular-nums text-foreground">
              <span style={{ color: RED }}>{nameA} {a}</span>
              <span className="mx-3 text-muted-foreground">:</span>
              <span style={{ color: BLUE }}>{b} {nameB}</span>
            </p>
            {a === b && <p className="mt-3 text-sm font-bold text-destructive">비긴 경기는 기록할 수 없어요.</p>}
            {msg && <p className="mt-3 text-sm font-bold text-destructive">{msg}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                className="flex-1 rounded-xl border border-border/50 py-4 text-lg font-black text-muted-foreground">
                계속하기
              </button>
              <button type="button" onClick={submit} disabled={busy || a === b}
                className={cn("flex-[2] rounded-xl py-4 text-lg font-black",
                  busy || a === b ? "bg-muted text-muted-foreground" : "bg-neon-blue text-background")}>
                {busy ? "기록 중…" : "기록"}
              </button>
            </div>
          </div>
        </div>
      )}
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
