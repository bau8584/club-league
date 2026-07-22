import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { History, RotateCcw, ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Row = { id: string; name: string; before: number; after: number };

export function RpRecoveryPanel() {
  const { recomputeRpPreview, applyRecomputedRp, recomputeLeagueRp, matches, currentViewSeason } = useLeagueStore();
  const readOnly = currentViewSeason !== "현재 시즌";
  const noMatches = !matches || matches.length === 0;

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  // 서버 정합성 재계산: 저장된 경기별 델타·감점 기준으로 rp를 정확히 복구(동시 입력 어긋남 복구용).
  const handleServerRecompute = async () => {
    if (readOnly || noMatches || recomputing) return;
    if (!window.confirm(
      "현재 시즌 경기 기록·감점을 기준으로 모든 회원 RP를 서버에서 정확히 다시 맞춥니다.\n" +
      "동시 입력 등으로 RP가 어긋났을 때 복구용입니다.\n\n" +
      "※ 관리자가 수동으로 직접 조정한 RP는 복원되지 않고 이력 기준값으로 덮어써집니다.\n\n진행할까요?"
    )) return;
    setRecomputing(true);
    try { await recomputeLeagueRp(); } finally { setRecomputing(false); }
  };

  const openPreview = () => {
    if (readOnly || noMatches) return;
    const preview = recomputeRpPreview();
    setRows(preview);
    setOpen(true);
  };

  const changed = rows.filter((r) => r.before !== r.after);

  const handleApply = async () => {
    setApplying(true);
    try {
      const n = await applyRecomputedRp();
      if (n >= 0) setOpen(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Card className="border border-amber-500/30 bg-amber-500/[0.05] p-5 backdrop-blur shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <History className="size-4 text-amber-500" /> RP 복원 (경기 재계산)
            </h4>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              남아 있는 <b className="text-foreground">경기 기록을 처음부터 다시 계산</b>해 모든 회원의 RP를 되돌립니다.
              RP가 초기화됐지만 경기 기록은 남아 있을 때 사용하세요. (경기가 삭제됐다면 복원 불가)
            </p>
          </div>
          <Button
            onClick={openPreview}
            disabled={readOnly || noMatches}
            className="shrink-0 self-start bg-amber-500 hover:bg-amber-500/85 text-amber-950 font-black active:scale-95 transition-all disabled:opacity-40"
          >
            <RotateCcw className="mr-2 size-4" /> 재계산 미리보기
          </Button>
        </div>
        {noMatches && (
          <p className="mt-2 text-[11px] font-bold text-muted-foreground">경기 기록이 없어 복원할 수 없습니다.</p>
        )}

        {/* 서버 정합성 재계산 — 동시 입력으로 RP 캐시가 어긋났을 때 정확 복구 */}
        <div className="mt-3 flex flex-col gap-2 border-t border-border/25 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-muted-foreground leading-snug">
            <b className="text-foreground">정합성 재계산(서버)</b> — 여러 명 동시 입력 등으로 RP가 어긋났을 때, 저장된
            경기별 변동·감점으로 <b className="text-foreground">정확히 복구</b>합니다.
          </p>
          <Button
            onClick={handleServerRecompute}
            disabled={readOnly || noMatches || recomputing}
            variant="outline"
            className="shrink-0 self-start border-amber-500/40 font-black text-amber-600 hover:bg-amber-500/10 active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={cn("mr-2 size-4", recomputing && "animate-spin")} /> {recomputing ? "재계산 중..." : "정합성 재계산"}
          </Button>
        </div>
      </Card>

      <AlertDialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <AlertDialogContent className="max-h-[85vh] max-w-lg overflow-hidden rounded-2xl border-amber-500/30 bg-background/95 shadow-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg font-black">
              <History className="size-5 text-amber-500" /> RP 복원 미리보기
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              경기 {matches.length}건을 재생한 결과입니다. <b className="text-amber-600">{changed.length}명</b>의 RP가 바뀝니다.
              적용하면 아래 값으로 저장됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="my-2 max-h-[46vh] overflow-y-auto rounded-xl border border-border/40">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">회원</th>
                  <th className="px-2 py-2 text-right font-bold">현재</th>
                  <th className="px-2 py-2 text-center font-bold"></th>
                  <th className="px-2 py-2 text-right font-bold">복원</th>
                  <th className="px-3 py-2 text-right font-bold">변화</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.after - r.before;
                  return (
                    <tr key={r.id} className={cn("border-t border-border/20", diff !== 0 && "bg-amber-500/[0.04]")}>
                      <td className="px-3 py-1.5 font-semibold text-foreground truncate max-w-[140px]">{r.name}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{r.before}</td>
                      <td className="px-2 py-1.5 text-center"><ArrowRight className="mx-auto size-3 text-muted-foreground/60" /></td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-foreground">{r.after}</td>
                      <td className={cn(
                        "px-3 py-1.5 text-right font-mono font-bold",
                        diff > 0 ? "text-win" : diff < 0 ? "text-loss" : "text-muted-foreground/50"
                      )}>
                        {diff === 0 ? "–" : `${diff > 0 ? "+" : ""}${diff}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={applying} className="h-11 rounded-xl border-border/80 px-5 font-bold">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (changed.length === 0) { toast.info("바뀌는 RP가 없습니다."); return; } handleApply(); }}
              disabled={applying || changed.length === 0}
              className="h-11 rounded-xl bg-amber-500 px-5 font-black text-amber-950 hover:bg-amber-500/85"
            >
              {applying ? "복원 중..." : `${changed.length}명 RP 복원`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
