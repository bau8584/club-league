import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "sonner";
import { Login } from "../components/Login";

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

function JoinRouteComponent() {
  const { classId } = Route.useSearch();
  const navigate = useNavigate();
  const [supabaseSession, setSupabaseSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

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

  useEffect(() => {
    if (!loading && supabaseSession && classId) {
      handleJoinClass();
    }
  }, [loading, supabaseSession, classId]);

  const handleJoinClass = async () => {
    if (joining) return;
    setJoining(true);
    try {
      // 안전한 참가: RLS를 우회하는 join_league RPC로 본인만 멤버에 추가.
      const { data, error: joinErr } = await supabase.rpc("join_league", { p_class_id: classId });
      if (joinErr) throw joinErr;

      const row = Array.isArray(data) ? data[0] : data;
      toast.success(row?.is_owner ? "이 리그의 개설자입니다. 대시보드로 이동합니다." : "리그에 참여했습니다!");

      // Navigate to the class dashboard
      navigate({ to: `/class/${classId}` });
    } catch (err: any) {
      console.error("Error joining league:", err.message);
      toast.error("초대 수락 중 오류가 발생했습니다: " + err.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading || (supabaseSession && joining)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">
            기록원 초대 코드를 확인하고 있습니다...
          </span>
        </div>
      </div>
    );
  }

  // If not logged in, prompt login
  if (!supabaseSession) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center">
        <div className="w-full max-w-md p-4 text-center">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-xl p-4 mb-4 text-xs">
            ⚠️ <strong>로그인 필요</strong>: 초대 링크를 수락하려면 구글 계정 로그인이 필요합니다.
          </div>
        </div>
        <Login />
      </div>
    );
  }

  return null;
}
