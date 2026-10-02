import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ScoreBoard } from "./ScoreBoard";
import { apiFetchScoreInputView, apiSubmitScoreInput } from "@/services/league-api";
import { cn } from "@/lib/utils";
import {
  Shell, Note, SectionTitle, IconBtn, Queue, TierGroups,
  type ClassView, type QueueRow,
} from "./ClassroomView";

/**
 * 점수입력판 — 학생이 QR(열쇠 링크)로 들어와 대기열 경기 결과를 넣는다.
 *
 * 교실 화면(ClassroomView)과 같은 대기열·등급을 쓰고, 넣을 수 있는 줄에 [점수 넣기]만 더한다.
 * 줄을 누르면 점수판(ScoreBoard, 점수판 웹의 일반 모드)이 화면 가득 열리고, [경기 끝]으로 기록한다.
 * 실시간 연결도 자동 반복 조회도 없다 — 열 때·[새로고침]·입력 직후·화면으로 돌아올 때만 읽는다.
 * (수파베이스 동시 접속 한도. docs/PLAN-student-input.md)
 *
 * 점수만 보낸다. RP 는 서버가 교사 태블릿과 같은 코드로 계산한다.
 */

type InputView = { state: "closed" } | { state: "open"; view: ClassView; rows: { id: string; seq: number }[] };
type Done = { names: string; delta: number | null; won: boolean }[];

export function ScoreInputView({ inputKey }: { inputKey: string }) {
  const [data, setData] = useState<InputView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<QueueRow | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: d, error: e } = DEMO(inputKey) ? { data: demoView(), error: null } : await apiFetchScoreInputView(inputKey);
    if (e) setError("불러오지 못했어요. 새로고침을 눌러 주세요.");
    else setData(d as InputView);
    setLoading(false);
  }, [inputKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const idBySeq = useMemo(() => {
    const m = new Map<number, string>();
    if (data?.state === "open") for (const r of data.rows) m.set(r.seq, r.id);
    return m;
  }, [data]);
  const pickable = useMemo(() => new Set(idBySeq.keys()), [idBySeq]);

  if (loading && !data) return <Shell><Note>불러오는 중…</Note></Shell>;
  if (error && !data) return <Shell><Note tone="bad">{error}</Note></Shell>;
  if (!data || data.state === "closed") {
    return (
      <Shell>
        <h1 className="text-2xl font-black text-foreground">점수입력판</h1>
        <Note>입력이 닫혔어요. 선생님께 새 QR을 받아 주세요.</Note>
      </Shell>
    );
  }

  const view = data.view;
  const inSession = view.state === "session";
  const queue = view.queue ?? [];

  return (
    <Shell wide>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight text-foreground lg:text-3xl xl:text-4xl">
            점수입력판
          </h1>
          <p className="mt-1 text-sm font-bold text-muted-foreground lg:text-base xl:text-lg">
            {view.class_label || view.league_name} · 우리 경기를 눌러 점수를 넣어요
          </p>
        </div>
        <IconBtn label="새로고침" onClick={() => load()}>
          <RefreshCw className={cn("size-5", loading && "animate-spin")} />
        </IconBtn>
      </header>

      <div className="lg:grid lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-8">
        <section className="mb-7 lg:mb-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <SectionTitle>대기열</SectionTitle>
          {inSession ? (
            <Queue rows={queue} courts={!!view.court_count} pickable={pickable}
              onPick={(seq) => { setDone(null); setPicked(queue.find((r) => r.seq === seq) ?? null); }} />
          ) : (
            <Note>지금 진행 중인 수업이 없어요.</Note>
          )}
        </section>
        <section className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <SectionTitle hint="막대가 차면 다음 등급">오늘 등급</SectionTitle>
          <TierGroups
            players={view.players ?? []}
            thresholds={view.tier_thresholds ?? undefined}
            placement={view.placement ?? undefined}
            pref={{ follow: true }}
            wide={false}
          />
        </section>
      </div>

      {picked && picked.seq != null && idBySeq.get(picked.seq) && (
        <ScoreBoard
          rowId={idBySeq.get(picked.seq)!}
          seq={picked.seq}
          nameA={picked.team_a.join("·")}
          nameB={picked.team_b.join("·")}
          onClose={() => setPicked(null)}
          onSubmit={async (scoreA, scoreB) => {
            const { data: r, error: e } = DEMO(inputKey)
              ? { data: { ok: true as const, aWon: scoreA > scoreB, deltaA: [scoreA > scoreB ? 24 : -8, null], deltaB: [scoreA > scoreB ? -8 : 24, null] }, error: null }
              : await apiSubmitScoreInput({ key: inputKey, scheduledId: idBySeq.get(picked.seq!)!, scoreA, scoreB });
            if (e || !r) return e?.message ?? "저장하지 못했어요.";
            setDone([
              { names: picked.team_a.join("·"), delta: r.deltaA[0], won: r.aWon },
              { names: picked.team_b.join("·"), delta: r.deltaB[0], won: !r.aWon },
            ]);
            setPicked(null);
            load();
            return null;
          }}
        />
      )}
      {done && <DoneCard done={done} onClose={() => setDone(null)} />}
    </Shell>
  );
}

function DoneCard({ done, onClose }: { done: Done; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-background p-6 text-center shadow-2xl">
        <p className="text-2xl font-black text-neon-green">기록했어요!</p>
        <div className="mt-4 space-y-2">
          {done.map((d) => (
            <p key={d.names} className="text-lg font-bold text-foreground">
              {d.names} {d.won ? "승" : "패"}
              {d.delta != null && (
                <span className={cn("ml-2 font-black tabular-nums", d.delta >= 0 ? "text-neon-green" : "text-destructive")}>
                  {d.delta >= 0 ? `+${d.delta}` : d.delta}
                </span>
              )}
            </p>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-neon-blue py-4 text-lg font-black text-background">
          확인
        </button>
      </div>
    </div>
  );
}

/* ── 개발용 가짜 데이터 — 개발 서버에서 /input?k=demo 일 때만. 배포 빌드에는 DEV=false 라 안 쓰인다. ── */
const DEMO = (k: string) => import.meta.env.DEV && k === "demo";
function demoView(): InputView {
  const p = (id: string, name: string, rp: number, w: number, l: number, t: number) =>
    ({ id, name, rp, wins: w, losses: l, grade: 5, class_num: 1, student_no: null, today_plays: t });
  return {
    state: "open",
    rows: [{ id: "r7", seq: 7 }, { id: "r8", seq: 8 }, { id: "r9", seq: 9 }],
    view: {
      state: "session", league_name: "데모 리그", class_label: "5학년 1반", court_count: 2,
      tier_thresholds: { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 },
      queue: [
        { seq: 7, court: "1", team_a: ["가온"], team_b: ["나래"], pool: [] },
        { seq: 8, court: "2", team_a: ["다솜"], team_b: ["라온"], pool: [] },
        { seq: 9, court: null, team_a: ["마루"], team_b: ["바다"], pool: [] },
      ],
      players: [p("1", "가*", 1250, 5, 2, 2), p("2", "나*", 1080, 3, 3, 1), p("3", "다*", 990, 2, 4, 1), p("4", "라*", 1010, 3, 2, 1)],
    },
  };
}
