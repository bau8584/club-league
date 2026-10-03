import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ListOrdered, RotateCcw, X } from "lucide-react";
import { ScoreBoard, TEAM_A, TEAM_B } from "./ScoreBoard";
import { apiFetchScoreInputView, apiSubmitScoreInput } from "@/services/league-api";
import { cn } from "@/lib/utils";
import { buildMatchReceipt } from "@/domain/match-receipt";
import { MatchResultModal, type MatchResultData } from "@/components/league/MatchResultModal";
import { Shell, Note, SectionTitle, Queue, TierGroups, type ClassView, type QueueRow } from "./ClassroomView";

/**
 * 점수입력판 — 학생이 QR(열쇠 링크)로 들어와 경기 결과를 넣는다. (docs/PLAN-student-input.md)
 *
 * 흐름: 누구 경기인지 먼저 고른다(대기열 줄 또는 반 명단에서 직접) → 그 이름이 붙은 점수판(0:0) → [경기 끝] → 확인 → [기록] → 다시 고르기.
 * (실측 1차 2026-10-02: 점수판 먼저 → 나중에 고르기는 헷갈려서 버렸다. 대기열·출석을 안 쓰는 반도 쓸 수 있게 직접 고르기를 둔다.)
 *
 * 실시간 연결도 자동 반복 조회도 없다 — 열 때·새로고침 버튼·입력 직후·화면으로 돌아올 때만 읽는다(동시 접속 한도).
 * 점수와 학생만 보낸다. RP 는 서버가 교사 태블릿과 같은 코드로 계산한다.
 */

type RosterP = { id: string; name: string; grade: number | null; class_num: number | null; student_no: number | null };
type Row = { id: string; seq: number };
type InputView = { state: "closed" } | { state: "open"; view: ClassView; rows: Row[]; roster?: RosterP[] };
type Done = { names: string; delta: number | null; won: boolean }[];
/** 기록할 경기 — 팀 A·팀 B. 대기열 줄이면 scheduledId 가 있다. */
type Pick = { scheduledId: string | null; seq: number | null; /** 대기열 줄과 팀 A·B가 뒤집혔나(화면 팀 A = 줄의 team_b) */ flip?: boolean; red: { ids?: string[]; names: string[] }; blue: { ids?: string[]; names: string[] } };

// 경기 중인 팀과 점수를 기기에 저장한다 — 태블릿이 잠들거나 새로고침돼도 그 경기로 돌아온다.
// (옛 키 score-input:board 는 이름 없는 점수만 있어 읽지 않는다 → 새 흐름은 언제나 고르기부터.)
const SAVE_KEY = "score-input:match";
type Saved = { pick: Pick; score: [number, number] } | null;
const readSaved = (): Saved => {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (v && v.pick && Array.isArray(v.score) && v.score.length === 2)
      return { pick: v.pick as Pick, score: [Number(v.score[0]) || 0, Number(v.score[1]) || 0] };
  } catch { /* 없으면 고르기부터 */ }
  return null;
};

