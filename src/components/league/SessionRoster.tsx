import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import type { Student } from "@/lib/league-types";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

/** 학교는 학년·반·번호 순, 그 외에는 이름 순. 교사가 출석부를 훑는 순서 그대로. */
function sortForRoster(list: Student[]): Student[] {
  return [...list].sort((a, b) => {
    const ga = a.grade ?? 0,
      gb = b.grade ?? 0;
    if (ga !== gb) return ga - gb;
    const ca = a.classNum ?? 0,
      cb = b.classNum ?? 0;
    if (ca !== cb) return ca - cb;
    const na = a.studentNo ?? 0,
      nb = b.studentNo ?? 0;
    if (na !== nb) return na - nb;
    return dn(a).localeCompare(dn(b));
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 출석 체크 = 배정의 유일한 입력.
 *
 * 명단이 곧 배정 후보다. 지각·조퇴를 상태로 모델링하지 않고, 채울 때마다 "그 순간 이 명단에
 * 있는 사람" 중에서 뽑으므로 조퇴자는 그 시점부터 안 뽑히고 지각자는 그 시점부터 뽑힌다.
 *
 * [새로 시작]이 세션 경계다 — 기존 큐를 전부 지우고 새 명단을 확정한다. 4교시 5반이
 * 들어오면 3교시의 미소화 경기가 그때 사라진다.
 */
export function SessionRoster() {
  const { students, assignmentSession, startAssignmentSession, updateAssignmentSession } =
    useLeagueStore();

  const roster = useMemo(() => sortForRoster(students), [students]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [draftType, setDraftType] = useState<"single" | "double">("double");
  const [saving, setSaving] = useState(false);

  const present = assignmentSession?.player_ids ?? [];
  const hasSession = !!assignmentSession && present.length > 0;
  // 세션이 없으면 처음부터 체크 화면이다. 있으면 접어 두고 [명단 수정]으로 연다.
  const open = editing || !hasSession;

  const beginEdit = () => {
    setDraft(
      hasSession
        ? present.filter((id) => students.some((s) => s.id === id))
        : roster.map((s) => s.id),
    );
    setDraftType(assignmentSession?.match_type === "single" ? "single" : "double");
    setEditing(true);
  };

  // 세션이 없을 때는 전원 체크된 상태로 시작한다 — 결석 몇 명을 빼는 쪽이 빠르다.
  const picked = editing ? draft : roster.map((s) => s.id);
  const toggle = (id: string) => {
    if (!editing) beginEdit();
    setDraft((prev) => {
      const base = editing ? prev : roster.map((s) => s.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  const save = async (asNewSession: boolean) => {
    setSaving(true);
    const ok = asNewSession
      ? await startAssignmentSession({ playerIds: picked, matchType: draftType })
      : await updateAssignmentSession({ playerIds: picked, matchType: draftType });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neon-green/15 text-neon-green">
          <ClipboardCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-foreground">
            {hasSession ? `참석 ${present.length}명` : "출석 체크"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {hasSession
              ? `${assignmentSession?.match_type === "single" ? "단식" : "복식"} · ${fmtTime(assignmentSession!.started_at)} 시작 · 이 명단에서만 대진을 뽑습니다.`
              : "오늘 온 사람을 체크하세요. 체크된 사람만 대진에 들어갑니다."}
          </p>
        </div>
        {hasSession && !editing && (
          <Button
            onClick={beginEdit}
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-lg border-border/50 px-3 text-[11px] font-black"
          >
            명단 수정
          </Button>
        )}
      </div>

      {open && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">체크 {picked.length}명</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setDraft(roster.map((s) => s.id));
                }}
                className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setDraft([]);
                }}
                className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
              >
                해제
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border/30 p-2">
            <div className="flex flex-wrap gap-1.5">
              {roster.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-bold transition-all",
                      on
                        ? "border-neon-green/50 bg-neon-green/15 text-neon-green"
                        : "border-border/40 text-muted-foreground line-through hover:text-foreground",
                    )}
                  >
                    {dn(s)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 종목은 그 수업·리그의 성격이라 세션 설정이다. 채우는 단위(한 바퀴/1경기)와는 다른 축. */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground">종목</span>
            {(["double", "single"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setEditing(true);
                  setDraftType(t);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-black transition-all",
                  (editing ? draftType : (assignmentSession?.match_type ?? "double")) === t
                    ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue"
                    : "border-border/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "double" ? "복식" : "단식"}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            {hasSession && (
              <Button
                onClick={() => save(false)}
                disabled={saving || picked.length === 0}
                className="h-11 flex-1 rounded-xl bg-neon-blue text-sm font-black text-primary-foreground hover:bg-neon-blue/90"
              >
                명단 저장
              </Button>
            )}
            <Button
              onClick={() => save(true)}
              disabled={saving || picked.length === 0}
              variant={hasSession ? "outline" : "default"}
              className={cn(
                "h-11 rounded-xl text-sm font-black",
                hasSession
                  ? "shrink-0 border-border/50 px-4"
                  : "flex-1 bg-neon-green text-primary-foreground hover:bg-neon-green/90",
              )}
            >
              <RotateCcw className="mr-1.5 size-4" />
              {hasSession ? "새로 시작" : "이 명단으로 시작"}
            </Button>
          </div>
          {hasSession && editing && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              [새로 시작]은 대기 중인 경기를 전부 지우고 새 명단으로 다시 시작합니다.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
