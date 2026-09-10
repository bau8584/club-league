import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchClassOptionsPublic, apiFetchClassViewPublic } from "@/services/league-api";
import { cn } from "@/lib/utils";
import {
  getTier, isUnranked, nextStepGap, TIER_ORDER, TIER_STYLES, type TierName,
} from "@/lib/league-types";
import { RefreshCw, SlidersHorizontal, Radio } from "lucide-react";

/**
 * 교실 화면 — 로그인 없이 대기열과 등급을 본다.
 *
 * 지금 아이들이 몰려와 보는 태블릿은 교사 계정으로 로그인돼 있어, 아이 누구나 대진을
 * 지울 수 있고 명단 관리·리그 설정까지 열려 있다. 여기엔 그런 버튼이 없다.
 *
 * 순위 숫자를 매기지 않고 등급으로 묶는다. 한 반이 26명이라 "26등"은 태블릿 앞에 몰려선
 * 스물여섯 명 모두가 보는 꼴찌가 된다. 500명 중 400등이 흐릿한 것과 다르다.
 * 대신 다음 단계까지 남은 점수와 오늘 판 수를 보여준다 —
 * **위치는 숨기고 거리는 보여준다.** 거리는 자기 얘기이고 오늘 한 판으로 줄어든다.
 *
 * 화면은 두 벌이다. 폰은 한 줄로 세우고, 태블릿·데스크톱은 좌우로 나눠 **대기열과 등급이
 * 한 화면에 같이** 있게 한다. 교실 태블릿은 아이들이 스크롤하지 않고 지나가며 보는
 * 물건이라, 스크롤해야 보이는 정보는 없는 것과 같다.
 */

type QueueRow = { seq: number | null; team_a: string[]; team_b: string[]; pool: string[] };
type ViewPlayer = {
  id: string; name: string | null; rp: number; wins: number; losses: number;
  grade: number | null; class_num: number | null; student_no: number | null; today_plays: number;
};
type ClassView = {
  state: "session" | "other_session" | "idle" | "need_input" | "not_found";
  league_name?: string;
  class_label?: string | null;
  tier_thresholds?: Record<TierName, number> | null;
  placement?: { enabled?: boolean; games?: number } | null;
  queue?: QueueRow[];
  players?: ViewPlayer[];
};
type ClassOption = { grade: number; class_num: number; player_count: number };

/**
 * 무엇을 볼지. 브라우저에만 남는다.
 *
 * `follow`가 선생님 화면이다 — 반을 고르지 않고 **지금 수업 중인 반을 계속 따라간다.**
 * 반을 골라 고정해두면 태블릿이 다음 교시에 엉뚱한 반을 보여준다. 교실에 걸어두고
 * 잊는 물건이 되려면 따라가는 쪽이 기본이어야 한다.
 */
type Pref = { follow: boolean; grade?: number; classNum?: number; studentNo?: number };
const prefKeyOf = (classId: string) => `classroom-pref:${classId}`;

function readPref(classId: string): Pref | null {
  try {
    const raw = localStorage.getItem(prefKeyOf(classId));
    return raw ? (JSON.parse(raw) as Pref) : null;
  } catch {
    return null;
  }
}
function writePref(classId: string, p: Pref) {
  try { localStorage.setItem(prefKeyOf(classId), JSON.stringify(p)); }
  catch { /* 비공개 모드 등 — 저장 못 해도 화면은 돌아야 한다 */ }
}

// 수업 중에는 대기열이 자주 바뀐다. 로그인이 없어 실시간 구독을 못 쓰므로(구독은 인증을
// 요구한다) 주기적으로 다시 읽는다. 아이가 새로고침을 누르지 않아도 따라오게.
const POLL_MS = 15000;

