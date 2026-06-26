import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Moon, Save, Play, History, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TierName } from "@/lib/league-types";
import { useLeagueStore, type DecayLogRow } from "@/lib/league-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIER_ORDER = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const;
const TIER_LABEL: Record<TierName, string> = {
  Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드",
};
// 시스템을 처음 켤 때 기본으로 감점 적용되는 티어
const DEFAULT_ON_TIERS: TierName[] = ["Gold", "Platinum", "Diamond"];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-amber-500" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DecayManager() {
  const {
    decayEnabled, decayDays, decayTiers, decayAmount, decaySettings,
    saveDecaySettings, previewDormancyDecay, applyDormancyDecay, fetchDecayLog,
    currentViewSeason,
  } = useLeagueStore();

  const readOnly = currentViewSeason !== "현재 시즌";

  // ── 설정 로컬 상태 (store에서 초기화 + 동기화) ──
  const [enabled, setEnabled] = useState(decayEnabled);
  const [days, setDays] = useState(String(decayDays));
  const [tiers, setTiers] = useState<TierName[]>(decayTiers);
  const [tierRp, setTierRp] = useState<Record<TierName, string>>(() => ({
    Bronze: String(decaySettings?.bronze?.decayRp ?? decayAmount),
    Silver: String(decaySettings?.silver?.decayRp ?? decayAmount),
    Gold: String(decaySettings?.gold?.decayRp ?? decayAmount),
    Platinum: String(decaySettings?.platinum?.decayRp ?? decayAmount),
    Diamond: String(decaySettings?.diamond?.decayRp ?? decayAmount),
  }));

  useEffect(() => { setEnabled(decayEnabled); }, [decayEnabled]);
  useEffect(() => { setDays(String(decayDays)); }, [decayDays]);
  useEffect(() => { setTiers(decayTiers); }, [decayTiers]);
  useEffect(() => {
    if (decaySettings) {
      setTierRp({
        Bronze: String(decaySettings.bronze?.decayRp ?? decayAmount),
        Silver: String(decaySettings.silver?.decayRp ?? decayAmount),
        Gold: String(decaySettings.gold?.decayRp ?? decayAmount),
        Platinum: String(decaySettings.platinum?.decayRp ?? decayAmount),
        Diamond: String(decaySettings.diamond?.decayRp ?? decayAmount),
      });
    }
  }, [decaySettings, decayAmount]);

  // 시스템 토글 — 처음 켤 때 적용 티어가 비어 있으면 기본값(골드/플래/다이아) 자동 선택
  const toggleSystem = () => {
    setEnabled((prev) => {
      const next = !prev;
      if (next && tiers.length === 0) setTiers([...DEFAULT_ON_TIERS]);
      return next;
    });
  };

  const toggleTier = (t: TierName) =>
    setTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleSave = async () => {
    const d = parseInt(days, 10);
    if (enabled && (isNaN(d) || d <= 0)) {
      return toast.error("기준 미활동 일수는 1 이상의 정수여야 합니다.");
    }
    const perTierRp: Partial<Record<TierName, number>> = {};
    if (enabled) {
      for (const t of tiers) {
        const v = parseInt(tierRp[t], 10);
        if (isNaN(v) || v <= 0) {
          return toast.error(`${TIER_LABEL[t]} 티어의 차감 RP는 1 이상의 정수여야 합니다.`);
        }
        perTierRp[t] = v;
      }
    }
    const legacyAmount = tiers.length > 0 ? (perTierRp[tiers[0]] ?? decayAmount) : decayAmount;
    const p = Promise.resolve(
      saveDecaySettings(enabled, isNaN(d) ? decayDays : d, legacyAmount, tiers, perTierRp)
    );
    toast.promise(p, {
      loading: "휴면 감점 설정 저장 중...",
      success: "휴면 감점 설정이 저장되었습니다!",
      error: "저장 실패. 다시 시도해 주세요.",
    });
    await p;
  };

  // ── 실시(미리보기/확인) ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  // 미리보기는 store 상태(저장된 설정) 기준. 저장 후 갱신됨.
  const preview = useMemo(
    () => (decayEnabled ? previewDormancyDecay() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decayEnabled, decaySettings, previewDormancyDecay]
  );

  const handleApply = async () => {
    setApplying(true);
    try {
      const n = await applyDormancyDecay();
      setConfirmOpen(false);
      if (n > 0) loadLog();
    } finally {
      setApplying(false);
    }
  };

  // ── 내역 로그 ──
  const [log, setLog] = useState<DecayLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const loadLog = async () => {
    setLogLoading(true);
    try {
      setLog(await fetchDecayLog());
    } finally {
      setLogLoading(false);
    }
  };
  useEffect(() => { loadLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // 로그를 batch 단위로 묶기
  const batches = useMemo(() => {
    const map = new Map<string, DecayLogRow[]>();
    for (const r of log) {
      const arr = map.get(r.batch_id) ?? [];
      arr.push(r);
      map.set(r.batch_id, arr);
    }
    return [...map.values()].sort(
      (a, b) => new Date(b[0].applied_at).getTime() - new Date(a[0].applied_at).getTime()
    );
  }, [log]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Moon className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">휴면 감점 시스템</h2>
          <p className="text-[11px] text-muted-foreground">오래 경기하지 않은 회원의 RP를 티어별로 차감합니다.</p>
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-600">
          <AlertTriangle className="size-4 shrink-0" /> 과거 시즌 열람 중에는 설정·실시가 비활성화됩니다.
        </div>
      )}

      {/* 1. 설정 카드 */}
      <Card className={cn(
        "border p-5 backdrop-blur shadow-lg transition-colors",
        enabled ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-border/40 bg-card/50"
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="block text-sm font-bold text-foreground">시스템 활성화</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">
              기준일수 동안 경기가 없으면 <b>실시할 때 1회</b> 차감됩니다. (자동 차감 아님)
            </span>
          </div>
          <Toggle checked={enabled} onChange={toggleSystem} />
        </div>

        {enabled && (
          <div className="mt-4 space-y-4 border-t border-border/20 pt-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">기준 미활동 일수 (모든 티어 공통)</label>
              <div className="relative max-w-[180px]">
                <Input
                  type="number" min={1} value={days}
                  onChange={(e) => setDays(e.target.value)}
                  disabled={readOnly}
                  className="h-9 border-border/30 bg-input pr-12 font-sans text-xs focus:border-amber-500"
                />
                <span className="absolute right-2 top-2 text-[10px] font-bold text-muted-foreground">일 이상</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-muted-foreground">
                티어별 1회 차감 RP <span className="font-medium text-muted-foreground/70">(티어를 켜고 값을 따로 지정)</span>
              </label>
              <div className="space-y-1.5">
                {TIER_ORDER.map((t) => {
                  const on = tiers.includes(t);
                  return (
                    <div key={t} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTier(t)}
                        disabled={readOnly}
                        className={cn(
                          "w-[84px] shrink-0 rounded-lg border px-2.5 py-1.5 text-center text-[11px] font-bold transition-all",
                          on
                            ? "border-amber-500/50 bg-amber-500/15 text-amber-500"
                            : "border-border/30 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {TIER_LABEL[t]}
                      </button>
                      {on ? (
                        <div className="relative max-w-[170px] flex-1">
                          <Input
                            type="number" min={1} value={tierRp[t]}
                            onChange={(e) => setTierRp((p) => ({ ...p, [t]: e.target.value }))}
                            disabled={readOnly}
                            className="h-9 border-border/30 bg-input pr-16 font-sans text-xs text-loss focus:border-amber-500"
                          />
                          <span className="absolute right-2 top-2 text-[10px] font-bold text-loss">RP 감점</span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-muted-foreground/70">감점 없음</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end border-t border-border/15 pt-3">
          <Button
            onClick={handleSave}
            disabled={readOnly}
            className="h-9 rounded-xl bg-amber-500 px-4 text-[11px] font-black text-white shadow-md transition-all hover:bg-amber-500/90 active:scale-95"
          >
            <Save className="mr-1 size-3.5" /> 설정 저장
          </Button>
        </div>
      </Card>

      {/* 2. 실시 카드 */}
      <Card className="border border-border/40 bg-card/50 p-5 backdrop-blur shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="block text-sm font-bold text-foreground">휴면 감점 실시</span>
            <span className="block text-[11px] text-muted-foreground">
              {decayEnabled
                ? <>현재 기준 대상 <b className="text-amber-500">{preview.length}명</b>. 실시하면 즉시 RP가 차감되고 내역이 기록됩니다.</>
                : "시스템이 꺼져 있습니다. 위에서 활성화·저장 후 실시할 수 있습니다."}
            </span>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!decayEnabled || readOnly || preview.length === 0}
            className="h-9 shrink-0 rounded-xl bg-loss px-4 text-[11px] font-black text-white shadow-md transition-all hover:bg-loss/90 active:scale-95 disabled:opacity-40"
          >
            <Play className="mr-1 size-3.5" /> 실시
          </Button>
        </div>

        {decayEnabled && preview.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border/30">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-border/30 bg-muted/30 px-3 py-2 text-[10px] font-bold text-muted-foreground">
              <span>회원</span><span className="text-right">티어</span><span className="text-right">미활동</span><span className="text-right">RP</span>
            </div>
            <div className="max-h-72 divide-y divide-border/15 overflow-y-auto">
              {preview.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-xs">
                  <span className="truncate font-semibold text-foreground">{p.name}</span>
                  <span className="text-right text-[10px] font-bold text-muted-foreground">{TIER_LABEL[p.tier]}</span>
                  <span className="text-right text-[10px] text-muted-foreground">{p.daysInactive}일</span>
                  <span className="text-right font-mono font-bold">
                    <span className="text-muted-foreground">{p.rp}</span>
                    <span className="text-loss"> −{p.decayRp}</span>
                    <span className="text-muted-foreground"> → {p.rpAfter}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 3. 내역 카드 */}
      <Card className="border border-border/40 bg-card/50 p-5 backdrop-blur shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">감점 내역</span>
          </div>
          <button
            type="button"
            onClick={loadLog}
            className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-[10px] font-bold text-muted-foreground transition-all hover:text-foreground active:scale-95"
          >
            <RefreshCw className={cn("size-3", logLoading && "animate-spin")} /> 새로고침
          </button>
        </div>

        {batches.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border/30 py-6 text-center text-[11px] text-muted-foreground">
            아직 휴면 감점을 실시한 내역이 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {batches.map((rows) => (
              <div key={rows[0].batch_id} className="overflow-hidden rounded-xl border border-border/30">
                <div className="flex items-center justify-between border-b border-border/30 bg-muted/30 px-3 py-2">
                  <span className="text-[11px] font-bold text-foreground">{fmtDateTime(rows[0].applied_at)}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {rows[0].season ?? ""} · {rows.length}명 · 총 −{rows.reduce((s, r) => s + (r.decay_rp ?? 0), 0)} RP
                  </span>
                </div>
                <div className="divide-y divide-border/15">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="truncate font-semibold text-foreground">
                        {r.player_name ?? "(삭제된 회원)"}
                        {r.tier && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">{TIER_LABEL[r.tier as TierName] ?? r.tier}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[11px]">
                        <span className="text-muted-foreground">{r.rp_before}</span>
                        <span className="text-loss"> −{r.decay_rp}</span>
                        <span className="text-muted-foreground"> → {r.rp_after}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 실시 확인 다이얼로그 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>휴면 감점을 실시할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              대상 <b>{preview.length}명</b>의 RP가 즉시 차감됩니다. 총 차감량 −{preview.reduce((s, p) => s + p.decayRp, 0)} RP.
              이 작업은 되돌릴 수 없으며 내역에 기록됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleApply(); }}
              disabled={applying}
              className="bg-loss text-white hover:bg-loss/90"
            >
              {applying ? "실시 중..." : "실시"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
