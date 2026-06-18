import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { LeagueStoreProvider } from "../lib/league-store";
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Session } from "@supabase/supabase-js";
import { Login } from "../components/Login";
import { GlobalErrorBoundary } from "../components/GlobalErrorBoundary";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  const handleResetSession = () => {
    try {
      localStorage.removeItem("bdm.session.v1");
      // Clear other potentially related session artifacts to guarantee a clean state
      localStorage.removeItem("bdm.students.v2");
      localStorage.removeItem("bdm.matches.v1");
    } catch (e) {
      console.error("Failed to clear localStorage:", e);
    }
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Background neon grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-destructive/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />

      <div className="max-w-md w-full text-center border border-border/60 bg-card/65 backdrop-blur-xl p-8 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.06)] relative z-10 animate-in zoom-in-95 duration-300">
        <div className="flex size-14 items-center justify-center rounded-xl bg-destructive/15 border border-destructive/30 text-destructive mx-auto mb-4 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-foreground">
          페이지를 로드할 수 없습니다
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          웹 어플리케이션 구동 중 예기치 못한 오류가 발생했습니다.<br />
          이전에 시도했던 로그인 데이터(최고 관리자 등)가 남아 오류가 반복될 수 있습니다.
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex flex-col gap-2.5">
          <button
            onClick={handleResetSession}
            className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond px-4 py-3 text-sm font-black text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
          >
            🔑 로그인 세션 초기화 및 안전 로그아웃
          </button>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card hover:bg-accent/40 px-4 py-2.5 text-xs font-bold text-foreground transition-colors cursor-pointer"
            >
              🔄 다시 시도하기
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card hover:bg-accent/40 px-4 py-2.5 text-xs font-bold text-foreground transition-colors"
            >
              🏠 메인 홈으로
            </a>
          </div>
        </div>

        <div className="mt-6 text-[10px] text-muted-foreground border-t border-border/25 pt-4">
          세션 초기화 버튼을 누르면 브라우저에 임시 저장된 이전 로그인 캐시가 즉시 파기되고 정상적인 로그인 화면으로 되돌아갑니다.
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "초등 스포츠 리그 · 티어 시스템" },
      { name: "description", content: "초등학교 체육수업과 반 대항전을 위한 스포츠 리그 & 티어 랭킹 앱." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "초등 스포츠 리그 · 티어 시스템" },
      { property: "og:description", content: "초등학교 체육수업과 반 대항전을 위한 스포츠 리그 & 티어 랭킹 앱." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "초등 스포츠 리그 · 티어 시스템" },
      { name: "twitter:description", content: "초등학교 체육수업과 반 대항전을 위한 스포츠 리그 & 티어 랭킹 앱." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e57697e9-090c-47b8-9098-36cb4863a462/id-preview-9856be04--c1d0bcbc-12c3-486c-b9d2-865bdef007a8.lovable.app-1779425665875.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e57697e9-090c-47b8-9098-36cb4863a462/id-preview-9856be04--c1d0bcbc-12c3-486c-b9d2-865bdef007a8.lovable.app-1779425665875.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const isViewRoute = router.state.location.pathname.startsWith("/view/");

  useEffect(() => {
    if (isViewRoute) {
      setLoading(false);
      return;
    }

    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSupabaseSession(session);
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isViewRoute]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">보안 세션 검증 중...</span>
        </div>
      </div>
    );
  }

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LeagueStoreProvider>
          {isViewRoute || supabaseSession ? <Outlet /> : <Login />}
        </LeagueStoreProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}
