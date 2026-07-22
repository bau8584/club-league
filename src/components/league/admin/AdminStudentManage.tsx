import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Users, Save, Trash2, ShieldAlert, HelpCircle, RotateCcw, ChevronDown, ClipboardPaste, UserPlus, Link2, Link2Off, ShieldCheck, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import type { Gender, Student, Match, TierName } from "@/lib/league-types";
import { TierBadge } from "../TierBadge";
import { AddMemberForm } from "../AddMemberForm";
import { CURRENT_YEAR, normalizeBirthYear, yy2 } from "@/lib/birth-year";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface AdminStudentManageProps {
  students: Student[];
  matches?: Match[];
  onUpdateRP?: (studentId: string, nextRp: number) => void;
  onResetStudent?: (studentId: string) => void;
  onDeleteStudent?: (studentId: string) => void;
  onUpdateGender?: (studentId: string, gender: Gender) => void;
  onUpdateStudentInfo?: (...args: any[]) => any;
  thresholds?: Record<TierName, number>;
}

type RowDraft = { name: string; nickname: string; group: string; gender: Gender; rp: number; birthYearInput: string };

type DeletedStudent = { id: string; name: string; nickname: string; group: string | null; rp: number };

// 한 줄 = 한 명. 칸은 탭/콤마로 구분.
//   1칸 → 닉네임 / 2칸 → 레벨, 닉네임
type ParsedRow = { nickname: string; group: string | null };
function parseRoster(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = line.split(/[\t,]/).map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    let nickname = "";
    let group: string | null = null;
    if (cells.length === 1) {
      nickname = cells[0];
    } else {
      group = cells[0];
      nickname = cells[1];
    }
    if (!nickname) continue;
    out.push({ nickname, group: group || null });
  }
  return out;
}

