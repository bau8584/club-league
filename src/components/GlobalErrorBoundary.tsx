import React, { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("GlobalErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden text-foreground">
          {/* Background neon grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
          <div className="absolute -top-40 -left-40 size-96 rounded-full bg-destructive/10 blur-[130px] pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />

          <div className="max-w-md w-full text-center border border-border/60 bg-card/65 backdrop-blur-xl p-8 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.06)] relative z-10 animate-in zoom-in-95 duration-300">
            {/* Caution Icon */}
            <div className="flex size-14 items-center justify-center rounded-xl bg-destructive/15 border border-destructive/30 text-destructive mx-auto mb-5 shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-pulse">
              <ShieldAlert className="size-8 text-destructive" />
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              데이터 처리 중 문제가 발생했습니다
            </h1>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              예기치 못한 런타임 오류가 발생하여 앱이 일시적으로 중단되었습니다.<br />
              로그인 세션이나 네트워크 데이터는 안전하며, 아래 버튼을 통해 앱을 안전하게 복구할 수 있습니다.
            </p>

            {/* Error Details Accordion */}
            {this.state.error && (
              <div className="mt-5 text-left border border-border/40 rounded-xl bg-muted/20 overflow-hidden transition-all duration-300">
                <button
                  onClick={this.toggleDetails}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  <span>상세 에러 로그 보기</span>
                  {this.state.showDetails ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
                {this.state.showDetails && (
                  <div className="p-4 border-t border-border/30 bg-black/40 font-mono text-[10px] text-destructive overflow-auto max-h-40 leading-relaxed break-all">
                    <p className="font-extrabold mb-1">{this.state.error.toString()}</p>
                    <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Recovery Buttons */}
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond px-4 py-3 text-sm font-black text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
              >
                <RefreshCw className="size-4" />
                <span>안전하게 새로고침</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-accent/40 px-4 py-3 text-sm font-bold text-foreground transition-all cursor-pointer active:scale-[0.98]"
              >
                <Home className="size-4 text-neon-green" />
                <span>로비로 돌아가기</span>
              </button>
            </div>

            <div className="mt-5 text-[10px] text-muted-foreground border-t border-border/25 pt-4">
              새로고침 시 마지막으로 기록된 상태가 데이터베이스에서 다시 호출됩니다. 오류가 반복되면 관리자에게 문의해 주세요.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
