import { useEffect, useState } from "react";
import { Lock, ShieldCheck, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLeagueStore } from "@/lib/league-store";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/**
 * 입력용 기기 잠금 (2026-09-28, docs/PLAN-device-lock.md).
 * - 핀은 리그 settings.lockPin, "이 기기 잠김" 표시는 이 기기 브라우저 저장소.
 * - 저장소엔 잠글 때의 settings.lockEpoch 를 적어 둔다. 다른 기기에서 [잠금 전부 풀기]로
 *   epoch 가 올라가면 이 기기의 표시가 낡은 것이 되어 저절로 풀린다.
 */
const key = (leagueId: string) => `deviceLock:${leagueId}`;

function readLock(leagueId: string): number | null {
  try {
    const raw = localStorage.getItem(key(leagueId));
    if (raw === null) return null;
    const n = Number(JSON.parse(raw)?.epoch);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

/** 이 기기가 잠겼는지 + 잠그기/풀기. 핀이 없으면 잠금은 무효(값 없음 = 지금 동작). */
export function useDeviceLock(leagueId: string, lockPin: string, lockEpoch: number) {
  const [stored, setStored] = useState<number | null>(() => (typeof window === "undefined" ? null : readLock(leagueId)));

  useEffect(() => { setStored(readLock(leagueId)); }, [leagueId]);

  // 다른 기기에서 '잠금 전부 풀기'를 눌렀으면 이 기기 표시도 지운다.
  useEffect(() => {
    if (stored !== null && lockEpoch > stored) {
      try { localStorage.removeItem(key(leagueId)); } catch { /* 저장소 막힘 */ }
      setStored(null);
    }
  }, [stored, lockEpoch, leagueId]);

  const lock = () => {
    try { localStorage.setItem(key(leagueId), JSON.stringify({ epoch: lockEpoch })); } catch { /* 저장소 막힘 — 이번 화면만 잠김 */ }
    setStored(lockEpoch);
  };
  const release = () => {
    try { localStorage.removeItem(key(leagueId)); } catch { /* 저장소 막힘 */ }
    setStored(null);
  };

  const locked = !!lockPin && stored !== null && lockEpoch <= stored;
  return { locked, lock, release };
}

/** 4자리 숫자 입력칸 */
function PinInput({ value, onChange, onEnter, error, autoFocus }: {
  value: string; onChange: (v: string) => void; onEnter: () => void; error?: boolean; autoFocus?: boolean;
}) {
  return (
    <input
      autoFocus={autoFocus}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      placeholder="● ● ● ●"
      className={cn(
        "w-full h-12 rounded-xl border bg-input text-center text-2xl font-black tracking-[0.4em] text-foreground focus:outline-none transition-colors",
        error ? "border-destructive" : "border-border/40 focus:border-amber-500",
      )}
    />
  );
}

/** 잠긴 탭 자리에 뜨는 핀 입력 화면 */
export function PinGate({ expected, onUnlock }: { expected: string; onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const submit = () => {
    if (input === expected) { setError(false); onUnlock(); }
    else { setError(true); setInput(""); }
  };
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-border/60 bg-card/40 px-6 py-14 text-center backdrop-blur-xl shadow-lg animate-in fade-in duration-300">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30">
        <Lock className="size-8 text-amber-500" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-black tracking-tight text-foreground">이 기기는 입력용으로 잠겨 있어요</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
          경기장에서 결과를 입력할 수 있어요. 이 화면을 보려면 <b>핀 4자리</b>를 넣으세요.
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
        <PinInput autoFocus value={input} onChange={(v) => { setInput(v); setError(false); }} onEnter={submit} error={error} />
        {error && <span className="text-[11px] font-bold text-destructive">핀이 맞지 않아요.</span>}
        <button
          onClick={submit}
          className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 h-10 text-sm font-black text-background transition-all active:scale-95 hover:bg-amber-500/90 cursor-pointer"
        >
          <ShieldCheck className="size-4" /> 잠금 풀기
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/80 max-w-xs">
        핀을 잊었다면 다른 기기(선생님 폰 등)에서 관리자 → 설정 → 기기 잠금을 여세요.
      </p>
    </div>
  );
}

/** 처음 잠글 때 핀 4자리 정하기 */
export function SetPinDialog({ open, onOpenChange, onSave, title = "잠금 핀 정하기", buttonLabel = "핀 저장하고 이 기기 잠그기" }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSave: (pin: string) => Promise<boolean>; title?: string; buttonLabel?: string;
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPin(""); setPin2(""); setMsg(""); } }, [open]);

  const submit = async () => {
    if (pin.length !== 4) { setMsg("숫자 4자리를 넣어 주세요."); return; }
    if (pin !== pin2) { setMsg("두 번 넣은 핀이 달라요."); setPin2(""); return; }
    setBusy(true);
    const ok = await onSave(pin);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            잠긴 기기에서 랭킹·하이라이트·관리자 탭을 열 때 쓰는 숫자 4자리예요. 이 리그의 모든 잠긴 기기가 같은 핀을 써요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <PinInput autoFocus value={pin} onChange={(v) => { setPin(v); setMsg(""); }} onEnter={submit} />
          <PinInput value={pin2} onChange={(v) => { setPin2(v); setMsg(""); }} onEnter={submit} />
          <p className="text-[11px] text-muted-foreground">확인을 위해 한 번 더 넣어 주세요.</p>
          {msg && <span className="text-[11px] font-bold text-destructive">{msg}</span>}
          <button
            onClick={submit}
            disabled={busy}
            className="mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-black text-background transition-all active:scale-95 disabled:opacity-60"
          >
            <Lock className="size-4" /> {buttonLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 관리자 → 설정의 '기기 잠금' 카드. 핀 잊었을 때 다른 기기에서 여기로 온다. */
export function DeviceLockSettings() {
  const { lockPin, saveLockSettings, isClassOwner } = useLeagueStore();
  const [show, setShow] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const releaseAll = async () => {
    if (!confirm("잠긴 기기를 모두 풀까요? 각 기기는 새로고침하거나 다음 경기 결과가 저장되면 풀려요.")) return;
    setBusy(true);
    const ok = await saveLockSettings({ bumpEpoch: true });
    setBusy(false);
    if (ok) toast.success("잠금을 모두 풀었어요.");
  };

  return (
    <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
      <div className="space-y-3">
        <div className="space-y-0.5">
          <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">🔒 기기 잠금</span>
          <span className="text-[10px] text-muted-foreground leading-snug block">
            아이들이 점수를 넣는 태블릿에서 상단 <b>[🔒 잠그기]</b>를 누르면 그 기기만 경기장 외 탭(랭킹·하이라이트·시즌 요약·관리자)과 로그아웃이 핀으로 잠겨요.
          </span>
        </div>
        {lockPin ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-border/50 bg-input px-3 py-2 font-mono text-sm font-black tracking-[0.3em]">
              {show ? lockPin : "••••"}
            </span>
            <button type="button" onClick={() => setShow(!show)} className="text-[11px] font-bold text-neon-blue hover:underline">
              {show ? "숨기기" : "핀 보기"}
            </button>
            {isClassOwner && (
              <>
                <Button onClick={() => setPinOpen(true)} variant="outline" className="h-9 rounded-xl text-[11px] font-bold">핀 바꾸기</Button>
                <Button onClick={releaseAll} disabled={busy} variant="outline" className="h-9 rounded-xl text-[11px] font-bold text-amber-500 border-amber-500/40">
                  <Unlock className="size-3.5 mr-1" /> 잠금 전부 풀기
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">아직 핀이 없어요. 잠글 기기에서 [🔒 잠그기]를 처음 누르면 정해요.</p>
        )}
      </div>
      <SetPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        title="잠금 핀 바꾸기"
        buttonLabel="새 핀 저장"
        onSave={async (pin) => { const ok = await saveLockSettings({ lockPin: pin }); if (ok) toast.success("핀을 바꿨어요."); return ok; }}
      />
    </Card>
  );
}
