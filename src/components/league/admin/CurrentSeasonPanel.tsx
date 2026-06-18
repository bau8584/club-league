import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeagueStore } from "@/lib/league-store";
import { CalendarDays, Swords, Users, Pencil, RotateCcw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 다음 시즌 이름 추천 (현재 + 과거 시즌에서 가장 큰 번호 +1)
function recommendNext(current: string, past: string[]) {
  let max = 0;
  for (const s of [current, ...past]) {
    const m = (s || "").match(/(\d+)/g);
    if (m) max = Math.max(max, parseInt(m[m.length - 1], 10));
  }
  return `시즌${max + 1}`;
}

export function CurrentSeasonPanel() {
  const { currentSeason, seasonList, students, matches, renameSeason, changeSeason } = useLeagueStore();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const period = useMemo(() => {
    if (matches.length === 0) return null;
    const times = matches.map((m) => new Date(m.date).getTime());
    const fmt = (t: number) => new Date(t).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" });
    return { from: fmt(Math.min(...times)), to: fmt(Math.max(...times)) };
  }, [matches]);

  const openRename = () => { setRenameValue(currentSeason); setRenameOpen(true); };
  const openNew = () => { setNewName(recommendNext(currentSeason, seasonList)); setNewOpen(true); };

  return (
    <div className="space-y-5">
      {/* 현재 시즌 현황 */}
      <Card className="border border-border/60 bg-card/60 p-5 backdrop-blur shadow-lg">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-neon-blue uppercase tracking-wider block">진행 중인 시즌</span>
            <h3 className="text-xl font-black tracking-tight truncate">{currentSeason}</h3>
          </div>
          <Button size="sm" variant="outline" onClick={openRename}
            className="h-8 px-3 rounded-lg text-[11px] font-bold border-border/80 shrink-0">
            <Pencil className="size-3.5 mr-1" /> 이름 변경
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Metric icon={<Swords className="size-4" />} label="경기 수" value={`${matches.length}`} />
          <Metric icon={<Users className="size-4" />} label="참여 학생" value={`${students.length}명`} />
          <Metric icon={<CalendarDays className="size-4" />} label="기간"
            value={period ? `${period.from}` : "-"} sub={period ? `~ ${period.to}` : "경기 없음"} />
        </div>
      </Card>

      {/* 새 시즌 시작 */}
      <Card className="border border-amber-500/30 bg-amber-500/[0.05] p-5 backdrop-blur shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-black text-foreground flex items-center gap-1.5">
              <RotateCcw className="size-4 text-amber-500" /> 새 시즌 시작
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              현재 시즌 순위를 보관한 뒤, 학생을 1000 RP·0승 0패로 초기화합니다. (명단·별명은 유지)
            </p>
          </div>
          <Button onClick={openNew}
            className="shrink-0 self-start sm:self-center bg-amber-500 hover:bg-amber-500/85 text-amber-950 font-black active:scale-95 transition-all">
            <RotateCcw className="mr-2 size-4" /> 새 시즌 시작
          </Button>
        </div>
      </Card>

      {/* 이름 변경 다이얼로그 */}
      <AlertDialog open={renameOpen} onOpenChange={(o) => { if (!o) setRenameOpen(false); }}>
        <AlertDialogContent className="border-border/40 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black flex items-center gap-2">
              <Pencil className="size-5 text-neon-blue" /> 현재 시즌 이름 변경
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
              경기 기록과 순위 데이터에 일괄 반영됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={busy}
            className="h-11 bg-input border-border/65 font-bold mt-1" placeholder="새 시즌 이름" />
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel disabled={busy} className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !renameValue.trim() || renameValue.trim() === currentSeason}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try { await renameSeason(currentSeason, renameValue.trim()); } finally { setBusy(false); setRenameOpen(false); }
              }}
              className="font-black bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground rounded-xl h-11 px-5">
              변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 새 시즌 시작 다이얼로그 */}
      <AlertDialog open={newOpen} onOpenChange={(o) => { if (!o) setNewOpen(false); }}>
        <AlertDialogContent className="border-amber-500/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black flex items-center gap-2">
              <RotateCcw className="size-5 text-amber-500" /> 새 시즌 시작
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              현재 시즌 <b className="text-foreground">{currentSeason}</b>의 순위가 보관되고, 모든 학생이 1000 RP·0승 0패로 초기화됩니다. 명단·별명·개인 코드는 그대로 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-1 space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">새 시즌 이름</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              className="h-11 bg-input border-border/65 font-bold" placeholder="예: 시즌2 또는 2026 2학기" />
          </div>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel disabled={busy} className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !newName.trim() || newName.trim() === currentSeason}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try { await changeSeason(newName.trim()); } finally { setBusy(false); setNewOpen(false); }
              }}
              className="font-black bg-amber-500 hover:bg-amber-500/85 text-amber-950 rounded-xl h-11 px-5">
              새 시즌 시작
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/15 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold">{icon}{label}</div>
      <div className="mt-1 text-lg font-black tracking-tight truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
