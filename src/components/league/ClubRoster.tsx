import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClipboardCheck, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { getTodayPlayerIds } from "@/lib/today-players";
import { liveSession } from "@/lib/session-today";
import type { Student } from "@/lib/league-types";

const dn = (s: Student) => s.nickname || s.name;

/**
 * 동호회의 "오늘 참석" — 학교 명단(SessionRoster)과 반대 방향이다.
 *
 * 학교는 반을 고르면 전원 출석이고 안 온 아이만 뺀다. 동호회는 반이 없고 회원 41명 중
 * 오늘 온 사람이 열 몇 명이라, 기본은 **아무도 없음**이고 온 사람만 켠다.
 * 오늘 이미 경기한 사람은 켜져 있다 — 뛰었으면 온 것이다.
 *
 * 늦게 오는 사람이 운동 내내 있다. 그래서 저장해도 팝업이 닫히지 않는다 — 한 명 켜고
 * 저장하고 또 한 명 켜는 일이 학교의 "한 번 정하기"보다 훨씬 잦다.
 *
 * 세션 자체는 학교와 같은 행(assignment_sessions)이다. 동호회는 주인 없는 한 행을 쓴다.
 */
export function ClubRoster({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    students,
    matches,
    scheduledMatches,
    assignmentSession: rawSession,
    startAssignmentSession,
    updateAssignmentSession,
    removeScheduledMatches,
  } = useLeagueStore();

  // 지난주 세션은 없는 것으로 본다 — 오늘 시작한 것만 살아 있다.
  const assignmentSession = liveSession(rawSession, "club");
  const present = useMemo(() => assignmentSession?.player_ids ?? [], [assignmentSession]);
  const hasSession = !!assignmentSession && present.length > 0;
  const todayIds = useMemo(() => getTodayPlayerIds(matches), [matches]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [draftType, setDraftType] = useState<"single" | "double">("double");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // "오늘 운동 시작" 직전에 묻는 지난 예약 정리. null 이면 묻는 중이 아니다.
  const [staleAsk, setStaleAsk] = useState<string[] | null>(null);

  /**
   * 지난 예약 — 아직 대기 중인데 만든 지 하루가 넘은 줄. 회원 예약은 세션 밖이라
   * [오늘 운동 시작]이 지우지 않는다(방금 넣은 걸 날리면 안 되니까). 그래서 지난 것은
   * 시작할 때 묻고 지운다. 자동으로 지우지 않는다 — 어제 잡아 둔 약속일 수도 있다.
   */
  const STALE_MS = 12 * 60 * 60 * 1000;
  const staleIds = useMemo(() => {
    const cutoff = Date.now() - STALE_MS;
    return scheduledMatches
      .filter((m) => (m.status === "waiting" || m.status === "called") && new Date(m.created_at).getTime() < cutoff)
      .map((m) => m.id);
  }, [scheduledMatches]);

  // 열 때마다 세션 명단 + 오늘 뛴 사람으로 시작한다.
  useEffect(() => {
    if (!open) return;
    const alive = new Set(students.map((s) => s.id));
    const init = new Set<string>();
    for (const id of present) if (alive.has(id)) init.add(id);
    for (const id of todayIds) if (alive.has(id)) init.add(id);
    setPicked(init);
    setDraftType(assignmentSession?.match_type === "single" ? "single" : "double");
    setSearch("");
  }, [open, present, todayIds, students, assignmentSession?.match_type]);

  const roster = useMemo(
    () => [...students].sort((a, b) => dn(a).localeCompare(dn(b), "ko")),
    [students],
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) => dn(s).toLowerCase().includes(q) || (s.group ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const dirty =
    picked.size !== present.length ||
    present.some((id) => !picked.has(id)) ||
    draftType !== (assignmentSession?.match_type ?? "double");

  const start = async (clearStale: boolean) => {
    setStaleAsk(null);
    setSaving(true);
    if (clearStale && staleIds.length > 0) await removeScheduledMatches(staleIds);
    const ok = await startAssignmentSession({ playerIds: [...picked], matchType: draftType });
    setSaving(false);
    // 처음 시작할 때는 닫아 대기열로 보낸다.
    if (ok) onOpenChange(false);
  };

  const save = async () => {
    if (!hasSession) {
      // 지난 예약이 남아 있으면 먼저 묻는다.
      if (staleIds.length > 0) return setStaleAsk(staleIds);
      return start(false);
    }
    setSaving(true);
    await updateAssignmentSession({ playerIds: [...picked], matchType: draftType });
    setSaving(false);
    // 닫지 않는다 — 늦게 온 사람이 또 온다.
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative my-4 flex w-full max-w-3xl flex-col rounded-2xl border border-border/50 bg-background shadow-2xl sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-green/15 text-neon-green">
            <ClipboardCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black tracking-tight text-foreground">오늘 참석</h3>
            <p className="text-[11px] text-muted-foreground">
              온 사람을 누르세요. 오늘 경기한 사람은 이미 켜져 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·급수 검색"
            className="h-9 border-border/50 bg-input text-xs"
          />

          <div className="rounded-xl border border-border/30 bg-input/30 p-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-xs font-bold text-muted-foreground">
                참석 <span className="font-black text-foreground">{picked.size}</span>명
              </span>
              {picked.size > 0 && (
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  className="ml-auto text-[11px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  모두 끄기
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {shown.map((s) => {
                const on = picked.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                    className={cn(
                      "flex h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-all active:scale-95",
                      on
                        ? "border-neon-green/50 bg-neon-green/15 text-neon-green"
                        : "border-border/40 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{dn(s)}</span>
                    {s.group && (
                      <span className="shrink-0 text-[10px] font-black opacity-70">{s.group}</span>
                    )}
                  </button>
                );
              })}
              {shown.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-muted-foreground">없어요.</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-muted-foreground">종목</span>
            {(["double", "single"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraftType(t)}
                className={cn(
                  "h-8 rounded-lg border px-3 text-xs font-black transition-all",
                  draftType === t
                    ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                    : "border-border/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "double" ? "복식" : "단식"}
              </button>
            ))}
          </div>
        </div>

        {(dirty || !hasSession) && (
          <div className="sticky bottom-0 rounded-b-2xl border-t border-border/30 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
            <Button
              onClick={save}
              disabled={saving || picked.size === 0}
              className="h-11 w-full rounded-xl bg-neon-green text-sm font-black text-primary-foreground hover:bg-neon-green/90"
            >
              {hasSession ? "명단 반영" : "오늘 운동 시작"}
            </Button>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              {hasSession
                ? "대기 중인 경기는 그대로 두고 명단만 고칩니다."
                : "이 명단에서 대진을 뽑습니다. 나중에 더 켜도 돼요."}
            </p>
          </div>
        )}
      </div>

      {/* 지난 예약 정리 — 시작 직전 한 번 묻는다. */}
      {staleAsk && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setStaleAsk(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">지난 예약 {staleAsk.length}건이 남아 있어요</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              만든 지 12시간이 넘은 줄이에요. 정리하고 시작할까요, 그대로 두고 시작할까요?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={() => start(true)}
                className="h-10 rounded-xl bg-neon-green text-sm font-black text-primary-foreground hover:bg-neon-green/90"
              >
                정리하고 시작
              </Button>
              <Button
                onClick={() => start(false)}
                variant="outline"
                className="h-10 rounded-xl border-border/50 text-sm font-black"
              >
                그대로 두고 시작
              </Button>
              <button
                type="button"
                onClick={() => setStaleAsk(null)}
                className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