export function ScoreInputView({ inputKey }: { inputKey: string }) {
  const [data, setData] = useState<InputView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved] = useState<Saved>(readSaved);
  const [match, setMatch] = useState<Pick | null>(saved?.pick ?? null);
  const [[a, b], setScore] = useState<[number, number]>(saved?.score ?? [0, 0]);
  const [panel, setPanel] = useState<null | "end" | "queue">(null);
  const [done, setDone] = useState<Done | null>(null);
  // 교사 화면과 같은 결과 영수증 창. 서버가 영수증을 돌려주면 이걸, 아니면 간단한 창(DoneCard)을 띄운다.
  const [receipt, setReceipt] = useState<MatchResultData | null>(null);

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(match ? { pick: match, score: [a, b] } : null)); } catch { /* 무시 */ }
  }, [match, a, b]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: d, error: e } = DEMO(inputKey) ? { data: demoView(), error: null } : await apiFetchScoreInputView(inputKey);
    if (e) setError("불러오지 못했어요. 잠시 뒤 다시 열어 주세요.");
    else setData(d as InputView);
    setLoading(false);
  }, [inputKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

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

  const start = (p: Pick) => { setMatch(p); setScore([0, 0]); setPanel(null); };

  const submit = async (p: Pick): Promise<string | null> => {
    // 대기열 줄은 서버가 줄의 팀 순서(A = team_a)로 받는다. 화면 팀 A가 team_b 면 점수를 뒤집어 보낸다.
    const [sa, sb] = p.scheduledId && p.flip ? [b, a] : [a, b];
    const body = p.scheduledId
      ? { key: inputKey, scheduledId: p.scheduledId, scoreA: sa, scoreB: sb }
      : { key: inputKey, teamA: p.red.ids!, teamB: p.blue.ids!, scoreA: a, scoreB: b };
    const { data: r, error: e } = DEMO(inputKey)
      ? { data: { ok: true as const, aWon: sa > sb, deltaA: [sa > sb ? 24 : -8, null], deltaB: [sa > sb ? -8 : 24, null], receipt: demoReceipt(sa > sb, Math.max(a, b), Math.min(a, b)) }, error: null }
      : await apiSubmitScoreInput(body);
    if (e || !r) return e?.message ?? "저장하지 못했어요.";
    const flip = !!(p.scheduledId && p.flip);
    if ((r as { receipt?: unknown }).receipt) setReceipt((r as { receipt?: unknown }).receipt as MatchResultData);
    else
    setDone([
      { names: p.red.names.join("·"), delta: (flip ? r.deltaB : r.deltaA)[0], won: a > b },
      { names: p.blue.names.join("·"), delta: (flip ? r.deltaA : r.deltaB)[0], won: b > a },
    ]);
    setMatch(null);
    setScore([0, 0]);
    setPanel(null);
    load();
    return null;
  };

  const queuePanel = panel === "queue" && (
    <Sheet title="대기열 · 오늘 등급" onClose={() => setPanel(null)}>
      <SectionTitle>대기열</SectionTitle>
      <Queue rows={data.view.queue ?? []} courts={!!data.view.court_count} />
      <div className="mt-6">
        <SectionTitle hint="막대가 차면 다음 등급">등급</SectionTitle>
        <TierGroups players={data.view.players ?? []} thresholds={data.view.tier_thresholds ?? undefined}
          placement={data.view.placement ?? undefined} pref={{ follow: true }} wide={false} />
      </div>
    </Sheet>
  );
  const result = receipt ? (
    <MatchResultModal resultData={receipt} thresholds={data.view.tier_thresholds ?? undefined}
      genderEnabled={false} closeLabel="확인" onClose={() => setReceipt(null)} />
  ) : done && <DoneCard done={done} onClose={() => setDone(null)} />;

  // 1단계 — 누구 경기예요?
  if (!match) {
    return (
      <>
        <PickScreen data={data} onPick={start} onRefresh={load} onShowQueue={() => { load(); setPanel("queue"); }} />
        {queuePanel}
        {result}
      </>
    );
  }

  // 2단계 — 이름이 붙은 점수판
  const pill = "rounded-full bg-black/35 px-4 py-3 text-base font-black text-white backdrop-blur active:scale-95";
  return (
    <>
      <ScoreBoard
        a={a} b={b} nameA={match.red.names.join("·")} nameB={match.blue.names.join("·")}
        onAdd={(team, d) => setScore(([x, y]) => {
          const c = (n: number) => Math.max(0, Math.min(999, n));
          return team === 0 ? [c(x + d), y] : [x, c(y + d)];
        })}
        top={<>
          <button type="button" aria-label="다시 고르기" className={cn(pill, "px-3")}
            onClick={() => { if (a + b === 0 || confirm("이 경기를 지우고 다시 고를까요?")) { setMatch(null); setScore([0, 0]); } }}>
            <X className="size-5" />
          </button>
          <button type="button" aria-label="양쪽 자리 바꾸기" className={cn(pill, "px-3")}
            onClick={() => { setMatch({ ...match, red: match.blue, blue: match.red, flip: !match.flip }); setScore(([x, y]) => [y, x]); }}>
            <ArrowLeftRight className="size-5" />
          </button>
          <button type="button" aria-label="점수 0으로" className={cn(pill, "px-3")}
            onClick={() => { if (confirm("점수를 0:0으로 되돌릴까요?")) setScore([0, 0]); }}>
            <RotateCcw className="size-5" />
          </button>
          <button type="button" onClick={() => setPanel("end")}
            className="rounded-full bg-white px-5 py-3 text-base font-black text-black shadow-lg active:scale-95">
            경기 끝
          </button>
        </>}
      />
      {panel === "end" && <ConfirmEnd a={a} b={b} pick={match} onClose={() => setPanel(null)} onSubmit={submit} />}
      {result}
    </>
  );
}