export function ClassroomView({ classId, ownerId }: { classId: string; ownerId?: string | null }) {
  // 주소에 선생님이 들어 있으면(교실 화면) 기본이 "따라가기"다.
  const [pref, setPref] = useState<Pref>(() => readPref(classId) ?? { follow: !!ownerId });
  const [view, setView] = useState<ClassView | null>(null);
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const askGrade = pref.follow ? null : pref.grade ?? null;
  const askClass = pref.follow ? null : pref.classNum ?? null;

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await apiFetchClassViewPublic({
        classId, ownerId, grade: askGrade, classNum: askClass,
      });
      if (err) throw err;
      setView(data as ClassView);
    } catch (e: any) {
      setError(e?.message || "불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [classId, ownerId, askGrade, askClass]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (view?.state !== "need_input" && !pickerOpen) return;
    if (options.length) return;
    apiFetchClassOptionsPublic(classId).then(({ data }) => setOptions((data || []) as ClassOption[]));
  }, [view?.state, pickerOpen, options.length, classId]);

  const savePref = (next: Pref) => { setPref(next); writePref(classId, next); setPickerOpen(false); };

  if (loading && !view) return <Shell><Note>불러오는 중…</Note></Shell>;
  if (error) return <Shell><Note tone="bad">{error}</Note></Shell>;
  if (!view || view.state === "not_found") return <Shell><Note>리그를 찾을 수 없어요.</Note></Shell>;

  if (view.state === "need_input" || pickerOpen) {
    return (
      <Shell>
        <Picker
          options={options}
          pref={pref}
          canFollow={!!ownerId}
          onSave={savePref}
          onCancel={view.state === "need_input" ? undefined : () => setPickerOpen(false)}
        />
      </Shell>
    );
  }

  const inSession = view.state === "session";
  const players = view.players ?? [];
  const queue = view.queue ?? [];

  return (
    <Shell wide>
      <header className="mb-4 flex items-start justify-between gap-3 lg:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-black tracking-tight text-foreground lg:text-3xl xl:text-4xl">
              {view.class_label || view.league_name}
            </h1>
            {pref.follow && (
              // 따라가는 중이라는 걸 화면에 남긴다. 안 보이면 태블릿이 어제 반에 멈춰 있어도 모른다.
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-neon-blue/15 px-2 py-0.5 text-[10px] font-black text-neon-blue lg:text-xs">
                <Radio className="size-3" /> 수업 따라가는 중
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-muted-foreground lg:text-base xl:text-lg">
            {inSession
              ? `수업 중 · ${players.length}명`
              : view.state === "other_session"
                ? "수업 진행 중이에요"
                : "오늘 수업은 끝났어요"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconBtn label="새로고침" onClick={() => load()}>
            <RefreshCw className={cn("size-5", loading && "animate-spin")} />
          </IconBtn>
          <IconBtn label="무엇을 볼지 고르기" onClick={() => setPickerOpen(true)}>
            <SlidersHorizontal className="size-5" />
          </IconBtn>
        </div>
      </header>

      {/*
        폰은 위아래, 태블릿·데스크톱은 좌우. 넓은 화면에서는 각 칸이 따로 스크롤해서
        머리말이 늘 보이고, 대기열과 등급이 한눈에 같이 들어온다.
      */}
      <div className="lg:grid lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        {inSession && (
          <section className="mb-7 lg:mb-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <SectionTitle>대기열</SectionTitle>
            <Queue rows={queue} />
          </section>
        )}
        <section className={cn("lg:min-h-0 lg:overflow-y-auto lg:pr-1", !inSession && "lg:col-span-2")}>
          {/*
            `+23`이 뭔지 한 줄로 알린다. 줄마다 "다음까지"를 스물일곱 번 되풀이하는 대신
            머리말에서 한 번 말한다 — 되풀이하면 정작 중요한 이름이 밀린다.
          */}
          <SectionTitle hint="숫자는 다음 등급까지 남은 점수예요">
            {inSession ? "오늘 등급" : "등급"}
          </SectionTitle>
          <TierGroups
            players={players}
            thresholds={view.tier_thresholds ?? undefined}
            placement={view.placement ?? undefined}
            pref={pref}
            wide={!inSession}
          />
        </section>
      </div>
    </Shell>
  );
}

