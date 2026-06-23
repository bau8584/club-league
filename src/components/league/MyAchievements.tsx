import { useMemo } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { Card } from "@/components/ui/card";
import { 
  Award, 
  Lock, 
  Check, 
  Flame, 
  Trophy, 
  Swords, 
  Zap, 
  ShieldAlert, 
  Sparkles, 
  Target, 
  Heart,
  Calendar,
  Compass,
  Crown
} from "lucide-react";
import { cn } from "@/lib/utils";

// 업적 등급별 프리미엄 스타일 상수
const TIER_THEMES = {
  Common: {
    bg: "bg-slate-500/5",
    border: "border-slate-500/30",
    text: "text-soft",
    accent: "bg-slate-400",
    glow: "shadow-[0_0_15px_rgba(148,163,184,0.15)]",
    badge: "bg-slate-500/10 border-slate-500/20 text-soft",
    label: "커먼"
  },
  Rare: {
    bg: "bg-cyan-500/5",
    border: "border-cyan-500/35",
    text: "text-cyan-400",
    accent: "bg-cyan-400",
    glow: "shadow-[0_0_20px_rgba(6,182,212,0.3)]",
    badge: "bg-cyan-500/15 border-cyan-500/25 text-cyan-400",
    label: "레어"
  },
  Epic: {
    bg: "bg-purple-500/5",
    border: "border-purple-500/35",
    text: "text-purple-400",
    accent: "bg-purple-400",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
    badge: "bg-purple-500/15 border-purple-500/25 text-purple-400",
    label: "에픽"
  },
  Legendary: {
    bg: "bg-amber-500/5",
    border: "border-amber-500/35",
    text: "text-amber-400",
    accent: "bg-amber-400",
    glow: "shadow-[0_0_25px_rgba(245,158,11,0.35)]",
    badge: "bg-amber-500/15 border-amber-500/25 text-amber-400",
    label: "레전더리"
  }
};

// 각 업적 카드 고유 아이콘 매핑 헬퍼
function getAchievementIcon(id: string, className?: string) {
  switch (id) {
    case "court_first_greeting":
      return <Compass className={className} />;
    case "warmup_complete":
      return <Zap className={className} />;
    case "taste_of_victory":
      return <Trophy className={className} />;
    case "unbroken_heart":
      return <Heart className={className} />;
    case "iron_stamina":
      return <Flame className={className} />;
    case "courageous_challenger":
      return <Target className={className} />;
    case "gym_spirit":
      return <Calendar className={className} />;
    case "unyielding_will":
      return <ShieldAlert className={className} />;
    case "avatar_of_revenge":
      return <Swords className={className} />;
    case "court_ruler":
      return <Crown className={className} />;
    case "honorable_sweat":
      return <Sparkles className={className} />;
    case "rival_destroyer":
      return <Zap className={className} />;
    case "legendary_undefeated":
      return <Trophy className={className} />;
    case "true_champion":
      return <Award className={className} />;
    default:
      return <Award className={className} />;
  }
}