/* ── 1단계: 누구 경기예요? — 대기열 줄 누르기 또는 직접 고르기 ───── */

function PickScreen({ data, onPick, onRefresh, onShowQueue }: {
  data: Extract<InputView, { state: "open" }>;
  onPick: (p: Pick) => void;
  onRefresh: () => void;
  onShowQueue: () => void;
}) {
  const [mode, setMode] = useState<"queue" | "direct">((data.rows.length ? "queue" : "direct"));
  const queueBySeq = useMemo(() => {
    const m = new Map<number, QueueRow>();
    for (const r of data.view.queue ?? []) if (r.seq != null) m.set(r.seq, r);
    return m;
  }, [data]);

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-foreground">누구 경기예요?</h1>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} aria-label="새로고침"
            className="rounded-full border border-border/50 p-2.5 text-muted-foreground active:scale-95"><RotateCcw className="size-5" /></button>
          <button type="button" onClick={onShowQueue}
            className="flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-2 text-sm font-bold text-muted-foreground active:scale-95">
            <ListOrdered className="size-4" /> 대기열·등급
          </button>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-input/50 p-1">
        {(["queue", "direct"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn("rounded-lg py-2.5 text-sm font-black", mode === m ? "bg-background text-foreground shadow" : "text-muted-foreground")}>
            {m === "queue" ? `대기열에서 (${data.rows.length})` : "직접 고르기"}
          </button>
        ))}
      </div>

      {mode === "queue" ? (
        data.rows.length === 0 ? (
          <Note>대기열에 넣을 수 있는 경기가 없어요. [직접 고르기]를 눌러 주세요.</Note>
        ) : (
          <div className="space-y-2">
            {data.rows.map((r) => {
              const q = queueBySeq.get(r.seq);
              if (!q) return null;
              return (
                <button key={r.id} type="button"
                  onClick={() => onPick({ scheduledId: r.id, seq: r.seq, red: { names: q.team_a }, blue: { names: q.team_b } })}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-input/40 px-3 py-4 text-left active:scale-[0.99]">
                  <span className="w-12 text-center text-xl font-black text-neon-blue">#{r.seq}</span>
                  <span className="flex-1 text-lg font-bold">{q.team_a.join("·")} <span className="mx-1 text-xs text-muted-foreground">vs</span> {q.team_b.join("·")}</span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <DirectPick roster={data.roster ?? []} onDone={(red, blue) => onPick({ scheduledId: null, seq: null, red, blue })} />
      )}
    </Shell>
  );
}

/* ── 3단계: 경기 끝 → 확인 → 기록 ─────────────────────────── */

function ConfirmEnd({ a, b, pick, onClose, onSubmit }: {
  a: number; b: number; pick: Pick;
  onClose: () => void;
  onSubmit: (p: Pick) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (a === b) {
    return (
      <Sheet title="경기 끝" onClose={onClose}>
        <Note tone="bad">비긴 점수는 기록할 수 없어요. 점수판에서 점수를 고쳐 주세요.</Note>
      </Sheet>
    );
  }

  const save = async () => {
    setBusy(true); setMsg(null);
    const err = await onSubmit(pick);
    if (err) { setMsg(err); setBusy(false); }
  };
  return (
    <Sheet title="이대로 기록할까요?" onClose={busy ? undefined : onClose} back>
      <div className="grid grid-cols-2 items-center gap-3 text-center">
        <TeamCard color={TEAM_A} label={a > b ? "승" : "패"} names={pick.red.names} score={a} />
        <TeamCard color={TEAM_B} label={b > a ? "승" : "패"} names={pick.blue.names} score={b} />
      </div>
      {msg && <p className="mt-4 text-center text-sm font-bold text-destructive">{msg}</p>}
      <button type="button" onClick={save} disabled={busy}
        className={cn("mt-6 w-full rounded-xl py-4 text-lg font-black", busy ? "bg-muted text-muted-foreground" : "bg-neon-blue text-background")}>
        {busy ? "기록 중…" : "기록"}
      </button>
    </Sheet>
  );
}

/* ── 직접 고르기 — 반 → 팀 A 1~2명 → 팀 B 1~2명 ──────────── */

function DirectPick({ roster, onDone }: {
  roster: RosterP[];
  onDone: (red: { ids: string[]; names: string[] }, blue: { ids: string[]; names: string[] }) => void;
}) {
  const classes = useMemo(() => {
    const seen = new Map<string, { grade: number | null; class_num: number | null }>();
    for (const p of roster) seen.set(`${p.grade}-${p.class_num}`, { grade: p.grade, class_num: p.class_num });
    return [...seen.entries()];
  }, [roster]);
  const [cls, setCls] = useState<string | null>(classes.length === 1 ? classes[0][0] : null);
  const [red, setRed] = useState<string[]>([]);
  const [blue, setBlue] = useState<string[]>([]);
  const [side, setSide] = useState<"red" | "blue">("red");

  const label = (g: number | null, c: number | null) => (g && c ? `${g}-${c}반` : g ? `${g}학년` : "명단");
  const people = roster.filter((p) => `${p.grade}-${p.class_num}` === cls);
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.name ?? "?";

  if (!cls) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {classes.map(([k, v]) => (
          <button key={k} type="button" onClick={() => setCls(k)}
            className="rounded-xl border border-border/40 bg-input/40 py-4 text-lg font-black active:scale-95">
            {label(v.grade, v.class_num)}
          </button>
        ))}
      </div>
    );
  }

  const toggle = (id: string) => {
    if (red.includes(id)) { setRed(red.filter((x) => x !== id)); return; }
    if (blue.includes(id)) { setBlue(blue.filter((x) => x !== id)); return; }
    // 팀 A 첫 명을 고르면 팀 B로 넘어간다(단식이 흔하다). 복식이면 팀 A 칸을 다시 눌러 한 명 더.
    if (side === "red" && red.length < 2) { setRed([...red, id]); if (blue.length === 0) setSide("blue"); }
    else if (side === "blue" && blue.length < 2) setBlue([...blue, id]);
  };

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["red", "blue"] as const).map((s) => {
          const ids = s === "red" ? red : blue;
          return (
            <button key={s} type="button" onClick={() => setSide(s)}
              className={cn("rounded-xl border-2 px-3 py-3 text-left", side === s ? "" : "opacity-60")}
              style={{ borderColor: s === "red" ? TEAM_A : TEAM_B }}>
              <p className="text-xs font-black" style={{ color: s === "red" ? TEAM_A : TEAM_B }}>
                {s === "red" ? "팀 A" : "팀 B"} {side === s && "← 고르는 중"}
              </p>
              <p className="mt-1 min-h-6 text-base font-bold">{ids.length ? ids.map(nameOf).join("·") : "1~2명"}</p>
            </button>
          );
        })}
      </div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => { setCls(null); setRed([]); setBlue([]); setSide("red"); }}
          className="text-sm font-bold text-muted-foreground underline">{label(people[0]?.grade ?? null, people[0]?.class_num ?? null)} · 반 바꾸기</button>
      </div>
      <div className="grid max-h-[40vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {people.map((p) => {
          const onRed = red.includes(p.id), onBlue = blue.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)}
              className={cn("rounded-xl border px-2 py-3 text-base font-bold",
                onRed || onBlue ? "text-white" : "border-border/40 bg-input/40")}
              style={onRed ? { background: TEAM_A, borderColor: TEAM_A } : onBlue ? { background: TEAM_B, borderColor: TEAM_B } : undefined}>
              {p.student_no ? <span className="mr-1 text-xs opacity-70">{p.student_no}</span> : null}{p.name}
            </button>
          );
        })}
      </div>
      <button type="button" disabled={!red.length || !blue.length}
        onClick={() => onDone({ ids: red, names: red.map(nameOf) }, { ids: blue, names: blue.map(nameOf) })}
        className={cn("mt-4 w-full rounded-xl py-4 text-lg font-black",
          red.length && blue.length ? "bg-neon-blue text-background" : "bg-muted text-muted-foreground")}>
        다음
      </button>
    </div>
  );
}

