import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TierBadge } from "./TierBadge";
import { GenderMark } from "./GenderMark";
import { cn } from "@/lib/utils";
import { 
  Trophy, 
  Award, 
  TrendingUp, 
  Activity, 
  Calendar, 
  Zap, 
  User, 
  Users, 
  ChevronRight, 
  Medal, 
  Percent 
} from "lucide-react";
import { 
  getTier, 
  getTierSubdivision, 
  getFullTierLabel,
  TIER_STYLES,
  type TierName,
  type Student,
  type Match,
  type DecaySettingsRecord
} from "@/lib/league-types";

interface MyRecordProps {
  session: {
    loginId: string;
    role: "MASTER" | "TEACHER" | "STUDENT";
    schoolName: string;
    userName: string;
    scriptUrl?: string;
    studentId?: string;
  } | null;
  students: Student[];
  matches: Match[];
  thresholds?: Record<TierName, number>;
  rpVariables?: { winDelta: number; loseDelta: number };
  decaySettings?: DecaySettingsRecord;
  decayAppliedDates?: Record<string, string>;
}

export function MyRecord({
  session,
  students,
  matches,
  thresholds,
  rpVariables = { winDelta: 25, loseDelta: 20 },
  decaySettings,
  decayAppliedDates = {}
}: MyRecordProps) {
  
  // 1. 현재 접속한 학생 정보 매칭 (동명이인 처리 포함)
  const me = useMemo(() => {
    if (!session || session.role !== "STUDENT") return null;
    if (session.studentId) {
      return students.find((s) => s.id === session.studentId) ?? null;
    }
    return students.find((s) => s.name === session.userName) ?? null;
  }, [session, students]);

  // 2. 본인이 참여한 최근 경기 목록 (최신순)
  const myMatches = useMemo(() => {
    if (!me) return [];
    return matches
      .filter((m) => m.playerAId === me.id || m.playerBId === me.id || m.playerA2Id === me.id || m.playerB2Id === me.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [me, matches]);

  // 3. 승률 및 티어 진척도 계산
  const stats = useMemo(() => {
    if (!me) return { total: 0, winRate: 0, wins: 0, losses: 0 };
    const total = me.wins + me.losses;
    const winRate = total === 0 ? 0 : Math.round((me.wins / total) * 100);
    return {
      total,
      winRate,
      wins: me.wins,
      losses: me.losses
    };
  }, [me]);

  // 4. 다음 티어 정보 및 필요 RP 계산
  const tierProgress = useMemo(() => {
    if (!me) return null;
    const t = thresholds || { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 };
    const currentRp = me.rp;
    const currentTier = getTier(currentRp, thresholds);
    
    let nextTier: TierName | null = null;
    let nextTierLabel = "";
    let nextThreshold = 0;
    let currentThreshold = 0;

    if (currentTier === "Bronze") {
      nextTier = "Silver";
      nextTierLabel = "실버";
      currentThreshold = t.Bronze ?? 0;
      nextThreshold = t.Silver ?? 1000;
    } else if (currentTier === "Silver") {
      nextTier = "Gold";
      nextTierLabel = "골드";
      currentThreshold = t.Silver ?? 1000;
      nextThreshold = t.Gold ?? 1200;
    } else if (currentTier === "Gold") {
      nextTier = "Platinum";
      nextTierLabel = "플래티넘";
      currentThreshold = t.Gold ?? 1200;
      nextThreshold = t.Platinum ?? 1400;
    } else if (currentTier === "Platinum") {
      nextTier = "Diamond";
      nextTierLabel = "다이아몬드";
      currentThreshold = t.Platinum ?? 1400;
      nextThreshold = t.Diamond ?? 1600;
    } else {
      // 다이아몬드
      nextTier = null;
      nextTierLabel = "마스터";
      currentThreshold = t.Diamond ?? 1600;
      nextThreshold = currentThreshold + 400; // 다이아 상한 가상 설정
    }

    const range = nextThreshold - currentThreshold;
    const relativeRp = Math.max(0, currentRp - currentThreshold);
    const percent = Math.min(100, Math.round((relativeRp / range) * 100));
    const remainingRp = Math.max(0, nextThreshold - currentRp);

    return {
      currentTier,
      nextTier,
      nextTierLabel,
      remainingRp,
      percent,
      nextThreshold
    };
  }, [me, thresholds]);

  // 4.5. 휴면 감점 카운트다운 계산 (사이클당 1회 차감 기준)
  //  - status: "new"(전적 없음) | "exempt"(감점 면제 티어) | "active"(감점 대상)
  //  - daysRemaining: 다음 RP 차감까지 남은 일수 (active일 때)
  const inactivityInfo = useMemo(() => {
    if (!me || !me.lastMatchDate) {
      return { status: "new" as const, daysRemaining: null, warning: false, text: "아직 등록된 경기 전적이 없습니다. 첫 대결에 도전하세요!" };
    }

    const myTier = getTier(me.rp, thresholds);
    const tierKey = myTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
    const setting = decaySettings?.[tierKey];

    const dayMs = 1000 * 60 * 60 * 24;

    // 감점 면제(설정 비활성) 티어
    if (!setting || !setting.enabled) {
      return { status: "exempt" as const, daysRemaining: null, warning: false, text: "현재 등급은 휴면 감점이 없습니다. 편하게 즐기세요! 😊" };
    }

    // 사이클당 1회: max(마지막 경기일, 마지막 감점일) 기준으로 남은 일수 계산
    const lastMatchTime = new Date(me.lastMatchDate).getTime();
    const appliedStr = decayAppliedDates[me.id];
    const baseline = Math.max(lastMatchTime, appliedStr ? new Date(appliedStr).getTime() : 0);
    const elapsedMs = new Date().getTime() - baseline;
    const daysRemaining = Math.max(0, Math.ceil(setting.inactiveDays - elapsedMs / dayMs));

    // 3일 이하 남으면 경고
    const warning = daysRemaining <= 3;

    let text = "";
    if (daysRemaining <= 0) {
      text = `${setting.inactiveDays}일 이상 미활동 상태입니다. 곧 RP ${setting.decayRp}점이 차감됩니다. 지금 대결하세요!`;
    } else {
      text = `대결이 없으면 ${daysRemaining}일 후 RP ${setting.decayRp}점이 차감됩니다.`;
    }

    return { status: "active" as const, daysRemaining, warning, text };
  }, [me, thresholds, decaySettings, decayAppliedDates]);

  if (!me || !tierProgress) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-2xl bg-card/25 backdrop-blur-md">
        <Activity className="size-12 text-muted-foreground animate-pulse mb-3" />
        <h3 className="text-lg font-bold text-foreground">학생 데이터를 불러올 수 없습니다</h3>
        <p className="text-sm text-muted-foreground mt-1">
          현재 로그인 세션에 일치하는 학생 정보가 명렬표에 없거나 로딩 중입니다. 교사에게 문의하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* 1. 티어 및 프로필 프리미엄 글래스 카드 */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="relative overflow-hidden border-border/60 bg-card/45 backdrop-blur-xl md:col-span-2 shadow-lg">
          {/* Background subtle neon light */}
          <div className={cn(
            "absolute -right-24 -top-24 size-64 rounded-full blur-[100px] pointer-events-none opacity-20",
            tierProgress.currentTier === "Diamond" && "bg-tier-diamond",
            tierProgress.currentTier === "Platinum" && "bg-tier-platinum",
            tierProgress.currentTier === "Gold" && "bg-tier-gold",
            tierProgress.currentTier === "Silver" && "bg-tier-silver",
            tierProgress.currentTier === "Bronze" && "bg-tier-bronze",
          )} />

          <CardHeader className="pb-3 relative z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-neon-blue">Student Profile</span>
                <CardTitle className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                  <GenderMark gender={me.gender} />
                  <span>{me.name}</span>
                </CardTitle>
              </div>
              
              <div className="flex items-center gap-2">
                {/* 🛡️ 강등 보호막 카운터 HUD */}
                {me.rp >= (thresholds?.Silver ?? 1000) && (
                  <div className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold shadow-md transition-all shrink-0",
                    (me.demotionShields ?? 0) > 0 
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-500 animate-pulse"
                      : "border-border bg-card/60 text-muted-foreground"
                  )}>
                    <span>🛡️ x{me.demotionShields ?? 0}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider hidden sm:inline">강등 보호막</span>
                  </div>
                )}
                <TierBadge rp={me.rp} thresholds={thresholds} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 relative z-10 pt-1">
            {/* RP Stats */}
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-foreground">{me.rp}</span>
              <span className="text-xs font-black uppercase tracking-wider text-neon-blue">RP 점수</span>
            </div>

            {/* 휴면 경고 안내 바 */}
            <div className={cn(
              "rounded-xl border p-3 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm transition-all",
              inactivityInfo.status === "new"
                ? "border-neon-blue/30 bg-neon-blue/5 text-neon-blue"
                : inactivityInfo.status === "exempt"
                  ? "border-border bg-background/30 text-muted-foreground"
                  : inactivityInfo.warning
                    ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
                    : "border-border bg-background/30 text-muted-foreground"
            )}>
              <span className="flex items-center gap-1.5 leading-relaxed">
                {inactivityInfo.status === "new" ? "🌱 " : inactivityInfo.status === "exempt" ? "😊 " : inactivityInfo.warning ? "⚠️ " : "⏱️ "}
                {inactivityInfo.text}
              </span>
              {inactivityInfo.status === "active" && inactivityInfo.warning ? (
                <span className="text-[9px] font-black uppercase tracking-wider text-destructive bg-destructive/15 border border-destructive/20 px-2 py-0.5 rounded animate-bounce shrink-0 self-end sm:self-center">
                  {(inactivityInfo.daysRemaining ?? 0) <= 0 ? "휴면 감점 임박!" : `RP 차감 D-${inactivityInfo.daysRemaining}`}
                </span>
              ) : inactivityInfo.status === "active" ? (
                <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-card/65 px-2 py-0.5 rounded border border-border/40 shrink-0 self-end sm:self-center">
                  RP 차감까지 D-{inactivityInfo.daysRemaining}
                </span>
              ) : inactivityInfo.status === "exempt" ? (
                <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-card/65 px-2 py-0.5 rounded border border-border/40 shrink-0 self-end sm:self-center">
                  감점 없음
                </span>
              ) : (
                <span className="text-[9px] font-black uppercase tracking-wider text-neon-blue bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/20 shrink-0 self-end sm:self-center">
                  신규 유저
                </span>
              )}
            </div>

            {/* Tier progress gauge */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="size-3.5 text-neon-blue" />
                  티어 진척도
                </span>
                <span>
                  {tierProgress.nextTier ? (
                    <>다음 등급인 <span className="text-neon-blue font-extrabold">[{tierProgress.nextTierLabel}]</span>까지 {tierProgress.remainingRp} RP 필요</>
                  ) : (
                    <span className="text-glow-gold text-gold flex items-center gap-1"><Medal className="size-3.5" /> 최고 티어 달성!</span>
                  )}
                </span>
              </div>

              {/* Gauge Bar */}
              <div className="relative w-full h-3.5 bg-background/60 border border-border/40 rounded-full overflow-hidden p-0.5">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-700 bg-gradient-to-r shadow-inner",
                    tierProgress.currentTier === "Diamond" ? "from-tier-diamond to-[#00b4d8]" : 
                    tierProgress.currentTier === "Platinum" ? "from-tier-platinum to-[#80ffdb]" :
                    tierProgress.currentTier === "Gold" ? "from-tier-gold to-amber-300" :
                    tierProgress.currentTier === "Silver" ? "from-tier-silver to-[#e2eafc]" :
                    "from-tier-bronze to-amber-700"
                  )}
                  style={{ width: `${tierProgress.percent}%` }}
                />
              </div>
              
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground/80 px-1">
                <span>{getFullTierLabel(me.rp, thresholds)}</span>
                <span>{tierProgress.percent}%</span>
                <span>{tierProgress.nextTier ? `${tierProgress.nextTierLabel} (${tierProgress.nextThreshold} RP)` : "MAX"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. 승률 통계 카드 */}
        <Card className="border-border/60 bg-card/45 backdrop-blur-xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <CardHeader className="pb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-neon-green">Performance</span>
            <CardTitle className="text-base font-black tracking-tight text-foreground flex items-center gap-1.5">
              <Percent className="size-4.5 text-neon-green" />
              승률 및 경기 통계
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 flex-1 flex flex-col justify-end">
            
            {/* Winrate Big Label */}
            <div className="text-center py-2 relative">
              <span className="text-5xl font-black tracking-tighter text-glow-green text-neon-green font-mono">
                {stats.winRate}%
              </span>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">전체 승률</p>
            </div>

            {/* Custom styled progress bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-background/50 border border-border/40 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-gradient-to-r from-win to-[#06d6a0] rounded-l-full" 
                  style={{ width: `${stats.winRate}%` }}
                  title={`승리: ${stats.winRate}%`}
                />
                <div 
                  className="h-full bg-gradient-to-r from-loss to-[#ef476f] rounded-r-full" 
                  style={{ width: `${100 - stats.winRate}%` }}
                  title={`패배: ${100 - stats.winRate}%`}
                />
              </div>

              {/* Detail Stats Grid */}
              <div className="grid grid-cols-3 gap-1.5 text-center mt-3">
                <div className="bg-background/45 border border-border/30 rounded-lg p-1.5">
                  <p className="text-[10px] text-muted-foreground font-bold">경기수</p>
                  <p className="text-sm font-black text-foreground font-mono">{stats.total}</p>
                </div>
                <div className="bg-win/5 border border-win/20 rounded-lg p-1.5">
                  <p className="text-[10px] text-win font-bold">승리</p>
                  <p className="text-sm font-black text-win font-mono">{stats.wins}</p>
                </div>
                <div className="bg-loss/5 border border-loss/20 rounded-lg p-1.5">
                  <p className="text-[10px] text-loss font-bold">패배</p>
                  <p className="text-sm font-black text-loss font-mono">{stats.losses}</p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* 3. 최근 전적 타임라인 리스트 */}
      <Card className="border-border/60 bg-card/45 backdrop-blur-xl shadow-lg">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-neon-blue">History Timeline</span>
              <CardTitle className="text-lg font-black tracking-tight text-foreground flex items-center gap-1.5 mt-0.5">
                <Trophy className="size-4.5 text-neon-blue" />
                나의 최근 경기 전적
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">
              최근 경기수 <span className="font-bold text-foreground">{myMatches.length}</span>건
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {myMatches.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Calendar className="size-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">아직 참여한 경기 기록이 없습니다.</p>
              <p className="text-xs text-muted-foreground/80 mt-1">교사가 매치 결과를 등록하면 여기에 실시간으로 전적이 나열됩니다!</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {myMatches.map((m) => {
                // 내 소속 팀이 Team A인지 확인
                const isTeamA = m.playerAId === me.id || m.playerA2Id === me.id;
                
                // 상대방 팀 구성원 검색
                const oppIds = isTeamA 
                  ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[]
                  : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
                const oppPlayers = oppIds.map(id => students.find((s) => s.id === id)).filter(Boolean) as Student[];
                const oppName = oppPlayers.map(o => o.name).join(" & ") || "탈퇴한 학생";
                const oppClass = oppPlayers[0] ? `${oppPlayers[0].grade}학년 ${oppPlayers[0].classNum}반` : "기타 소속";
                
                // 내 파트너 검색 (복식일 경우)
                const partnerId = isTeamA 
                  ? (m.playerAId === me.id ? m.playerA2Id : m.playerAId)
                  : (m.playerBId === me.id ? m.playerB2Id : m.playerBId);
                const partner = partnerId ? students.find((s) => s.id === partnerId) : null;
                
                // 승패 여부
                const isWin = isTeamA ? (m.scoreA > m.scoreB) : (m.scoreB > m.scoreA);
                
                // 스코어 포맷
                const myScore = isTeamA ? m.scoreA : m.scoreB;
                const oppScore = isTeamA ? m.scoreB : m.scoreA;

                // RP 변동폭 (정밀 계산 변동폭 지원)
                let matchDelta: number | undefined;
                if (m.playerAId === me.id) matchDelta = m.rpDeltaA;
                else if (m.playerBId === me.id) matchDelta = m.rpDeltaB;
                else if (m.playerA2Id === me.id) matchDelta = m.rpDeltaA2;
                else if (m.playerB2Id === me.id) matchDelta = m.rpDeltaB2;
                
                const rpDelta = matchDelta !== undefined ? matchDelta : (isWin ? rpVariables.winDelta : -rpVariables.loseDelta);

                // 경기 날짜 포맷
                const dateStr = new Date(m.date).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <div key={m.id} className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-accent/15 transition-all">
                    
                    {/* 경기 정보 & 결과 배지 */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex size-10.5 items-center justify-center rounded-full text-sm font-black tracking-wide border",
                        isWin 
                          ? "bg-win/15 border-win/40 text-win shadow-[0_0_12px_rgba(6,214,160,0.15)]" 
                          : "bg-loss/15 border-loss/40 text-loss shadow-[0_0_12px_rgba(239,71,111,0.15)]"
                      )}>
                        {isWin ? "WIN" : "LOSE"}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm text-foreground">
                            vs {oppName}
                          </span>
                          {partner && (
                            <span className="text-[10px] font-bold text-neon-blue bg-neon-blue/10 border border-neon-blue/20 rounded px-1.5 py-0.5">
                              동료: {partner.name}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-muted-foreground/80 bg-background/50 border border-border/40 rounded px-1 py-0.5">
                            {oppClass}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1 mt-0.5">
                          <Calendar className="size-3" />
                          {dateStr}
                        </p>
                      </div>
                    </div>

                    {/* 스코어보드 */}
                    <div className="flex items-center gap-3">
                      <div className="bg-background/60 border border-border/40 rounded-xl px-4 py-1.5 text-center shadow-inner">
                        <span className="text-xs font-semibold text-muted-foreground/80 block mb-0.5">SCORE</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className={cn("text-base font-extrabold", isWin ? "text-win" : "text-muted-foreground")}>
                            {myScore}
                          </span>
                          <span className="text-muted-foreground/60 text-xs">:</span>
                          <span className={cn("text-base font-extrabold", !isWin ? "text-loss" : "text-muted-foreground")}>
                            {oppScore}
                          </span>
                        </div>
                      </div>

                      {/* RP Delta Badge */}
                      <div className={cn(
                        "rounded-xl px-3 py-1.5 text-center border font-bold min-w-20",
                        isWin 
                          ? "bg-win/10 border-win/35 text-win" 
                          : "bg-loss/10 border-loss/35 text-loss"
                      )}>
                        <span className="text-[9px] font-black uppercase tracking-wider block opacity-75 mb-0.5">RP 변동</span>
                        <span className="text-xs font-black font-mono">
                          {isWin ? `+${rpDelta}` : rpDelta}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
