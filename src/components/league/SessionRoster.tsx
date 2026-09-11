import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardCheck, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { classKeyOf, classLabel, sortStudentsForRoster, type Student } from "@/lib/league-types";
import { sessionClassKeys } from "@/domain/session-scope";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

/**
 * 반 키에서 학년 축만 떼어낸다. 학년이 없는 키("", "-3")는 전부 한 묶음이다.
 * 학년/반 2단으로 나누는 기준이 이것이다.
 */
const gradeOf = (key: string): string => (key === "" ? "" : (key.split("-")[0] ?? ""));

/** 학년 줄에 붙는 이름. 학년 없는 묶음은 5학년·6학년과 나란히 설 때만 이름이 필요하다. */
const gradeLabel = (g: string): string => (g === "" ? "학년 없음" : `${g}학년`);

/**
 * 반 줄에 붙는 이름 — 학년은 위에서 이미 골랐으므로 숫자만 남긴다.
 * "5-1반 5-2반 …"에서 "5-"와 "반"이 열 번씩 반복되던 것이 사라지고 읽을 글자가 숫자 하나가 된다.
 * 반 번호가 없는 키는 숫자로 줄일 수 없으니 제 이름을 그대로 쓴다.
 */
function classNumLabel(key: string): string {
  if (key === "") return "반 미지정";
  const c = key.split("-")[1] ?? "";
  return c === "" ? "전체" : `${c}반`;
}

/**
 * 명단 상자 안의 선택지는 두 층뿐이다.
 * - 학년: 아래 반 줄을 갈아 끼우는 탭. 밑줄로 "지금 보는 곳"만 표시한다
 * - 반·섞기·종목: 실제 선택. 같은 크기의 칩이고 켜지면 파랗다
 * 셋을 전부 같은 칩으로 만들면 6학년을 누른 건지 4반을 고른 건지 구분이 안 된다.
 */
function GradeTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-2.5 pb-1.5 text-xs font-black transition-colors",
        on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg border px-3 text-xs font-black transition-all",
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
 * 이름은 번호 순으로 위→아래로 채운다(세로 채우기). 1열에 1~10번, 2열에 11~20번.
 * 가로로 흘리면 번호가 지그재그가 되어 "13번 어디 있지"를 눈으로 훑어야 한다.
 * 폰은 2열, 태블릿 3열, 넓으면 5열. 30명까지는 3열일 때 10행을 지키고, 넘으면 균등하게 나눈다.
 */
