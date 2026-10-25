import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Login } from "../components/Login";
import { Button } from "../components/ui/button";
import { apiFetchLeaguePublic } from "../services/league-api";

type SearchParams = {
  classId?: string;
};

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    return {
      classId: (search.classId as string) || undefined,
    };
  },
  component: JoinRouteComponent,
});

type LeagueInfo = { name: string; leagueType: string | null };

/**
 * 초대 링크로 들어온 화면.
 * 링크를 열자마자 참가시키지 않고, 어떤 리그에 어떤 자격으로 들어가는지 먼저 보여 준 뒤
 * [들어가기]를 눌러야 참가한다(2026-10-25). 학교 리그는 들어가면 공동 관리자가 되기 때문이다.
 * 실패하면 흰 화면 대신 이유와 [다시 시도]·[첫 화면으로]를 보여 준다.
 */
function JoinRouteComponent() {
  const { classId } = Route.useSearch();
  const navigate = useNavigate();
  const [supabaseSession, setSupabaseSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  // undefined = 아직 확인 중, null = 리그 없음(지워졌거나 주소가 틀림)
  const [league, setLeague] = useState<LeagueInfo | null | undefined>(undefined);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSupabaseSession(session);
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 로그인 없이도 리그 이름·유형은 볼 수 있다(공개 순위표와 같은 조회).
  useEffect(() => {
    if (!classId) { setLeague(null); return; }
    let alive = true;
    apiFetchLeaguePublic(classId).then(({ data, error }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : data;
      setLeague(error || !row ? null : { name: row.name ?? "", leagueType: row.league_type ?? null });
    });
    return () => { alive = false; };
  }, [classId]);

  const goHome = () => navigate({ to: "/" });

  const handleJoinClass = async () => {
    if (joining || !classId) return;
    setJoining(true);
    setJoinError(null);
    try {
      // 안전한 참가: RLS를 우회하는 join_league RPC로 본인만 멤버에 추가.
      const { data, error: joinErr } = await supabase.rpc("join_league", { p_class_id: classId });
      if (joinErr) throw joinErr;

      const row = Array.isArray(data) ? data[0] : data;

      // Navigate to the class dashboard — school 리그는 /school/id, 그 외는 /class/id 로.
      navigate({ to: row?.league_type === "school" ? `/school/${classId}` : `/class/${classId}` });
    } catch (err: any) {
      console.error("Error joining league:", err?.message);
      setJoinError(err?.message || "알 수 없는 문제가 생겼어요.");
      setJoining(false);
    }
  };

  if (loading || league === undefined || joining) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">
            {joining ? "리그에 들어가는 중이에요..." : "초대 링크를 확인하고 있어요..."}
          </span>
        </div>
      </div>
    );
  }

  // 리그가 없거나 주소가 깨졌으면 로그인을 시키기 전에 알려 준다.
  if (!league) {
    return (
      <JoinCard title="초대 링크가 맞지 않아요">
        <p className="text-sm text-muted-foreground leading-relaxed">
          리그가 지워졌거나 링크가 잘렸어요. 초대한 선생님께 링크를 다시 받아 주세요.
        </p>
        <Button onClick={goHome} size="lg" className="mt-5 w-full font-black">첫 화면으로</Button>
      </JoinCard>
    );
  }

  const isSchool = league.leagueType === "school";
  const leagueLabel = league.name ? `‘${league.name}’` : "이 리그";

  // If not logged in, prompt login
  if (!supabaseSession) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center">
        <div className="w-full max-w-md p-4 text-center">
          <div className="bg-amber-500/10 border border-amber-500/30 text-foreground rounded-xl p-4 mb-4 text-xs">
            <strong>{leagueLabel}</strong> 초대 링크예요. 들어가려면 먼저 구글 계정으로 로그인해 주세요.
          </div>
        </div>
        <Login schoolMode={isSchool} />
      </div>
    );
  }

  return (
    <JoinCard title={`${leagueLabel}에 들어갈까요?`}>
      {isSchool ? (
        <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>
            들어가면 <b className="text-foreground">공동 관리자</b>가 되어 경기 결과를 넣고 학생 명단을 볼 수 있어요.
          </p>
          <p>초대받은 선생님만 들어가 주세요. 학생은 들어갈 수 없어요.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">
          참가자로 들어가 순위표와 내 기록을 볼 수 있어요.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        로그인한 계정: <span className="font-bold text-foreground">{supabaseSession.user?.email ?? "알 수 없음"}</span>
      </p>

      {joinError && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive leading-relaxed">
          들어가지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.
          <span className="mt-1 block opacity-70">({joinError})</span>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button onClick={goHome} variant="outline" size="lg" className="font-bold">그만두기</Button>
        <Button onClick={handleJoinClass} size="lg" className="font-black">
          {joinError ? "다시 시도" : "들어가기"}
        </Button>
      </div>
    </JoinCard>
  );
}

function JoinCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
        <h1 className="mb-3 text-lg font-black text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}
