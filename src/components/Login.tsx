import { Card } from "./ui/card";
import { supabase } from "../supabaseClient";
import { Swords, Crown, Sparkles } from "lucide-react";
import { useState } from "react";

export function Login() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error("Google login failed:", err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background neon grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      
      {/* Neon glowing ambient blobs */}
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-tier-diamond/10 blur-[130px] pointer-events-none" />

      {/* Main Premium Card */}
      <Card className="w-full max-w-md border-border/60 bg-card/65 backdrop-blur-xl p-8 md:p-10 rounded-2xl glow-primary relative overflow-hidden animate-in zoom-in-95 fade-in duration-500">
        {/* Decorative border glow top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-80" />

        <div className="flex flex-col items-center text-center relative z-10">
          {/* Logo with pulsing neon ring */}
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-blue to-tier-diamond glow-primary mb-6 hover:scale-105 transition-transform duration-300">
            <Swords className="size-8 text-primary-foreground animate-pulse" />
            <div className="absolute -inset-1 rounded-2xl border border-neon-blue/40 animate-ping opacity-25 pointer-events-none" />
          </div>

          {/* Subheader Brand Tag */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-blue/35 bg-neon-blue/5 mb-3">
            <Sparkles className="size-3 text-neon-blue" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neon-blue">
              CLUB SPORTS LEAGUE
            </span>
          </div>

          {/* Central Title */}
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
            클럽 리그 관리 시스템
          </h1>

          {/* Description */}
          <p className="text-xs md:text-sm text-muted-foreground mt-3 max-w-sm leading-relaxed">
            동호회 리그와 멤버를 간편하게 관리하고<br />
            실시간 티어와 랭킹 시스템으로 즐거움을 더하세요.
          </p>

          {/* Spacer */}
          <div className="h-8" />

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full h-12 flex items-center justify-center gap-3 bg-white text-black font-extrabold text-sm rounded-xl shadow-[0_4px_15px_rgba(255,255,255,0.05)] border border-white/90 hover:bg-neutral-50 active:scale-[0.98] transition-all cursor-pointer relative group overflow-hidden"
          >
            {loading ? (
              <span className="flex items-center gap-2 text-neutral-600 font-bold">
                <span className="size-4 rounded-full border-2 border-neutral-400 border-t-transparent animate-spin" />
                로그인 연결 중...
              </span>
            ) : (
              <>
                {/* Colored Google Logo SVG */}
                <svg className="size-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                <span className="tracking-tight text-neutral-800">구글 계정으로 로그인하기</span>
              </>
            )}

            {/* Subtle light sweep effect on hover */}
            <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[sweep_1.5s_ease_infinite] pointer-events-none" />
          </button>

          {/* Footer Info */}
          <div className="mt-8 text-[10px] text-muted-foreground flex items-center gap-1.5 border-t border-border/25 pt-4 w-full justify-center">
            <Crown className="size-3 text-neon-blue" />
            <span>수파베이스 통합 보안 소셜 로그인</span>
          </div>
        </div>
      </Card>
      
      {/* Custom inline style for keyframes to keep file self-contained */}
      <style>{`
        @keyframes sweep {
          0% { transform: translateX(-150%) skewX(-15deg); }
          100% { transform: translateX(250%) skewX(-15deg); }
        }
      `}</style>
    </div>
  );
}
