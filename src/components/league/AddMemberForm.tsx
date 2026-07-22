import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import type { Gender } from "@/lib/league-types";
import { CURRENT_YEAR, normalizeBirthYear } from "@/lib/birth-year";

/**
 * 회원 추가 폼 (레이아웃 중립) — 회원관리 화면과 경기 기록 팝업에서 공용 사용.
 * 닉네임/레벨/나이(연생)/성별 입력 후 upsertStudents로 등록.
 */
export function AddMemberForm({ onAdded, className }: { onAdded?: (nickname: string) => void; className?: string }) {
  const { upsertStudents, levelMode, levels } = useLeagueStore();
  const usePresetLevels = levelMode === "preset" && levels.length > 0;

  const [form, setForm] = useState<{ nickname: string; group: string; gender: Gender; birthYear: string }>({
    nickname: "",
    group: "",
    gender: "U",
    birthYear: "",
  });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const nickname = form.nickname.trim();
    if (!nickname) { toast.error("닉네임을 입력하세요."); return; }
    setAdding(true);
    try {
      await upsertStudents([{
        name: nickname,
        nickname,
        group: form.group.trim() || null,
        gender: form.gender,
        birthYear: normalizeBirthYear(form.birthYear),
      }]);
      setForm({ nickname: "", group: "", gender: "U", birthYear: "" });
      onAdded?.(nickname);
    } finally { setAdding(false); }
  };

  return (
    <div className={cn("rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">닉네임</label>
          <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            placeholder="닉네임" className="h-9 mt-1 bg-input border-border/30" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">레벨 (선택)</label>
          {usePresetLevels ? (
            <select value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              className="h-9 mt-1 w-full rounded-md bg-input border border-border/30 px-2 text-sm">
              <option value="">선택 안 함</option>
              {levels.map((lv) => <option key={lv.name} value={lv.name}>{lv.name}</option>)}
            </select>
          ) : (
            <Input value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              placeholder="레벨" className="h-9 mt-1 bg-input border-border/30" />
          )}
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">나이(연생) (선택)</label>
          <Input
            value={form.birthYear}
            onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))}
            placeholder="연생 입력 (예: 94, 01)"
            inputMode="numeric"
            className="h-9 mt-1 bg-input border-border/30"
          />
          {form.birthYear && normalizeBirthYear(form.birthYear) && (
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {normalizeBirthYear(form.birthYear)}년생 · 만 {CURRENT_YEAR - normalizeBirthYear(form.birthYear)!}세
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-muted-foreground mr-1">성별</span>
          {(["M", "F", "U"] as const).map((g) => (
            <button key={g} type="button" onClick={() => setForm((f) => ({ ...f, gender: g }))}
              className={cn("h-7 px-2.5 rounded-md text-[11px] font-black border transition-all active:scale-95",
                form.gender === g
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
  );
}
