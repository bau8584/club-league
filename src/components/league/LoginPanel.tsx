import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  Swords, 
  Users, 
  Building2, 
  Key, 
  Gamepad2, 
  ShieldCheck, 
  UserPlus, 
  ArrowLeft, 
  Globe, 
  HelpCircle,
  Lock
} from "lucide-react";

type Role = "TEACHER" | "STUDENT" | "MASTER";

export function LoginPanel({
  onLogin,
  onRegister,
  onRecoverPassword,
  isSyncing
}: {
  onLogin: (
    schoolName: string, 
    accessCodeOrName: string, 
    role: Role, 
    studentGrade?: number, 
    studentClass?: number
  ) => Promise<{ success: boolean; message?: string }>;
  onRegister: (details: {
    loginId: string;
    password: string;
    role: "TEACHER" | "STUDENT";
    schoolName: string;
    userName: string;
    scriptUrl?: string;
    email?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onRecoverPassword: (schoolName: string, email: string) => Promise<{ success: boolean; message?: string }>;
  isSyncing: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"TEACHER" | "STUDENT">("STUDENT");
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  // Login Inputs
  const [schoolName, setSchoolName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [studentClass, setStudentClass] = useState("");

  // Master Login Inputs
  const [masterId, setMasterId] = useState("");
  const [masterPw, setMasterPw] = useState("");

  // Register Inputs
  const [regSchoolName, setRegSchoolName] = useState("");
  const [regUserName, setRegUserName] = useState("");
  const [regAccessCode, setRegAccessCode] = useState("");
  const [regAccessCodeConfirm, setRegAccessCodeConfirm] = useState("");
  const [regScriptUrl, setRegScriptUrl] = useState("");
  const [regEmail, setRegEmail] = useState("");

  // Recover Password Inputs
  const [isRecoverModalOpen, setIsRecoverModalOpen] = useState(false);
  const [recoverSchoolName, setRecoverSchoolName] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoverSchoolName.trim()) return toast.error("학교 이름을 입력해 주세요.");
    if (!recoverEmail.trim()) return toast.error("이메일 주소를 입력해 주세요.");

    toast.loading("비밀번호 자가 복구 요청 중...", { id: "recover-loading" });
    const res = await onRecoverPassword(recoverSchoolName.trim(), recoverEmail.trim());
    toast.dismiss("recover-loading");

    if (res.success) {
      toast.success(res.message || "비밀번호가 등록된 이메일 주소로 자동 발송되었습니다.");
      setIsRecoverModalOpen(false);
      setRecoverSchoolName("");
      setRecoverEmail("");
    } else {
      toast.error(res.message || "비밀번호 찾기 요청 실패. 입력한 정보를 다시 확인해 주세요.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. MASTER LOGIN MODE
    if (isMasterMode) {
      if (!masterId.trim() || !masterPw.trim()) {
        return toast.error("마스터 계정 ID와 비밀번호를 모두 입력해 주세요.");
      }
      const res = await onLogin(masterId.trim(), masterPw.trim(), "MASTER");
      if (res.success) {
        toast.success("👑 최고 마스터 관리자 세션으로 접속했습니다!");
      } else {
        toast.error(res.message || "마스터 로그인 정보가 일치하지 않습니다.");
      }
      return;
    }

    // 2. TEACHER REGISTER FLOW
    if (isRegisterMode && activeTab === "TEACHER") {
      if (!regSchoolName.trim()) return toast.error("등록할 학교 이름을 입력해 주세요.");
      if (!regUserName.trim()) return toast.error("교사 이름을 입력해 주세요.");
      if (!regAccessCode.trim()) return toast.error("접속 시 사용할 4~10자리 인증코드를 지정해 주세요.");
      if (regAccessCode !== regAccessCodeConfirm) return toast.error("지정한 두 인증코드가 일치하지 않습니다.");
      if (!regEmail.trim()) return toast.error("비밀번호 분실 시 수신할 이메일 주소를 입력해 주세요.");

      toast.loading("마스터 서버에 새로운 리그 학교 정보를 등록하는 중...", { id: "reg-loading" });
      const res = await onRegister({
        loginId: regSchoolName.trim(), // SchoolName acts as loginId in the new registry model
        password: regAccessCode.trim(),
        role: "TEACHER",
        schoolName: regSchoolName.trim(),
        userName: regUserName.trim(),
        scriptUrl: regScriptUrl.trim() || undefined,
        email: regEmail.trim()
      });
      toast.dismiss("reg-loading");

      if (res.success) {
        toast.success(`🏫 ${regSchoolName} 리그 계정 등록 성공! 설정한 인증코드로 즉시 로그인해 보세요.`);
        setSchoolName(regSchoolName.trim());
        setAccessCode(regAccessCode.trim());
        setIsRegisterMode(false);
        setRegSchoolName("");
        setRegUserName("");
        setRegAccessCode("");
        setRegAccessCodeConfirm("");
        setRegScriptUrl("");
        setRegEmail("");
      } else {
        toast.error(res.message || "등록 중 오류가 발생했습니다. 이미 등록된 학교 이름이거나 서버 상태를 확인해 주세요.");
      }
      return;
    }

    // 3. STANDARD LOGIN FLOW
    if (!schoolName.trim()) {
      return toast.error("학교 이름을 입력해 주세요.");
    }

    if (activeTab === "TEACHER") {
      if (!accessCode.trim()) {
        return toast.error("교사 인증코드를 입력해 주세요.");
      }
      const res = await onLogin(schoolName.trim(), accessCode.trim(), "TEACHER");
      if (res.success) {
        toast.success(`${schoolName} 교사 권한으로 접속했습니다!`);
      } else {
        toast.error(res.message || "인증코드가 일치하지 않습니다.");
      }
    } else {
      if (!studentGrade) {
        return toast.error("학년을 입력해 주세요.");
      }
      if (!studentClass) {
        return toast.error("반을 입력해 주세요.");
      }
      if (!studentName.trim()) {
        return toast.error("학생 본인의 이름을 입력해 주세요.");
      }
      const res = await onLogin(
        schoolName.trim(), 
        studentName.trim(), 
        "STUDENT", 
        parseInt(studentGrade), 
        parseInt(studentClass)
      );
      if (res.success) {
        toast.success(`${schoolName} ${studentGrade}학년 ${studentClass}반 ${studentName} 학생 권한으로 접속했습니다!`);
      } else {
        toast.error(res.message || "해당 학교 명단에 등록되지 않은 학생입니다. 학년, 반, 이름을 다시 확인하세요.");
      }
    }
  };

  const handleGuestDemoLogin = async () => {
    toast.loading("가상 데모 스포츠 리그에 입장하는 중...", { id: "guest-loading" });
    const res = await onLogin("꿈나무 초등학교", "1234", "TEACHER");
    toast.dismiss("guest-loading");
    if (res.success) {
      toast.success("🎮 게스트 교사 권한으로 체험을 시작합니다. 모든 기능을 마음껏 테스트해보세요!");
    } else {
      toast.error("데모 로그인 실패");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background neon elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-tier-diamond/10 blur-[130px] pointer-events-none" />

      <Card className="w-full max-w-lg border-border/60 bg-card/65 backdrop-blur-xl p-6 md:p-8 rounded-2xl shadow-[0_0_50px_rgba(0,180,216,0.06)] relative overflow-hidden animate-in zoom-in-95 duration-400">
        
        {/* Brand / Logo */}
        <div className="flex flex-col items-center text-center mb-6 shrink-0 relative z-10">
          <div className={cn(
            "flex size-12 items-center justify-center rounded-xl shadow-[0_0_20px_oklch(0.78_0.18_230/0.45)] mb-3 animate-pulse",
            isMasterMode 
              ? "bg-gradient-to-br from-amber-500 to-yellow-400" 
              : "bg-gradient-to-br from-neon-blue to-tier-diamond"
          )}>
            {isMasterMode ? (
              <ShieldCheck className="size-6 text-primary-foreground" />
            ) : (
              <Swords className="size-6 text-primary-foreground" />
            )}
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neon-blue">Elementary Sports League</p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-1 text-foreground">
            {isMasterMode 
              ? "👑 최고 관리자 제어 포털" 
              : isRegisterMode 
                ? "🏫 리그전 신규 학교/교사 등록" 
                : "스포츠 리그전 인증 포털"
            }
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {isMasterMode 
              ? "시스템 총괄 마스터 관리자 인증 정보를 입력하세요." 
              : isRegisterMode 
                ? "새로운 학교 리그를 창설하고 고유 인증코드를 지정하세요." 
                : "학교명과 정보를 입력하고 실시간 스포츠 리그전 시스템에 접속하세요."
            }
          </p>
        </div>

        {/* 1. 교사/학생 접속 탭 분리 (마스터 모드가 아닐 때만 렌더링) */}
        {!isMasterMode && !isRegisterMode && (
          <div className="grid grid-cols-2 gap-2 bg-background/50 border border-border/40 p-1.5 rounded-xl mb-6 relative z-10">
            <button
              type="button"
              onClick={() => setActiveTab("STUDENT")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg text-xs font-extrabold transition-all active:scale-[0.97]",
                activeTab === "STUDENT"
                  ? "bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground shadow-[0_0_12px_rgba(0,180,216,0.3)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              <Users className="size-3.5" /> 학생 접속
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("TEACHER")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg text-xs font-extrabold transition-all active:scale-[0.97]",
                activeTab === "TEACHER"
                  ? "bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground shadow-[0_0_12px_rgba(0,180,216,0.3)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              <Building2 className="size-3.5" /> 교사 접속
            </button>
          </div>
        )}

        {/* 2. Dynamic Login/Register Form */}
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          
          {/* A. SUPREME ADMIN MASTER MODE */}
          {isMasterMode ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">마스터 관리자 ID</Label>
                <Input
                  required
                  value={masterId}
                  onChange={(e) => setMasterId(e.target.value)}
                  placeholder="Master Admin ID"
                  className="h-10 border-border/60 bg-background/40 hover:border-amber-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">보안 비밀번호</Label>
                <Input
                  required
                  type="password"
                  value={masterPw}
                  onChange={(e) => setMasterPw(e.target.value)}
                  placeholder="보안 패스워드"
                  className="h-10 border-border/60 bg-background/40 hover:border-amber-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                />
              </div>
            </div>
          ) : isRegisterMode ? (
            
            /* B. TEACHER REGISTRATION FORM */
            <div className="space-y-3.5 animate-in fade-in duration-300">
              {/* Register School Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Building2 className="size-3.5 text-neon-blue" /> 학교 이름
                </Label>
                <Input
                  required
                  value={regSchoolName}
                  onChange={(e) => setRegSchoolName(e.target.value)}
                  placeholder="정확한 학교 명칭 입력 (예: 대한초등학교)"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>

              {/* Register Teacher Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Users className="size-3.5 text-neon-blue" /> 교사 이름
                </Label>
                <Input
                  required
                  value={regUserName}
                  onChange={(e) => setRegUserName(e.target.value)}
                  placeholder="선생님 성함 입력 (예: 홍길동)"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>



              {/* Custom Access Code */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Key className="size-3.5 text-neon-blue" /> 인증코드 지정
                  </Label>
                  <Input
                    required
                    type="password"
                    maxLength={10}
                    value={regAccessCode}
                    onChange={(e) => setRegAccessCode(e.target.value)}
                    placeholder="원하는 코드 (4~10자)"
                    className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">인증코드 확인</Label>
                  <Input
                    required
                    type="password"
                    maxLength={10}
                    value={regAccessCodeConfirm}
                    onChange={(e) => setRegAccessCodeConfirm(e.target.value)}
                    placeholder="인증코드 재입력"
                    className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                  />
                </div>
              </div>

              {/* Register Email Address */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Globe className="size-3.5 text-neon-blue" /> 이메일 주소 (비밀번호 복구용)
                </Label>
                <Input
                  required
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="비밀번호 분실 시 수신할 이메일 주소를 입력하세요"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>

              {/* Optional scriptUrl API */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Globe className="size-3.5 text-neon-blue" /> 전용 구글 시트 API 주소 (선택)
                  </span>
                  <span className="text-[10px] text-muted-foreground">구글 시트 연동 시 입력</span>
                </Label>
                <Input
                  value={regScriptUrl}
                  onChange={(e) => setRegScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue font-mono text-xs transition-all"
                />
              </div>

              {/* Back to Login Toggle */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(false)}
                  className="text-xs font-bold text-neon-blue hover:underline flex items-center gap-1 ml-auto"
                >
                  <ArrowLeft className="size-3.5" /> 이미 학교 계정이 있나요? 로그인하기
                </button>
              </div>
            </div>
          ) : (
            
            /* C. STANDARD LOGIN FORM */
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* School Name Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">학교 이름</Label>
                <Input
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="학교 이름을 입력하세요 (예: 대한초 또는 대한초등학교)"
                  className="h-10 border-border/60 bg-background/40 hover:border-neon-blue/60 focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all"
                />
              </div>

              {activeTab === "TEACHER" ? (
                /* TEACHER LOGIN FIELDS */
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-bold text-foreground">교사 인증코드</Label>
                  </div>
                  <Input
                    required
                    type="password"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="교사 인증코드 4자리를 입력하세요"
                    className="h-10 border-border/60 bg-background/40 hover:border-neon-blue/60 focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all"
                  />
                  
                  {/* Register account toggle & Forgot password */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setIsRecoverModalOpen(true)}
                      className="text-xs font-bold text-muted-foreground hover:text-foreground hover:underline"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRegisterMode(true)}
                      className="text-xs font-bold text-neon-blue hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="size-3.5" /> 새로운 학교/교사 계정 등록하기
                    </button>
                  </div>
                </div>
              ) : (
                /* STUDENT LOGIN FIELDS */
                <div className="space-y-3.5 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">학년</Label>
                      <Input
                        required
                        type="number"
                        min={1}
                        max={6}
                        value={studentGrade}
                        onChange={(e) => setStudentGrade(e.target.value)}
                        placeholder="학년 (1~6)"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all font-sans"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">반</Label>
                      <Input
                        required
                        type="number"
                        min={1}
                        max={20}
                        value={studentClass}
                        onChange={(e) => setStudentClass(e.target.value)}
                        placeholder="반 (1~20)"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">본인 이름</Label>
                    <Input
                      required
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="명렬표에 등록된 본인 실명을 입력하세요"
                      className="h-10 border-border/60 bg-background/40 hover:border-neon-blue/60 focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Action Submit Button */}
          <Button
            type="submit"
            disabled={isSyncing}
            className={cn(
              "w-full h-11 text-primary-foreground font-black tracking-wider shadow-lg hover:opacity-95 active:scale-[0.99] transition-all mt-4",
              isMasterMode 
                ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-500 shadow-amber-500/10" 
                : "bg-gradient-to-r from-neon-blue to-tier-diamond hover:from-neon-blue hover:to-tier-diamond"
            )}
          >
            {isSyncing ? (
              <span className="flex items-center gap-2">
                <span className="size-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                처리 중...
              </span>
            ) : isMasterMode ? (
              <span className="flex items-center gap-1.5">
                <Lock className="size-4" /> 최고 권한 마스터 로그인
              </span>
            ) : isRegisterMode ? (
              <span className="flex items-center gap-1.5">
                <UserPlus className="size-4" /> 학교 창설 및 교사 등록 완료
              </span>
            ) : activeTab === "TEACHER" ? (
              <span className="flex items-center gap-1.5">
                <Key className="size-4" /> 교사 전용 리그 접속
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> 학생 전용 리그 접속
              </span>
            )}
          </Button>
        </form>

        {/* 3. 🎮 1-Click Guest Sandbox Demo Mode Button (일반 로그인 모드일 때만 노출) */}
        {!isMasterMode && !isRegisterMode && (
          <div className="mt-4 relative z-10 border-t border-border/30 pt-4">
            <Button
              type="button"
              onClick={handleGuestDemoLogin}
              className="w-full h-11 bg-background/80 hover:bg-neon-blue/10 text-neon-blue border border-neon-blue/50 font-black tracking-wide shadow-[0_0_15px_rgba(0,180,216,0.15)] active:scale-[0.98] transition-all gap-1.5"
            >
              <Gamepad2 className="size-4.5 animate-bounce" /> 🎮 로그인 없이 1초 만에 데모 구경하기
            </Button>
          </div>
        )}

        {/* 4. 👑 Supreme Admin Toggle Switcher */}
        <div className="mt-4 text-center relative z-10 border-t border-border/25 pt-4">
          <button
            type="button"
            onClick={() => {
              setIsMasterMode(!isMasterMode);
              setIsRegisterMode(false);
            }}
            className={cn(
              "text-xs font-bold hover:underline transition-colors",
              isMasterMode 
                ? "text-muted-foreground hover:text-foreground" 
                : "text-amber-500 hover:text-amber-400"
            )}
          >
            {isMasterMode ? (
              <span className="flex items-center gap-1">
                🏫 일반 교사/학생 로그인으로 돌아가기
              </span>
            ) : (
              <span className="flex items-center gap-1 justify-center">
                👑 최고 관리자(마스터) 로그인으로 전환
              </span>
            )}
          </button>
        </div>

      </Card>

      {/* 5. 비밀번호 찾기 (비밀번호 자가 복구) 모달 */}
      {isRecoverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="text-center mb-6">
              <h3 className="text-lg font-black text-foreground">🔑 교사 비밀번호 분실 자가 복구</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                가입 시 입력했던 학교명과 이메일 주소가 일치하는 경우, 등록된 이메일로 현재 설정된 교사 인증코드를 자동 전송합니다.
              </p>
            </div>

            <form onSubmit={handleRecoverSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">학교 이름</Label>
                <Input
                  required
                  value={recoverSchoolName}
                  onChange={(e) => setRecoverSchoolName(e.target.value)}
                  placeholder="가입 시 정확한 학교명 (예: 대한초등학교)"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">가입 이메일 주소</Label>
                <Input
                  required
                  type="email"
                  value={recoverEmail}
                  onChange={(e) => setRecoverEmail(e.target.value)}
                  placeholder="가입 시 등록한 이메일 주소 입력"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsRecoverModalOpen(false);
                    setRecoverSchoolName("");
                    setRecoverEmail("");
                  }}
                  className="h-10 rounded-xl"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={isSyncing}
                  className="h-10 rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-bold shadow-md active:scale-95 transition-all"
                >
                  {isSyncing ? "전송 중..." : "인증코드 찾기"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
