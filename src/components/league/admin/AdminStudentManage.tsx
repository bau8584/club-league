import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Trash2, RotateCcw, User, Save, Pencil, ArrowLeft, ShieldAlert, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiResetStudentCode } from "@/lib/league-api";
import type { Gender, Student, Match, TierName } from "@/lib/league-types";
import { GenderMark } from "../GenderMark";
import { TierBadge } from "../TierBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface AdminStudentManageProps {
  students: Student[];
  matches: Match[];
  onUpdateRP: (studentId: string, nextRp: number) => void;
  onResetStudent: (studentId: string) => void;
  onDeleteStudent?: (studentId: string) => void;
  onUpdateGender?: (studentId: string, gender: Gender) => void;
  onUpdateStudentInfo?: (
    studentId: string,
    info: { grade: number; classNum: number; number: number; name: string; gender: Gender; rp?: number }
  ) => Promise<void>;
  thresholds?: Record<TierName, number>;
}

export function AdminStudentManage({
  students,
  matches,
  onUpdateRP,
  onResetStudent,
  onDeleteStudent,
  onUpdateGender,
  onUpdateStudentInfo,
  thresholds,
}: AdminStudentManageProps) {
  // Student editor states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editRpInput, setEditRpInput] = useState<string>("");

  // Grade/Class filter
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterClassNum, setFilterClassNum] = useState<number | null>(null);

  // Filter class students list
  const classFilteredStudents = useMemo(() => {
    if (filterGrade == null || filterClassNum == null) return [];
    return students
      .filter((s) => s.grade === filterGrade && s.classNum === filterClassNum)
      .sort((a, b) => a.number - b.number);
  }, [students, filterGrade, filterClassNum]);

  // Extract available classes
  const availableClassesForFilter = useMemo(() => {
    if (filterGrade == null) return [];
    const set = new Set<number>();
    students.filter((s) => s.grade === filterGrade).forEach((s) => set.add(s.classNum));
    return Array.from(set).sort((a, b) => a - b);
  }, [students, filterGrade]);

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) ?? null;
  }, [students, selectedStudentId]);

  // Handle select student
  const handleSelectStudent = (s: Student) => {
    setSelectedStudentId(s.id);
    setEditRpInput(s.rp.toString());
    setSearchQuery(""); // Clear search query after selection
    toast.info(`${s.realName || s.name} 학생의 프로필을 로드했습니다.`);
  };

  // Search filtered students list for editor select
  const searchFilteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return students.filter(
      (s) => (s.realName || s.name).toLowerCase().includes(q) || `${s.grade}-${s.classNum}`.includes(q)
    );
  }, [students, searchQuery]);

  // Save manual RP changes
  const saveRpChanges = () => {
    if (!selectedStudent) return;
    const parsedRp = parseInt(editRpInput, 10);
    if (isNaN(parsedRp) || parsedRp < 0) {
      return toast.error("올바른 RP 점수 값을 입력해주세요 (0점 이상)");
    }
    onUpdateRP(selectedStudent.id, parsedRp);
    toast.success(`${selectedStudent.realName || selectedStudent.name} 학생의 RP를 ${parsedRp}점으로 수동 조정했습니다.`);
  };

  // Apply RP presets instantly
  const applyRpPreset = (delta: number) => {
    if (!selectedStudent) return;
    const nextRp = Math.max(0, selectedStudent.rp + delta);
    setEditRpInput(nextRp.toString());
    onUpdateRP(selectedStudent.id, nextRp);
    toast.success(`${selectedStudent.realName || selectedStudent.name} 학생의 RP를 ${delta > 0 ? "+" : ""}${delta} 조정했습니다. (${nextRp} RP)`);
  };

  // Student specific matches timeline
  const studentMatches = useMemo(() => {
    if (!selectedStudentId) return [];
    return matches
      .filter((m) => m.playerAId === selectedStudentId || m.playerBId === selectedStudentId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, selectedStudentId]);

  // Individual student reset check
  const handleStudentReset = () => {
    if (!selectedStudent) return;
    if (window.confirm(`정말로 [${selectedStudent.realName || selectedStudent.name}] 학생의 모든 전적(0승 0패, 1000 RP)을 초기화하시겠습니까? 이 학생이 치른 모든 경기 기록도 자동으로 삭제 및 처리됩니다.`)) {
      onResetStudent(selectedStudent.id);
      setEditRpInput("1000");
      toast.success(`${selectedStudent.realName || selectedStudent.name} 학생의 기록을 완전 초기화했습니다.`);
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-neon-blue">
          <User className="size-5" />
          <h3 className="font-black text-lg">개별 학생 관리 대시보드</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          학생 이름을 검색하여 개별 프로필을 조회하고, RP 점수를 임의 수정하거나 과거 경기 내역을 추적하여 양방향 롤백(삭제)을 관리할 수 있습니다.
        </p>
      </div>

      {!selectedStudent && (
        <>
          {/* Student Search Box */}
          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="관리하고 싶은 학생 이름을 입력하세요..."
              className="h-10 border-border/60 bg-background/60 pl-9 text-sm"
            />
            
            {/* Autocomplete Search Dropdown */}
            {searchQuery.trim() !== "" && (
              <Card className="absolute left-0 right-0 top-[44px] z-50 max-h-[220px] overflow-y-auto border border-border/80 bg-popover p-2 shadow-2xl backdrop-blur-xl">
                {searchFilteredStudents.length > 0 ? (
                  <div className="space-y-1">
                    {searchFilteredStudents.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectStudent(s)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <GenderMark gender={s.gender} />
                          <span className="font-bold text-foreground">{s.realName || s.name}</span>
                          <span className="text-xs text-muted-foreground">({s.grade}학년 {s.classNum}반 {s.number}번)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TierBadge rp={s.rp} thresholds={thresholds} />
                          <span className="font-mono text-xs text-neon-blue font-bold">{s.rp} RP</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-muted-foreground">일치하는 학생을 찾을 수 없습니다.</div>
                )}
              </Card>
            )}
          </div>

          {/* Grade/Class Selector */}
          <div className="rounded-xl border border-border/40 bg-muted/10 p-5 mt-4 space-y-4">
            <div>
              <span className="text-xs text-neon-blue font-bold uppercase tracking-wider">학년 선택</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setFilterGrade(g);
                      setFilterClassNum(null);
                    }}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95",
                      filterGrade === g
                        ? "border-neon-blue bg-neon-blue/20 text-neon-blue shadow-[0_0_12px_rgba(0,180,216,0.25)]"
                        : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {g}학년
                  </button>
                ))}
              </div>
            </div>

            {filterGrade != null && (
              <div className="animate-in fade-in duration-300">
                <span className="text-xs text-neon-green font-bold uppercase tracking-wider">반 선택</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((c) => availableClassesForFilter.includes(c)).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFilterClassNum(c)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95",
                        filterClassNum === c
                          ? "border-neon-green bg-neon-green/20 text-neon-green shadow-[0_0_12px_rgba(34,197,94,0.25)]"
                          : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c}반
                    </button>
                  ))}
                  {availableClassesForFilter.length === 0 && (
                    <span className="text-xs text-muted-foreground py-2 block">해당 학년에 등록된 학생이 없습니다. 명렬표를 등록해주세요.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Class Students Roster Grid Card */}
          {filterGrade != null && filterClassNum != null && (
            <div className="mt-5 pt-4 border-t border-border/30 animate-in fade-in duration-300">
              <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider block mb-2">
                학급 명단 브라우저 ({filterGrade}학년 {filterClassNum}반 · {classFilteredStudents.length}명)
              </span>
              
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {classFilteredStudents.map((s) => (
                  <Card 
                    key={s.id} 
                    className={cn(
                      "p-4 border border-border/40 bg-background/40 hover:bg-accent/10 hover:border-neon-blue/40 transition-all duration-200 cursor-pointer flex items-center justify-between group relative overflow-hidden",
                      selectedStudentId === s.id && "border-neon-blue bg-neon-blue/5 shadow-[0_0_15px_rgba(0,180,216,0.1)]"
                    )}
                    onClick={() => handleSelectStudent(s)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-muted-foreground bg-muted/40 size-8 rounded-full flex items-center justify-center shrink-0">
                        {s.number}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 font-bold">
                          <GenderMark gender={s.gender} />
                          <span>{s.realName || s.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <TierBadge rp={s.rp} thresholds={thresholds} />
                          <span className="font-mono text-[11px] text-neon-blue font-bold">{s.rp} RP</span>
                        </div>
                      </div>
                    </div>

                    {/* Delete Student Button wrapped in AlertDialog trigger */}
                    <div className="flex items-center gap-1 relative z-20" onClick={(e) => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-80 hover:opacity-100 transition-all"
                            title="선수 삭제"
                          >
                            <Trash2 className="size-4.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-destructive/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
                              <ShieldAlert className="size-5 shrink-0" /> 정말 학생을 삭제하시겠습니까?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
                              정말 <span className="font-black text-foreground">[{s.realName || s.name}] ({s.grade}학년 {s.classNum}반 {s.number}번)</span> 학생의 모든 데이터를 영구 삭제하시겠습니까?<br /><br />
                              이 학생이 치른 <span className="font-bold text-destructive">모든 과거 경기 기록도 자동으로 제거</span>되며, 상대방 학생들의 승패와 RP 수치도 경기 전 상태로 부분 롤백됩니다. 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="mt-6 gap-2">
                            <AlertDialogCancel className="font-bold border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all rounded-xl h-11 px-5">
                              취소
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => {
                                onDeleteStudent?.(s.id);
                                if (selectedStudentId === s.id) {
                                  setSelectedStudentId(null);
                                }
                                toast.success(`[${s.name}] 학생 및 연계 경기 전적이 리그에서 성공적으로 완전 삭제되었습니다.`);
                              }}
                              className="font-black bg-destructive hover:bg-destructive/80 active:scale-95 transition-all text-white rounded-xl h-11 px-5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                            >
                              예, 안전 삭제합니다
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </Card>
                ))}
                {classFilteredStudents.length === 0 && (
                  <div className="col-span-full py-6 text-center text-xs text-muted-foreground border border-dashed border-border/30 rounded-xl bg-muted/5">
                    선택하신 학급에 등록된 학생이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Student Detail Panel */}
      {selectedStudent ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-border/25">
            <Button
              variant="ghost"
              onClick={() => setSelectedStudentId(null)}
              className="h-9 px-3 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="size-4" /> 다른 학생 선택 (목록으로)
            </Button>
          </div>
          
          <div className="grid gap-6 md:grid-cols-5">
            {/* Profile Info & RP Adjuster (Left Side) */}
            <div className="md:col-span-2 space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/20 p-5 relative overflow-hidden">
                <div className="absolute right-4 top-4 opacity-15">
                  <User className="size-20 text-muted-foreground" />
                </div>
                
                <span className="text-xs text-muted-foreground font-semibold">
                  {selectedStudent.grade}학년 {selectedStudent.classNum}반 · {selectedStudent.number}번
                </span>
                
                <div className="mt-1 flex items-center gap-2 text-2xl font-black">
                  <GenderMark gender={selectedStudent.gender} />
                  {selectedStudent.realName || selectedStudent.name}
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <TierBadge rp={selectedStudent.rp} thresholds={thresholds} />
                  <span className="font-mono text-sm font-bold text-neon-blue">{selectedStudent.rp} RP</span>
                  <span className="text-xs text-muted-foreground">({selectedStudent.wins}승 {selectedStudent.losses}패)</span>
                </div>

                {/* Gender modify */}
                <div className="space-y-1.5 mt-3 pt-3 border-t border-border/20">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">성별 수정</label>
                  <select
                    value={selectedStudent.gender}
                    onChange={(e) => onUpdateGender?.(selectedStudent.id, e.target.value as Gender)}
                    className="w-full h-10 border border-border/50 bg-background/60 rounded-xl px-3 text-xs font-semibold focus-visible:ring-neon-blue transition-all"
                  >
                    <option value="M">남학생 (M)</option>
                    <option value="F">여학생 (F)</option>
                    <option value="U">미지정 (U)</option>
                  </select>
                </div>

                {/* Delete student */}
                <div className="mt-2.5">
                  <Button
                    onClick={() => {
                      if (window.confirm(`정말로 [${selectedStudent.realName || selectedStudent.name}] 학생을 완전히 삭제하시겠습니까? 이 학생이 치른 모든 경기 기록도 연쇄 삭제되며 롤백됩니다. 이 작업은 취소할 수 없습니다.`)) {
                        onDeleteStudent?.(selectedStudent.id);
                        setSelectedStudentId(null);
                        toast.success(`[${selectedStudent.realName || selectedStudent.name}] 학생이 성공적으로 삭제되었습니다.`);
                      }
                    }}
                    variant="destructive"
                    size="sm"
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold active:scale-95 transition-all"
                  >
                    <Trash2 className="mr-2 size-3.5" /> 학생 영구 삭제
                  </Button>
                </div>

                {/* Individual Student Reset Button */}
                <div className="mt-4 pt-3 border-t border-border/30">
                  <Button
                    onClick={handleStudentReset}
                    variant="destructive"
                    size="sm"
                    className="w-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 font-bold active:scale-95 transition-all"
                  >
                    <RotateCcw className="mr-2 size-3.5" /> 개인 데이터 초기화
                  </Button>
                </div>

                {/* 개인 코드 초기화 (학생이 코드를 잊었을 때 잠금 해제) */}
                <div className="mt-2.5">
                  <Button
                    onClick={async () => {
                      if (!window.confirm(`[${selectedStudent.realName || selectedStudent.name}] 학생의 개인 코드를 초기화할까요? 학생이 다시 새 코드를 정할 수 있게 됩니다. (별명·전적은 그대로 유지됩니다.)`)) return;
                      const { error } = await apiResetStudentCode(selectedStudent.id);
                      if (error) {
                        toast.error("코드 초기화에 실패했습니다: " + error.message);
                      } else {
                        toast.success(`[${selectedStudent.realName || selectedStudent.name}] 학생의 개인 코드를 초기화했습니다.`);
                      }
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full font-bold active:scale-95 transition-all"
                  >
                    <KeyRound className="mr-2 size-3.5" /> 개인 코드 초기화
                  </Button>
                </div>
              </div>

              {/* RP Editor */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
                <h4 className="text-sm font-bold mb-3 text-muted-foreground">RP 수동 조정 및 편집</h4>
                
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={editRpInput}
                    onChange={(e) => setEditRpInput(e.target.value)}
                    className="font-mono font-bold text-lg text-neon-blue bg-background/60"
                  />
                  <Button onClick={saveRpChanges} className="bg-neon-blue text-primary-foreground font-black px-4 hover:opacity-90">
                    <Save className="size-4 mr-1" /> 저장
                  </Button>
                </div>

                {/* Instant adjustment presets */}
                <div className="mt-4">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-2">실시간 빠른 미세 조정 (즉시 반영)</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[-50, -10, +10, +50].map((delta) => (
                      <button
                        key={delta}
                        onClick={() => applyRpPreset(delta)}
                        className={cn(
                          "py-1.5 text-xs font-mono font-bold rounded-lg border transition-all active:scale-95",
                          delta > 0 
                            ? "border-neon-green/40 bg-neon-green/5 text-neon-green hover:bg-neon-green/15" 
                            : "border-loss/40 bg-loss/5 text-loss hover:bg-loss/15"
                        )}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Match Logs (Right Side) */}
            <div className="md:col-span-3 space-y-3">
              <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                경기 내역 타임라인 <span className="font-mono text-xs rounded-full bg-muted/80 px-2 py-0.5 text-foreground">{studentMatches.length}</span>
              </h4>

              <div className="max-h-[460px] overflow-y-auto space-y-2 border border-border/30 rounded-xl p-3 bg-muted/10">
                {studentMatches.length > 0 ? (
                  studentMatches.map((m) => {
                    const isPlayerA = m.playerAId === selectedStudent.id;
                    const opponentId = isPlayerA ? m.playerBId : m.playerAId;
                    const opponent = students.find((s) => s.id === opponentId) ?? {
                      name: "알 수 없는 선수",
                      grade: 0,
                      classNum: 0,
                      number: 0,
                      gender: "U" as Gender
                    };

                    const scoreSelf = isPlayerA ? m.scoreA : m.scoreB;
                    const scoreOpp = isPlayerA ? m.scoreB : m.scoreA;
                    const isWin = scoreSelf > scoreOpp;
                    const matchDateStr = new Date(m.date).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <div key={m.id} className="flex items-center justify-between border border-border/30 bg-background/40 p-3 rounded-lg hover:border-border/60 transition-all gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "flex size-7 items-center justify-center rounded-full text-xs font-black select-none shrink-0",
                            isWin 
                              ? "bg-win/15 text-win ring-1 ring-win/30" 
                              : "bg-loss/15 text-loss ring-1 ring-loss/30"
                          )}>
                            {isWin ? "승" : "패"}
                          </span>
                          
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>VS</span>
                              <GenderMark gender={opponent.gender} className="size-3.5 text-[9px]" />
                              <span className="font-bold text-foreground">{opponent.realName || opponent.name}</span>
                              <span>({opponent.grade}-{opponent.classNum})</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{matchDateStr}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm font-black tracking-wider text-muted-foreground shrink-0 bg-muted/40 px-2 py-0.5 rounded">
                            <span className={cn(isWin ? "text-win" : "text-loss")}>{scoreSelf}</span>
                            <span> : </span>
                            <span className={cn(!isWin ? "text-win" : "text-loss")}>{scoreOpp}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground">경기 내역이 전혀 존재하지 않습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/40 rounded-xl bg-muted/5">
          <User className="size-10 text-muted-foreground/60 mb-2" />
          <div className="text-xs text-muted-foreground">조회하고 싶은 학생을 검색창에 입력하여 선택해 주세요.</div>
        </div>
      )}
    </Card>
  );
}
