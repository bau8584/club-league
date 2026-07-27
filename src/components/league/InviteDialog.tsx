import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { X, Copy, Check, QrCode } from "lucide-react";

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

  const inviteUrl = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/join?classId=${classId}` : `/join?classId=${classId}`),
    [classId]
  );

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("초대 링크를 복사했어요.");
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
            <QrCode className="size-5 text-neon-blue" /> QR로 초대하기
          </h3>
          <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground" title="닫기">
            <X className="size-5" />
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          {leagueName ? `‘${leagueName}’ ` : ""}리그로 초대해요. QR을 찍거나 링크를 공유하면 참가 화면으로 이동합니다.
        </p>

        {/* QR — 어떤 테마에서도 스캔되도록 흰 배경 고정 */}
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-white p-4 shadow-inner">
          <QRCodeSVG value={inviteUrl} size={200} level="M" marginSize={2} />
        </div>

        {/* 링크 + 복사 */}
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-input/50 p-1.5">
          <span className="min-w-0 flex-1 truncate px-2 text-[11px] text-muted-foreground" title={inviteUrl}>{inviteUrl}</span>
          <button type="button" onClick={copy}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-neon-blue px-3 py-2 text-xs font-black text-white transition-all hover:bg-neon-blue/90 active:scale-95">
            {copied ? <><Check className="size-3.5" /> 복사됨</> : <><Copy className="size-3.5" /> 링크 복사</>}
          </button>
        </div>
      </div>
    </div>
  );
}
