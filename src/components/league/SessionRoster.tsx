import type React from "react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLeagueStore } from "@/lib/league-store";
import { schoolAxesOf, schoolLabelCompact, type Student } from "@/lib/league-types";

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
function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[11px] font-black transition-all",
        on
          ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue"
          : "border-border/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function SessionRoster() {
  const { students, assignmentSession, startAssignmentSession, updateAssignmentSession } =
    useLeagueStore();

  const roster = useMemo(() => sortForRoster(students), [students]);

  // 500명짜리 전교 리그에서 전원을 한 줄에 늘어놓으면 고를 수가 없다.
  // 수업은 반 단위로 하므로 학년·반으로 먼저 좁힌다. (값이 한 종류뿐인 축은 칩을 띄우지 않는다)
  const axes = useMemo(() => schoolAxesOf(students), [students]);
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const availableClasses = useMemo(() => {
    if (!axes.varyClass) return [];
    const set = new Set<number>();
    for (const s of students) {
      if (s.classNum == null) continue;
      if (filterGrade != null && s.grade !== filterGrade) continue;
      set.add(s.classNum);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [students, filterGrade, axes.varyClass]);

  // 필터는 "보이는 사람"만 줄인다. 체크 상태는 필터 밖 사람도 그대로 유지된다 —
  // 학년 대전처럼 여러 반이 섞인 명단을 반씩 훑어 담을 수 있어야 한다.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((s) => {
      if (filterGrade != null && s.grade !== filterGrade) return false;
      if (filterClass != null && s.classNum !== filterClass) return false;
      if (!q) return true;
      return (
        (s.name || "").toLowerCase().includes(q) || (s.nickname || "").toLowerCase().includes(q)
      );
    });
  }, [roster, filterGrade, filterClass, search]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [draftType, setDraftType] = useState<"single" | "double">("double");
  const [saving, setSaving] = useState(false);

  const present = useMemo(() => assignmentSession?.player_ids ?? [], [assignmentSession]);
  const hasSession = !!assignmentSession && present.length > 0;
  // 세션이 없으면 처음부터 체크 화면이다. 있으면 접어 두고 [명단 수정]으로 연다.
  const open = editing || !hasSession;

  // 명단이 한 반뿐이면 전원 체크에서 결석자를 빼는 쪽이 빠르다.
  // 여러 학년·반이 섞여 있으면(전교 리그) 전원 체크가 오히려 위험하므로 빈 상태에서 시작한다.
  const singleClassLeague = !axes.varyGrade && !axes.varyClass;
  const initialPick = () => (singleClassLeague ? roster.map((s) => s.id) : []);

  const beginEdit = () => {
    setDraft(
      hasSession ? present.filter((id) => students.some((s) => s.id === id)) : initialPick(),
    );
    setDraftType(assignmentSession?.match_type === "single" ? "single" : "double");
    setEditing(true);
  };

  // 세션이 없을 때는 전원 체크된 상태로 시작한다 — 결석 몇 명을 빼는 쪽이 빠르다.
  const picked = editing ? draft : initialPick();
  const toggle = (id: string) => {
    if (!editing) beginEdit();
    setDraft((prev) => {
      const base = editing ? prev : initialPick();
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  /** 보이는 사람만 한꺼번에 켜고 끈다. 필터 밖 체크는 건드리지 않는다. */
  const bulkVisible = (on: boolean) => {
    const base = editing ? draft : initialPick();
    const ids = new Set(visible.map((s) => s.id));
    setEditing(true);
    setDraft(on ? Array.from(new Set([...base, ...ids])) : base.filter((id) => !ids.has(id)));
  };

  // 접힌 요약에 "어느 반인지"를 보여준다 — 옆 반 명단으로 돌리고 있는 사고를 바로 알아채야 한다.
  const scopeLabel = useMemo(() => {
    if (!hasSession) return "";
    const set = new Set<string>();
    for (const id of present) {
      const s = students.find((x) => x.id === id);
      if (!s) continue;
      if (s.grade == null && s.classNum == null) continue;
      set.add(`${s.grade ?? "?"}-${s.classNum ?? "?"}`);
      if (set.size > 3) break;
    }
    if (set.size === 0) return "";
    return set.size > 3 ? "여러 반" : Array.from(set).join(", ");
  }, [hasSession, present, students]);

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
              ? `${scopeLabel ? `${scopeLabel} · ` : ""}${assignmentSession?.match_type === "single" ? "단식" : "복식"} · ${fmtTime(assignmentSession!.started_at)} 시작 · 이 명단에서만 대진을 뽑습니다.`
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
          {/* 범위 좁히기 — 수업은 반 단위로 한다. 값이 한 종류뿐인 축은 칩을 띄우지 않는다. */}
          {(axes.varyGrade || axes.varyClass) && (
            <div className="mb-2 space-y-2">
              {axes.varyGrade && (
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip
                    on={filterGrade == null}
                    onClick={() => {
                      setFilterGrade(null);
                      setFilterClass(null);
                    }}
                  >
                    전체 학년
                  </FilterChip>
                  {axes.grades.map((g) => (
                    <FilterChip
                      key={g}
                      on={filterGrade === g}
                      onClick={() => {
                        setFilterGrade(g);
                        setFilterClass(null);
                      }}
                    >
                      {g}학년
                    </FilterChip>
                  ))}
                </div>
              )}
              {availableClasses.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip on={filterClass == null} onClick={() => setFilterClass(null)}>
                    전체 반
                  </FilterChip>
                  {availableClasses.map((c) => (
                    <FilterChip key={c} on={filterClass === c} onClick={() => setFilterClass(c)}>
                      {c}반
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>
          )}

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 검색..."
            className="mb-2 h-9 w-full border-border/50 bg-input text-xs"
          />

          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">
              체크 {picked.length}명
              {visible.length !== roster.length && (
                <span className="ml-1 font-normal text-muted-foreground/70">
                  (보이는 {visible.length}명 중{" "}
                  {visible.filter((s) => picked.includes(s.id)).length}명)
                </span>
              )}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => bulkVisible(true)}
                className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
              >
                {visible.length === roster.length ? "전체" : "보이는 전체"}
              </button>
              <button
                type="button"
                onClick={() => bulkVisible(false)}
                className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
              >
                해제
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border/30 p-2">
            {visible.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted-foreground">
                해당하는 사람이 없어요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {visible.map((s) => {
                  const on = picked.includes(s.id);
                  const label = schoolLabelCompact(s, axes);
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
                      {label ? (
                        <span className="ml-1 text-[10px] font-normal opacity-70">{label}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
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
