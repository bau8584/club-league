import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchClassOptionsPublic, apiFetchClassViewPublic } from "@/services/league-api";
import { cn } from "@/lib/utils";
import {
  getTier, isUnranked, nextStepGap, TIER_ORDER, TIER_STYLES, type TierName,
} from "@/lib/league-types";
import { RefreshCw, UserSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 교실 화면 — 로그인 없이 대기열과 등급을 본다.
 *
 * 지금 아이들이 몰려와 보는 태블릿은 교사 계정으로 로그인돼 있어, 아이 누구나 대진을
 * 지울 수 있고 명단 관리·리그 설정까지 열려 있다. 여기엔 버튼이 없으니 만져도 아무 일도
 * 일어나지 않는다.
 *
 * 순위 숫자를 매기지 않고 등급으로 묶는다. 한 반이 26명이라 "26등"은 태블릿 앞에 몰려선
 * 스물여섯 명 모두가 보는 꼴찌가 된다. 500명 중 400등이 흐릿한 것과 다르다.
 * 등급 안에서는 가나다순이다 — 점수순으로 놓으면 순위표가 그대로 되살아난다.
 *
 * 보여주는 값도 같은 원칙이다. **위치는 숨기고 거리는 보여준다.** "몇 등"은 남과 비교하는
 * 값이고 바꾸기 어렵지만, "다음 단계까지 8점"은 자기 얘기이고 오늘 한 판으로 줄어든다.
 */

type QueueRow = { seq: number | null; team_a: string[]; team_b: string[]; pool: string[] };
type ViewPlayer = {
  id: string; name: string | null; rp: number; wins: number; losses: number;
  grade: number | null; class_num: number | null; student_no: number | null; today_plays: number;
};
type ClassView = {
  state: "session" | "other_session" | "idle" | "need_input" | "not_found";
  league_type?: "club" | "school";
  league_name?: string;
  class_label?: string | null;
  tier_thresholds?: Record<TierName, number> | null;
  placement?: { enabled?: boolean; games?: number } | null;
  queue?: QueueRow[];
  players?: ViewPlayer[];
};
type ClassOption = { grade: number; class_num: number; player_count: number };

/** 고른 반과 "나". 브라우저에만 남는다 — 한 번 고르면 다음부터 안 묻는다. */
type Me = { grade: number; classNum: number; studentNo?: number };
const meKeyOf = (classId: string) => `classroom-me:${classId}`;

function readMe(classId: string): Me | null {
  try {
    const raw = localStorage.getItem(meKeyOf(classId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Me;
    return typeof v?.grade === "number" && typeof v?.classNum === "number" ? v : null;
  } catch {
    return null;
  }
}
function writeMe(classId: string, me: Me | null) {
  try {
    if (me) localStorage.setItem(meKeyOf(classId), JSON.stringify(me));
    else localStorage.removeItem(meKeyOf(classId));
  } catch { /* 사파리 비공개 모드 등 — 저장 못 해도 화면은 돌아야 한다 */ }
}

// 수업 중에는 대기열이 자주 바뀐다. 아이가 새로고침을 누르지 않아도 따라오게 한다.
// 로그인이 없어 실시간 구독을 못 쓰므로(구독은 인증을 요구한다) 주기적으로 다시 읽는다.
const POLL_MS = 15000;

export function ClassroomView({ classId, ownerId }: { classId: string; ownerId?: string | null }) {
  const [me, setMe] = useState<Me | null>(() => readMe(classId));
  const [view, setView] = useState<ClassView | null>(null);
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [numberOpen, setNumberOpen] = useState(false);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await apiFetchClassViewPublic({
        classId, ownerId, grade: me?.grade ?? null, classNum: me?.classNum ?? null,
      });
      if (err) throw err;
      setView(data as ClassView);
    } catch (e: any) {
      setError(e?.message || "불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [classId, ownerId, me?.grade, me?.classNum]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // 고르기 화면에 들어갈 때만 목록을 읽는다. 태블릿은 이 화면을 거치지 않는다.
  useEffect(() => {
    if (view?.state !== "need_input" && !pickerOpen) return;
    if (options.length) return;
    apiFetchClassOptionsPublic(classId).then(({ data }) => setOptions((data || []) as ClassOption[]));
  }, [view?.state, pickerOpen, options.length, classId]);

  const pickClass = (grade: number, classNum: number) => {
    const next = { grade, classNum, studentNo: me?.studentNo };
    setMe(next);
    writeMe(classId, next);
    setPickerOpen(false);
  };

  if (loading && !view) return <Shell><p className="text-sm text-muted-foreground">불러오는 중…</p></Shell>;
  if (error) return <Shell><p className="text-sm text-destructive">{error}</p></Shell>;
  if (!view || view.state === "not_found") {
    return <Shell><p className="text-sm text-muted-foreground">리그를 찾을 수 없어요.</p></Shell>;
  }

  if (view.state === "need_input" || pickerOpen) {
    return (
      <Shell>
        <ClassPicker
          options={options}
          onPick={pickClass}
          onCancel={pickerOpen && view.state !== "need_input" ? () => setPickerOpen(false) : undefined}
        />
      </Shell>
    );
  }

  const inSession = view.state === "session";
  const players = view.players ?? [];
  const queue = view.queue ?? [];

  return (
    <Shell>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black tracking-tight text-foreground">
            {view.class_label || view.league_name}
          </h1>
          <p className="mt-0.5 text-xs font-bold text-muted-foreground">
            {inSession
              ? `수업 중 · ${players.length}명`
              : view.state === "other_session"
                ? "수업 진행 중이에요"
                : "오늘 수업은 끝났어요"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon" className="size-9 border-border/50"
            onClick={() => load()} aria-label="새로고침">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="icon" className="size-9 border-border/50"
            onClick={() => setPickerOpen(true)} aria-label="반 바꾸기">
            <UserSearch className="size-4" />
          </Button>
        </div>
      </header>

      {inSession && <Queue rows={queue} />}

      <TierGroups
        players={players}
        thresholds={view.tier_thresholds ?? undefined}
        placement={view.placement ?? undefined}
        me={me}
        onAskNumber={() => setNumberOpen(true)}
      />

      {numberOpen && (
        <NumberDialog
          initial={me?.studentNo}
          onClose={() => setNumberOpen(false)}
          onSave={(no) => {
            if (!me) return;
            const next = { ...me, studentNo: no };
            setMe(next);
            writeMe(classId, next);
            setNumberOpen(false);
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-5">{children}</div>;
}

/** 대기열 — 여기만 실명이다. "김민준!" 하고 부르려면 실명이어야 한다. */
function Queue({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mb-5 rounded-xl border border-border/30 bg-input/40 px-3 py-4 text-center text-xs font-bold text-muted-foreground">
        아직 대진이 없어요.
      </p>
    );
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-black text-foreground">대기열</h2>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const confirmed = r.team_a.length > 0 && r.team_b.length > 0;
          return (
            <div key={r.seq ?? `x${i}`}
              className="flex items-center gap-2 rounded-xl border border-border/30 bg-input/40 px-3 py-3">
              <span className="w-10 shrink-0 text-center text-base font-black tabular-nums text-muted-foreground">
                {r.seq == null ? "" : `#${r.seq}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
                {confirmed ? (
                  <>
                    {r.team_a.join("·")}
                    <span className="mx-1.5 text-xs font-black text-muted-foreground">vs</span>
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
    </section>
  );
}

/**
 * 등급 묶음 — 순위 숫자가 없다. 등급 안은 가나다순이다.
 * 이름은 서버가 이미 가려서 내려준다(김○○). 자기 줄은 번호로 찾는다.
 */
function TierGroups({
  players, thresholds, placement, me, onAskNumber,
}: {
  players: ViewPlayer[];
  thresholds?: Record<TierName, number>;
  placement?: { enabled?: boolean; games?: number };
  me: Me | null;
  onAskNumber: () => void;
}) {
  const placementEnabled = !!placement?.enabled;
  const placementGames = placement?.games ?? 0;

  const { groups, unranked } = useMemo(() => {
    const g = new Map<TierName, ViewPlayer[]>();
    const un: ViewPlayer[] = [];
    for (const p of players) {
      if (isUnranked({ wins: p.wins, losses: p.losses }, placementEnabled, placementGames)) {
        un.push(p);
        continue;
      }
      const t = getTier(p.rp, thresholds);
      const list = g.get(t) ?? [];
      list.push(p);
      g.set(t, list);
    }
    return { groups: g, unranked: un };
  }, [players, thresholds, placementEnabled, placementGames]);

  if (players.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 아무도 없어요.</p>;
  }

  const isMe = (p: ViewPlayer) =>
    !!me?.studentNo && p.student_no === me.studentNo
    && p.grade === me.grade && p.class_num === me.classNum;

  return (
    <section className="space-y-5">
      {TIER_ORDER.map((tier) => {
        const list = groups.get(tier);
        if (!list?.length) return null;
        return (
          <div key={tier}>
            <div className="mb-2 flex items-center gap-2">
              {/* 묶음 머리글은 등급 이름만 쓴다 — 안쪽 칸(골드 3)은 순위처럼 읽혀서 뺀다. */}
              <span className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-black ring-1",
                TIER_STYLES[tier].bg, TIER_STYLES[tier].text, TIER_STYLES[tier].ring,
              )}>
                {TIER_STYLES[tier].label}
              </span>
              <span className="text-xs font-bold text-muted-foreground">{list.length}명</span>
            </div>
            <div className="space-y-1">
              {list.map((p) => (
                <PlayerRow key={p.id} p={p} mine={isMe(p)}
                  gap={nextStepGap(p.rp, thresholds)} />
              ))}
            </div>
          </div>
        );
      })}

      {unranked.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-black", TIER_STYLES.Bronze.bg, "text-muted-foreground")}>
              아직 등급 없음
            </span>
            <span className="text-xs font-bold text-muted-foreground">{unranked.length}명</span>
          </div>
          <div className="space-y-1">
            {unranked.map((p) => {
              const left = Math.max(0, placementGames - (p.wins + p.losses));
              return (
                <div key={p.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2",
                    isMe(p) ? "bg-neon-blue/10 ring-1 ring-neon-blue/40" : "bg-input/30",
                  )}>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name || "?"}</span>
                  <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                    {placementEnabled && left > 0 ? `${left}판 더 하면 등급이 정해져요` : "아직 경기 전이에요"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!me?.studentNo && (
        <button type="button" onClick={onAskNumber}
          className="w-full rounded-xl border border-dashed border-border/50 py-3 text-xs font-bold text-muted-foreground hover:text-foreground">
          번호를 넣으면 내 줄을 표시해줘요
        </button>
      )}
    </section>
  );
}

function PlayerRow({ p, mine, gap }: { p: ViewPlayer; mine: boolean; gap: number | null }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg px-3 py-2",
      mine ? "bg-neon-blue/10 ring-1 ring-neon-blue/40" : "bg-input/30",
    )}>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name || "?"}</span>
      {p.today_plays > 0 && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
          오늘 {p.today_plays}판
        </span>
      )}
      <span className="w-24 shrink-0 text-right text-[11px] font-bold tabular-nums text-muted-foreground">
        {gap == null ? "최고 단계" : `다음까지 ${gap}`}
      </span>
    </div>
  );
}

function ClassPicker({
  options, onPick, onCancel,
}: {
  options: ClassOption[];
  onPick: (grade: number, classNum: number) => void;
  onCancel?: () => void;
}) {
  const [grade, setGrade] = useState<number | null>(null);
  const grades = useMemo(
    () => Array.from(new Set(options.map((o) => o.grade))).sort((a, b) => a - b), [options]);
  const classes = useMemo(
    () => options.filter((o) => o.grade === grade).sort((a, b) => a.class_num - b.class_num), [options, grade]);

  return (
    <div className="py-6">
      <h1 className="text-xl font-black tracking-tight text-foreground">어느 반이에요?</h1>
      <p className="mt-1 text-xs text-muted-foreground">한 번 고르면 다음부터는 안 물어봐요.</p>

      <p className="mt-6 mb-2 text-xs font-black text-muted-foreground">학년</p>
      <div className="flex flex-wrap gap-2">
        {grades.map((g) => (
          <button key={g} type="button" onClick={() => setGrade(g)}
            className={cn(
              "h-12 min-w-12 rounded-xl border px-4 text-base font-black transition-all",
              grade === g
                ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                : "border-border/40 text-muted-foreground hover:text-foreground",
            )}>
            {g}
          </button>
        ))}
      </div>

      {grade != null && (
        <>
          <p className="mt-6 mb-2 text-xs font-black text-muted-foreground">반</p>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <button key={c.class_num} type="button" onClick={() => onPick(c.grade, c.class_num)}
                className="h-12 min-w-12 rounded-xl border border-border/40 px-4 text-base font-black text-muted-foreground transition-all hover:border-neon-blue/50 hover:text-neon-blue">
                {c.class_num}
              </button>
            ))}
          </div>
        </>
      )}

      {grades.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">아직 학년·반이 등록된 명단이 없어요.</p>
      )}

      {onCancel && (
        <button type="button" onClick={onCancel}
          className="mt-8 text-xs font-bold text-muted-foreground hover:text-foreground">
          그대로 둘게요
        </button>
      )}
    </div>
  );
}

/** 번호는 "나 표시하기"일 뿐이라 선택이다. 옆 반을 구경할 땐 넣을 번호가 없다. */
function NumberDialog({
  initial, onClose, onSave,
}: {
  initial?: number;
  onClose: () => void;
  onSave: (no: number | undefined) => void;
}) {
  const [text, setText] = useState(initial ? String(initial) : "");
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-black text-foreground">내 번호</h3>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          목록에서 내 줄만 표시해요. 이 기기에만 저장되고 아무 데도 보내지 않아요.
        </p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          placeholder="번호"
          className="h-12 w-full rounded-xl border border-border/50 bg-input/40 px-4 text-base font-bold text-foreground outline-none focus:border-neon-blue/50"
        />
        <div className="mt-4 flex flex-col gap-2">
          <Button
            onClick={() => onSave(text ? Number(text) : undefined)}
            className="h-10 rounded-xl bg-neon-blue text-sm font-black text-primary-foreground hover:bg-neon-blue/90">
            저장할게요
          </Button>
          {initial != null && (
            <button type="button" onClick={() => onSave(undefined)}
              className="rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
              표시 안 할래요
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