function columnRows(n: number, cols: number): number {
  if (cols === 3 && n <= 30) return Math.min(10, n);
  return Math.max(1, Math.ceil(n / cols));
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
export function SessionRoster({
  open,
  onOpenChange,
}: {
  /**
   * 팝업이다. 열림 여부는 카드가 쥔다 — 손잡이(명단 바꾸기)가 카드 머리글에 있다.
   * 명단을 정하는 일은 수업당 한 번인데 반 칩 스무 개와 이름 스물여섯 개는 화면 두 장이라,
   * 카드 안에 펼치면 매 경기 쓰는 대기열이 밀려나 사라진다. 지각생 하나 빼려다 대기열을
   * 잃으면 안 된다. 그래서 대기열 위에 띄우고, 닫으면 대기열이 그 자리에 그대로 있다.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { students, assignmentSession, startAssignmentSession, updateAssignmentSession } =
    useLeagueStore();

  const roster = useMemo(() => sortStudentsForRoster(students), [students]);

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
  const collapsed = !open;

  /** 현재 세션이 어느 반으로 돌아가고 있는지. 반이 바뀌면 그것이 곧 새 수업이다.
      경기 결과 입력·랭킹·하이라이트도 같은 답을 필요로 해서 공용 함수로 빼 두었다. */
  const sessionClasses = useMemo(() => sessionClassKeys(present, students), [present, students]);

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

  // 여러 반을 섞는 것(학년 대전)은 일 년에 몇 번 있는 예외다. 그래서 기본 화면에서는
  // 아예 빼 두고, [여러 반 섞기]를 눌렀을 때만 더하기 모드와 "고른 반" 요약이 나타난다.
  // 평소에는 반 칩을 누르면 교체된다 — 눌렀는데 이전 반이 남아 있는 사고를 막는다.
  const [multi, setMulti] = useState(false);

  /** 학년 목록. 학년이 하나뿐이면 학년 줄은 군더더기다. */
  const gradeKeys = useMemo(() => Array.from(new Set(classKeys.map(gradeOf))).sort(), [classKeys]);

  // 반 줄에 지금 펼쳐 둔 학년. 고른 반이 있으면 그 반의 학년에서 시작한다.
  // 섞기 모드에서는 이것이 "보기 전환"이 되어, 학년을 넘나들며 고를 수 있게 한다.
  const [viewGradePick, setViewGrade] = useState<string | null>(null);
  const viewGrade = viewGradePick ?? gradeOf(selected[0] ?? classKeys[0] ?? "");
  const keysInView = useMemo(
    () => classKeys.filter((k) => gradeOf(k) === viewGrade),
    [classKeys, viewGrade],
  );

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

  const save = async () => {
    setSaving(true);
    const ok = classesChanged
      ? await startAssignmentSession({ playerIds: picked, matchType: draftType })
      : await updateAssignmentSession({ playerIds: picked, matchType: draftType });
    setSaving(false);
    // 저장이 곧 "정했다"는 뜻이다 → 접고 대기열에 자리를 내준다.
    if (ok) {
      setEditing(false);
      onOpenChange(false);
    }
  };

  const dirty =
    editing &&
    (classesChanged ||
      picked.length !== present.length ||
      picked.some((id) => !present.includes(id)) ||
      draftType !== (assignmentSession?.match_type ?? "double"));

  // 닫는 것은 곧 편집을 그만두는 것이다 → 저장 안 한 손질은 버리고 세션으로 되돌린다.
  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  if (collapsed) return null;

  const close = () => onOpenChange(false);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        className="relative my-4 flex w-full max-w-3xl flex-col rounded-2xl border border-border/50 bg-background shadow-2xl sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 머리글 — 무엇을 하는 창인지와 지금 몇 명인지 */}
        <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-green/15 text-neon-green">
            <ClipboardCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black tracking-tight text-foreground">
              {hasSession ? "명단 바꾸기" : "오늘 수업"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {singleClass
                ? "안 온 사람만 눌러서 빼세요."
                : "수업할 반을 고르고, 안 온 학생만 눌러서 빼세요."}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          {/* 반 고르기 = 명단 정하기. 반이 하나뿐인 리그에는 고를 것이 없다. */}
          {!singleClass && (
            <div className="space-y-2.5">
              {/* 학년 줄 — 고르는 곳이 아니라 아래 반 줄을 갈아 끼우는 곳. */}
              {gradeKeys.length > 1 && (
                <div className="flex gap-1 border-b border-border/30">
                  {gradeKeys.map((g) => (
                    <GradeTab key={g} on={g === viewGrade} onClick={() => setViewGrade(g)}>
                      {gradeLabel(g)}
                    </GradeTab>
                  ))}
                </div>
              )}

              {/* 반 줄 — 실제 선택. [여러 반 섞기]는 일 년에 몇 번 쓰는 예외라 줄 끝에 작게. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {keysInView.map((key) => (
                  <Chip key={key} on={selected.includes(key)} onClick={() => pickClass(key, multi)}>
                    {classNumLabel(key)}
                  </Chip>
                ))}
                <span className="grow" />
                <Chip
                  on={multi}
                  onClick={() => {
                    if (multi) {
                      // 섞기를 끄는 것은 "한 반으로 돌아간다"는 뜻이다.
                      setSelected((prev) => (prev.length > 1 ? prev.slice(0, 1) : prev));
                      if (selected.length > 1) setEditing(true);
                    }
                    setMulti((v) => !v);
                  }}
                >
                  여러 반 섞기
                </Chip>
              </div>

              {/* 섞는 동안에는 학년을 옮겨 다니느라 고른 반이 화면에서 사라진다 → 요약으로 붙잡아 둔다. */}
              {multi && (
                <p className="text-[11px] text-muted-foreground">
                  누르는 반이 더해집니다 · 고른 반: <span className="font-black text-foreground">{scopeText || "없음"}</span>
                </p>
              )}
            </div>
          )}

          {selected.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/30 py-8 text-center text-xs text-muted-foreground">
              수업할 반을 고르세요.
            </p>
          ) : (
            <>
              {/* 명단 — 결과 입력의 선수 칸과 같은 모양(모서리·테두리·가운데 이름). */}
              <div className="rounded-xl border border-border/30 bg-input/30 p-2">
                <div className="mb-2 flex items-center gap-2 px-1">
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
                      className="ml-auto text-[11px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      결석 표시 지우기
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {selected.map((key) => {
                    const group = scopeStudents.filter((s) => classKeyOf(s) === key);
                    if (group.length === 0) return null;
                    const n = group.length;
                    return (
                      <div key={key}>
                        {/* 여러 반을 섞었을 때만 반 머리글을 붙인다. 한 반이면 군더더기다. */}
                        {selected.length > 1 && (
                          <p className="mb-1 px-1 text-[10px] font-black text-muted-foreground">
                            {classLabel(key)} ({group.filter((s) => !absentIds.has(s.id)).length}/{n})
                          </p>
                        )}
                        <div
                          className="grid grid-flow-col grid-cols-2 grid-rows-[repeat(var(--r2),minmax(0,auto))] gap-1.5 sm:grid-cols-3 sm:grid-rows-[repeat(var(--r3),minmax(0,auto))] lg:grid-cols-5 lg:grid-rows-[repeat(var(--r5),minmax(0,auto))]"
                          style={
                            {
                              "--r2": columnRows(n, 2),
                              "--r3": columnRows(n, 3),
                              "--r5": columnRows(n, 5),
                            } as React.CSSProperties
                          }
                        >
                          {group.map((s) => {
                            const out = absentIds.has(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleAbsent(s)}
                                className={cn(
                                  "flex h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-all active:scale-95",
                                  out
                                    ? // 결석은 눈에 띄어야 한다 — 교사가 훑어보는 대상은 빠진 사람이다.
                                      "border-amber-500/40 bg-amber-500/10 text-amber-600/80 line-through dark:text-amber-400/80"
                                    : "border-border/40 bg-background text-foreground hover:border-border",
                                )}
                              >
                                {s.studentNo != null && (
                                  <span className="w-5 shrink-0 text-right text-[11px] font-black tabular-nums text-muted-foreground">
                                    {s.studentNo}
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-left">{dn(s)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 종목은 명단이 아니라 수업 설정이지만 같이 저장된다 → 저장 버튼 바로 위에. */}
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-xs font-bold text-muted-foreground">종목</span>
                {(["double", "single"] as const).map((t) => (
                  <Chip
                    key={t}
                    on={draftType === t}
                    onClick={() => {
                      setEditing(true);
                      setDraftType(t);
                    }}
                  >
                    {t === "double" ? "복식" : "단식"}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 저장 — 창 바닥에 붙어 스크롤해도 보인다. 바뀐 게 없으면 누를 것도 없다. */}
        {selected.length > 0 && (dirty || !hasSession) && (
          <div className="sticky bottom-0 rounded-b-2xl border-t border-border/30 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
            <Button
              onClick={save}
              disabled={saving || picked.length === 0}
              className="h-11 w-full rounded-xl bg-neon-green text-sm font-black text-primary-foreground hover:bg-neon-green/90"
            >
              {classesChanged ? `${scopeText ? `${scopeText} ` : ""}수업 시작` : "명단 반영"}
            </Button>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              {classesChanged
                ? "대기 중인 경기를 지우고 이 명단으로 새로 시작합니다."
                : "대기 중인 경기는 그대로 두고 명단만 고칩니다. (지각·조퇴)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
