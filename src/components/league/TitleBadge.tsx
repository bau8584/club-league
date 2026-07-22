import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { TitleDef, TitleRarity } from "@/lib/title-calculator";

// 호칭 등급별 색상 테마
export const TITLE_RARITY_STYLE: Record<TitleRarity, { chip: string; text: string; label: string }> = {
  competitive: {
    chip: "bg-amber-500/15 border-amber-500/40 ring-amber-500/20",
    text: "text-amber-500",
    label: "경쟁",
  },
  achievement: {
    chip: "bg-cyan-500/15 border-cyan-500/40 ring-cyan-500/20",
    text: "text-cyan-400",
    label: "성취",
  },
  style: {
    chip: "bg-purple-500/15 border-purple-500/40 ring-purple-500/20",
    text: "text-purple-400",
    label: "성격",
  },
};

const RARITY_HINT: Record<TitleRarity, string> = {
  competitive: "리그에 단 1명만 가질 수 있는 호칭이에요.",
  achievement: "조건을 채우면 누구나 얻을 수 있어요.",
  style: "플레이 스타일로 얻는 호칭이에요.",
};

// 닉네임 옆에 붙는 작은 호칭 칩. 클릭하면 획득 조건 설명 팝오버가 뜬다.
// interactive=false 면 클릭 없는 순수 표시용(배너 등)으로 쓸 수 있다.
export function TitleBadge({
  title,
  className,
  interactive = true,
}: {
  title: TitleDef;
  className?: string;
  interactive?: boolean;
}) {
  const s = TITLE_RARITY_STYLE[title.rarity];
  const chipClass = cn(
    "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-black ring-1",
    s.chip,
    s.text,
    className
  );

  if (!interactive) {
    return (
      <span title={title.description} className={chipClass}>
        <span className="text-[11px] leading-none">{title.emoji}</span>
        {title.name}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(chipClass, "cursor-pointer transition-transform hover:scale-105 active:scale-95")}
        >
          <span className="text-[11px] leading-none">{title.emoji}</span>
          {title.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{title.emoji}</span>
          <div className="min-w-0">
            <div className={cn("text-sm font-black", s.text)}>{title.name}</div>
            <span className={cn("mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-black", s.chip, s.text)}>
              {s.label}
            </span>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">획득 조건</span>
            <p className="text-xs font-semibold text-foreground">{title.description}</p>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{RARITY_HINT[title.rarity]}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
