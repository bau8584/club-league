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

// 휴면 감점 프리셋 — '강도(k=결석 1회에 몇 승 손실)'만 정의하고,
// 실제 감점 RP는 현재 리그의 승리RP·밴드폭에서 자동 계산된다(기준점 프리셋 자동 적응).
type DecayPreset = { key: string; emoji: string; label: string; days: number; k: number; desc: string; tiers: TierName[] };
const DECAY_PRESETS: DecayPreset[] = [
  { key: "lenient",  emoji: "🌿", label: "느슨",          days: 14, k: 1.5, desc: "결석 1회 ≈ 1.5승. 친목·취미 모임에 알맞아요.", tiers: ["Gold", "Platinum", "Diamond"] },
  { key: "standard", emoji: "⚖️", label: "표준 출석",     days: 10, k: 2.5, desc: "결석 1회 ≈ 2.5승. 실버부터 은근한 출석 압박.", tiers: ["Silver", "Gold", "Platinum", "Diamond"] },
  { key: "strict",   emoji: "🔥", label: "엄격 · 주1회",  days: 7,  k: 3.5, desc: "결석 1회 ≈ 3.5승. 일주일에 한 번은 꼭 나오도록.", tiers: ["Silver", "Gold", "Platinum", "Diamond"] },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors",
        checked ? "bg-amber-500" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
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
    currentViewSeason, tierThresholds, tierSettings, rpVariables,
  } = useLeagueStore();

  const readOnly = currentViewSeason !== "현재 시즌";

  // ── 현재 리그 점수 기준: 티어별 승리 RP & 밴드폭 → 감점 자동 계산 재료 ──
  const winRpOf = (t: TierName): number => {
    switch (t) {
      case "Bronze": return tierSettings?.Bronze?.winDelta ?? 24;
      case "Silver": return tierSettings?.Silver?.winDelta ?? 20;
      case "Gold": return tierSettings?.Gold?.winDelta ?? 16;
      case "Platinum": return tierSettings?.Platinum?.winDelta ?? 13;
      case "Diamond": return rpVariables?.winDelta ?? 11;
    }
  };
  const bandOf = (t: TierName): number => {
    const th = tierThresholds;
    if (!th) return Infinity;
    switch (t) {
      case "Bronze": return th.Silver - th.Bronze;
      case "Silver": return th.Gold - th.Silver;
      case "Gold": return th.Platinum - th.Gold;
      case "Platinum": return th.Diamond - th.Platinum;
      case "Diamond": return Infinity; // 상한 개방
    }
  };
  // 결석 1회 = k승 손실 → 감점 RP (밴드폭 35% 상한으로 한 번에 강등 방지)
  const computeRp = (t: TierName, k: number): number => {
    let rp = Math.round(k * winRpOf(t));
    const band = bandOf(t);
    if (isFinite(band)) rp = Math.min(rp, Math.floor(band * 0.35));
    return Math.max(1, rp);
  };

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
  // 강도: 결석 1회 = 약 k승 손실 (직접 조절 가능)
  const [wins, setWins] = useState("3");

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

  // 켜진 티어들의 감점 RP를 현재 강도(k)로 다시 채움
  const fillFromK = (k: number, tierList: TierName[]) => {
    setTierRp((prev) => {
      const next = { ...prev };
      tierList.forEach((t) => { next[t] = String(computeRp(t, k)); });
      return next;
    });
  };

  const toggleTier = (t: TierName) =>
    setTiers((prev) => {
      const on = prev.includes(t);
      if (!on) { const k = Number(wins); if (k > 0) setTierRp((r) => ({ ...r, [t]: String(computeRp(t, k)) })); }
      return on ? prev.filter((x) => x !== t) : [...prev, t];
    });

  // 강도(k) 변경 → 켜진 티어 감점 자동 재계산
  const changeWins = (v: string) => {
    setWins(v);
    const k = Number(v);
    if (k > 0) fillFromK(k, tiers);
  };

  // 프리셋 적용 — 강도(k)만 정하고 감점 RP는 현재 리그 기준 자동 계산. 저장은 사용자가 확인 후.
  const applyPreset = (p: DecayPreset) => {
    if (readOnly) return;
    setEnabled(true);
    setDays(String(p.days));
    setTiers([...p.tiers]);
    setWins(String(p.k));
    fillFromK(p.k, p.tiers);
    toast.info(`'${p.label}' 프리셋을 불러왔어요. (결석 1회 ≈ ${p.k}승) 확인 후 저장하세요.`);
  };
  // 현재 폼이 어떤 프리셋과 일치하는지 (강도·기간·티어 일치)
  const sameTiers = (a: TierName[], b: TierName[]) => a.length === b.length && a.every((t) => b.includes(t));
  const activePreset = DECAY_PRESETS.find(
    (p) => enabled && Number(days) === p.days && Number(wins) === p.k && sameTiers(tiers, p.tiers)
  )?.key;

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

        {/* 프리셋 빠른 설정 */}
        <div className="mt-4 space-y-2 border-t border-border/20 pt-4">
          <span className="block text-[11px] font-bold text-muted-foreground">⚡ 프리셋 — 강도만 고르면 <b className="text-amber-500">현재 리그 점수 기준</b>으로 감점이 자동 계산돼요 (저장 전까지 미적용)</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DECAY_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                disabled={readOnly}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99] disabled:opacity-50",
                  activePreset === p.key
                    ? "border-amber-500/60 bg-amber-500/15"
                    : "border-border/40 bg-card/40 hover:border-amber-500/40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-black text-foreground">
                    <span className="text-base">{p.emoji}</span>{p.label}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-amber-500">{p.days}일</span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{p.desc}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {TIER_ORDER.filter((t) => p.tiers.includes(t)).map((t) => (
                    <span key={t} className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                      {TIER_LABEL[t]} −{computeRp(t, p.k)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {enabled && (
          <div className="mt-4 space-y-4 border-t border-border/20 pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">기준 미활동 일수</label>
                <div className="relative max-w-[150px]">
                  <Input
                    type="number" min={1} value={days}
                    onChange={(e) => setDays(e.target.value)}
                    disabled={readOnly}
                    className="h-9 border-border/30 bg-input pr-12 font-sans text-xs focus:border-amber-500"
                  />
                  <span className="absolute right-2 top-2 text-[10px] font-bold text-muted-foreground">일 이상</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">강도 — 결석 1회 ≈ 몇 승 손실</label>
                <div className="relative max-w-[150px]">
                  <Input
                    type="number" min={0.5} step={0.5} value={wins}
                    onChange={(e) => changeWins(e.target.value)}
                    disabled={readOnly}
                    className="h-9 border-border/30 bg-input pr-12 font-sans text-xs focus:border-amber-500"
                  />
                  <span className="absolute right-2 top-2 text-[10px] font-bold text-amber-500">승</span>
                </div>
              </div>
            </div>
            <p className="rounded-lg border border-border/20 bg-muted/20 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
              💡 아래 티어별 감점은 <b>강도 × 그 티어의 승리 RP</b>로 자동 계산됩니다(밴드폭 초과 방지 상한 적용). 기준점 프리셋이 촘촘하든 넓든 “결석 1회 = {wins || 0}승”이 유지돼요. 필요하면 개별 값을 직접 고쳐도 됩니다.
            </p>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-muted-foreground">
                티어별 1회 차감 RP <span className="font-medium text-muted-foreground/70">(자동 계산 · 직접 수정 가능)</span>
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
