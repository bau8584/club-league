import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LockKeyhole, ShieldAlert, KeyRound, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecurityModalProps {
  correctCode: string;
  onSuccess: () => void;
}

export function SecurityModal({ correctCode, onSuccess }: SecurityModalProps) {
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isError, setIsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      toast.error("접근 코드를 입력해 주세요.");
      return;
    }

    if (trimmedCode === correctCode) {
      setIsError(false);
      toast.success("🔐 이중 보안 해제에 성공하였습니다!");
      onSuccess();
    } else {
      setIsError(true);
      toast.error("접근 코드가 일치하지 않습니다. 다시 입력해 주세요.");
      setCode("");
      // Reset error shake animation after 500ms
      setTimeout(() => setIsError(false), 500);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Glow Backdrops */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[350px] rounded-full bg-neon-blue/10 blur-[90px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[250px] rounded-full bg-destructive/5 blur-[80px] pointer-events-none" />

      <Card className={cn(
        "max-w-md w-full border transition-all duration-300 bg-card/45 backdrop-blur-xl p-8 rounded-2xl shadow-2xl relative z-10",
        isError 
          ? "border-destructive/60 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-[shake_0.5s_ease-in-out]" 
          : "border-border/60 hover:border-neon-blue/40 shadow-[0_0_40px_rgba(0,180,216,0.05)]"
      )}>
        {/* Animated Shield/Lock Icon */}
        <div className={cn(
          "flex size-16 items-center justify-center rounded-2xl mx-auto mb-6 transition-all duration-300 ring-1",
          isError
            ? "bg-destructive/15 border-destructive/30 text-destructive ring-destructive/20 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
            : "bg-neon-blue/10 border-neon-blue/20 text-neon-blue ring-neon-blue/15 shadow-[0_0_20px_rgba(0,180,216,0.15)]"
        )}>
          {isError ? (
            <ShieldAlert className="size-8 animate-bounce" />
          ) : (
            <LockKeyhole className="size-8 animate-pulse text-glow-blue" />
          )}
        </div>

        {/* Text Header */}
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
            🔑 이중 보안 접근 통제
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed px-2">
            교사 전용 제어 시스템 및 민감한 전적 정보를 보호하기 위해 2차 접근 코드를 입력하세요.
          </p>
        </div>

        {/* Password Input Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label htmlFor="accessCode" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                접근 코드 입력 (Passcode)
              </label>
              <span className="text-[10px] font-bold text-destructive/80 flex items-center gap-1">
                <LockKeyhole className="size-3" /> 제한된 보안 구역
              </span>
            </div>
            
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="accessCode"
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="인증코드를 입력하세요..."
                className={cn(
                  "h-12 pl-10 pr-10 font-mono text-base border-border/60 bg-background/50 focus:border-neon-blue focus:ring-neon-blue/20 transition-all rounded-xl tracking-widest",
                  isError && "border-destructive focus:border-destructive focus:ring-destructive/20"
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 size-6 -translate-y-1/2 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title={showPassword ? "코드 가리기" : "코드 보기"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Button */}
          <Button
            type="submit"
            className="w-full h-12 rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-black text-sm tracking-wide shadow-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer shadow-neon-blue/10"
          >
            접근 승인 및 해제하기
          </Button>
        </form>

        <div className="mt-6 text-[10px] text-center text-muted-foreground border-t border-border/25 pt-4">
          학생들의 비정상적인 리그 조작 및 성적 조회를 차단하기 위한 2단계 안전 장치입니다.
        </div>
      </Card>

      {/* Shake Keyframe Injection */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
