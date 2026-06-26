import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getTier, type TierName } from "@/lib/league-types";
import { useLeagueStore } from "@/lib/league-store";
import { TierCrest } from "./TierCrest";
import { Swords, ChevronDown } from "lucide-react";

const TIER_KO: Record<TierName, string> = {
  Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드",
};
const TIER_RANK: Record<TierName, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
const BASE_DEFAULT: Record<TierName, { w: number; l: number }> = {
  Bronze: { w: 20, l: 0 }, Silver: { w: 15, l: 5 }, Gold: { w: 15, l: 10 }, Platinum: { w: 10, l: 15 }, Diamond: { w: 10, l: 20 },
};

type Row = { icon: string; label: string; value: string; desc: string };

// 점수 전략 가이드: 내 현재 티어 기준으로 적용 중인 보너스·패널티·휴면감점을 보여줘
// "누구와 어떻게 붙을지" 능동 판단을 돕는다. (켜진 항목만 표시)
export function ScoreStrategyGuide({ rp }: { rp: number }) {
  const {
    tierThresholds, rpVariables, tierSettings,
    dynamicBonuses, dynamicPenalties, decaySettings,
  } = useLeagueStore();

  const tier = getTier(rp, tierThresholds);
  const tk = tier.toLowerCase() as "bronze" | "silver" | "gold" | "platinum" | "diamond";
  const isDia = tier === "Diamond";
  const ts = (tierSettings as any)?.[tier];
  const winBase = isDia ? (rpVariables?.winDelta ?? 10) : (ts?.winDelta ?? BASE_DEFAULT[tier].w);
  const loseBase = isDia ? (rpVariables?.loseDelta ?? 20) : (ts?.loseDelta ?? BASE_DEFAULT[tier].l);

  const db: any = dynamicBonuses || {};
  const bonuses: Row[] = [];
  if (db.firstWinEnabled) bonuses.push({ icon: "👑", label: "오늘의 첫 승", value: `+${db.firstWinRp ?? 15}`, desc: "하루 첫 경기에서 승리 시" });
  if (db.revengeEnabled) bonuses.push({ icon: "🔥", label: "복수 성공", value: `+${db.revengeRp ?? 10}`, desc: "최근 졌던 상대에게 설욕 승리" });
  if (db.underdogEnabled) bonuses.push({ icon: "💪", label: "언더독 격파", value: `+${db.underdogDiff1Rp ?? 5} / +${db.underdogDiff2Rp ?? 10} / +${db.underdogDiff3Rp ?? 15}`, desc: "나보다 1·2·3티어 위 상대를 이기면" });
  if (db.freshnessEnabled) bonuses.push({ icon: "✨", label: "신규 매치", value: `+${db.freshnessRp ?? 5}`, desc: `최근 ${db.freshnessGames ?? 5}경기 내 안 만난 상대와 경기` });
  if (db.streakEnabled && tier !== "Platinum" && tier !== "Diamond") bonuses.push({ icon: "⚡", label: "연승", value: `+${db.streakRp ?? 10}`, desc: `${db.streakWins ?? 3}연승 이상 유지하며 승리` });
  if (db.greatMatchEnabled) bonuses.push({ icon: "🏅", label: "명승부 (접전)", value: `승 +${db.greatMatchWin1Rp ?? 10}/${db.greatMatchWin2Rp ?? 5}/${db.greatMatchWin3Rp ?? 2}`, desc: "1·2·3점차 접전 (패배도 소폭 보너스)" });
  if (db.lossComfortEnabled && TIER_RANK[tier] <= TIER_RANK[(db.lossComfortMaxTier ?? "Silver") as TierName]) bonuses.push({ icon: "🤗", label: "패배 위로", value: `+${db.lossComfortRp ?? 5}`, desc: "2연패 이상일 때 패배해도 위로 보너스" });
  if (db.willOfSteelEnabled) bonuses.push({ icon: "💎", label: "불굴의 의지", value: `+${db.willOfSteel3Rp ?? 10} ~ +${db.willOfSteel5Rp ?? 20}`, desc: "3연패 이상에서 탈출(승리) 시" });
  if (db.mentoring?.enabled) bonuses.push({ icon: "🤝", label: "멘토링 (복식)", value: `멘토 +${db.mentoring.mentorRp ?? 10} · 멘티 +${db.mentoring.menteeRp ?? 15}`, desc: `티어차 ${db.mentoring.minTierGap ?? 1}+ 파트너와 복식 승리` });

  const dp: any = dynamicPenalties || {};
  const goldPlus = tier === "Gold" || tier === "Platinum" || tier === "Diamond";
  const pv = (g: number, p: number, d: number) => (tier === "Gold" ? g : tier === "Platinum" ? p : d);
  const penalties: Row[] = [];
  if (dp.enabled && goldPlus) {
    if (dp.arrogance) penalties.push({ icon: "😤", label: "오만함의 대가", value: `-${pv(dp.arroganceGold ?? 20, dp.arrogancePlatinum ?? 30, dp.arroganceDiamond ?? 40)}`, desc: "나보다 2티어 이상 낮은 상대에게 패배" });
    if (dp.crushing) penalties.push({ icon: "💥", label: "굴욕적 완패", value: `-${pv(dp.crushingGold ?? 10, dp.crushingPlatinum ?? 15, dp.crushingDiamond ?? 20)}`, desc: "5점차 이상으로 크게 패배" });
    if (dp.revengeFail) penalties.push({ icon: "😈", label: "복수 허용", value: `-${pv(dp.revengeAllowedGold ?? 10, dp.revengeAllowedPlatinum ?? 15, dp.revengeAllowedDiamond ?? 20)}`, desc: "상대가 나에게 복수전 성공" });
    if (dp.championWeight) penalties.push({ icon: "👑", label: "챔피언의 무게", value: `-${pv(dp.championGold ?? 5, dp.championPlatinum ?? 10, dp.championDiamond ?? 15)}`, desc: "상위 티어일수록 패배 시 추가 감점" });
    if (dp.lossStreak) penalties.push({ icon: "🌊", label: "늪 (연패)", value: `2연패 -${pv(dp.swampGold2 ?? 5, dp.swampPlatinum2 ?? 10, dp.swampDiamond2 ?? 15)} · 3연패+ -${pv(dp.swampGold3 ?? 10, dp.swampPlatinum3 ?? 15, dp.swampDiamond3 ?? 25)}`, desc: "연패 중 패배 시 추가 감점" });
  }

  const ds: any = (decaySettings as any)?.[tk];
  const decayActive = !!ds?.enabled;

  const [open, setOpen] = useState(false);

  // 전략 팁 (켜진 항목 기반)
  const tips: string[] = [];
  if (db.underdogEnabled) tips.push("나보다 높은 티어에 도전해 이기면 추가 RP (언더독).");
  if (db.freshnessEnabled) tips.push("안 만나본 새 상대와 붙으면 매번 신규 매치 보너스.");
  if (dp.enabled && goldPlus && dp.arrogance) tips.push("나보다 2티어 이상 낮은 상대에겐 지면 큰 감점 — 방심 금지.");
  if (dp.enabled && goldPlus && dp.crushing) tips.push("질 것 같으면 점수차라도 줄이기 — 5점차 완패는 추가 감점.");
  if (decayActive) tips.push(`${ds.inactiveDays}일 이상 경기가 없으면 RP가 깎입니다 — 꾸준히 플레이.`);

  return (
    <Card className="border-border/60 bg-card/45 backdrop-blur-xl p-5 shadow-lg space-y-4">
      {/* 헤더 (클릭 시 접기/펼치기) */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <TierCrest rp={rp} thresholds={tierThresholds} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Swords className="size-4 text-neon-blue" />
            <h3 className="text-base font-black tracking-tight">점수 전략 가이드</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            현재 <b className="text-foreground">{TIER_KO[tier]}</b> 기준 · 적용 중인 점수 규칙{open ? "" : " · 펼쳐 보기"}
          </p>
        </div>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* 기본 점수 */}
      <Section title="기본 점수">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-win/25 bg-win/[0.06] px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-muted-foreground">승리</div>
            <div className="text-lg font-black text-win">+{winBase}</div>
          </div>
          <div className="rounded-lg border border-loss/25 bg-loss/[0.06] px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-muted-foreground">패배</div>
            <div className="text-lg font-black text-loss">{loseBase > 0 ? `-${loseBase}` : "0"}</div>
          </div>
        </div>
      </Section>

      {open && (<>
      {/* 보너스 */}
      <Section title="적용 중인 보너스">
        {bonuses.length === 0 ? (
          <Empty>현재 켜진 보너스가 없습니다.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{bonuses.map((b) => <RuleRow key={b.label} row={b} positive />)}</div>
        )}
      </Section>

      {/* 패널티 */}
      <Section title="적용 중인 감점">
        {!goldPlus ? (
          <Empty>현재 티어({TIER_KO[tier]})는 감점 규칙이 적용되지 않습니다. (골드 이상부터)</Empty>
        ) : penalties.length === 0 ? (
          <Empty>현재 켜진 감점이 없습니다.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{penalties.map((p) => <RuleRow key={p.label} row={p} />)}</div>
        )}
      </Section>

      {/* 휴면 감점 */}
      <Section title="휴면 감점">
        {decayActive ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-300">⏱️ {ds.inactiveDays}일 미활동 시 감점</div>
              <div className="text-[10px] text-muted-foreground">경기가 {ds.inactiveDays}일 이상 없으면 주기마다 차감</div>
            </div>
            <span className="shrink-0 font-mono text-sm font-black text-loss">-{ds.decayRp}</span>
          </div>
        ) : (
          <Empty>현재 티어({TIER_KO[tier]})는 휴면 감점이 없습니다. 😊</Empty>
        )}
      </Section>

      {/* 전략 팁 */}
      {tips.length > 0 && (
        <div className="rounded-xl border border-neon-blue/20 bg-neon-blue/[0.04] p-3">
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neon-blue">전략 팁</div>
          <ul className="space-y-1">
            {tips.map((t, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <span className="text-neon-blue">▸</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      </>)}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function RuleRow({ row, positive }: { row: Row; positive?: boolean }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border/30 bg-muted/15 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold">{row.icon} {row.label}</span>
        <span className={cn("shrink-0 font-mono text-xs font-black", positive ? "text-win" : "text-loss")}>{row.value}</span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{row.desc}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border/30 px-3 py-2 text-[11px] text-muted-foreground">{children}</p>;
}