/* ── 작은 조각들 ─────────────────────────────────────── */

function Sheet({ title, onClose, back, children }: { title: string; onClose?: () => void; back?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border/40 bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label={back ? "뒤로" : "닫기"} className="text-muted-foreground">
              {back ? <span className="text-sm font-bold">← 뒤로</span> : <X className="size-6" />}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function TeamCard({ color, label, names, score }: { color: string; label: string; names: string[]; score: number }) {
  return (
    <div className="rounded-xl border-2 p-3" style={{ borderColor: color }}>
      <p className="text-xs font-black" style={{ color }}>{label}</p>
      <p className="mt-1 text-lg font-black text-foreground">{names.join("·")}</p>
      <p className="mt-1 text-4xl font-black tabular-nums" style={{ color }}>{score}</p>
    </div>
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
        <p className="mt-3 text-xs text-muted-foreground">점수판은 0:0으로 돌아갔어요.</p>
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
  const names = ["가온", "나래", "다솜", "라온", "마루", "바다", "사랑", "아라"];
  return {
    state: "open",
    rows: [{ id: "r7", seq: 7 }, { id: "r8", seq: 8 }],
    roster: names.map((n, i) => ({ id: `p${i}`, name: n, grade: 5, class_num: i < 6 ? 1 : 2, student_no: i + 1 })),
    view: {
      state: "session", league_name: "데모 리그", class_label: "5학년 1반", court_count: 2,
      tier_thresholds: { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 },
      queue: [
        { seq: 7, court: "1", team_a: ["가온"], team_b: ["나래"], pool: [] },
        { seq: 8, court: "2", team_a: ["다솜"], team_b: ["라온"], pool: [] },
      ],
      players: [p("1", "가*", 1250, 5, 2, 2), p("2", "나*", 1080, 3, 3, 1)],
    },
  };
}
function demoReceipt(_aWon: boolean, ws: number, ls: number) {
  const st = (id: string, name: string, rp: number) => ({ id, name, nickname: name, group: null, gender: "U" as const, rp, wins: 2, losses: 1, recent: [], currentStreak: 1 });
  const ps = (id: string, delta: number) => ({ id, delta, firstWinBonus: delta > 0 ? 10 : 0, streakBonus: delta > 0 ? 5 : 0 });
  return buildMatchReceipt({
    students: [st("w", "나래", 1190), st("l", "가온", 1010)] as never,
    playerStats: [ps("w", 24), ps("l", -8)] as never,
    winnerId: "w", winner2Id: null, loserId: "l", loser2Id: null, winnerScore: ws, loserScore: ls, aWon: true,
    thresholds: { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 }, placement: { enabled: false, games: 3 },
  });
}
