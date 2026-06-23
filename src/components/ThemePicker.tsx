import { cn } from "@/lib/utils";
import { useTheme, THEMES, type ThemeName } from "@/lib/use-theme";

// 각 테마의 미리보기 스와치 색 (실제 토큰과 무관한 고정 견본)
const SWATCH: Record<ThemeName, { bg: string; a: string; b: string }> = {
  game:   { bg: "#120a1e", a: "#3df0ff", b: "#ff3df0" },
  black:  { bg: "#0a0a0a", a: "#c9d2dd", b: "#3a3a3a" },
  modern: { bg: "#f7f5f1", a: "#2b2b2b", b: "#b9b3a8" },
  glass:  { bg: "#bfeaf2", a: "#22b8d6", b: "#7c5cff" },
  clay:   { bg: "#fff2e2", a: "#ff9d7a", b: "#9be7c4" },
};

// 테마 선택기 — 설정/프로필 메뉴에서 사용. 3종 세그먼트 + 색 스와치.
export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-[11px] font-bold text-muted-foreground">화면 테마</div>
      <div className="grid grid-cols-3 gap-1.5">
        {THEMES.map((t) => {
          const sw = SWATCH[t.value];
          const active = theme === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              title={t.hint}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all active:scale-95",
                active ? "border-neon-blue ring-1 ring-neon-blue/50 bg-accent/40" : "border-border/50 hover:border-border"
              )}
            >
              <span className="flex h-7 w-full items-center justify-center gap-1 rounded-md" style={{ background: sw.bg }}>
                <span className="size-2.5 rounded-full" style={{ background: sw.a }} />
                <span className="size-2.5 rounded-full" style={{ background: sw.b }} />
              </span>
              <span className={cn("text-[11px] font-black", active ? "text-neon-blue" : "text-foreground")}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