/* ── 뼈대 ────────────────────────────────────────────── */

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(
      "mx-auto min-h-screen w-full px-4 py-5 lg:h-screen lg:overflow-hidden lg:px-8 lg:py-5",
      wide ? "max-w-lg lg:max-w-[1600px]" : "max-w-lg",
    )}>
      {children}
    </div>
  );
}

const Note = ({ children, tone }: { children: React.ReactNode; tone?: "bad" }) => (
  <p className={cn("text-sm", tone === "bad" ? "text-destructive" : "text-muted-foreground")}>{children}</p>
);

const SectionTitle = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <div className="mb-2.5 flex items-baseline gap-2 lg:mb-3">
    <h2 className="text-sm font-black text-muted-foreground lg:text-base">{children}</h2>
    {hint && <span className="truncate text-[11px] text-muted-foreground/70 lg:text-xs">{hint}</span>}
  </div>
);

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="flex size-11 items-center justify-center rounded-xl border border-border/50 text-muted-foreground transition-colors hover:text-foreground lg:size-12">
      {children}
    </button>
  );
}

/* ── 대기열 — 여기만 실명이다 ────────────────────────── */

function Queue({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border/30 bg-input/40 px-3 py-5 text-center text-sm font-bold text-muted-foreground">
        아직 대진이 없어요.
      </p>
    );
  }
  return (
    <div className="space-y-2 lg:space-y-2.5">
      {rows.map((r, i) => {
        const confirmed = r.team_a.length > 0 && r.team_b.length > 0;
        return (
          <div key={r.seq ?? `x${i}`}
            className="flex items-center gap-3 rounded-xl border border-border/30 bg-input/40 px-3 py-3 lg:px-3.5 lg:py-3 xl:px-4 xl:py-4">
            {/* 번호가 이 줄의 이름이다. 아이가 "우리 7번"만 기억하면 되므로 크게. */}
            <span className="w-11 shrink-0 text-center text-xl font-black tabular-nums text-neon-blue lg:w-14 lg:text-2xl xl:w-16 xl:text-3xl">
              {r.seq == null ? "" : `#${r.seq}`}
            </span>
            <span className="min-w-0 flex-1 text-base font-bold leading-snug text-foreground lg:text-lg xl:text-2xl">
              {confirmed ? (
                <>
                  {r.team_a.join("·")}
                  <span className="mx-2 text-xs font-black text-muted-foreground lg:text-sm xl:text-base">vs</span>
                  {r.team_b.join("·")}
                </>
              ) : (
                r.pool.join(" · ")
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 등급 묶음 — 순위 숫자가 없다 ────────────────────── */

function TierGroups({
  players, thresholds, placement, pref, wide,
}: {
  players: ViewPlayer[];
  thresholds?: Record<TierName, number>;
  placement?: { enabled?: boolean; games?: number };
  pref: Pref;
  /** 대기열이 없어 등급이 화면을 다 쓰는가 — 그러면 더 여러 칸으로 늘어놓는다. */
  wide?: boolean;
}) {
  const placementEnabled = !!placement?.enabled;
  const placementGames = placement?.games ?? 0;

  const { groups, unranked } = useMemo(() => {
    const g = new Map<TierName, ViewPlayer[]>();
    const un: ViewPlayer[] = [];
    // 묶음 안은 번호순이다. 점수순으로 놓으면 등급으로 묶은 의미가 없어지고,
    // 아이가 자기 줄을 찾는 단서도 번호다.
    const byNumber = (a: ViewPlayer, b: ViewPlayer) =>
      (a.student_no ?? Number.MAX_SAFE_INTEGER) - (b.student_no ?? Number.MAX_SAFE_INTEGER);
    for (const p of players) {
      if (isUnranked({ wins: p.wins, losses: p.losses }, placementEnabled, placementGames)) { un.push(p); continue; }
      const t = getTier(p.rp, thresholds);
      const list = g.get(t) ?? [];
      list.push(p);
      g.set(t, list);
    }
    for (const list of g.values()) list.sort(byNumber);
    un.sort(byNumber);
    return { groups: g, unranked: un };
  }, [players, thresholds, placementEnabled, placementGames]);

  if (players.length === 0) return <Note>아직 아무도 없어요.</Note>;

  const isMe = (p: ViewPlayer) =>
    !pref.follow && !!pref.studentNo && p.student_no === pref.studentNo
    && p.grade === pref.grade && p.class_num === pref.classNum;

  // 한 반이 26~28명이다. 넓은 화면에서는 스크롤 없이 다 들어가야 한다 —
  // 교실 태블릿은 지나가며 보는 물건이라, 스크롤해야 보이는 정보는 없는 것과 같다.
  const cols = wide
    ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    : "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="space-y-4">
      {TIER_ORDER.map((tier) => {
        const list = groups.get(tier);
        if (!list?.length) return null;
        const s = TIER_STYLES[tier];
        return (
          <div key={tier}>
            <div className="mb-2 flex items-center gap-2">
              {/* 묶음 머리글은 등급 이름만. 안쪽 칸(골드 3)은 순위처럼 읽혀서 뺀다. */}
              <span className={cn(
                "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-black ring-1 lg:text-sm",
                s.bg, s.text, s.ring,
              )}>
                {s.label}
              </span>
              <span className="text-xs font-bold text-muted-foreground lg:text-sm">{list.length}명</span>
            </div>
            <div className={cn("grid grid-cols-1 gap-1.5 lg:gap-1", cols)}>
              {list.map((p) => (
                <Row key={p.id} p={p} mine={isMe(p)}
                  trailing={<Gap n={nextStepGap(p.rp, thresholds)} />} />
              ))}
            </div>
          </div>
        );
      })}

      {unranked.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-muted/50 px-2.5 py-1 text-xs font-black text-muted-foreground ring-1 ring-border/50 lg:text-sm">
              아직 등급 없음
            </span>
            <span className="text-xs font-bold text-muted-foreground lg:text-sm">{unranked.length}명</span>
          </div>
          <div className={cn("grid grid-cols-1 gap-1.5 lg:gap-1", cols)}>
            {unranked.map((p) => {
              const left = Math.max(0, placementGames - (p.wins + p.losses));
              return (
                <Row key={p.id} p={p} mine={isMe(p)} trailing={
                  <span className="shrink-0 text-[11px] font-bold text-muted-foreground lg:text-sm">
                    {placementEnabled && left > 0 ? `${left}판 더` : "경기 전"}
                  </span>
                } />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 번호는 이름 앞에 붙인다. 한 반에 김○○ 이 셋이라 가린 이름만으로는 누군지 알 수 없다.
 * 순위처럼 읽히지 않게 흐리게 둔다 — 목록이 번호순이라 위에서부터 1, 2, 3 이 되는데
 * 이게 순위로 보이면 등급으로 묶은 이유가 사라진다.
 */
function Row({ p, mine, trailing }: { p: ViewPlayer; mine: boolean; trailing: React.ReactNode }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg px-2.5 py-2 lg:py-2.5 xl:gap-2.5 xl:px-3",
      mine ? "bg-neon-blue/10 ring-1 ring-neon-blue/40" : "bg-input/30",
    )}>
      <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground/60 xl:w-6 xl:text-sm">
        {p.student_no ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground lg:text-base xl:text-lg">
        {p.name || "?"}
      </span>
      {p.today_plays > 0 && (
        <span className="shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground lg:text-xs">
          {p.today_plays}판
        </span>
      )}
      {trailing}
    </div>
  );
}

const Gap = ({ n }: { n: number | null }) => (
  <span className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-muted-foreground lg:w-11 xl:w-14 lg:text-xs xl:text-sm">
    {n == null ? "최고" : `+${n}`}
  </span>
);

/* ── 무엇을 볼지 고르기 ──────────────────────────────── */

function Picker({
  options, pref, canFollow, onSave, onCancel,
}: {
  options: ClassOption[];
  pref: Pref;
  /** 주소에 선생님이 있어야 따라갈 수업이 정해진다. */
  canFollow: boolean;
  onSave: (p: Pref) => void;
  onCancel?: () => void;
}) {
  const [grade, setGrade] = useState<number | null>(pref.grade ?? null);
  const [no, setNo] = useState(pref.studentNo ? String(pref.studentNo) : "");
  const grades = useMemo(
    () => Array.from(new Set(options.map((o) => o.grade))).sort((a, b) => a - b), [options]);
  const classes = useMemo(
    () => options.filter((o) => o.grade === grade).sort((a, b) => a.class_num - b.class_num), [options, grade]);
  const studentNo = no ? Number(no) : undefined;

  return (
    <div className="py-6">
      <h1 className="text-2xl font-black tracking-tight text-foreground">무엇을 볼까요?</h1>
      <p className="mt-1 text-xs text-muted-foreground">한 번 고르면 다음부터는 안 물어봐요.</p>

      {canFollow && (
        <button type="button" onClick={() => onSave({ ...pref, follow: true, studentNo })}
          className={cn(
            "mt-5 flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all",
            pref.follow
              ? "border-neon-blue/50 bg-neon-blue/10"
              : "border-border/40 hover:border-neon-blue/40",
          )}>
          <Radio className="size-5 shrink-0 text-neon-blue" />
          <span className="min-w-0">
            <span className="block text-sm font-black text-foreground">지금 수업 중인 반</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">
              수업이 바뀌면 화면도 따라가요. 교실 태블릿은 이걸로 두세요.
            </span>
          </span>
        </button>
      )}

      <p className="mb-2 mt-6 text-xs font-black text-muted-foreground">
        {canFollow ? "또는 반을 골라 고정하기" : "학년"}
      </p>
      <div className="flex flex-wrap gap-2">
        {grades.map((g) => (
          <button key={g} type="button" onClick={() => setGrade(g)}
            className={cn(
              "h-12 min-w-12 rounded-xl border px-4 text-base font-black transition-all",
              grade === g
                ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                : "border-border/40 text-muted-foreground hover:text-foreground",
            )}>
            {g}학년
          </button>
        ))}
      </div>

      {grade != null && (
        <>
          <p className="mb-2 mt-5 text-xs font-black text-muted-foreground">반</p>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <button key={c.class_num} type="button"
                onClick={() => onSave({ follow: false, grade: c.grade, classNum: c.class_num, studentNo })}
                className={cn(
                  "h-12 min-w-12 rounded-xl border px-4 text-base font-black transition-all",
                  !pref.follow && pref.grade === c.grade && pref.classNum === c.class_num
                    ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                    : "border-border/40 text-muted-foreground hover:border-neon-blue/50 hover:text-neon-blue",
                )}>
                {c.class_num}반
              </button>
            ))}
          </div>
        </>
      )}

      {grades.length === 0 && (
        <p className="mt-5 text-sm text-muted-foreground">아직 학년·반이 등록된 명단이 없어요.</p>
      )}

      {/* 번호는 "나 표시하기"일 뿐이라 선택이다. 옆 반을 구경할 땐 넣을 번호가 없다. */}
      <p className="mb-2 mt-7 text-xs font-black text-muted-foreground">내 번호 (안 넣어도 돼요)</p>
      <input
        value={no}
        onChange={(e) => setNo(e.target.value.replace(/\D/g, "").slice(0, 3))}
        inputMode="numeric"
        placeholder="목록에서 내 줄만 표시해요"
        className="h-12 w-full rounded-xl border border-border/50 bg-input/40 px-4 text-base font-bold text-foreground outline-none placeholder:text-xs placeholder:font-normal focus:border-neon-blue/50"
      />

      {onCancel && (
        <button type="button" onClick={onCancel}
          className="mt-7 text-xs font-bold text-muted-foreground hover:text-foreground">
          그대로 둘게요
        </button>
      )}
    </div>
  );
}
