import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { X, Copy, Check, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

// 관리자용 QR 초대 다이얼로그 — 초대 링크의 QR + 링크 복사.
export function InviteDialog({
  open, onOpenChange, classId, leagueName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  leagueName?: string;
}) {
  const [copied, setCopied] = useState(false);
  // invite = 로그인해서 참가하는 초대 링크 / ranking = 로그인 없이 보는 공개 순위표 링크
  const [mode, setMode] = useState<"invite" | "ranking">("invite");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = useMemo(() => `${origin}/join?classId=${classId}`, [origin, classId]);
  const rankingUrl = useMemo(() => `${origin}/ranking/${classId}`, [origin, classId]);
  const shareUrl = mode === "ranking" ? rankingUrl : inviteUrl;

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(mode === "ranking" ? "공개 순위표 링크를 복사했어요." : "초대 링크를 복사했어요.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("복사에 실패했어요. 링크를 길게 눌러 복사해 주세요.");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-black text-foreground">
            <QrCode className="size-5 text-neon-blue" /> {mode === "ranking" ? "공개 순위표 공유" : "QR로 초대하기"}
          </h3>
          <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground" title="닫기">
            <X className="size-5" />
          </button>
        </div>

        {/* 링크 종류 선택 */}
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl border border-border/50 bg-input/40 p-1">
          {([["invite", "참가 초대"], ["ranking", "공개 순위표"]] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => { setMode(m); setCopied(false); }}
              className={cn("h-8 rounded-lg text-xs font-black transition-all active:scale-95",
                mode === m ? "bg-neon-blue text-white" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          {mode === "ranking"
            ? `${leagueName ? `‘${leagueName}’ ` : ""}리그의 순위표를 로그인 없이 볼 수 있는 링크예요. 개인 상세 기록은 보이지 않습니다.`
            : `${leagueName ? `‘${leagueName}’ ` : ""}리그로 초대해요. QR을 찍거나 링크를 공유하면 참가 화면으로 이동합니다.`}
        </p>

        {/* QR — 어떤 테마에서도 스캔되도록 흰 배경 고정 */}
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-white p-4 shadow-inner">
          <QRCodeSVG value={shareUrl} size={200} level="M" marginSize={2} />
        </div>

        {/* 링크 + 복사 */}
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-input/50 p-1.5">
          <span className="min-w-0 flex-1 truncate px-2 text-[11px] text-muted-foreground" title={shareUrl}>{shareUrl}</span>
          <button type="button" onClick={copy}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-neon-blue px-3 py-2 text-xs font-black text-white transition-all hover:bg-neon-blue/90 active:scale-95">
            {copied ? <><Check className="size-3.5" /> 복사됨</> : <><Copy className="size-3.5" /> 링크 복사</>}
          </button>
        </div>
      </div>
    </div>
  );
}