export function AdminStudentManage({ students, onDeleteStudent, thresholds }: AdminStudentManageProps) {
  const { upsertStudents, updateStudentInfo, bulkUpdateStudents, fetchDeletedStudents, restoreDeletedStudent, hardDeleteStudent, levelMode, levels, ownerUid, adminUids, setMemberAdmin, transferOwnership, setCoOwner, coOwnerUids, isClassPrimaryOwner, isClassOwner } = useLeagueStore();

  // 최고관리자(원조 방장) 위임 — 되돌리기 어려우므로 2단계 확인
  const handleTransferOwnership = (uid: string, label: string) => {
    if (!window.confirm(`${label} 님을 최고관리자(원조 방장)로 위임하시겠습니까?\n\n• 모든 리그 권한이 ${label} 님에게 넘어갑니다.\n• 본인은 공동방장으로 변경됩니다.`)) return;
    if (!window.confirm(`정말 진행할까요? 되돌리려면 새 방장이 다시 위임해야 합니다.`)) return;
    transferOwnership(uid);
  };
  const usePresetLevels = levelMode === "preset" && levels.length > 0;

  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<DeletedStudent[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [hardTarget, setHardTarget] = useState<{ id: string; name: string } | null>(null);

  const loadTrash = async () => {
    setTrashLoading(true);
    try { setTrash(await fetchDeletedStudents()); } finally { setTrashLoading(false); }
  };
  const toggleTrash = () => { const next = !trashOpen; setTrashOpen(next); if (next) loadTrash(); };
  const onRestore = async (id: string) => { if (await restoreDeletedStudent(id)) loadTrash(); };
  const runHardDelete = async () => { if (hardTarget && await hardDeleteStudent(hardTarget.id)) loadTrash(); setHardTarget(null); };
  const trashName = (s: DeletedStudent) => s.nickname || s.name || "이름없음";

  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, RowDraft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | { type: "delete"; ids: string[]; label: string }>(null);

  // 명단 붙여넣기
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const pastePreview = useMemo(() => parseRoster(pasteText), [pasteText]);

  // 개인 추가
  const [addOpen, setAddOpen] = useState(false);

  const availableGroups = useMemo(
    () => Array.from(new Set(students.map((s) => s.group || "").filter((g) => g))).sort((a, b) => a.localeCompare(b, "ko")),
    [students]
  );

  const rows = useMemo(
    () =>
      students
        .filter((s) => filterGroup == null || (s.group || "") === filterGroup)
        .slice()
        .sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "ko")),
    [students, filterGroup]
  );
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // 레벨 전환 시 미저장 편집/선택 초기화
  const changeFilter = (g: string | null) => {
    setDraft({});
    setSelected(new Set());
    setFilterGroup(g);
  };
  useEffect(() => { setSelected(new Set()); }, [filterGroup]);

  const rowOf = (s: Student): RowDraft => draft[s.id] ?? { name: s.name || "", nickname: s.nickname || "", group: s.group || "", gender: s.gender, rp: s.rp, birthYearInput: yy2(s.birthYear) };
  const isDirty = (s: Student) => {
    const r = draft[s.id];
    return !!r && (r.name !== (s.name || "") || r.nickname !== (s.nickname || "") || r.group !== (s.group || "") || r.gender !== s.gender || normalizeBirthYear(r.birthYearInput) !== (s.birthYear ?? null));
  };
  const dirtyRows = rows.filter(isDirty);

  const setField = (s: Student, patch: Partial<RowDraft>) =>
    setDraft((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? rowOf(s)), ...patch } }));

  const toggleSelect = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = rows.length > 0 && rows.every((s) => selected.has(s.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((s) => s.id)));

  const handleSave = async () => {
    const updates = dirtyRows.map((s) => {
      const r = draft[s.id];
      const u: { id: string; name?: string; nickname?: string | null; group?: string | null; gender?: Gender; rp?: number; birthYear?: number | null } = { id: s.id };
      if (r.name !== (s.name || "")) u.name = r.name;
      if (r.nickname !== (s.nickname || "")) u.nickname = r.nickname || null;
      if (r.group !== (s.group || "")) u.group = r.group || null;
      if (r.gender !== s.gender) u.gender = r.gender;
      const by = normalizeBirthYear(r.birthYearInput);
      if (by !== (s.birthYear ?? null)) u.birthYear = by;
      return u;
    });
    setSaving(true);
    try {
      const ok = await bulkUpdateStudents(updates);
      if (ok) setDraft({});
    } finally { setSaving(false); }
  };

  const handleImport = async () => {
    const parsed = pastePreview;
    if (parsed.length === 0) { toast.error("붙여넣은 명단에서 닉네임을 찾지 못했습니다."); return; }
    setImporting(true);
    try {
      const res = await upsertStudents(parsed.map((p) => ({ name: p.nickname, group: p.group, nickname: p.nickname })));
      if (res) toast.success(`명단을 반영했습니다. (추가 ${res.added ?? 0}명, 유지 ${res.kept ?? 0}명)`);
      setPasteText("");
      setPasteOpen(false);
    } finally { setImporting(false); }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "delete") {
      confirm.ids.forEach((id) => onDeleteStudent?.(id));
    }
    setSelected(new Set());
    setConfirm(null);
  };

  return (
    <Card className="border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
      <div className="mb-5">
        <div className="flex items-center gap-2 text-neon-blue">
          <Users className="size-5" />
          <h3 className="font-black text-lg">회원 관리</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          닉네임·레벨·성별·나이를 바로 수정하고, 회원을 선택해 삭제할 수 있어요. 명단을 한 번에 붙여넣어 등록할 수도 있습니다. <span className="text-muted-foreground/70">(RP는 경기 기록으로만 바뀌며 직접 수정하지 않습니다.)</span>
        </p>
      </div>

      {/* 명단 붙여넣기 / 개인 추가 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setPasteOpen((v) => !v)} variant="outline"
          className="h-9 px-3 rounded-lg text-xs font-bold border-border/80">
          <ClipboardPaste className="size-4 mr-1.5" /> 명단 붙여넣기
        </Button>
        <Button onClick={() => setAddOpen((v) => !v)} variant="outline"
          className="h-9 px-3 rounded-lg text-xs font-bold border-border/80">
          <UserPlus className="size-4 mr-1.5" /> 회원 추가
        </Button>
      </div>

      {pasteOpen && (
        <div className="mb-5 rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <HelpCircle className="size-3.5 mt-0.5 shrink-0 text-neon-blue" />
            <span>
              한 줄에 한 명씩 입력하세요. 칸은 <b className="text-foreground">탭 또는 콤마(,)</b>로 구분합니다.<br />
              · <b className="text-foreground">닉네임</b> (칸 1개)<br />
              · <b className="text-foreground">레벨, 닉네임</b> (칸 2개)
            </span>
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"예시)\nA조, 길동이\nA조, 철수\n영희"}
            className="w-full rounded-lg bg-input border border-border/30 p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-neon-blue"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">미리보기: <b className="text-foreground">{pastePreview.length}명</b> 인식됨</span>
            <Button onClick={handleImport} disabled={pastePreview.length === 0 || importing}
              className="h-8 px-4 bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black text-[11px] rounded-lg disabled:opacity-40">
              <Save className="size-3.5 mr-1" /> 명단 등록 ({pastePreview.length})
            </Button>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="mb-5">
          <AddMemberForm onAdded={() => setAddOpen(false)} />
        </div>
      )}

      {/* 레벨 필터 */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
        <div>
          <span className="text-xs text-neon-blue font-bold uppercase tracking-wider">레벨</span>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => changeFilter(null)}
              className={cn("px-4 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95",
                filterGroup === null ? "border-neon-blue bg-neon-blue/20 text-neon-blue" : "border-border/60 bg-input text-muted-foreground hover:text-foreground")}>
              전체
            </button>
            {availableGroups.map((g) => (
              <button key={g} type="button" onClick={() => changeFilter(g)}
                className={cn("px-4 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95",
                  filterGroup === g ? "border-neon-blue bg-neon-blue/20 text-neon-blue" : "border-border/60 bg-input text-muted-foreground hover:text-foreground")}>
                {g}
              </button>
            ))}
            {students.length === 0 && <span className="text-xs text-muted-foreground py-1">등록된 회원이 없습니다.</span>}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {/* 일괄 작업 툴바 */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
          <span className="text-xs font-bold text-muted-foreground">선택 {selected.size}명</span>
          <div className="h-4 w-px bg-border/40" />
          <button disabled={selected.size === 0}
            onClick={() => setConfirm({ type: "delete", ids: [...selected], label: `${selected.size}명` })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border border-destructive/40 text-destructive hover:bg-destructive/10 transition-all active:scale-95 disabled:opacity-40">
            <Trash2 className="size-3.5" /> 삭제
          </button>
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={dirtyRows.length === 0 || saving}
              className="h-8 px-4 bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black text-[11px] rounded-lg active:scale-95 disabled:opacity-40">
              <Save className="size-3.5 mr-1" /> 변경사항 저장{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ""}
            </Button>
          </div>
        </div>

        {/* 편집 표 */}
        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="size-4 accent-neon-blue align-middle" /></th>
                <th className="px-2 py-2.5 text-left font-bold">닉네임</th>
                <th className="px-2 py-2.5 text-left font-bold">레벨</th>
                <th className="px-2 py-2.5 text-center font-bold">나이</th>
                <th className="px-2 py-2.5 text-center font-bold">성별</th>
                <th className="px-2 py-2.5 text-center font-bold">티어</th>
                <th className="px-2 py-2.5 text-center font-bold">RP</th>
                <th className="px-2 py-2.5 text-center font-bold"></th>
                {isClassOwner && <th className="px-2 py-2.5 text-center font-bold">관리자</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => {
                const r = rowOf(s);
                const dirty = isDirty(s);
                return (
                  <tr key={s.id} className={cn("border-t border-border/20", idx % 2 === 1 && "bg-muted/[0.12]", selected.has(s.id) && "bg-neon-blue/[0.06]", dirty && "ring-1 ring-inset ring-amber-500/40")}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} className="size-4 accent-neon-blue align-middle" /></td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {s.userId ? (
                          <Link2 className="size-3.5 shrink-0 text-emerald-400" aria-label="구글 연동됨"><title>구글 계정 연동됨</title></Link2>
                        ) : (
                          <Link2Off className="size-3.5 shrink-0 text-muted-foreground/50" aria-label="미연동"><title>구글 계정 미연동</title></Link2Off>
                        )}
                        <Input type="text" value={r.nickname}
                          onChange={(e) => setField(s, { nickname: e.target.value })}
                          placeholder="(없음)"
                          className="h-8 min-w-[80px] bg-input border-border/30 font-bold" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {usePresetLevels ? (
                        <select value={r.group}
                          onChange={(e) => setField(s, { group: e.target.value })}
                          className="h-8 w-24 rounded-md bg-input border border-border/30 px-1.5 text-sm">
                          <option value="">(없음)</option>
                          {levels.map((lv) => <option key={lv.name} value={lv.name}>{lv.name}</option>)}
                          {/* 목록에 없는 기존 값 보존 */}
                          {r.group && !levels.some((lv) => lv.name === r.group) && (
                            <option value={r.group}>{r.group}</option>
                          )}
                        </select>
                      ) : (
                        <Input type="text" value={r.group}
                          onChange={(e) => setField(s, { group: e.target.value })}
                          placeholder="(없음)"
                          className="h-8 w-20 bg-input border-border/30" />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          value={r.birthYearInput}
                          onChange={(e) => setField(s, { birthYearInput: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                          placeholder="연생"
                          inputMode="numeric"
                          className="h-8 w-14 text-center bg-input border-border/30 p-0" />
                        <span className="w-7 text-[10px] text-muted-foreground tabular-nums">
                          {(() => { const by = normalizeBirthYear(r.birthYearInput); return by ? `${CURRENT_YEAR - by}세` : ""; })()}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        {(["M", "F"] as const).map((g) => (
                          <button key={g} type="button" onClick={() => setField(s, { gender: g })}
                            className={cn("size-7 rounded-md text-[11px] font-black border transition-all active:scale-95",
                              r.gender === g
                                ? (g === "M" ? "border-sky-500/60 bg-sky-500/20 text-sky-400" : "border-pink-500/60 bg-pink-500/20 text-pink-400")
                                : "border-border/40 text-muted-foreground hover:text-foreground")}>
                            {g === "M" ? "남" : "녀"}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center"><TierBadge rp={r.rp} thresholds={thresholds} /></td>
                    <td className="px-2 py-1.5 text-center font-mono font-bold text-neon-blue">{r.rp}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" disabled={!dirty}
                        onClick={async () => {
                          await updateStudentInfo(s.id, {
                            name: r.name,
                            nickname: r.nickname || null,
                            group: r.group || null,
                            gender: r.gender,
                            birthYear: normalizeBirthYear(r.birthYearInput),
                          });
                          setDraft((prev) => { const n = { ...prev }; delete n[s.id]; return n; });
                        }}
                        title="이 회원만 저장"
                        className="inline-flex items-center justify-center size-7 rounded-md border border-border/40 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/60 transition-all active:scale-95 disabled:opacity-30">
                        <Save className="size-3.5" />
                      </button>
                    </td>
                    {isClassOwner && (() => {
                      const linked = !!s.userId;
                      const label = r.nickname || s.name || "이 회원";
                      const isOwnerRow = linked && s.userId === ownerUid;
                      const isCoOwnerRow = linked && coOwnerUids.includes(s.userId!);
                      const isAdminRow = linked && adminUids.includes(s.userId!);
                      // 원조 방장 전용 버튼: 공동방장 지정/해제 + 최고관리자 위임
                      const CoOwnerSet = () => (
                        <button type="button"
                          onClick={() => { if (window.confirm(`${label} 님을 공동방장으로 지정하시겠습니까?\n방장과 동일한 권한(글로벌 설정·시즌·휴면 등)을 함께 행사합니다.`)) setCoOwner(s.userId!, true); }}
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-500 underline-offset-2 hover:underline">
                          <Crown className="size-2.5" /> 공동방장 지정
                        </button>
                      );
                      const TransferBtn = () => (
                        <button type="button"
                          onClick={() => handleTransferOwnership(s.userId!, label)}
                          className="text-[10px] font-bold text-muted-foreground underline-offset-2 hover:text-amber-500 hover:underline">
                          최고관리자 위임
                        </button>
                      );
                      return (
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">
                          {isOwnerRow ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-500">
                              <Crown className="size-3" /> 방장
                            </span>
                          ) : !linked ? (
                            <span className="text-[10px] text-muted-foreground/60" title="구글 연동된 회원만 권한을 부여할 수 있어요">미연동</span>
                          ) : isCoOwnerRow ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-500">
                                <Crown className="size-3" /> 공동방장
                              </span>
                              {isClassPrimaryOwner && (
                                <button type="button"
                                  onClick={() => { if (window.confirm(`${label} 님의 공동방장을 해제하시겠습니까?\n일반 회원으로 변경됩니다.`)) setCoOwner(s.userId!, false); }}
                                  className="text-[10px] font-bold text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
                                  공동방장 해제
                                </button>
                              )}
                            </div>
                          ) : isAdminRow ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-neon-blue/35 bg-neon-blue/15 px-2 py-0.5 text-[10px] font-black text-neon-blue">
                                <ShieldCheck className="size-3" /> 관리자
                              </span>
                              <button type="button"
                                onClick={() => { if (window.confirm(`${label} 님을 관리자에서 일반 회원으로 강등하시겠습니까?`)) setMemberAdmin(s.userId!, false); }}
                                className="text-[10px] font-bold text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
                                일반으로 강등
                              </button>
                              {isClassPrimaryOwner && <CoOwnerSet />}
                              {isClassPrimaryOwner && <TransferBtn />}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                                일반
                              </span>
                              <button type="button"
                                onClick={() => { if (window.confirm(`${label} 님을 공동 관리자로 승격하시겠습니까?`)) setMemberAdmin(s.userId!, true); }}
                                className="text-[10px] font-bold text-neon-blue underline-offset-2 hover:underline">
                                관리자 승격
                              </button>
                              {isClassPrimaryOwner && <CoOwnerSet />}
                              {isClassPrimaryOwner && <TransferBtn />}
                            </div>
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={isClassOwner ? 9 : 8} className="py-8 text-center text-muted-foreground text-xs">등록된 회원이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {dirtyRows.length > 0 && (
          <p className="text-[11px] text-amber-500 font-bold">※ 미저장 변경 {dirtyRows.length}건 — [변경사항 저장]을 눌러야 반영됩니다.</p>
        )}
      </div>

      {/* 휴지통 */}
      <div className="mt-6 pt-4 border-t border-border/30">
        <button onClick={toggleTrash} className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <RotateCcw className="size-4" /> 삭제한 회원 복원
          <ChevronDown className={cn("size-4 transition-transform", trashOpen && "rotate-180")} />
        </button>
        {trashOpen && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              삭제된 회원을 복원할 수 있어요. <b className="text-amber-500">단, 그 회원의 과거 경기 기록과 상대방 RP 변동은 복구되지 않습니다.</b>
            </p>
            {trashLoading ? (
              <p className="text-xs text-muted-foreground py-3 text-center">불러오는 중...</p>
            ) : trash.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border/30 rounded-xl bg-muted/5">삭제한 회원이 없습니다.</p>
            ) : (
              trash.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-muted/15 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <span className="font-bold">{trashName(s)}</span>
                    <span className="text-[11px] text-muted-foreground ml-2">{s.group ? `${s.group} · ` : ""}{s.rp} RP</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onRestore(s.id)} className="h-8 px-3 rounded-lg text-[11px] font-bold border-border/80">
                      <RotateCcw className="size-3.5 mr-1" /> 복원
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHardTarget({ id: s.id, name: trashName(s) })} className="h-8 px-3 rounded-lg text-[11px] font-bold text-destructive hover:bg-destructive/10">
                      <Trash2 className="size-3.5 mr-1" /> 영구삭제
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 영구 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!hardTarget} onOpenChange={(o) => { if (!o) setHardTarget(null); }}>
        <AlertDialogContent className="border-destructive/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black text-destructive flex items-center gap-2">
              <ShieldAlert className="size-5" /> {hardTarget?.name} 영구 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              이 회원을 데이터베이스에서 완전히 제거합니다. 더 이상 복원할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runHardDelete(); }}
              className="font-black bg-destructive hover:bg-destructive/80 text-white rounded-xl h-11 px-5">
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일괄 확인 다이얼로그 */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent className="border-border/40 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              회원 {confirm?.label} 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              선택한 회원과 관련 경기 기록이 삭제되고 RP가 롤백됩니다. 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runConfirm(); }}
              className="font-black rounded-xl h-11 px-5 bg-destructive hover:bg-destructive/80 text-white">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
