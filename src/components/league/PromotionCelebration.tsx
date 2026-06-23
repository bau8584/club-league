import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trophy, Crown, Award, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// 고성능 캔버스 Confetti 파티클 애니메이션
function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // 화려한 사이키델릭/네온 컬러 파티클 색상 목록
    const colors = ["#00F0FF", "#00FF66", "#FF007A", "#FFD700", "#A855F7", "#3B82F6", "#FF5733"];
    const particles: Particle[] = [];

    class Particle {
      x = Math.random() * width;
      y = Math.random() * height - height - 20; // 화면 외부(상단)에서 생성
      r = Math.random() * 6 + 4;
      d = Math.random() * height;
      color = colors[Math.floor(Math.random() * colors.length)];
      tilt = Math.random() * 10 - 5;
      tiltAngleIncremental = Math.random() * 0.07 + 0.02;
      tiltAngle = 0;

      draw() {
        ctx!.beginPath();
        ctx!.lineWidth = this.r / 1.5;
        ctx!.strokeStyle = this.color;
        ctx!.moveTo(this.x + this.tilt + this.r / 2, this.y);
        ctx!.lineTo(this.x + this.tilt, this.y + this.tilt + this.r / 2);
        ctx!.stroke();
      }

      update() {
        this.tiltAngle += this.tiltAngleIncremental;
        this.y += (Math.cos(this.tiltAngle) + 3 + this.r / 2) / 1.8;
        this.x += Math.sin(this.tiltAngle) * 0.8;
        this.tilt = Math.sin(this.tiltAngle - this.r / 2) * 12;

        // 바닥을 치면 위로 재생성
        if (this.y > height + 10) {
          this.y = -20;
          this.x = Math.random() * width;
        }
      }
    }

    for (let i = 0; i < 180; i++) {
      particles.push(new Particle());
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const loop = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-[110] w-full h-full" 
    />
  );
}

interface PromotionCelebrationProps {
  studentName?: string;
  newTier: string;
  onConfirm: () => void;
}

export function PromotionCelebration({ studentName, newTier, onConfirm }: PromotionCelebrationProps) {
  // 한글 뱃지 라벨에 매칭되는 Lucide 아이콘 및 컬러 매핑
  const getTierDetails = (label: string) => {
    if (label.includes("다이아")) {
      return {
        color: "text-tier-diamond text-glow-blue",
        glow: "glow-primary bg-tier-diamond/10 border-tier-diamond/40",
        label: "다이아몬드",
        bgStyle: "from-tier-diamond/20 via-background/10 to-tier-diamond/5",
        icon: <Crown className="size-16 drop-glow-primary" />
      };
    }
    if (label.includes("플래티넘")) {
      return {
        color: "text-tier-platinum text-glow-purple",
        glow: "shadow-[0_0_60px_rgba(168,85,247,0.6)] bg-tier-platinum/10 border-tier-platinum/40",
        label: "플래티넘",
        bgStyle: "from-tier-platinum/20 via-background/10 to-tier-platinum/5",
        icon: <Award className="size-16 drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
      };
    }
    if (label.includes("골드")) {
      return {
        color: "text-tier-gold text-glow-gold",
        glow: "shadow-[0_0_60px_rgba(245,158,11,0.6)] bg-tier-gold/10 border-tier-gold/40",
        label: "골드",
        bgStyle: "from-tier-gold/20 via-background/10 to-tier-gold/5",
        icon: <Trophy className="size-16 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
      };
    }
    if (label.includes("실버")) {
      return {
        color: "text-tier-silver text-glow-silver",
        glow: "shadow-[0_0_60px_rgba(148,163,184,0.5)] bg-tier-silver/10 border-tier-silver/40",
        label: "실버",
        bgStyle: "from-tier-silver/20 via-background/10 to-tier-silver/5",
        icon: <Zap className="size-16 drop-shadow-[0_0_15px_rgba(148,163,184,0.7)]" />
      };
    }
    return {
      color: "text-tier-bronze text-glow-bronze",
      glow: "shadow-[0_0_60px_rgba(180,83,9,0.5)] bg-tier-bronze/10 border-tier-bronze/40",
      label: "브론즈",
      bgStyle: "from-tier-bronze/20 via-background/10 to-tier-bronze/5",
      icon: <Award className="size-16 drop-shadow-[0_0_15px_rgba(180,83,9,0.7)]" />
    };
  };

  const details = getTierDetails(newTier);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      
      {/* 폭죽 효과 활성화 */}
      <ConfettiCanvas />

      {/* 후광 배경 그라디언트 서클 */}
      <div className={cn("absolute inset-0 bg-gradient-to-tr pointer-events-none opacity-40 transition-all", details.bgStyle)} />
      
      {/* 메인 팝업 카드 */}
      <Card className={cn(
        "relative max-w-md w-full text-center p-8 rounded-3xl border backdrop-blur-2xl shadow-2xl relative z-[120] flex flex-col items-center animate-in zoom-in-95 duration-500",
        details.glow
      )}>
        
        {/* 상단 스파클 디자인 */}
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] mb-6 animate-pulse">
          <Sparkles className="size-7" />
        </div>

        {/* 1. 영롱한 티어 뱃지 컨테이너 */}
        <div className={cn(
          "relative flex size-32 items-center justify-center rounded-full border-2 bg-background/80 glow-primary mb-6 animate-bounce",
          details.glow
        )}>
          {/* 빛이 퍼지는 백드롭 효과 */}
          <div className="absolute inset-0 rounded-full bg-current opacity-10 animate-ping pointer-events-none" />
          <div className={cn("relative z-10 transition-transform scale-110", details.color)}>
            {details.icon}
          </div>
        </div>

        {/* 2. 축하 타이틀 및 세부 문구 */}
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-amber-400 to-foreground animate-pulse">
            TIER UP!
          </h2>
          
          <div className="space-y-1">
            <h3 className="text-2xl font-black tracking-tight text-foreground">
              {studentName ? `${studentName} 선수` : "축하합니다!"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {studentName ? "위 선수이 경기 후 높은 기량을 펼쳐" : "성공적으로 실력을 입증하여"} <br />
              <span className={cn("font-black text-lg", details.color)}>{newTier}</span> 티어로 승급했습니다!
            </p>
          </div>
        </div>

        {/* 3. 확인 버튼 (선수 '나의 기록' 탭으로 리다이렉트 유도) */}
        <div className="w-full mt-8">
          <Button
            onClick={onConfirm}
            className="w-full h-12 bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-black tracking-wide rounded-xl shadow-lg active:scale-95 transition-all text-sm"
          >
            확인 (나의 전적 보기)
          </Button>
        </div>

      </Card>
    </div>
  );
}
