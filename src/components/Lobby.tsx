import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "../supabaseClient";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Toaster } from "./ui/sonner";
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
  Trash2,
  UserPlus,
  UserX
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
import { LEAGUE_BUNDLES, buildBundleSettings, type BundleKey } from "@/lib/league-presets";

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
  const [selectedBundle, setSelectedBundle] = useState<BundleKey>("standard");

  // 리그 참여 모달
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // 기록원 초대 모달 / 멤버 관리 모달
  const [inviteLeague, setInviteLeague] = useState<Class | null>(null);
  const [membersLeague, setMembersLeague] = useState<Class | null>(null);
  const [members, setMembers] = useState<{ uid: string; email: string | null; role: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

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
  // 관리자 코드 편집
  const [editAdminCode, setEditAdminCode] = useState("");
  const [editConfirmCode, setEditConfirmCode] = useState("");
  const [currentCodeExists, setCurrentCodeExists] = useState<boolean | null>(null); // null=확인중

  // 리그 수정 모달 열기 (이름 채우고 현재 코드 존재 여부 조회)
  const openEditLeague = async (league: Class) => {
    setEditingLeague(league);
    setEditLeagueName(league.class_name);
    setEditAdminCode("");
    setEditConfirmCode("");
    setCurrentCodeExists(null);
    try {
      const { data } = await supabase
        .from("class_secrets")
        .select("admin_code")
        .eq("class_id", league.id)
        .maybeSingle();
      setCurrentCodeExists(!!(data && data.admin_code));
    } catch {
      setCurrentCodeExists(false);
    }
  };

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

    // 코드 변경을 입력했는지 (둘 중 하나라도 입력되면 변경 시도로 간주)
    const wantsCodeChange = editAdminCode.length > 0 || editConfirmCode.length > 0;
    if (wantsCodeChange) {
      if (!/^\d{4}$/.test(editAdminCode)) return toast.error("관리자 코드는 4자리 숫자여야 합니다.");
      if (editAdminCode !== editConfirmCode) return toast.error("코드 확인이 일치하지 않습니다.");
    }

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from("classes")
        .update({ class_name: editLeagueName.trim() })
        .eq("id", editingLeague.id);

      if (error) throw error;

      // 코드 변경/생성 (upsert: 기존 row 없으면 생성)
      if (wantsCodeChange) {
        const { error: codeErr } = await supabase
          .from("class_secrets")
          .upsert({ class_id: editingLeague.id, admin_code: editAdminCode }, { onConflict: "class_id" });
        if (codeErr) throw codeErr;
      }

      toast.success(wantsCodeChange ? "리그 정보와 관리자 코드가 저장되었습니다!" : "리그 이름이 수정되었습니다!");
      setEditingLeague(null);
      setEditLeagueName("");
      setEditAdminCode("");
      setEditConfirmCode("");
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
            sport: newSport.trim(),
            // 개설 시 선택한 '리그 성향' → 기준점/승패/보너스/패널티 일괄 적용
            ...buildBundleSettings(selectedBundle),
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

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinCode.trim();
    // 전체 초대 링크를 붙여넣어도 classId 추출
    const fromUrl = raw.match(/classId=([0-9a-f-]{36})/i)?.[1];
    const code = fromUrl || raw;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    if (!isUuid) {
      return toast.error("올바른 리그 코드가 아닙니다. 개설자에게 받은 코드(또는 초대 링크)를 붙여넣어 주세요.");
    }
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc("join_league", { p_class_id: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(row?.is_owner ? "내가 개설한 리그입니다." : `'${row?.class_name ?? "리그"}'에 참여했습니다!`);
      setJoinModalOpen(false);
      setJoinCode("");
      await loadLeagues(userId);
    } catch (err: any) {
      console.error("Failed to join league:", err.message);
      toast.error(err.message || "리그 참여에 실패했습니다.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveLeague = async (league: Class) => {
    if (!window.confirm(`[${league.class_name}] 리그에서 탈퇴하시겠습니까?\n다시 참여하려면 리그 코드가 필요합니다.`)) return;
    try {
      const { error } = await supabase.rpc("leave_league", { p_class_id: league.id });
      if (error) throw error;
      toast.success("리그에서 탈퇴했습니다.");
      await loadLeagues(userId);
    } catch (err: any) {
      toast.error(err.message || "탈퇴에 실패했습니다.");
    }
  };

  const openMembers = async (league: Class) => {
    setMembersLeague(league);
    setMembers([]);
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase.rpc("get_league_members", { p_class_id: league.id });
      if (error) throw error;
      setMembers((data as any[]) || []);
    } catch (err: any) {
      toast.error(err.message || "멤버를 불러오지 못했습니다.");
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleRemoveMember = async (uid: string, email: string | null) => {
    if (!membersLeague) return;
    if (!window.confirm(`${email || "이 멤버"}를 리그에서 내보내시겠습니까?`)) return;
    try {
      const { error } = await supabase.rpc("remove_league_member", { p_class_id: membersLeague.id, p_member: uid });
      if (error) throw error;
      toast.success("멤버를 내보냈습니다.");
      setMembers((prev) => prev.filter((m) => m.uid !== uid));
    } catch (err: any) {
      toast.error(err.message || "내보내기에 실패했습니다.");
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
      <Toaster theme="dark" position="top-center" richColors />
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
                        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 text-[10px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/50">
                            <Calendar className="size-3 text-neon-blue" />
                            시즌: {league.settings?.season || "2026-1"}
                          </span>
                          <span>개설일: {new Date(league.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 relative z-20">
                        {/* 기록원 초대 (독립 버튼) */}
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInviteLeague(league); }}
                          className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-neon-green/40 bg-neon-green/10 text-neon-green hover:bg-neon-green/20 active:scale-95 transition-all cursor-pointer text-[11px] font-bold"
                          title="기록원 초대"
                        >
                          <UserPlus className="size-4" /><span className="hidden lg:inline">기록원 추가</span>
                        </button>

                        {/* Settings Dropdown Button */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 active:scale-95 transition-all cursor-pointer text-[11px] font-bold"
                              title="리그 설정"
                            >
                              <Settings className="size-4" /><span className="hidden lg:inline">리그 설정</span>
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
                                openMembers(league);
                              }}
                              className="flex items-center gap-2 cursor-pointer font-bold text-xs hover:text-neon-green transition-colors"
                            >
                              <Users className="size-3.5" />
                              <span>멤버 관리</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openEditLeague(league);
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

                        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-neon-blue/10 border border-neon-blue/30 text-neon-blue group-hover:bg-neon-blue group-hover:text-primary-foreground transition-all duration-300 text-[11px] font-bold">
                          <Gamepad2 className="size-4.5" /><span className="hidden lg:inline">리그 입장</span>
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
              <button
                onClick={() => setJoinModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neon-green/40 bg-neon-green/10 text-neon-green hover:bg-neon-green/20 active:scale-95 transition-all text-[11px] font-bold cursor-pointer"
              >
                <Plus className="size-3.5" /> 리그 참여하기
              </button>
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
                        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 text-[10px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/50">
                            <Calendar className="size-3 text-neon-green" />
                            시즌: {league.settings?.season || "2026-1"}
                          </span>
                          <span>소유주: {league.owner_uid === userId ? "나" : "다른 교사"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 relative z-20">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLeaveLeague(league); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-destructive hover:border-destructive/40 active:scale-95 transition-all text-[11px] font-bold cursor-pointer"
                          title="리그 탈퇴"
                        >
                          <UserX className="size-3.5" />
                          <span>탈퇴</span>
                        </button>
                        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green group-hover:bg-neon-green group-hover:text-primary-foreground transition-all duration-300 text-[11px] font-bold">
                          <Gamepad2 className="size-4.5" /><span className="hidden lg:inline">리그 입장</span>
                        </div>
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
                <div className="space-y-2 animate-in fade-in duration-200">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    리그 성향을 고르면 <b className="text-foreground">티어 기준점·승패 점수·보너스·패널티</b>가 한 번에 설정됩니다. 세부 조정은 개설 후 [리그 글로벌 설정]에서 가능합니다.
                  </p>
                  <div className="space-y-2">
                    {(Object.keys(LEAGUE_BUNDLES) as BundleKey[]).map((k) => {
                      const b = LEAGUE_BUNDLES[k];
                      const active = selectedBundle === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSelectedBundle(k)}
                          className={cn(
                            "w-full text-left rounded-xl border p-3 transition-all active:scale-[0.99]",
                            active ? "border-neon-blue bg-neon-blue/10" : "border-border/50 bg-background/30 hover:border-border/80"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("text-sm font-black", active ? "text-neon-blue" : "text-foreground")}>{b.label}</span>
                            {active && <span className="text-[10px] font-bold text-neon-blue">선택됨</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{b.desc}</p>
                        </button>
                      );
                    })}
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
                리그 설정 수정
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                리그 이름과 관리자 코드를 변경합니다. 변경 후 즉시 반영됩니다.
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

              {/* 관리자 코드 (화면 잠금 해제용) */}
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold text-foreground">🔒 관리자 코드 (4자리)</Label>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                    currentCodeExists === null
                      ? "text-muted-foreground border-border/40"
                      : currentCodeExists
                        ? "text-neon-green border-neon-green/40 bg-neon-green/10"
                        : "text-amber-500 border-amber-500/40 bg-amber-500/10"
                  )}>
                    {currentCodeExists === null ? "확인 중..." : currentCodeExists ? "설정됨" : "미설정"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  순위표·관리자 탭 잠금을 해제할 때 쓰는 코드입니다. {currentCodeExists ? "변경하지 않으려면 비워 두세요." : "잠금 기능을 쓰려면 코드를 설정하세요."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={editAdminCode}
                    onChange={(e) => setEditAdminCode(e.target.value.replace(/\D/g, ""))}
                    placeholder={currentCodeExists ? "새 코드" : "코드 입력"}
                    className="h-9 border-border/60 bg-background/40 focus:border-amber-500 text-center tracking-[0.3em] font-bold"
                  />
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={editConfirmCode}
                    onChange={(e) => setEditConfirmCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="코드 확인"
                    className="h-9 border-border/60 bg-background/40 focus:border-amber-500 text-center tracking-[0.3em] font-bold"
                  />
                </div>
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

      {/* Join League Modal */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-4 right-4">
              <button onClick={() => { setJoinModalOpen(false); setJoinCode(""); }} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="text-center mb-5">
              <h3 className="text-lg font-black text-foreground flex items-center justify-center gap-2">
                <Users className="size-5 text-neon-green" />
                리그 참여하기
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                개설자에게 받은 <b className="text-foreground">리그 코드</b>(또는 초대 링크)를 붙여넣으면 그 리그의 관리 교사로 등록됩니다.
              </p>
            </div>

            <form onSubmit={handleJoinLeague} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">리그 코드</Label>
                <Input
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="리그 코드 또는 초대 링크 붙여넣기"
                  className="h-10 border-border/60 focus:border-neon-green transition-all font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  ※ 참여하면 그 리그의 학생·경기를 관리할 수 있습니다(리그 전체 범위). 리그 글로벌 설정·시즌·데이터는 개설자만 가능합니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => { setJoinModalOpen(false); setJoinCode(""); }} className="h-10 rounded-xl cursor-pointer">
                  취소
                </Button>
                <Button type="submit" disabled={joining} className="h-10 rounded-xl bg-neon-green hover:bg-neon-green/90 text-primary-foreground font-bold shadow-md active:scale-95 transition-all cursor-pointer">
                  {joining ? "참여 중..." : "참여하기"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 기록원 초대 모달 */}
      {inviteLeague && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-4 right-4">
              <button onClick={() => setInviteLeague(null)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="text-center mb-5">
              <h3 className="text-lg font-black text-foreground flex items-center justify-center gap-2">
                <UserPlus className="size-5 text-neon-green" /> 기록원 초대
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                아래 <b className="text-foreground">리그 코드</b>를 함께 관리할 교사에게 전달하세요. 받은 사람은 로비 → [+ 리그 참여하기]에 붙여넣으면 됩니다.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">리그 코드</Label>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLeague.id} className="h-10 font-mono text-[11px]" />
                  <Button type="button" onClick={() => { navigator.clipboard.writeText(inviteLeague.id); toast.success("리그 코드가 복사되었습니다!"); }}
                    className="h-10 px-3 bg-neon-green hover:bg-neon-green/90 text-primary-foreground font-bold shrink-0">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">또는 초대 링크</Label>
                <div className="flex gap-2">
                  <Input readOnly value={`${window.location.origin}/join?classId=${inviteLeague.id}`} className="h-10 font-mono text-[11px]" />
                  <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join?classId=${inviteLeague.id}`); toast.success("초대 링크가 복사되었습니다!"); }}
                    className="h-10 px-3 font-bold shrink-0">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 멤버 관리 모달 */}
      {membersLeague && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-md border-border/60 bg-card/95 p-6 rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-4 right-4">
              <button onClick={() => setMembersLeague(null)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                <Users className="size-5 text-neon-blue" /> 멤버 관리
              </h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">{membersLeague.class_name}</p>
            </div>
            {loadingMembers ? (
              <p className="text-xs text-muted-foreground py-6 text-center">불러오는 중...</p>
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border/30 rounded-xl">참여 중인 멤버가 없습니다. 기록원을 초대해 보세요.</p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {members.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/40 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{m.email || m.uid.slice(0, 8) + "…"}</div>
                      <div className="text-[10px] text-muted-foreground">{m.role}</div>
                    </div>
                    <Button type="button" variant="ghost" onClick={() => handleRemoveMember(m.uid, m.email)}
                      className="h-8 px-3 rounded-lg text-[11px] font-bold text-destructive hover:bg-destructive/10 shrink-0">
                      <UserX className="size-3.5 mr-1" /> 내보내기
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
