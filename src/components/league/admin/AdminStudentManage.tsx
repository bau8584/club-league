import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Users, Save, KeyRound, Trash2, ShieldAlert, HelpCircle, RotateCcw, ChevronDown, ClipboardPaste, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiResetStudentCode } from "@/services/league-api";
import { useLeagueStore } from "@/lib/league-store";
import type { Gender, Student, Match, TierName } from "@/lib/league-types";
import { TierBadge } from "../TierBadge";
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

type RowDraft = { name: string; nickname: string; group: string; gender: Gender; rp: number };

type DeletedStudent = { id: string; name: string; nickname: string; group: string | null; rp: number };

// 한 줄 = 한 명. 칸은 탭/콤마로 구분.
//   1칸 → 닉네임 / 2칸 → 구분조, 닉네임
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

// 연생(출생연도) 선택 옵션: 약 10~89세 범위
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 80 }, (_, i) => CURRENT_YEAR - 10 - i);

export function AdminStudentManage({ students, onDeleteStudent, thresholds }: AdminStudentManageProps) {
  const { upsertStudents, updateStudentInfo, bulkUpdateStudents, fetchDeletedStudents, restoreDeletedStudent, hardDeleteStudent } = useLeagueStore();

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
  const [confirm, setConfirm] = useState<null | { type: "codeReset" | "delete"; ids: string[]; label: string }>(null);

  // 명단 붙여넣기
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const pastePreview = useMemo(() => parseRoster(pasteText), [pasteText]);

  // 개인 추가
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ nickname: string; group: string; gender: Gender; birthYear: string }>({ nickname: "", group: "", gender: "U", birthYear: "" });
  const [adding, setAdding] = useState(false);

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

  // 구분조 전환 시 미저장 편집/선택 초기화
  const changeFilter = (g: string | null) => {
    setDraft({});
    setSelected(new Set());
    setFilterGroup(g);
  };
  useEffect(() => { setSelected(new Set()); }, [filterGroup]);

  const rowOf = (s: Student): RowDraft => draft[s.id] ?? { name: s.name || "", nickname: s.nickname || "", group: s.group || "", gender: s.gender, rp: s.rp };
  const isDirty = (s: Student) => {
    const r = draft[s.id];
    return !!r && (r.name !== (s.name || "") || r.nickname !== (s.nickname || "") || r.group !== (s.group || "") || r.gender !== s.gender || r.rp !== s.rp);
  };
  const dirtyRows = rows.filter(isDirty);

  const setField = (s: Student, patch: Partial<RowDraft>) =>
    setDraft((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? rowOf(s)), ...patch } }));

  const adjustSelectedRp = (fn: (rp: number) => number) =>
    setDraft((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const s = studentsById.get(id);
        if (!s) continue;
        const base = next[id] ?? { name: s.name || "", nickname: s.nickname || "", group: s.group || "", gender: s.gender, rp: s.rp };
        next[id] = { ...base, rp: Math.max(0, Math.round(fn(base.rp))) };
      }
      return next;
    });

  const toggleSelect = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = rows.length > 0 && rows.every((s) => selected.has(s.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((s) => s.id)));

  const handleSave = async () => {
    const updates = dirtyRows.map((s) => {
      const r = draft[s.id];
      const u: { id: string; name?: string; nickname?: string | null; group?: string | null; gender?: Gender; rp?: number } = { id: s.id };
      if (r.name !== (s.name || "")) u.name = r.name;
      if (r.nickname !== (s.nickname || "")) u.nickname = r.nickname || null;
      if (r.group !== (s.group || "")) u.group = r.group || null;
      if (r.gender !== s.gender) u.gender = r.gender;
      if (r.rp !== s.rp) u.rp = r.rp;
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

  const handleAdd = async () => {
    const nickname = addForm.nickname.trim();
    if (!nickname) { toast.error("닉네임을 입력하세요."); return; }
    setAdding(true);
    try {
      await upsertStudents([{
        name: nickname,
        nickname,
        group: addForm.group.trim() || null,
        gender: addForm.gender,
        birthYear: addForm.birthYear ? Number(addForm.birthYear) : null,
      }]);
      setAddForm({ nickname: "", group: "", gender: "U", birthYear: "" });
      setAddOpen(false);
    } finally { setAdding(false); }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "codeReset") {
      const res = await Promise.all(confirm.ids.map((id) => apiResetStudentCode(id)));
      const failed = res.filter((r) => r.error).length;
      if (failed) toast.error(`${failed}명 코드 초기화 실패`);
      else toast.success(`${confirm.ids.length}명의 개인 코드를 초기화했습니다.`);
    } else if (confirm.type === "delete") {
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
          닉네임·구분조·성별·RP를 바로 수정하고, 회원을 선택해 코드 초기화나 RP 일괄 조정을 할 수 있어요. 명단을 한 번에 붙여넣어 등록할 수도 있습니다.
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
              · <b className="text-foreground">구분조, 닉네임</b> (칸 2개)
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
        <div className="mb-5 rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground">닉네임</label>
              <Input value={addForm.nickname} onChange={(e) => setAddForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="닉네임" className="h-9 mt-1 bg-input border-border/30" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground">구분조 (선택)</label>
              <Input value={addForm.group} onChange={(e) => setAddForm((f) => ({ ...f, group: e.target.value }))}
                placeholder="구분조" className="h-9 mt-1 bg-input border-border/30" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground">나이(연생) (선택)</label>
              <select value={addForm.birthYear} onChange={(e) => setAddForm((f) => ({ ...f, birthYear: e.target.value }))}
                className="h-9 mt-1 w-full rounded-md bg-input border border-border/30 px-2 text-sm">
                <option value="">선택 안 함</option>
                {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}년생</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-muted-foreground mr-1">성별</span>
              {(["M", "F", "U"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setAddForm((f) => ({ ...f, gender: g }))}
                  className={cn("h-7 px-2.5 rounded-md text-[11px] font-black border transition-all active:scale-95",
                    addForm.gender === g
                      ? (g === "M" ? "border-sky-500/60 bg-sky-500/20 text-sky-400" : g === "F" ? "border-pink-500/60 bg-pink-500/20 text-pink-400" : "border-neon-blue/60 bg-neon-blue/20 text-neon-blue")
                      : "border-border/40 text-muted-foreground hover:text-foreground")}>
                  {g === "M" ? "남" : g === "F" ? "녀" : "미정"}
                </button>
              ))}
            </div>
            <Button onClick={handleAdd} disabled={adding}
              className="h-8 px-4 bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black text-[11px] rounded-lg disabled:opacity-40">
              <UserPlus className="size-3.5 mr-1" /> 추가
            </Button>
          </div>
        </div>
      )}

      {/* 구분조 필터 */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
        <div>
          <span className="text-xs text-neon-blue font-bold uppercase tracking-wider">구분조</span>
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
          <span className="text-[11px] font-bold text-muted-foreground">RP</span>
          {[-50, -10, +10, +50].map((d) => (
            <button key={d} disabled={selected.size === 0} onClick={() => adjustSelectedRp((rp) => rp + d)}
              className={cn("px-2 py-1 rounded-md text-[11px] font-mono font-bold border transition-all active:scale-95 disabled:opacity-40",
                d > 0 ? "border-neon-green/40 text-neon-green hover:bg-neon-green/10" : "border-loss/40 text-loss hover:bg-loss/10")}>
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
          <button disabled={selected.size === 0} onClick={() => adjustSelectedRp(() => 1000)}
            className="px-2 py-1 rounded-md text-[11px] font-bold border border-border/60 text-muted-foreground hover:text-foreground transition-all active:scale-95 disabled:opacity-40">
            1000으로
          </button>
          <div className="h-4 w-px bg-border/40" />
          <button disabled={selected.size === 0}
            onClick={() => setConfirm({ type: "codeReset", ids: [...selected], label: `${selected.size}명` })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border border-border/60 text-foreground hover:bg-accent/40 transition-all active:scale-95 disabled:opacity-40">
            <KeyRound className="size-3.5" /> 코드 초기화
          </button>
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

        {/* 코드 초기화 안내 */}
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 px-1">
          <HelpCircle className="size-3.5 mt-0.5 shrink-0 text-neon-blue" />
          <span>
            <b className="text-foreground">개인 코드</b>는 회원이 [회원 열람 화면]에서 자기 카드(닉네임 등)를 수정할 때 쓰는 비밀번호예요.
            회원이 코드를 잊었을 때 <b className="text-foreground">초기화</b>하면 새 코드를 다시 정할 수 있습니다. (전적·닉네임은 그대로)
          </span>
        </p>

        {/* 편집 표 */}
        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="size-4 accent-neon-blue align-middle" /></th>
                <th className="px-2 py-2.5 text-left font-bold">닉네임</th>
                <th className="px-2 py-2.5 text-left font-bold">구분조</th>
                <th className="px-2 py-2.5 text-center font-bold">나이</th>
                <th className="px-2 py-2.5 text-center font-bold">성별</th>
                <th className="px-2 py-2.5 text-center font-bold">티어</th>
                <th className="px-2 py-2.5 text-center font-bold">RP</th>
                <th className="px-2 py-2.5 text-center font-bold"></th>
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
                      <Input type="text" value={r.nickname}
                        onChange={(e) => setField(s, { nickname: e.target.value })}
                        placeholder="(없음)"
                        className="h-8 min-w-[90px] bg-input border-border/30 font-bold" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="text" value={r.group}
                        onChange={(e) => setField(s, { group: e.target.value })}
                        placeholder="(없음)"
                        className="h-8 w-20 bg-input border-border/30" />
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground tabular-nums">
                      {s.birthYear ? `${CURRENT_YEAR - s.birthYear}세` : "-"}
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
                    <td className="px-2 py-1.5">
                      <Input type="number" value={r.rp}
                        onChange={(e) => setField(s, { rp: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="h-8 w-20 mx-auto text-center font-mono font-bold bg-input border-border/30 text-neon-blue p-0" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" disabled={!dirty}
                        onClick={async () => {
                          await updateStudentInfo(s.id, {
                            name: r.name,
                            nickname: r.nickname || null,
                            group: r.group || null,
                            gender: r.gender,
                            rp: r.rp,
                          });
                          setDraft((prev) => { const n = { ...prev }; delete n[s.id]; return n; });
                        }}
                        title="이 회원만 저장"
                        className="inline-flex items-center justify-center size-7 rounded-md border border-border/40 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/60 transition-all active:scale-95 disabled:opacity-30">
                        <Save className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">등록된 회원이 없습니다.</td></tr>
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
            <AlertDialogTitle className={cn("text-lg font-black flex items-center gap-2", confirm?.type === "delete" && "text-destructive")}>
              {confirm?.type === "delete" ? <ShieldAlert className="size-5" /> : <KeyRound className="size-5 text-neon-blue" />}
              {confirm?.type === "delete" ? `회원 ${confirm?.label} 삭제` : `개인 코드 초기화 (${confirm?.label})`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {confirm?.type === "delete"
                ? "선택한 회원과 관련 경기 기록이 삭제되고 RP가 롤백됩니다. 되돌릴 수 없습니다."
                : "선택한 회원들의 개인 코드가 초기화되어 다시 새 코드를 정할 수 있게 됩니다. (닉네임·전적은 유지)"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runConfirm(); }}
              className={cn("font-black rounded-xl h-11 px-5",
                confirm?.type === "delete" ? "bg-destructive hover:bg-destructive/80 text-white" : "bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground")}>
              {confirm?.type === "delete" ? "삭제" : "초기화"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
