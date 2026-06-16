import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Swords, Search, Calendar, Users, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gender, Student, Match } from "@/lib/league-types";
import { GenderMark } from "../GenderMark";

export interface AdminMatchRecordsProps {
  students: Student[];
  matches: Match[];
  onDeleteMatch: (matchId: string) => void;
  onUpdateMatchScore: (matchId: string, scoreA: number, scoreB: number) => void;
}

export function AdminMatchRecords({
  students,
  matches,
  onDeleteMatch,
  onUpdateMatchScore,
}: AdminMatchRecordsProps) {
  // Score editor states
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScoreA, setEditScoreA] = useState<string>("");
  const [editScoreB, setEditScoreB] = useState<string>("");

  // Filtering states
  const [matchFilterType, setMatchFilterType] = useState<"recent" | "student" | "date" | "class">("recent");
  const [matchSearchStudent, setMatchSearchStudent] = useState("");
  const [matchSearchDate, setMatchSearchDate] = useState("");
  const [matchSearchGradeClass, setMatchSearchGradeClass] = useState("");

  const [appliedSearchStudent, setAppliedSearchStudent] = useState("");
  const [appliedSearchDate, setAppliedSearchDate] = useState("");
  const [appliedSearchGradeClass, setAppliedSearchGradeClass] = useState("");

  const handleSaveScoreEdit = () => {
    if (!editingMatchId) return;
    const sA = parseInt(editScoreA, 10);
    const sB = parseInt(editScoreB, 10);

    if (isNaN(sA) || sA < 0 || isNaN(sB) || sB < 0) {
      return toast.error("올바른 점수 값을 입력해 주세요 (0점 이상).");
    }

    if (sA === sB) {
      return toast.error("경기는 동점으로 끝날 수 없습니다. 승패가 결정되는 점수를 입력해 주세요.");
    }

    onUpdateMatchScore(editingMatchId, sA, sB);
    setEditingMatchId(null);
    toast.success("경기 점수가 수정되었으며 두 학생의 보너스 및 최종 RP가 오차 없이 즉시 재계산되어 덮어씌워졌습니다!");
  };

  // Filtered matches logic
  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    let result = [...matches];

    // Sort all matches initially by date descending
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matchFilterType === "recent") {
      return result.slice(0, 20);
    }

    if (matchFilterType === "student") {
      const query = appliedSearchStudent.trim().toLowerCase();
      if (!query) return [];
      return result.filter((m) => {
        const playerA = students.find((s) => s.id === m.playerAId);
        const playerB = students.find((s) => s.id === m.playerBId);
        const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
        const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
        return (
          (playerA && playerA.name.toLowerCase().includes(query)) ||
          (playerB && playerB.name.toLowerCase().includes(query)) ||
          (playerA2 && playerA2.name.toLowerCase().includes(query)) ||
          (playerB2 && playerB2.name.toLowerCase().includes(query))
        );
      });
    }

    if (matchFilterType === "date") {
      const query = appliedSearchDate.trim();
      if (!query) return [];
      return result.filter((m) => {
        const mDate = new Date(m.date);
        const mMonth = mDate.getMonth() + 1;
        const mDay = mDate.getDate();

        // 1. Month/Day combo formats: "6/2", "6-2", "6.2", "6 2"
        const parts = query.split(/[\/\-\.\s]+/);
        if (parts.length === 2) {
          const qMonth = parseInt(parts[0], 10);
          const qDay = parseInt(parts[1], 10);
          if (!isNaN(qMonth) && !isNaN(qDay)) {
            return mMonth === qMonth && mDay === qDay;
          }
        }

        // 2. Single digit e.g. "2" -> match month OR day
        if (/^\d+$/.test(query)) {
          const qNum = parseInt(query, 10);
          return mMonth === qNum || mDay === qNum;
        }

        // 3. String representations
        const localDateStr = mDate.toLocaleString("ko-KR", { month: "long", day: "numeric" });
        const localDateShort = mDate.toLocaleString("ko-KR", { month: "short", day: "numeric" });
        const isoStr = mDate.toISOString().split("T")[0];

        return (
          localDateStr.toLowerCase().includes(query.toLowerCase()) ||
          localDateShort.toLowerCase().includes(query.toLowerCase()) ||
          isoStr.includes(query)
        );
      });
    }

    if (matchFilterType === "class") {
      const query = appliedSearchGradeClass.trim();
      if (!query) return [];

      // 1. Grade-Class format like "6-1", "6 1"
      const parts = query.split(/[\-\s\/학년반]+/);
      if (parts.length >= 2) {
        const qGrade = parseInt(parts[0], 10);
        const qClass = parseInt(parts[1], 10);
        if (!isNaN(qGrade) && !isNaN(qClass)) {
          return result.filter((m) => {
            const playerA = students.find((s) => s.id === m.playerAId);
            const playerB = students.find((s) => s.id === m.playerBId);
            const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
            const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
            const aMatch = (playerA && playerA.grade === qGrade && playerA.classNum === qClass) ||
                           (playerA2 && playerA2.grade === qGrade && playerA2.classNum === qClass);
            const bMatch = (playerB && playerB.grade === qGrade && playerB.classNum === qClass) ||
                           (playerB2 && playerB2.grade === qGrade && playerB2.classNum === qClass);
            return aMatch || bMatch;
          });
        }
      }

      // 2. Just a single number -> match grade OR class
      const qNum = parseInt(query, 10);
      if (!isNaN(qNum)) {
        return result.filter((m) => {
          const playerA = students.find((s) => s.id === m.playerAId);
          const playerB = students.find((s) => s.id === m.playerBId);
          const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
          const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
          return (
            (playerA && (playerA.grade === qNum || playerA.classNum === qNum)) ||
            (playerB && (playerB.grade === qNum || playerB.classNum === qNum)) ||
            (playerA2 && (playerA2.grade === qNum || playerA2.classNum === qNum)) ||
            (playerB2 && (playerB2.grade === qNum || playerB2.classNum === qNum))
          );
        });
      }

      // 3. String representation
      return result.filter((m) => {
        const playerA = students.find((s) => s.id === m.playerAId);
        const playerB = students.find((s) => s.id === m.playerBId);
        const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
        const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
        const aStr = playerA ? `${playerA.grade}-${playerA.classNum}` : "";
        const a2Str = playerA2 ? `${playerA2.grade}-${playerA2.classNum}` : "";
        const bStr = playerB ? `${playerB.grade}-${playerB.classNum}` : "";
        const b2Str = playerB2 ? `${playerB2.grade}-${playerB2.classNum}` : "";
        return aStr.includes(query) || a2Str.includes(query) || bStr.includes(query) || b2Str.includes(query);
      });
    }

    return result;
  }, [matches, students, matchFilterType, appliedSearchStudent, appliedSearchDate, appliedSearchGradeClass]);

  return (
    <>
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl relative overflow-hidden">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-neon-blue">
            <Swords className="size-5 animate-pulse" />
            <h3 className="font-black text-lg">리그 기록 관리</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-muted-foreground/85">
            리그에 기록된 모든 매치 데이터를 조회하고, 경기 점수를 소급 수정하거나 완전 삭제하여 RP 및 전적을 안전하게 롤백 복원합니다.
          </p>
        </div>

        {/* Category Selector Tabs */}
        <div className="mb-5 space-y-3">
          <div className="p-1 bg-muted/40 border border-border/20 rounded-xl flex flex-wrap gap-1.5 w-full md:w-max">
            <button
              onClick={() => {
                setMatchFilterType("recent");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "recent"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Swords className="size-3.5" />
              최근 20경기
            </button>
            <button
              onClick={() => {
                setMatchFilterType("student");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "student"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Search className="size-3.5" />
              학생 이름 검색
            </button>
            <button
              onClick={() => {
                setMatchFilterType("date");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "date"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Calendar className="size-3.5" />
              날짜 검색 (6/2 등)
            </button>
            <button
              onClick={() => {
                setMatchFilterType("class");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "class"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Users className="size-3.5" />
              학년·반 검색 (6-1 등)
            </button>
          </div>

          {/* Conditional search inputs */}
          {matchFilterType === "student" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 학생 이름을 입력하세요..."
                  value={matchSearchStudent}
                  onChange={(e) => setMatchSearchStudent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchStudent(matchSearchStudent);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchStudent && (
                  <button
                    onClick={() => {
                      setMatchSearchStudent("");
                      setAppliedSearchStudent("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchStudent(matchSearchStudent)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}

          {matchFilterType === "date" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 날짜를 입력하세요 (예: 6/2, 6월 2일)..."
                  value={matchSearchDate}
                  onChange={(e) => setMatchSearchDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchDate(matchSearchDate);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchDate && (
                  <button
                    onClick={() => {
                      setMatchSearchDate("");
                      setAppliedSearchDate("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchDate(matchSearchDate)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}

          {matchFilterType === "class" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 학년-반을 입력하세요 (예: 6-1, 6)..."
                  value={matchSearchGradeClass}
                  onChange={(e) => setMatchSearchGradeClass(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchGradeClass(matchSearchGradeClass);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchGradeClass && (
                  <button
                    onClick={() => {
                      setMatchSearchGradeClass("");
                      setAppliedSearchGradeClass("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchGradeClass(matchSearchGradeClass)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}
        </div>

        {/* Matches table container */}
        <div className="overflow-x-auto rounded-xl border border-border/30 bg-muted/5">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
              <tr>
                <th className="px-4 py-3">경기 일시</th>
                <th className="px-4 py-3">대결 학생 A</th>
                <th className="px-4 py-3 text-center">점수</th>
                <th className="px-4 py-3">대결 학생 B</th>
                <th className="px-4 py-3">RP 및 획득 보상 변동 내역</th>
                <th className="px-4 py-3 text-right">관리 작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches && filteredMatches.length > 0 ? (
                filteredMatches.map((m) => {
                  const playerA = students.find((s) => s.id === m.playerAId) ?? {
                    name: "알 수 없는 학생",
                    grade: 0,
                    classNum: 0,
                    number: 0,
                    gender: "U" as Gender
                  };
                  const playerB = students.find((s) => s.id === m.playerBId) ?? {
                    name: "알 수 없는 학생",
                    grade: 0,
                    classNum: 0,
                    number: 0,
                    gender: "U" as Gender
                  };
                  const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
                  const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;

                  const aWon = m.scoreA > m.scoreB;
                  const matchDateStr = new Date(m.date).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  const getMatchBonuses = (roleSuffix: "" | "2", isTeamA: boolean) => {
                    const bonuses = [];
                    const rival = isTeamA ? (roleSuffix === "" ? m.rivalBonusA : m.rivalBonusA2) : (roleSuffix === "" ? m.rivalBonusB : m.rivalBonusB2);
                    const firstWin = isTeamA ? (roleSuffix === "" ? m.firstWinBonusA : m.firstWinBonusA2) : (roleSuffix === "" ? m.firstWinBonusB : m.firstWinBonusB2);
                    const revenge = isTeamA ? (roleSuffix === "" ? m.revengeBonusA : m.revengeBonusA2) : (roleSuffix === "" ? m.revengeBonusB : m.revengeBonusB2);
                    const underdog = isTeamA ? (roleSuffix === "" ? m.underdogBonusA : m.underdogBonusA2) : (roleSuffix === "" ? m.underdogBonusB : m.underdogBonusB2);
                    const scoreDiff = isTeamA ? (roleSuffix === "" ? m.scoreDiffBonusA : m.scoreDiffBonusA2) : (roleSuffix === "" ? m.scoreDiffBonusB : m.scoreDiffBonusB2);
                    const margin = isTeamA ? (roleSuffix === "" ? m.marginBonusA : m.marginBonusA2) : (roleSuffix === "" ? m.marginBonusB : m.marginBonusB2);
                    const freshness = isTeamA ? (roleSuffix === "" ? m.freshnessBonusA : m.freshnessBonusA2) : (roleSuffix === "" ? m.freshnessBonusB : m.freshnessBonusB2);
                    const streak = isTeamA ? (roleSuffix === "" ? m.streakBonusA : m.streakBonusA2) : (roleSuffix === "" ? m.streakBonusB : m.streakBonusB2);
                    const comeback = isTeamA ? (roleSuffix === "" ? m.comebackBonusA : m.comebackBonusA2) : (roleSuffix === "" ? m.comebackBonusB : m.comebackBonusB2);

                    if (firstWin && firstWin > 0) bonuses.push(`🌟 오늘의 첫 승 (+${firstWin})`);
                    if (revenge && revenge > 0) bonuses.push(`😈 복수전 성공 (+${revenge})`);
                    if (underdog && underdog > 0) bonuses.push(`🛡️ 언더독 격파 (+${underdog})`);
                    const finalMargin = (margin ?? 0) + (scoreDiff ?? 0);
                    if (finalMargin > 0) bonuses.push(`🚀 압승 (+${finalMargin})`);
                    if (rival && rival > 0) bonuses.push(`⚔️ 라이벌 격파 (+${rival})`);
                    if (freshness && freshness > 0) bonuses.push(`✨ 신선한 매치 (+${freshness})`);
                    if (streak && streak > 0) bonuses.push(`🔥 연승 (+${streak})`);
                    if (comeback && comeback > 0) bonuses.push(`🩹 연패 탈출 (+${comeback})`);
                    return bonuses;
                  };

                  const bonusesA = getMatchBonuses("", true);
                  const bonusesA2 = playerA2 ? getMatchBonuses("2", true) : [];
                  const bonusesB = getMatchBonuses("", false);
                  const bonusesB2 = playerB2 ? getMatchBonuses("2", false) : [];

                  return (
                    <tr key={m.id} className="border-b border-border/20 hover:bg-accent/10 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{matchDateStr}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <GenderMark gender={playerA.gender} className="size-3.5 text-[9px]" />
                            <span className={cn("font-bold", aWon && "text-neon-blue")}>{playerA.name}</span>
                            <span className="text-[10px] text-muted-foreground">({playerA.grade}-{playerA.classNum})</span>
                          </div>
                          {playerA2 && (
                            <div className="flex items-center gap-1.5 border-t border-border/10 pt-1">
                              <GenderMark gender={playerA2.gender} className="size-3.5 text-[9px]" />
                              <span className={cn("font-bold", aWon && "text-neon-blue")}>{playerA2.name}</span>
                              <span className="text-[10px] text-muted-foreground">({playerA2.grade}-{playerA2.classNum})</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="font-mono font-bold bg-muted/60 px-2.5 py-1 rounded text-sm select-none">
                          <span className={cn(aWon ? "text-win" : "text-loss")}>{m.scoreA}</span>
                          <span className="text-muted-foreground mx-1">:</span>
                          <span className={cn(!aWon ? "text-win" : "text-loss")}>{m.scoreB}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <GenderMark gender={playerB.gender} className="size-3.5 text-[9px]" />
                            <span className={cn("font-bold", !aWon && "text-neon-blue")}>{playerB.name}</span>
                            <span className="text-[10px] text-muted-foreground">({playerB.grade}-{playerB.classNum})</span>
                          </div>
                          {playerB2 && (
                            <div className="flex items-center gap-1.5 border-t border-border/10 pt-1">
                              <GenderMark gender={playerB2.gender} className="size-3.5 text-[9px]" />
                              <span className={cn("font-bold", !aWon && "text-neon-blue")}>{playerB2.name}</span>
                              <span className="text-[10px] text-muted-foreground">({playerB2.grade}-{playerB2.classNum})</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[240px] sm:max-w-xs md:max-w-md lg:max-w-lg">
                        <div className="space-y-1">
                          <div className="flex flex-col gap-1 text-[10px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("font-mono font-bold", aWon ? "text-win" : "text-loss")}>
                                {playerA.name}: {m.rpDeltaA !== undefined ? (m.rpDeltaA > 0 ? `+${m.rpDeltaA}` : m.rpDeltaA) : 0} RP
                              </span>
                              {playerA2 && (
                                <span className={cn("font-mono font-bold", aWon ? "text-win" : "text-loss")}>
                                  & {playerA2.name}: {m.rpDeltaA2 !== undefined ? (m.rpDeltaA2 > 0 ? `+${m.rpDeltaA2}` : m.rpDeltaA2) : 0} RP
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("font-mono font-bold", !aWon ? "text-win" : "text-loss")}>
                                {playerB.name}: {m.rpDeltaB !== undefined ? (m.rpDeltaB > 0 ? `+${m.rpDeltaB}` : m.rpDeltaB) : 0} RP
                              </span>
                              {playerB2 && (
                                <span className={cn("font-mono font-bold", !aWon ? "text-win" : "text-loss")}>
                                  & {playerB2.name}: {m.rpDeltaB2 !== undefined ? (m.rpDeltaB2 > 0 ? `+${m.rpDeltaB2}` : m.rpDeltaB2) : 0} RP
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bonuses A */}
                          {bonusesA.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerA.name} 보상:</span>
                              {bonusesA.map((b, idx) => (
                                <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bonuses A2 */}
                          {bonusesA2.length > 0 && playerA2 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerA2.name} 보상:</span>
                              {bonusesA2.map((b, idx) => (
                                <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bonuses B */}
                          {bonusesB.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerB.name} 보상:</span>
                              {bonusesB.map((b, idx) => (
                                <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bonuses B2 */}
                          {bonusesB2.length > 0 && playerB2 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerB2.name} 보상:</span>
                              {bonusesB2.map((b, idx) => (
                                <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Score Edit */}
                          <Button
                            onClick={() => {
                              setEditingMatchId(m.id);
                              setEditScoreA(m.scoreA.toString());
                              setEditScoreB(m.scoreB.toString());
                            }}
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 rounded-lg border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all text-[11px] font-bold"
                            title="경기 점수 수정"
                          >
                            <Pencil className="size-3.5 mr-1" /> 수정
                          </Button>

                          {/* Delete & Rollback */}
                          <Button
                            onClick={() => {
                              const deltaWinner = aWon ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 25) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 25);
                              const deltaLoser = !aWon ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 20) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 20);

                              const vsText = playerB2 ? `VS ${playerB.name} & ${playerB2.name}` : `VS ${playerB.name}`;
                              const playersA = playerA2 ? `${playerA.name} & ${playerA2.name}` : playerA.name;
                              const playersB = playerB2 ? `${playerB.name} & ${playerB2.name}` : playerB.name;

                              if (window.confirm(`정말로 이 경기 기록(${vsText})을 삭제하시겠습니까?\n\n모든 참여 학생들의 RP가 경기 이전 상태로 완벽하게 롤백 복원됩니다.\n- ${playersA}: RP ${aWon ? "-" : "+"}${deltaWinner}\n- ${playersB}: RP ${!aWon ? "-" : "+"}${deltaLoser}`)) {
                                onDeleteMatch(m.id);
                                toast.success("경기 기록이 완벽히 삭제되었으며 참여 학생들의 RP 및 전적이 경기 이전으로 롤백 복구되었습니다!");
                              }
                            }}
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg active:scale-95 transition-all shrink-0"
                            title="이 경기 삭제 및 안전 롤백"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground font-medium bg-muted/5 font-sans text-xs">
                    {(() => {
                      if (matchFilterType === "recent") {
                        return "기록된 전체 경기 매치 내역이 전혀 존재하지 않습니다.";
                      }

                      const hasApplied = 
                        (matchFilterType === "student" && appliedSearchStudent) ||
                        (matchFilterType === "date" && appliedSearchDate) ||
                        (matchFilterType === "class" && appliedSearchGradeClass);

                      if (!hasApplied) {
                        return "검색어를 입력하고 '검색' 버튼(또는 엔터)을 누르면 매치 기록을 불러옵니다.";
                      }

                      return "선택한 필터 조건과 일치하는 경기 기록이 존재하지 않습니다.";
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inline Score Edit Modal Overlaid */}
      {editingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-sm w-full border border-border/80 bg-background p-6 shadow-2xl rounded-2xl relative z-50 animate-in zoom-in-95 duration-200">
            <h4 className="text-base font-black mb-1 flex items-center gap-1.5 text-foreground">
              <Pencil className="size-4.5 text-neon-blue" /> 경기 세부 점수 수정
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              경기 결과를 수정하면 바뀐 점수를 기반으로 점수차 비례 보상 등의 보너스 및 최종 RP가 오차 없이 다시 자동 계산되어 두 학생에게 즉시 덮어씌워집니다.
            </p>

            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border/30 mb-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  A 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreA}
                  onChange={(e) => setEditScoreA(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  B 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreB}
                  onChange={(e) => setEditScoreB(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setEditingMatchId(null)}
                variant="outline"
                className="w-1/2 h-10 font-bold border-border/80 text-foreground rounded-xl"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSaveScoreEdit}
                className="w-1/2 h-10 font-black bg-neon-blue text-primary-foreground hover:opacity-90 rounded-xl"
              >
                저장 및 재계산
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
