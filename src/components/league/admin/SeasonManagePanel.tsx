import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeagueStore } from "@/lib/league-store";
import { History, RotateCcw, Pencil, Trash2, ShieldAlert } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SeasonManagePanel() {
  const { seasonList, restoreSeason, renameSeason, deleteSeason } = useLeagueStore();

  const [confirm, setConfirm] = useState<{ type: "restore" | "delete"; season: string } | null>(null);
  const [deleteMatches, setDeleteMatches] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ success: boolean }>) => {
    setBusy(true);
    try { await fn(); } finally {
      setBusy(false);
      setConfirm(null);
      setRenameTarget(null);
      setDeleteMatches(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 과거 시즌 관리 */}
      <Card className="border border-border/60 bg-card/60 p-5 backdrop-blur shadow-lg">
        <div className="flex items-center gap-2 text-neon-blue mb-3">
          <History className="size-5" />
          <h3 className="font-black text-base text-foreground">과거 시즌 관리</h3>
        </div>
        {seasonList.length === 0 ? (
          <p className="text-xs text-muted-foreground">관리할 과거 시즌이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {seasonList.map((season) => (
              <div key={season} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-muted/15 px-3.5 py-2.5">
                <span className="font-bold text-sm">{season}</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setConfirm({ type: "restore", season })}
                    className="h-8 px-2.5 rounded-lg text-[11px] font-bold border-border/80">
                    <RotateCcw className="size-3.5 mr-1" /> 복귀
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => { setRenameTarget(season); setRenameValue(season); }}
                    className="h-8 px-2.5 rounded-lg text-[11px] font-bold border-border/80">
                    <Pencil className="size-3.5 mr-1" /> 이름변경
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => { setDeleteMatches(false); setConfirm({ type: "delete", season }); }}
                    className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-3.5 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 복귀 / 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent className="border-border/40 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black flex items-center gap-2">
              {confirm?.type === "restore"
                ? (<><RotateCcw className="size-5 text-neon-blue" /> '{confirm?.season}' 시즌으로 복귀</>)
                : (<><ShieldAlert className="size-5 text-destructive" /> '{confirm?.season}' 시즌 삭제</>)}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {confirm?.type === "restore" ? (
                <>현재 진행분은 먼저 보관되고, 학생 RP·전적이 <b className="text-foreground">{confirm?.season}</b> 시즌 값으로 복원됩니다. 그 사이 등록된 전학생은 1000 RP로 시작합니다. 이후 새 경기는 이 시즌에 이어서 쌓입니다.</>
              ) : (
                <>이 시즌의 보관된 순위 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm?.type === "delete" && (
            <label className="flex items-center gap-2 mt-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={deleteMatches} onChange={(e) => setDeleteMatches(e.target.checked)} className="size-4 accent-destructive" />
              이 시즌의 경기 원본까지 삭제 (용량 절감 · 시즌 요약/경기 조회 불가해짐)
            </label>
          )}

          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel disabled={busy} className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                if (confirm.type === "restore") run(() => restoreSeason(confirm.season));
                else run(() => deleteSeason(confirm.season, deleteMatches));
              }}
              className={confirm?.type === "delete"
                ? "font-black bg-destructive hover:bg-destructive/80 text-white rounded-xl h-11 px-5"
                : "font-black bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground rounded-xl h-11 px-5"}>
              {confirm?.type === "restore" ? "복귀" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 이름 변경 다이얼로그 */}
      <AlertDialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <AlertDialogContent className="border-border/40 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black flex items-center gap-2">
              <Pencil className="size-5 text-neon-blue" /> 시즌 이름 변경
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
              '{renameTarget}' 시즌의 새 이름을 입력하세요. 경기 기록과 순위 보관 데이터에 일괄 반영됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={busy}
            className="h-11 bg-input border-border/65 font-bold mt-1" placeholder="새 시즌 이름" />
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel disabled={busy} className="font-bold border-border/80 rounded-xl h-11 px-5">취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !renameValue.trim() || renameValue.trim() === renameTarget}
              onClick={(e) => {
                e.preventDefault();
                if (renameTarget) run(() => renameSeason(renameTarget, renameValue.trim()));
              }}
              className="font-black bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground rounded-xl h-11 px-5">
              변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
