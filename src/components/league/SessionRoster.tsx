import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import type { Student } from "@/lib/league-types";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

/**
 * 학년-반 키.
 *
 * 명단에 반 정보가 없을 수 있다 — 일괄 등록에서 이름만 붙여넣으면 학년·반·번호가 전부
 * null이고, 그건 정상적인 사용 방식이다(한 반만 쓰는 리그는 반을 적을 이유가 없다).
 * 그런 학생은 빈 키 하나로 묶인다. 전원이 빈 키면 고를 것이 없으므로 칩 자체가 안 뜨고
 * 명단 = 전원이 된다. 일부만 비어 있으면 "반 미지정" 묶음으로 따로 보인다.
 */
const classKeyOf = (s: Student): string =>
  s.grade == null && s.classNum == null ? "" : `${s.grade ?? ""}-${s.classNum ?? ""}`;

/** 있는 축만 읽는다. 학년만 있으면 "5학년", 반만 있으면 "3반", 둘 다면 "5-3반". */
function classLabel(key: string): string {
  if (key === "") return "반 미지정";
  const [g, c] = key.split("-");
  if (g && c) return `${g}-${c}반`;
  if (g) return `${g}학년`;
  return `${c}반`;
}

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

function ClassChip({
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
        "rounded-lg border px-3 py-1.5 text-xs font-black transition-all",
        on
          ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
          : "border-border/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 출석 = 반을 고르고, 안 온 학생만 빼는 것.
 *
 * 명단의 단위는 "아무나 모은 집합"이 아니라 **반**이다. 5교시 5-5 수업이 끝나고 6교시
 * 5-7이 들어오면 교사가 하는 일은 "반을 바꾸는 것" 하나여야 한다 — 5-5를 전부 결석으로
 * 돌리고, 5-7을 전원 출석으로 켜고, 다시 결석생을 찾는 세 번의 일이 아니다.
 * 그래서 반 선택 자체가 곧 명단이고, 반을 바꾸면 이전 반은 통째로 빠진다.
 *
 * 결석은 반 안에서만 기억한다. 반을 다시 고르면 그 반의 결석 표시가 그대로 살아난다
 * (같은 반이 다음 교시에 또 들어오는 경우).
 */
export function SessionRoster() {
  const { students, assignmentSession, startAssignmentSession, updateAssignmentSession } =
    useLeagueStore();

  const roster = useMemo(() => sortForRoster(students), [students]);

  /** 명단에 존재하는 반 목록. 반이 하나뿐이면 고를 것이 없다. */
  const classKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of roster) set.add(classKeyOf(s));
    return Array.from(set).sort();
  }, [roster]);
  const singleClass = classKeys.length <= 1;

  const [selected, setSelected] = useState<string[]>([]);
  // 결석은 반별로 기억한다. 반을 바꿔도 그 반의 표시가 남고, 다른 반에 영향을 주지 않는다.
  const [absent, setAbsent] = useState<Record<string, string[]>>({});
  const [draftType, setDraftType] = useState<"single" | "double">("double");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const present = useMemo(() => assignmentSession?.player_ids ?? [], [assignmentSession]);
  const hasSession = !!assignmentSession && present.length > 0;

  /** 현재 세션이 어느 반으로 돌아가고 있는지. 반이 바뀌면 그것이 곧 새 수업이다. */
  const sessionClasses = useMemo(() => {
    const set = new Set<string>();
    for (const id of present) {
      const s = students.find((x) => x.id === id);
      if (s) set.add(classKeyOf(s));
    }
    return Array.from(set).sort();
  }, [present, students]);

  // 열려 있는 세션이 있으면 그 반을 골라 둔 상태로 시작한다.
  useEffect(() => {
    if (editing) return;
    if (hasSession) {
      setSelected(sessionClasses);
      setAbsent(() => {
        const out: Record<string, string[]> = {};
        for (const key of sessionClasses) {
          out[key] = roster
            .filter((s) => classKeyOf(s) === key && !present.includes(s.id))
            .map((s) => s.id);
        }
        return out;
      });
      setDraftType(assignmentSession?.match_type === "single" ? "single" : "double");
    } else if (singleClass && classKeys.length === 1) {
      setSelected(classKeys);
    }
  }, [
    editing,
    hasSession,
    sessionClasses,
    present,
    roster,
    assignmentSession,
    singleClass,
    classKeys,
  ]);

  /** 고른 반의 학생 전원. 이것이 명단의 모집단이다. */
  const scopeStudents = useMemo(
    () => roster.filter((s) => selected.includes(classKeyOf(s))),
    [roster, selected],
  );
  const absentIds = useMemo(() => {
    const set = new Set<string>();
    for (const key of selected) for (const id of absent[key] ?? []) set.add(id);
    return set;
  }, [selected, absent]);
  const picked = useMemo(
    () => scopeStudents.filter((s) => !absentIds.has(s.id)).map((s) => s.id),
    [scopeStudents, absentIds],
  );

  /** 반 선택 = 명단 교체. 여러 반을 섞는 경우(학년 대전)만 명시적으로 추가한다. */
  const pickClass = (key: string, additive: boolean) => {
    setEditing(true);
    setSelected((prev) => {
      if (!additive) return [key];
      return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].sort();
    });
  };

  const toggleAbsent = (s: Student) => {
    const key = classKeyOf(s);
    setEditing(true);
    setAbsent((prev) => {
      const list = prev[key] ?? [];
      return {
        ...prev,
        [key]: list.includes(s.id) ? list.filter((x) => x !== s.id) : [...list, s.id],
      };
    });
  };

  // 여러 반을 섞는 것(학년 대전)은 예외적인 경우다. 평소에는 반 칩을 누르면 교체되고,
  // [반 더하기]를 켰을 때만 더해진다 — 눌렀는데 이전 반이 남아 있는 사고를 막는다.
  const [multi, setMulti] = useState(false);

  // 반 구성이 바뀌면 새 수업이다 → 큐를 비우고 시작한다.
  // 같은 반에서 몇 명만 바뀐 것은 지각·조퇴다 → 큐를 그대로 둔다.
  // 교사가 "명단 저장이냐 새로 시작이냐"를 고를 일이 아니라, 무엇이 바뀌었는지가 정한다.
  const classesChanged =
    !hasSession || selected.length !== sessionClasses.length
      ? true
      : selected.some((k) => !sessionClasses.includes(k));

  // 반 정보가 없는 명단에서는 "반 미지정"을 제목에 붙이지 않는다 — 고를 것이 없으니
  // 그냥 오늘 수업이다. 여러 반 중 하나로 섞여 있을 때만 이름이 필요하다.
  const labelOf = (keys: string[]) =>
    keys.length === 1 && keys[0] === "" ? "" : keys.map(classLabel).join(", ");
  const scopeText = labelOf(selected);
  const sessionText = labelOf(sessionClasses);

  const save = async () => {
    setSaving(true);
    const ok = classesChanged
      ? await startAssignmentSession({ playerIds: picked, matchType: draftType })
      : await updateAssignmentSession({ playerIds: picked, matchType: draftType });
    setSaving(false);
    if (ok) setEditing(false);
  };

  const dirty =
    editing &&
    (classesChanged ||
      picked.length !== present.length ||
      picked.some((id) => !present.includes(id)) ||
      draftType !== (assignmentSession?.match_type ?? "double"));

  return (
    <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neon-green/15 text-neon-green">
          <ClipboardCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-foreground">
            {hasSession && !editing
              ? `${sessionText ? `${sessionText} · ` : ""}참석 ${present.length}명`
              : "수업 시작"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {hasSession && !editing
              ? `${assignmentSession?.match_type === "single" ? "단식" : "복식"} · ${fmtTime(assignmentSession!.started_at)} 시작 · 이 명단에서만 대진을 뽑습니다.`
              : singleClass
                ? "안 온 학생만 눌러서 빼세요."
                : "수업할 반을 고르고, 안 온 학생만 눌러서 빼세요."}
          </p>
        </div>
      </div>

      {/* 반 고르기 = 명단 정하기. 반이 하나뿐인 리그에는 고를 것이 없다. */}
      {!singleClass && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5">
            {classKeys.map((key) => (
              <ClassChip
                key={key}
                on={selected.includes(key)}
                onClick={() => pickClass(key, multi)}
              >
                {classLabel(key)}
              </ClassChip>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMulti((v) => !v)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-black transition-all",
                multi
                  ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue"
                  : "border-border/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {multi ? "반 더하는 중 · 끄기" : "+ 반 더하기"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {multi
                ? "누르는 반이 명단에 더해집니다. 다시 누르면 빠집니다."
                : "학년 대전처럼 여러 반을 섞을 때만 켜세요."}
            </span>
          </div>
        </div>
      )}

      {selected.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-[11px] text-muted-foreground">
          수업할 반을 고르세요.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">
              {scopeText ? `${scopeText} ` : ""}참석 {picked.length}명
              {absentIds.size > 0 && (
                <span className="ml-1.5 font-black text-amber-500">결석 {absentIds.size}명</span>
              )}
            </span>
            {absentIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setAbsent((prev) => {
                    const out = { ...prev };
                    for (const key of selected) out[key] = [];
                    return out;
                  });
                }}
                className="ml-auto rounded-lg border border-border/40 px-2 py-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
              >
                결석 표시 지우기
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border/30 p-2">
            {selected.map((key) => {
              const group = scopeStudents.filter((s) => classKeyOf(s) === key);
              if (group.length === 0) return null;
              return (
                <div key={key} className="mb-2 last:mb-0">
                  {/* 여러 반을 섞었을 때만 반 머리글을 붙인다. 한 반이면 군더더기다. */}
                  {selected.length > 1 && (
                    <p className="mb-1 text-[10px] font-black text-muted-foreground">
                      {classLabel(key)} ({group.filter((s) => !absentIds.has(s.id)).length}/
                      {group.length})
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {group.map((s) => {
                      const out = absentIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleAbsent(s)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-bold transition-all",
                            out
                              ? // 결석은 눈에 띄어야 한다 — 교사가 훑어보는 대상은 빠진 사람이다.
                                "border-amber-500/40 bg-amber-500/10 text-amber-500/80 line-through"
                              : "border-neon-green/50 bg-neon-green/15 text-neon-green",
                          )}
                        >
                          {dn(s)}
                          {s.studentNo != null && (
                            <span className="ml-1 text-[10px] font-normal opacity-70">
                              {s.studentNo}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 종목은 그 수업의 성격이라 세션 설정이다. 채우는 단위(한 바퀴/1경기)와는 다른 축. */}
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
                  draftType === t
                    ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue"
                    : "border-border/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "double" ? "복식" : "단식"}
              </button>
            ))}
          </div>

          {(dirty || !hasSession) && (
            <>
              <Button
                onClick={save}
                disabled={saving || picked.length === 0}
                className="mt-3 h-11 w-full rounded-xl bg-neon-green text-sm font-black text-primary-foreground hover:bg-neon-green/90"
              >
                {classesChanged ? `${scopeText ? `${scopeText} ` : ""}수업 시작` : "명단 반영"}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {classesChanged
                  ? "대기 중인 경기를 지우고 이 명단으로 새로 시작합니다."
                  : "대기 중인 경기는 그대로 두고 명단만 고칩니다. (지각·조퇴)"}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
