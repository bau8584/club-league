import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "../supabaseClient";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { 
  Crown, 
  Swords, 
  Plus, 
  Users, 
  LogOut, 
  Calendar, 
  Gamepad2, 
  Sparkles, 
  ShieldAlert, 
  Settings,
  X,
  Copy,
  Edit2,
  Trash2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { type Class } from "@/lib/league-types";

export function Lobby() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [ownedLeagues, setOwnedLeagues] = useState<Class[]>([]);
  const [joinedLeagues, setJoinedLeagues] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSport, setNewSport] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [newSeason, setNewSeason] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [confirmAdminCode, setConfirmAdminCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalTab, setModalTab] = useState<"info" | "settings">("info");

  const getDynamicSeasonPlaceholder = () => {
    const now = new Date();
    const yy = now.getFullYear() % 100;
    const month = now.getMonth() + 1;
    let displayYear = yy;
    let semester = 1;
    if (month >= 3 && month <= 8) {
      semester = 1;
      displayYear = yy;
    } else {
      semester = 2;
      if (month === 1 || month === 2) {
        displayYear = (yy - 1 + 100) % 100;
      } else {
        displayYear = yy;
      }
    }
    const sportPart = newSport.trim() ? `${newSport.trim()} ` : "";
    return `${displayYear}년 ${semester}학기 ${sportPart}리그`;
  };

  // Edit League states
  const [editingLeague, setEditingLeague] = useState<Class | null>(null);
  const [editLeagueName, setEditLeagueName] = useState("");
  const [updatingName, setUpdatingName] = useState(false);

  useEffect(() => {
    // Get user info and load leagues
    const fetchUserAndLeagues = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        setUserId(user.id);
        await loadLeagues(user.id);
      }
      setLoading(false);
    };

    fetchUserAndLeagues();
  }, []);

  const loadLeagues = async (uid: string) => {
    try {
      // 1. Load owned leagues (owner_uid === user.id)
      const { data: owned, error: ownedErr } = await supabase
        .from("classes")
        .select("*")
        .eq("owner_uid", uid)
        .neq("is_deleted", true)
        .order("created_at", { ascending: false });
      if (ownedErr) throw ownedErr;
      setOwnedLeagues(owned || []);

      // 2. Load joined leagues (uid in scorekeeper_uids or co_admin_uids)
      const { data: joined, error: joinedErr } = await supabase
        .from("classes")
        .select("*")
        .or(`scorekeeper_uids.cs.{${uid}},co_admin_uids.cs.{${uid}}`)
        .neq("is_deleted", true)
        .order("created_at", { ascending: false });
      if (joinedErr) throw joinedErr;
      setJoinedLeagues(joined || []);
    } catch (err: any) {
      console.error("Failed to load classes:", err.message);
      toast.error("리그 목록을 불러오지 못했습니다.");
    }
  };

  const handleUpdateLeagueName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeague) return;
    if (!editLeagueName.trim()) return toast.error("리그 이름을 입력해 주세요.");

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from("classes")
        .update({ class_name: editLeagueName.trim() })
        .eq("id", editingLeague.id);

      if (error) throw error;

      toast.success("리그 이름이 수정되었습니다!");
      setEditingLeague(null);
      setEditLeagueName("");
      await loadLeagues(userId);
    } catch (err: any) {
      console.error("Failed to update league name:", err.message);
      toast.error("리그 이름 수정에 실패했습니다: " + err.message);
    } finally {
      setUpdatingName(false);
    }
  };

  const handleDeleteLeague = async (leagueId: string, leagueName: string) => {
    if (!window.confirm(`정말로 [${leagueName}] 리그를 삭제하시겠습니까?\n삭제된 리그는 복구할 수 없습니다.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("classes")
        .update({ is_deleted: true })
        .eq("id", leagueId);

      if (error) throw error;

      toast.success("리그가 삭제되었습니다.");
      await loadLeagues(userId);
    } catch (err: any) {
      console.error("Failed to delete league:", err.message);
      toast.error("리그 삭제에 실패했습니다: " + err.message);
    }
  };

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) {
      setModalTab("info");
      return toast.error("학교 이름을 입력해 주세요.");
    }
    if (!newLeagueName.trim()) {
      setModalTab("info");
      return toast.error("리그 이름을 입력해 주세요.");
    }
    if (!/^\d{4}$/.test(adminCode)) {
      setModalTab("info");
      return toast.error("관리자 코드는 4자리 숫자여야 합니다.");
    }
    if (adminCode !== confirmAdminCode) {
      setModalTab("info");
      return; // Block submission (inline error is displayed)
    }

    const finalSeason = newSeason.trim() ? newSeason.trim() : getDynamicSeasonPlaceholder();

    setCreating(true);
    try {
      // 1. classes 테이블에 인서트 (settings에서 adminCode 제외)
      const { data: classData, error: classErr } = await supabase
        .from("classes")
        .insert({
          class_name: newLeagueName.trim(),
          settings: {
            season: finalSeason,
            schoolName: newSchoolName.trim(),
            sport: newSport.trim()
          },
          owner_uid: userId,
          scorekeeper_uids: [],
          co_admin_uids: []
        })
        .select("id")
        .single();

      if (classErr) throw classErr;

      // 2. class_secrets 테이블에 admin_code 삽입
      if (classData) {
        const { error: secretErr } = await supabase
          .from("class_secrets")
          .insert({
            class_id: classData.id,
            admin_code: adminCode
          });
        if (secretErr) throw secretErr;
      }

      toast.success("새로운 리그가 개설되었습니다!");
      setIsModalOpen(false);
      setNewSchoolName("");
      setNewSport("");
      setNewLeagueName("");
      setNewSeason("");
      setAdminCode("");
      setConfirmAdminCode("");
      setModalTab("info");
      await loadLeagues(userId);
    } catch (err: any) {
      console.error("Failed to create class:", err.message);
      toast.error("리그 생성에 실패했습니다: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    toast.loading("로그아웃 중...", { id: "logout" });
    await supabase.auth.signOut();
    toast.success("안전하게 로그아웃되었습니다.", { id: "logout" });
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">로비 입장 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      {/* Background neon elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-tier-diamond/10 blur-[130px] pointer-events-none" />

      {/* Header Profile Section */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl relative z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-blue to-tier-diamond shadow-[0_0_18px_oklch(0.78_0.18_230/0.5)]">
              <Crown className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                스포츠 리그 로비
              </h1>
              <p className="text-[10px] font-bold text-neon-blue tracking-wider uppercase">Lobby Matchmaking</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-black text-foreground">{userEmail}</span>
              <span className="text-[9px] font-bold text-muted-foreground">교사/관리자 계정</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 active:scale-95 transition-all text-xs font-bold cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative z-10">
        {/* Banner Card */}
        <div className="mb-8 rounded-2xl border border-neon-blue/20 bg-gradient-to-r from-neon-blue/5 to-tier-diamond/5 p-6 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_0_30px_rgba(0,180,216,0.03)]">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Sparkles className="size-5 text-neon-blue animate-pulse" />
              학교 스포츠 리그 관리 시스템
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
              관리를 맡고 있는 리그(학급)를 선택하거나 새 학기 새로운 리그전을 창설하세요.<br />
              참여 중인 리그에서는 다른 관리자가 개설한 학급 리그의 경기 기록을 도울 수 있습니다.
            </p>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-r from-neon-blue to-tier-diamond hover:opacity-95 text-primary-foreground font-black px-6 py-5 rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="size-5" /> 새 리그 개설하기
          </Button>
        </div>

        {/* Two Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN: Owned Leagues */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
              <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                <Crown className="size-4.5 text-amber-500" />
                내가 관리하는 리그 ({ownedLeagues.length})
              </h3>
            </div>
            
            {ownedLeagues.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-card/20 p-8 text-center text-muted-foreground text-xs leading-relaxed flex flex-col items-center justify-center gap-2">
                <ShieldAlert className="size-8 text-muted-foreground/45" />
                개설한 리그가 존재하지 않습니다.<br />
                우측 상단 혹은 배너의 [+ 새 리그 개설하기]를 클릭하여 첫 리그를 창설하세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {ownedLeagues.map((league) => (
                  <Link
                    key={league.id}
                    to="/class/$classId"
                    params={{ classId: league.id }}
                    className="group block"
                  >
                    <Card className="relative border-border/60 bg-card/50 hover:bg-card/75 hover:border-neon-blue/60 backdrop-blur-md p-5 rounded-xl transition-all duration-300 hover:scale-[1.01] shadow-[0_4px_15px_rgba(0,0,0,0.05)] hover:shadow-[0_0_25px_rgba(0,180,216,0.08)] cursor-pointer flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1.5 flex-1">
                        <h4 className="text-sm sm:text-base font-black text-foreground group-hover:text-neon-blue transition-colors pr-8">
                          {league.class_name}
                        </h4>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/50">
                            <Calendar className="size-3 text-neon-blue" />
                            시즌: {league.settings?.season || "2026-1"}
                          </span>
                          <span>개설일: {new Date(league.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 relative z-20">
                        {/* Settings Dropdown Button */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 active:scale-95 transition-all cursor-pointer"
                              title="리그 설정"
                            >
                              <Settings className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent 
                            align="end" 
                            className="border-border/60 bg-card/95 backdrop-blur-md text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const inviteUrl = `${window.location.origin}/join?classId=${league.id}`;
                                navigator.clipboard.writeText(inviteUrl);
                                toast.success("초대 링크가 클립보드에 복사되었습니다!");
                              }}
                              className="flex items-center gap-2 cursor-pointer font-bold text-xs hover:text-neon-blue transition-colors"
                            >
                              <Copy className="size-3.5" />
                              <span>초대 링크 복사</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingLeague(league);
                                setEditLeagueName(league.class_name);
                              }}
                              className="flex items-center gap-2 cursor-pointer font-bold text-xs hover:text-neon-blue transition-colors"
                            >
                              <Edit2 className="size-3.5" />
                              <span>리그 설정/수정</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border/30" />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteLeague(league.id, league.class_name);
                              }}
                              className="flex items-center gap-2 cursor-pointer font-bold text-xs text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                              <span>리그 삭제</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="flex size-8 items-center justify-center rounded-lg bg-neon-blue/10 border border-neon-blue/30 text-neon-blue group-hover:bg-neon-blue group-hover:text-primary-foreground transition-all duration-300">
                          <Gamepad2 className="size-4.5" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Joined Leagues */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
              <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                <Users className="size-4.5 text-neon-green" />
                참여 중인 리그 ({joinedLeagues.length})
              </h3>
            </div>
            
            {joinedLeagues.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-card/20 p-8 text-center text-muted-foreground text-xs leading-relaxed flex flex-col items-center justify-center gap-2">
                <Users className="size-8 text-muted-foreground/45" />
                공동 관리 또는 기록원(Scorekeeper)으로 참여 중인 리그가 존재하지 않습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {joinedLeagues.map((league) => (
                  <Link
                    key={league.id}
                    to="/class/$classId"
                    params={{ classId: league.id }}
                    className="group block"
                  >
                    <Card className="border-border/60 bg-card/50 hover:bg-card/75 hover:border-neon-green/60 backdrop-blur-md p-5 rounded-xl transition-all duration-300 hover:scale-[1.01] shadow-[0_4px_15px_rgba(0,0,0,0.05)] hover:shadow-[0_0_25px_rgba(34,197,94,0.08)] cursor-pointer flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1.5">
                        <h4 className="text-sm sm:text-base font-black text-foreground group-hover:text-neon-green transition-colors">
                          {league.class_name}
                        </h4>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/50">
                            <Calendar className="size-3 text-neon-green" />
                            시즌: {league.settings?.season || "2026-1"}
                          </span>
                          <span>소유주: {league.owner_uid === userId ? "나" : "다른 교사"}</span>
                        </div>
                      </div>
                      <div className="flex size-8 items-center justify-center rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green group-hover:bg-neon-green group-hover:text-primary-foreground transition-all duration-300">
                        <Gamepad2 className="size-4.5" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Create League Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-4 right-4">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setModalTab("info");
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <div className="text-center mb-4">
              <h3 className="text-lg font-black text-foreground flex items-center justify-center gap-2">
                <Plus className="size-5 text-neon-blue" />
                새로운 리그 창설하기
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                운영할 학급명 및 리그 정보를 지정해 주세요. 리그가 생성되면 선수(학생) 관리 및 점수 기록을 하실 수 있습니다.
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-border/20 mb-5 relative z-10">
              <button
                type="button"
                onClick={() => setModalTab("info")}
                className={cn(
                  "flex-1 pb-3 text-xs font-extrabold border-b-2 text-center transition-all cursor-pointer",
                  modalTab === "info" 
                    ? "border-neon-blue text-neon-blue" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                기본 정보
              </button>
              <button
                type="button"
                onClick={() => setModalTab("settings")}
                className={cn(
                  "flex-1 pb-3 text-xs font-extrabold border-b-2 text-center transition-all cursor-pointer",
                  modalTab === "settings" 
                    ? "border-neon-blue text-neon-blue" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                리그 설정
              </button>
            </div>

            <form onSubmit={handleCreateLeague} className="space-y-4">
              {modalTab === "info" ? (
                <>
                  <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">학교 이름</Label>
                      <Input
                        required
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        placeholder="예: 서울초등학교"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">종목</Label>
                      <Input
                        value={newSport}
                        onChange={(e) => setNewSport(e.target.value)}
                        placeholder="예: 배드민턴, 테니스"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <Label className="text-xs font-bold text-foreground">리그 이름</Label>
                    <Input
                      required
                      value={newLeagueName}
                      onChange={(e) => setNewLeagueName(e.target.value)}
                      placeholder="예: 5학년 2반 배드민턴 리그"
                      className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <Label className="text-xs font-bold text-foreground">시즌 정보</Label>
                    <Input
                      value={newSeason}
                      onChange={(e) => setNewSeason(e.target.value)}
                      placeholder={getDynamicSeasonPlaceholder()}
                      className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">관리자 코드</Label>
                      <Input
                        type="password"
                        required
                        maxLength={4}
                        value={adminCode}
                        onChange={(e) => setAdminCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="4자리 숫자 입력"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">교사 관리자 및 티어 순위표 접근용 비밀번호</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">관리자 코드 확인</Label>
                      <Input
                        type="password"
                        required
                        maxLength={4}
                        value={confirmAdminCode}
                        onChange={(e) => setConfirmAdminCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="4자리 숫자 재입력"
                        className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                      />
                      {confirmAdminCode && adminCode !== confirmAdminCode && (
                        <p className="text-[10px] text-destructive mt-0.5 font-bold animate-in fade-in duration-200">
                          코드가 일치하지 않습니다.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center space-y-3 border border-dashed border-border/60 rounded-xl bg-background/20 animate-in fade-in duration-200">
                  <div className="flex size-12 items-center justify-center rounded-full bg-neon-blue/10 border border-neon-blue/30 text-neon-blue mx-auto">
                    <Settings className="size-6 text-neon-blue animate-spin" style={{ animationDuration: '6s' }} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-foreground">세부 리그 설정</p>
                    <p className="text-xs text-muted-foreground px-4 leading-relaxed">
                      초기 랭킹포인트(RP), 티어 별 승패점수 배정, <br/>
                      경기 보너스 점수 규칙 등 상세한 리그 설정 기능은 <br/>
                      <span className="text-neon-blue font-bold">추후 지원 예정</span>입니다.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setModalTab("info");
                  }}
                  className="h-10 rounded-xl cursor-pointer"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="h-10 rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-bold shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  {creating ? "개설 중..." : "리그 개설 완료"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit League Modal */}
      {editingLeague && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setEditingLeague(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <div className="text-center mb-6">
              <h3 className="text-lg font-black text-foreground flex items-center justify-center gap-2">
                <Edit2 className="size-5 text-neon-blue" />
                리그 이름 수정하기
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                선택한 리그의 이름을 변경합니다. 변경 후 즉시 순위표 및 대시보드 타이틀에 반영됩니다.
              </p>
            </div>

            <form onSubmit={handleUpdateLeagueName} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">리그 이름</Label>
                <Input
                  required
                  value={editLeagueName}
                  onChange={(e) => setEditLeagueName(e.target.value)}
                  placeholder="예: 5학년 2반 배드민턴 리그"
                  className="h-10 border-border/60 bg-background/40 focus:border-neon-blue transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingLeague(null)}
                  className="h-10 rounded-xl cursor-pointer"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={updatingName}
                  className="h-10 rounded-xl bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-bold shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  {updatingName ? "수정 중..." : "수정 완료"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
