import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import { getSportPreset } from "@/domain/sport-levels";
import { Plus, Trash2, GripVertical, RotateCcw, Save, AlertTriangle, ChevronDown, Layers } from "lucide-react";

type LevelRow = { name: string; description?: string; originalName?: string };

// 관리자 레벨 체계 편집기: 이름/설명 수정·추가·삭제, preset/free 모드 전환, 종목 프리셋으로 초기화.
//  - 레벨 이름변경/삭제 시 그 레벨이던 회원의 group 을 자동 이전/정리.
export function LevelManager() {
  const { levels, levelMode, sport, saveLevels, students } = useLeagueStore();
  const [mode, setMode] = useState<"preset" | "free">(levelMode);
  const [rows, setRows] = useState<LevelRow[]>(levels.map((l) => ({ ...l, originalName: l.name })));
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [open, setOpen] = useState(false);

  // 스토어(리그 로드/저장)와 동기화
  useEffect(() => { setMode(levelMode); }, [levelMode]);
  useEffect(() => { setRows(levels.map((l) => ({ ...l, originalName: l.name }))); setPendingConfirm(false); }, [levels]);

  const preset = getSportPreset(sport);

  const dirty =
    mode !== levelMode ||
    JSON.stringify(rows.map((r) => ({ name: r.name, description: r.description }))) !==
      JSON.stringify(levels.map((l) => ({ name: l.name, description: l.description })));

  const updateRow = (i: number, patch: Partial<LevelRow>) => { setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); setPendingConfirm(false); };
  const removeRow = (i: number) => { setRows((rs) => rs.filter((_, idx) => idx !== i)); setPendingConfirm(false); };
  const addRow = () => { setRows((rs) => [...rs, { name: "", description: "" }]); setPendingConfirm(false); };
  const loadPreset = () => { if (preset) { setRows(preset.levels.map((l) => ({ ...l }))); setPendingConfirm(false); } };
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // 저장 시 적용될 레벨 이전/정리 계산
  const computeMigrations = (cleaned: LevelRow[]) => {
    const kept = new Set(cleaned.map((r) => r.originalName).filter(Boolean) as string[]);
    const migs: { from: string; to: string | null }[] = [];
    for (const r of cleaned) {
      if (r.originalName && r.originalName !== r.name) migs.push({ from: r.originalName, to: r.name });
    }
    for (const l of levels) {
      if (!kept.has(l.name)) migs.push({ from: l.name, to: null }); // 삭제된 레벨 → 정리
    }
    return migs;
  };

  const buildCleaned = () =>
    rows
      .map((r) => ({ name: r.name.trim(), description: (r.description || "").trim() || undefined, originalName: r.originalName }))
      .filter((r) => r.name);

  const affectedCount = (migs: { from: string }[]) =>
    students.filter((s) => migs.some((m) => (s.group || "") === m.from)).length;

  const handleSave = async () => {
    const cleaned = buildCleaned();
    if (mode === "preset" && cleaned.length === 0) {
      return; // 빈 목록 preset 방지 (회원이 레벨을 못 고름)
    }
    const migs = computeMigrations(cleaned);
    const affected = affectedCount(migs);
    if (affected > 0 && !pendingConfirm) {
      setPendingConfirm(true); // 회원 레벨이 변경되므로 한 번 더 확인
      return;
    }
    setSaving(true);
    const finalLevels = cleaned.map(({ name, description }) => ({ name, ...(description ? { description } : {}) }));
    const ok = await saveLevels(finalLevels, mode, migs);
    setSaving(false);
    setPendingConfirm(false);
    if (ok) setRows(finalLevels.map((l) => ({ ...l, originalName: l.name })));
  };

  const pendingMigs = pendingConfirm ? computeMigrations(buildCleaned()) : [];
  const pendingAffected = pendingConfirm ? affectedCount(pendingMigs) : 0;

  return (
    <Card className="border-border/60 bg-card/60 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 sm:px-6 py-4 text-left hover:bg-accent/20 transition-colors">
        <span className="flex items-center gap-2">
          <Layers className="size-4 text-neon-blue" />
          <span className="text-base font-black text-foreground">레벨 체계 관리</span>
          <span className="text-[11px] text-muted-foreground">
            ({levelMode === "preset" ? `체계 따름 · ${levels.length}개` : "자유"})
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {!open ? null : (
      <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        회원이 프로필에서 고르는 레벨(급수) 목록을 관리합니다. <b>체계 따름</b>이면 정의된 목록에서만 선택,
        <b> 자유</b>면 회원이 직접 텍스트로 입력합니다. 레벨 <b>이름을 바꾸거나 삭제</b>하면 그 레벨이던 회원도 자동으로 이전/정리됩니다.
      </p>

      {/* 모드 토글 */}
      <div className="inline-flex rounded-xl bg-muted/40 p-1 border border-border/30">
        <button type="button" onClick={() => { setMode("preset"); setPendingConfirm(false); }}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-black transition-all",
            mode === "preset" ? "bg-neon-blue/15 text-neon-blue" : "text-muted-foreground")}>
          체계 따름
        </button>
        <button type="button" onClick={() => { setMode("free"); setPendingConfirm(false); }}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-black transition-all",
            mode === "free" ? "bg-neon-blue/15 text-neon-blue" : "text-muted-foreground")}>
          자유
        </button>
      </div>

      {mode === "free" ? (
        <p className="rounded-lg border border-border/40 bg-background/30 p-3 text-xs text-muted-foreground">
          자유 모드에서는 회원이 레벨을 직접 입력합니다. 아래 목록은 저장되지만 선택을 강제하지 않습니다.
        </p>
      ) : null}

      {/* 레벨 목록 편집 */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            레벨이 없습니다. 아래 <b>+ 레벨 추가</b>로 만들거나
            {preset ? " 종목 표준 체계로 불러오세요." : " 직접 추가하세요."}
          </p>
        )}
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-background/40 p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none text-[10px]">▲</button>
                <GripVertical className="size-3 text-muted-foreground/40" />
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none text-[10px]">▼</button>
              </div>
              <Input
                value={r.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                placeholder="레벨 이름 (예: A급)"
                className="h-9 w-28 shrink-0 bg-input border-border/40 font-bold"
              />
              <Input
                value={r.description || ""}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                placeholder="설명 (선택)"
                className="h-9 flex-1 bg-input border-border/40 text-xs"
              />
              <Button type="button" variant="ghost" size="icon"
                onClick={() => removeRow(i)}
                className="size-9 shrink-0 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* 회원 영향 확인 */}
      {pendingConfirm && pendingAffected > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            이 변경으로 <b>{pendingAffected}명</b>의 회원 레벨이 새 이름으로 이전되거나 정리(삭제)됩니다.
            계속하려면 <b>저장</b>을 한 번 더 누르세요.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}
          className="border-border/50">
          <Plus className="size-4 mr-1" /> 레벨 추가
        </Button>
        {preset && (
          <Button type="button" variant="outline" size="sm" onClick={loadPreset}
            className="border-border/50">
            <RotateCcw className="size-4 mr-1" /> {sport} 표준 체계 불러오기
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={handleSave}
          disabled={!dirty || saving}
          className={cn("font-bold disabled:opacity-40 text-primary-foreground",
            pendingConfirm ? "bg-amber-600 hover:bg-amber-600/90" : "bg-gradient-to-r from-neon-blue to-tier-diamond")}>
          <Save className="size-4 mr-1" /> {saving ? "저장 중…" : pendingConfirm ? "확인하고 저장" : "저장"}
        </Button>
      </div>
      </div>
      )}
    </Card>
  );
}
