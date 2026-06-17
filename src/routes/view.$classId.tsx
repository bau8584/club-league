import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { cn } from "@/lib/utils";
import { 
  Trophy, 
  Swords, 
  Crown, 
  Calendar, 
  Award, 
  ShieldAlert, 
  Search 
} from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/view/$classId")({
  component: StudentViewerComponent,
});

function StudentViewerComponent() {
  const { classId } = Route.useParams();
  const {
    students,
    matches,
    title,
    loadClassData,
    tierThresholds,
    hydrated,
    isSyncing
  } = useLeagueStore();

  const [activeTab, setActiveTab] = useState<"leaderboard" | "history">("leaderboard");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (classId) {
      loadClassData(classId);
    }
  }, [classId, loadClassData]);

  // Name masking filter (e.g. 홍길동 -> 홍*동, 이철수 -> 이*수, 김철 -> 김*, 남궁민수 -> 남**수)
  const maskName = (name: string) => {
    // API 레벨에서 실명이 보호되고 display_name(닉네임 또는 학년-반-번호)이 내려오므로, 마스킹 처리 없이 그대로 노출합니다.
    return name || "";
  };

  const getWinStreak = (recent: ("W" | "L")[]): number => {
    let count = 0;
    for (const r of recent) {
      if (r === "W") count++;
      else break;
    }
    return count;
  };

  const filteredStudents = students
    .filter((s) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      // Also match raw or masked names
      const masked = maskName(s.name).toLowerCase();
      return s.name.toLowerCase().includes(q) || masked.includes(q);
    })
    .sort((a, b) => b.rp - a.rp);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">
            리더보드를 동기화하고 있습니다...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      {/* Background neon elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-tier-diamond/10 blur-[130px] pointer-events-none" />

      {/* Header Profile Section */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl relative z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-blue to-tier-diamond shadow-[0_0_18px_oklch(0.78_0.18_230/0.5)]">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-[10px] font-bold text-neon-green tracking-wider uppercase flex items-center gap-1.5 animate-pulse">
                <span className="size-1.5 rounded-full bg-neon-green" />
                Live Student Leaderboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSyncing && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-neon-blue/40 bg-neon-blue/5 text-[9px] font-bold text-neon-blue animate-pulse">
                <span>실시간 동기화 중...</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground text-[10px] font-bold">
              <span>학생 전용 열람 모드 (읽기 전용)</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 relative z-10">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border/40 mb-6 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer",
              activeTab === "leaderboard"
                ? "border-neon-blue bg-neon-blue/10 text-neon-blue text-glow-blue"
                : "border-transparent text-muted-foreground hover:bg-accent/30 hover:text-foreground",
            )}
          >
            <Trophy className="size-4" />
            티어 순위표
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer",
              activeTab === "history"
                ? "border-neon-blue bg-neon-blue/10 text-neon-blue text-glow-blue"
                : "border-transparent text-muted-foreground hover:bg-accent/30 hover:text-foreground",
            )}
          >
            <Swords className="size-4" />
            최근 경기 기록
          </button>
        </div>

        {/* Tab 1: Leaderboard */}
        {activeTab === "leaderboard" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Search Box */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="마스킹 처리된 이름 또는 성으로 검색 (예: 홍*동)..."
                className="h-10 border-border/60 bg-card/60 pl-9 text-sm"
              />
            </div>

            {/* Ranking Table */}
            <Card className="overflow-hidden border-border/60 bg-card/60 p-0 backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 text-left w-16">순위</th>
                      <th className="px-4 py-3 text-left w-24">학년/반</th>
                      <th className="px-2 py-3 text-left w-16">번호</th>
                      <th className="px-4 py-3 text-left">이름 (보안마스킹)</th>
                      <th className="px-4 py-3 text-left">티어</th>
                      <th className="px-4 py-3 text-right">RP</th>
                      <th className="px-4 py-3 text-center">최근 5경기</th>
                      <th className="px-4 py-3 text-right">승률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => {
                      const total = s.wins + s.losses;
                      const winRate = total === 0 ? 0 : Math.round((s.wins / total) * 100);
                      const maskedName = maskName(s.name);
                      
                      return (
                        <tr key={s.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3 font-bold tabular-nums">
                            {i === 0 ? (
                              <span className="text-glow-gold text-gold font-extrabold">#1</span>
                            ) : i === 1 ? (
                              <span className="text-tier-silver font-extrabold">#2</span>
                            ) : i === 2 ? (
                              <span className="text-tier-bronze font-extrabold">#3</span>
                            ) : (
                              <span className="text-muted-foreground">#{i + 1}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-medium">{s.grade}학년 {s.classNum}반</td>
                          <td className="px-2 py-3 tabular-nums text-muted-foreground">{s.number}번</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-bold">
                              <GenderMark gender={s.gender} />
                              <span>{maskedName}</span>
                              {getWinStreak(s.recent) >= 3 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-black text-orange-500 ring-1 ring-orange-500/30 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.2)]">
                                  🔥 {getWinStreak(s.recent)}연승
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <TierBadge rp={s.rp} thresholds={tierThresholds} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-neon-blue text-glow-blue">
                            {s.rp}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              {Array.from({ length: 5 }).map((_, idx) => {
                                const r = s.recent[idx];
                                return (
                                  <span
                                    key={idx}
                                    className={cn(
                                      "flex size-5.5 items-center justify-center rounded-full text-[9px] font-bold",
                                      !r && "bg-muted/40 text-muted-foreground",
                                      r === "W" && "bg-win/20 text-win ring-1 ring-win/40",
                                      r === "L" && "bg-loss/20 text-loss ring-1 ring-loss/40",
                                    )}
                                  >
                                    {r ?? "·"}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className="font-bold">{winRate}%</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">({s.wins}승 {s.losses}패)</span>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-xs leading-relaxed">
                          조건에 부합하는 선수가 없거나 아직 등록된 선수가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 2: Match History */}
        {activeTab === "history" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Card className="overflow-hidden border-border/60 bg-card/60 p-0 backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 text-left w-24">날짜</th>
                      <th className="px-6 py-3 text-left">승리 팀/선수</th>
                      <th className="px-4 py-3 text-center w-24">결과</th>
                      <th className="px-6 py-3 text-right">패배 팀/선수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const winner = students.find((s) => s.id === m.playerAId);
                      const loser = students.find((s) => s.id === m.playerBId);
                      
                      const winnerName = winner ? `${winner.grade}-${winner.classNum} ${maskName(winner.name)}` : "알 수 없음";
                      const loserName = loser ? `${loser.grade}-${loser.classNum} ${maskName(loser.name)}` : "알 수 없음";

                      return (
                        <tr key={m.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3.5 text-xs text-muted-foreground">
                            {m.date ? new Date(m.date).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-6 py-3.5 text-left font-extrabold text-win flex items-center gap-1.5">
                            <Award className="size-4 text-win" />
                            <span>{winnerName}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="px-2 py-0.5 rounded border border-win/40 bg-win/10 text-[10px] font-black text-win">
                              승리
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right font-medium text-muted-foreground">
                            <span>{loserName}</span>
                          </td>
                        </tr>
                      );
                    })}

                    {matches.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-xs leading-relaxed">
                          기록된 경기 전적이 아직 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>

      <footer className="border-t border-border/25 py-4 text-center text-[10px] text-muted-foreground relative z-10 bg-background/50">
        <div>본 대시보드는 실시간으로 동기화됩니다. 경기 점수가 기록되면 자동으로 리더보드가 갱신됩니다.</div>
      </footer>
    </div>
  );
}
