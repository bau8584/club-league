import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { Student } from "@/lib/league-types";
import {
  apiStudentHasCode,
  apiVerifyStudentCode,
  apiClaimStudent,
  apiUpdateStudentNickname,
  apiChangeStudentCode,
} from "@/lib/league-api";

type Notice = { type: "ok" | "err"; text: string } | null;

/**
 * 학생 본인 카드 설정 모달.
 * - 코드가 없으면: 별명(선택) + 새 코드로 "내 카드 설정"(최초 1회)
 * - 코드가 있으면: ① 현재 코드 입력해 잠금 해제 → ② 별명 변경 / 코드 변경
 * 보기(대시보드)는 잠그지 않으며, 편집만 코드로 보호한다.
 */
export function StudentCardSettings({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [hasCode, setHasCode] = useState(false);
  const [unlocked, setUnlocked] = useState(false); // 코드 검증 통과 여부
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // 입력 상태
  const [nickname, setNickname] = useState(student.nickname?.trim() || "");
  const [code, setCode] = useState(""); // 신규 코드(최초) 또는 현재 코드(잠금해제)
  const [codeConfirm, setCodeConfirm] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCodeConfirm, setNewCodeConfirm] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await apiStudentHasCode(student.id);
        if (error) throw error;
        if (alive) setHasCode(Boolean(data));
      } catch (err: any) {
        if (alive)
          setNotice({
            type: "err",
            text: "코드 기능이 아직 준비되지 않았습니다(서버 설정 필요).",
          });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [student.id]);

  const isPin = (v: string) => /^\d{4,}$/.test(v.trim());

  const ok = (text: string) => {
    setNotice({ type: "ok", text });
    toast.success(text);
  };
  const err = (text: string) => {
    setNotice({ type: "err", text });
    toast.error(text);
  };

  // 최초 등록(코드 없음)
  const handleClaim = async () => {
    setNotice(null);
    if (!isPin(code)) return err("코드는 숫자 4자리 이상으로 정해주세요.");
    if (code.trim() !== codeConfirm.trim()) return err("두 코드가 서로 다릅니다.");
    setBusy(true);
    try {
      const { error } = await apiClaimStudent(student.id, code.trim(), nickname.trim() || null);
      if (error) throw error;
      ok("내 카드가 설정되었습니다!");
      onSaved();
      setTimeout(onClose, 600);
    } catch (e: any) {
      err("설정에 실패했습니다: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  // 1단계: 현재 코드 검증 → 잠금 해제
  const handleUnlock = async () => {
    setNotice(null);
    if (!code.trim()) return err("코드를 입력해주세요.");
    setBusy(true);
    try {
      const { data, error } = await apiVerifyStudentCode(student.id, code.trim());
      if (error) throw error;
      if (data === true) {
        setUnlocked(true);
        setNotice({ type: "ok", text: "잠금이 해제되었습니다. 별명·코드를 바꿀 수 있어요." });
      } else {
        err("코드가 올바르지 않습니다.");
      }
    } catch (e: any) {
      err("확인에 실패했습니다: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  // 2단계: 별명 변경
  const handleSaveNickname = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await apiUpdateStudentNickname(student.id, code.trim(), nickname.trim() || null);
      if (error) throw error;
      ok("별명이 저장되었습니다!");
      onSaved();
      setTimeout(onClose, 600);
    } catch (e: any) {
      err("저장에 실패했습니다: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  // 2단계: 코드 변경
  const handleChangeCode = async () => {
    setNotice(null);
    if (!isPin(newCode)) return err("새 코드는 숫자 4자리 이상으로 정해주세요.");
    if (newCode.trim() !== newCodeConfirm.trim()) return err("새 코드가 서로 다릅니다.");
    setBusy(true);
    try {
      const { error } = await apiChangeStudentCode(student.id, code.trim(), newCode.trim());
      if (error) throw error;
      ok("코드가 변경되었습니다! 새 코드를 기억해 두세요.");
      setCode(newCode.trim()); // 변경된 코드로 갱신(계속 편집 가능)
      setNewCode("");
      setNewCodeConfirm("");
    } catch (e: any) {
      err("코드 변경에 실패했습니다: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-neon-blue" />내 카드 설정
          </DialogTitle>
          <DialogDescription>
            별명과 개인 코드를 정할 수 있어요. 코드는 별명·코드를 바꿀 때만 필요하고, 순위·대시보드 보기는
            누구나 가능합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 인라인 안내 (성공/실패 항상 표시) */}
        {notice && (
          <div
            className={
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
              (notice.type === "ok"
                ? "border-win/40 bg-win/10 text-win"
                : "border-loss/40 bg-loss/10 text-loss")
            }
          >
            {notice.type === "ok" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !hasCode ? (
          // ── 코드 없음: 최초 1회 설정(카드 claim) ──
          <div className="space-y-5">
            <div className="rounded-lg border border-neon-blue/30 bg-neon-blue/5 p-3 text-xs text-muted-foreground leading-relaxed">
              아직 코드가 없는 카드예요. 별명과 코드를 처음 정하면, 이후엔 코드를 아는 사람만 별명을 바꿀 수
              있어요. <span className="font-bold text-foreground">코드는 잊지 않게 기억해 두세요.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">별명 (선택)</label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="비우면 학번으로 표시됩니다"
                maxLength={20}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Lock className="size-3.5" /> 새 코드 (숫자 4자리 이상)
              </label>
              <Input
                type="password"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="예: 1234"
              />
              <Input
                type="password"
                inputMode="numeric"
                value={codeConfirm}
                onChange={(e) => setCodeConfirm(e.target.value)}
                placeholder="코드 확인"
              />
            </div>

            <Button className="w-full" onClick={handleClaim} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "내 카드로 설정"}
            </Button>
          </div>
        ) : !unlocked ? (
          // ── 코드 있음 · 1단계: 현재 코드 입력 ──
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Lock className="size-3.5" /> 현재 코드를 입력하세요
              </label>
              <Input
                type="password"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="내가 정한 코드"
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={handleUnlock} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "확인"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              코드를 잊었다면 선생님께 초기화를 요청하세요.
            </p>
          </div>
        ) : (
          // ── 코드 있음 · 2단계: 편집(별명/코드 변경) ──
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">별명</label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="비우면 학번으로 표시됩니다"
                maxLength={20}
              />
              <Button className="w-full" onClick={handleSaveNickname} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "별명 저장"}
              </Button>
            </div>

            <div className="border-t border-border/40 pt-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">코드 변경</p>
              <Input
                type="password"
                inputMode="numeric"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="새 코드 (숫자 4자리 이상)"
              />
              <Input
                type="password"
                inputMode="numeric"
                value={newCodeConfirm}
                onChange={(e) => setNewCodeConfirm(e.target.value)}
                placeholder="새 코드 확인"
              />
              <Button variant="secondary" className="w-full" onClick={handleChangeCode} disabled={busy}>
                코드 변경
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
