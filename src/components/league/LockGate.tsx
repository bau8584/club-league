import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 키오스크 잠금 게이트.
 * 태블릿을 학생에게 맡길 때 순위표/관리자 화면을 리그 코드(4자리)로 잠근다.
 * 코드가 맞으면 onUnlock()을 호출한다. 코드가 설정돼 있지 않으면(빈 문자열)
 * 부모에서 fail-open 처리하므로 이 컴포넌트는 코드가 있다고 가정한다.
 */
export function LockGate({
  expectedCode,
  title = "잠금된 화면입니다",
  onUnlock,
}: {
  expectedCode: string;
  title?: string;
  onUnlock: () => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (input === expectedCode) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-border/60 bg-card/40 px-6 py-14 text-center backdrop-blur-xl shadow-lg animate-in fade-in duration-300">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30">
        <Lock className="size-8 text-amber-500" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-black tracking-tight text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
          이 화면은 잠겨 있습니다. 계속하려면 <b>리그 코드(4자리)</b>를 입력하세요.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={input}
          onChange={(e) => { setInput(e.target.value.replace(/\D/g, "")); setError(false); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="● ● ● ●"
          className={cn(
            "w-full h-12 rounded-xl border bg-input text-center text-2xl font-black tracking-[0.4em] text-foreground focus:outline-none transition-colors",
            error ? "border-destructive animate-shake" : "border-border/40 focus:border-amber-500"
          )}
        />
        {error && (
          <span className="text-[11px] font-bold text-destructive">코드가 올바르지 않습니다.</span>
        )}
        <button
          onClick={submit}
          className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 h-10 text-sm font-black text-background transition-all active:scale-95 hover:bg-amber-500/90 cursor-pointer"
        >
          <ShieldCheck className="size-4" />
          잠금 해제
        </button>
      </div>
    </div>
  );
}
