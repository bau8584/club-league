import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { apiFetchLeaguePublic, apiFetchStudentsPublic } from "@/services/league-api";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { cn } from "@/lib/utils";
import { isUnranked, schoolLabel, type Gender, type TierName } from "@/lib/league-types";
import { termsFor } from "@/lib/league-terms";
import { Trophy, RefreshCw } from "lucide-react";

type PublicPlayer = {
  id: string;
  rp: number;
  nickname: string | null;
  display_name: string | null;
  group_label: string | null;
  gender: Gender;
  win_count: number;
  lose_count: number;
  grade: number | null;
  class_num: number | null;
  student_no: number | null;
};

type PublicLeague = {
  id: string;
  name: string;
  league_type: "club" | "school";
  season: string;
  tier_thresholds: Record<TierName, number> | null;
  placement: { enabled?: boolean; games?: number } | null;
};

/**
 * 무인증 공개 순위표(B안).
 * 로그인 없이 리그의 순위만 열람한다. 본명(name)과 개인 상세는 노출하지 않는다
 * — players_public 뷰(닉네임/표시이름만)와 get_league_public RPC만 사용.
 */
export function PublicRanking({ classId }: { classId: string }) {
  const [league, setLeague] = useState<PublicLeague | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: lg, error: lgErr }, { data: ps, error: psErr }] = await Promise.all([
        apiFetchLeaguePublic(classId),
        apiFetchStudentsPublic(classId),
      ]);
      if (lgErr) throw lgErr;
      if (psErr) throw psErr;
      const row = Array.isArray(lg) ? lg[0] : lg;
      if (!row) throw new Error("리그를 찾을 수 없습니다.");
      setLeague(row as PublicLeague);
      setPlayers((ps || []) as PublicPlayer[]);
    } catch (err: any) {
      setError(err?.message || "순위표를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // 공개 화면이라 세션이 없어도 동작해야 한다. 리그가 바뀌면 다시 조회.
  }, [classId]);

  // 실시간 갱신: 경기 결과가 반영되면 순위도 따라 바뀐다.
  useEffect(() => {
    const ch = supabase
      .channel(`public-ranking-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `league_id=eq.${classId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [classId]);

  const terms = termsFor(league?.league_type ?? "club");
  const isSchool = league?.league_type === "school";
  const placementEnabled = !!league?.placement?.enabled;
  const placementGames = league?.placement?.games ?? 3;

  const ranked = useMemo(() => {
    return [...players]
      .map((p) => ({ ...p, wins: p.win_count ?? 0, losses: p.lose_count ?? 0 }))
      .sort((a, b) => b.rp - a.rp);
  }, [players]);

  const nameOf = (p: PublicPlayer) => p.display_name || p.nickname || "이름 미등록";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs font-black tracking-wider text-muted-foreground animate-pulse">순위표를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
          <p className="text-sm font-bold text-destructive">순위표를 볼 수 없습니다.</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{error ?? "리그를 찾을 수 없습니다."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-lg font-black tracking-tight sm:text-xl">
              <Trophy className="size-5 shrink-0 text-neon-blue" />
              {league.name}
            </h1>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {league.season} · 등록 {terms.member} {ranked.length}명 · 로그인 없이 볼 수 있는 공개 순위표입니다.
            </p>
          </div>
          <button
            onClick={load}
            title="새로고침"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition-all hover:border-neon-blue/40 hover:text-neon-blue active:scale-95"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {ranked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/40 bg-muted/5 py-10 text-center text-xs text-muted-foreground">
            아직 등록된 {terms.member}이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-center font-bold">순위</th>
                  <th className="px-2 py-2.5 text-left font-bold">{terms.nameLabel}</th>
                  <th className="px-2 py-2.5 text-left font-bold">{isSchool ? "학년·반" : "레벨"}</th>
                  <th className="px-2 py-2.5 text-center font-bold">티어</th>
                  <th className="px-2 py-2.5 text-center font-bold">전적</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((p, i) => {
                  const unranked = isUnranked(p, placementEnabled, placementGames);
                  return (
                    <tr key={p.id} className="border-t border-border/30">
                      <td className={cn(
                        "px-3 py-2 text-center font-mono font-black tabular-nums",
                        i === 0 ? "text-tier-gold" : i === 1 ? "text-tier-silver" : i === 2 ? "text-tier-bronze" : "text-muted-foreground"
                      )}>
                        {unranked ? "-" : i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-1.5 font-bold">
                          <GenderMark gender={p.gender} className="size-3.5 shrink-0 text-[9px]" />
                          <span className="truncate">{nameOf(p)}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
                        {isSchool
                          ? (schoolLabel({ grade: p.grade, classNum: p.class_num, studentNo: p.student_no }) || "-")
                          : (p.group_label || "-")}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <TierBadge rp={p.rp} thresholds={league.tier_thresholds ?? undefined} unranked={unranked} />
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                        {p.wins}승 {p.losses}패
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