export function MyAchievements({ studentId }: { studentId: string }) {
  const { students, calculateAchievements } = useLeagueStore();

  const student = useMemo(() => {
    return students.find((s) => s.id === studentId);
  }, [students, studentId]);

  // 자동 Derived State 업적 배열 스캔 연산
  const achievements = useMemo(() => {
    return calculateAchievements(studentId);
  }, [calculateAchievements, studentId]);

  // 해금된 업적 수 요약 계산
  const unlockedCount = useMemo(() => {
    return achievements.filter((a) => a.isUnlocked).length;
  }, [achievements]);

  if (!student) {
    return (
      <Card className="border-border/60 bg-card/60 p-8 text-center backdrop-blur">
        <p className="text-muted-foreground">로그인 세션이 만료되었거나 선수 정보를 찾을 수 없습니다.</p>
      </Card>
    );
  }

  // 총 달성률 (백분율)
  const percentComplete = achievements.length > 0 
    ? Math.round((unlockedCount / achievements.length) * 100) 
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* 1. Header Achievement Summary Card */}
      <Card className="border border-border/60 bg-card/40 p-6 md:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Glow effect backdrops */}
        <div className="absolute -top-24 -left-24 size-48 rounded-full bg-neon-blue/10 blur-[60px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 size-48 rounded-full bg-purple-500/10 blur-[60px] pointer-events-none" />

        <div className="space-y-2.5 relative z-10">
          <div className="flex items-center gap-2.5 text-neon-blue">
            <Award className="size-6 text-glow-blue animate-bounce" />
            <h3 className="font-black text-xl tracking-tight text-foreground">나의 스포츠 업적 명예회랑</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            {student.group ? `${student.group} · ` : ""}<span className="font-bold text-foreground">{student.nickname || student.name}</span> 님의 경기 기록을 분석한 실시간 자동 업적 판정입니다. 실패를 두려워하지 않고, 더 높은 점수와 기록에 도전해 보세요!
          </p>
        </div>

        {/* Progress Circle Visualizer */}
        <div className="flex items-center gap-5 relative z-10 bg-background/30 p-4 border border-border/30 rounded-2xl md:min-w-[240px] justify-between">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">업적 해금 현황</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-black text-neon-blue font-mono">{unlockedCount}</span>
              <span className="text-muted-foreground text-sm font-bold">/ {achievements.length}개</span>
            </div>
            <span className="text-[11px] font-bold text-neon-green font-mono">{percentComplete}% 달성 완료</span>
          </div>

          <div className="relative size-16 shrink-0 flex items-center justify-center">
            {/* SVG circle track */}
            <svg className="size-full -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                className="stroke-muted/30 fill-transparent"
                strokeWidth="5"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                className="stroke-neon-blue fill-transparent transition-all duration-1000 ease-out"
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - percentComplete / 100)}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xs font-black text-foreground font-mono">{percentComplete}%</span>
          </div>
        </div>
      </Card>

      {/* 2. Achievements Grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map((item) => {
          const theme = TIER_THEMES[item.tier];
          const progressPercent = Math.min(100, Math.round((item.currentValue / item.targetValue) * 100));

          return (
            <Card
              key={item.id}
              className={cn(
                "border backdrop-blur transition-all duration-300 p-5 flex flex-col justify-between relative overflow-hidden hover:scale-[1.02]",
                item.isUnlocked
                  ? cn(theme.bg, theme.border, theme.glow)
                  : "bg-background/10 border-border/30 hover:bg-background/20"
              )}
            >
              {/* Unlock glow highlight for premium look */}
              {item.isUnlocked && (
                <div className={cn("absolute -top-12 -right-12 size-24 rounded-full opacity-10 blur-xl pointer-events-none", theme.accent)} />
              )}

              <div className="space-y-4">
                {/* Badge Tier and Status */}
                <div className="flex justify-between items-center">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    item.isUnlocked ? theme.badge : "bg-muted/40 border-border/20 text-muted-foreground"
                  )}>
                    {theme.label}
                  </span>
                  
                  {item.isUnlocked ? (
                    <div className={cn("flex size-5 items-center justify-center rounded-full bg-neon-green/10 border border-neon-green/30 text-neon-green")}>
                      <Check className="size-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <Lock className="size-4 text-muted-foreground/60" />
                  )}
                </div>

                {/* Icon & Title info */}
                <div className="flex items-start gap-3.5">
                  <div className={cn(
                    "flex size-11 items-center justify-center rounded-xl shrink-0 transition-colors",
                    item.isUnlocked
                      ? cn("bg-background/50 border", theme.border, theme.text)
                      : "bg-muted/30 border border-border/20 text-muted-foreground/45 grayscale silhouette"
                  )}>
                    {getAchievementIcon(item.id, "size-5")}
                  </div>

                  <div className="space-y-1 text-left">
                    <h4 className={cn(
                      "font-black text-sm tracking-tight",
                      item.isUnlocked ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {item.name}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar visualizer */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-muted-foreground">진행 상황</span>
                  <span className={cn("font-mono", item.isUnlocked ? theme.text : "text-muted-foreground")}>
                    {item.currentValue} / {item.targetValue}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden border border-border/10 p-px">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700 ease-out",
                      item.isUnlocked ? theme.accent : "bg-muted-foreground/30"
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
