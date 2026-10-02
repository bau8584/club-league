import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { X, Copy, RefreshCw, Power } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { apiCloseScoreInput, apiOpenScoreInput } from "@/services/league-api";

/**
 * 점수입력판 — 교사가 켜면 학생용 QR(열쇠 링크)이 나온다. (docs/PLAN-student-input.md)
 * 열쇠는 오늘만. [새 QR] = 옛 QR 무효, [닫기] = 입력 끝. 공개 순위표 링크와는 따로다.
 */

const seoulToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function ScoreInputDialog({ open, onOpenChange, sessionId, onChanged }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 이 선생님의 오늘 수업. 없으면 수업을 먼저 시작해야 한다. */
  sessionId: string | null;
  /** 켜기·닫기 뒤 — 리그 화면이 수업 정보를 다시 읽게(수업 종료 버튼이 QR 상태를 안다). */
  onChanged?: () => void;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    if (!sessionId) { setKey(null); return; }
    const { data } = await supabase.from("assignment_sessions")
      .select("input_key, input_key_day").eq("id", sessionId).maybeSingle();
    setKey(data?.input_key && data.input_key_day === seoulToday() ? data.input_key : null);
  }, [sessionId]);

  useEffect(() => { if (open) read(); }, [open, read]);

  if (!open) return null;
  const url = key ? `${window.location.origin}/input?k=${key}` : "";

  const openNew = async () => {
    if (!sessionId) return;
    setBusy(true);
    const { data, error } = await apiOpenScoreInput(sessionId);
    setBusy(false);
    if (error) { toast.error("열지 못했어요: " + error.message); return; }
    setKey(data as string);
    onChanged?.();
  };
  const close = async () => {
    if (!sessionId) return;
    setBusy(true);
    const { error } = await apiCloseScoreInput(sessionId);
    setBusy(false);
    if (error) { toast.error("닫지 못했어요: " + error.message); return; }
    setKey(null);
    onChanged?.();
    toast.success("점수입력판을 닫았어요. 옛 QR로는 넣을 수 없어요.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-foreground">점수입력판</h2>
          <button onClick={() => onOpenChange(false)} aria-label="닫기" className="text-muted-foreground"><X className="size-5" /></button>
        </div>

        {!sessionId ? (
          <p className="mt-4 text-sm font-bold text-muted-foreground">오늘 수업(대기열)을 먼저 시작해 주세요.</p>
        ) : !key ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              켜면 학생 태블릿·폰이 QR로 들어와 점수판으로 경기하고 결과를 등록해요. 순위에 바로 반영되고, 잘못 넣은 경기는 관리자 › 리그 기록 관리에서 지우면 돼요.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">QR은 오늘만 쓸 수 있고, [수업 종료]를 누르면 같이 닫혀요. 공개 순위표 링크와는 따로예요.</p>
            <button onClick={openNew} disabled={busy}
              className="mt-4 w-full rounded-xl bg-neon-blue py-3 font-black text-background disabled:opacity-60">
              점수입력판 켜기
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
              <QRCodeSVG value={url} size={220} level="M" marginSize={2} />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">오늘만 쓸 수 있어요</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(url); toast.success("링크를 복사했어요."); }}
                className="flex flex-col items-center gap-1 rounded-xl border border-border/50 py-2.5 text-xs font-bold">
                <Copy className="size-4" /> 링크 복사
              </button>
              <button onClick={openNew} disabled={busy}
                className="flex flex-col items-center gap-1 rounded-xl border border-border/50 py-2.5 text-xs font-bold">
                <RefreshCw className="size-4" /> 새 QR
              </button>
              <button onClick={close} disabled={busy}
                className="flex flex-col items-center gap-1 rounded-xl border border-destructive/50 py-2.5 text-xs font-bold text-destructive">
                <Power className="size-4" /> 닫기
              </button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">새 QR을 만들거나 닫으면 지금 QR은 바로 못 써요.</p>
          </>
        )}
      </div>
    </div>
  );
}
