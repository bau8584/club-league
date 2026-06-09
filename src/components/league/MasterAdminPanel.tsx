import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Crown, Trash2, Edit3, Save, X, Calendar, School, UserCheck, ShieldCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type TeacherAccount = {
  loginId: string;
  role: string;
  schoolName: string;
  userName: string;
  scriptUrl: string;
  createdAt: string;
};

export function MasterAdminPanel({
  masterApiUrl
}: {
  masterApiUrl: string;
}) {
  const [teachers, setTeachers] = useState<TeacherAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSchoolName, setEditSchoolName] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editScriptUrl, setEditScriptUrl] = useState("");

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${masterApiUrl}?action=GET_TEACHERS`);
      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.teachers)) {
        setTeachers(data.teachers);
      } else {
        toast.error("교사 목록을 가져오지 못했습니다.");
      }
    } catch (err) {
      console.error(err);
      toast.error("마스터 서버 통신 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleEditClick = (t: TeacherAccount) => {
    setEditingId(t.loginId);
    setEditSchoolName(t.schoolName);
    setEditUserName(t.userName);
    setEditScriptUrl(t.scriptUrl);
  };

  const handleSaveClick = async (loginId: string) => {
    if (!editSchoolName.trim() || !editUserName.trim()) {
      return toast.error("학교명과 교사명을 올바르게 채워주세요.");
    }

    setIsLoading(true);
    try {
      const response = await fetch(masterApiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "UPDATE_TEACHER",
          targetId: loginId,
          nextSchoolName: editSchoolName.trim(),
          nextUserName: editUserName.trim(),
          nextScriptUrl: editScriptUrl.trim()
        })
      });
      const data = await response.json();
      if (data.status === "success") {
        toast.success(data.message || "교사 정보가 정상적으로 갱신되었습니다!");
        setEditingId(null);
        fetchTeachers(); // 목록 리프레시
      } else {
        toast.error(data.message || "정보 갱신에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      toast.error("마스터 정보 변경 통신 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = async (loginId: string) => {
    if (!confirm(`정말로 [${loginId}] 교사 계정을 삭제하시겠습니까?\n해당 교사의 개인 구글 시트 데이터는 지워지지 않으나 로그인 세션과 권한은 즉시 박탈됩니다.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(masterApiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "DELETE_TEACHER",
          targetId: loginId
        })
      });
      const data = await response.json();
      if (data.status === "success") {
        toast.success(data.message || "계정이 성공적으로 파기되었습니다.");
        fetchTeachers();
      } else {
        toast.error(data.message || "계정 삭제에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      toast.error("마스터 삭제 통신 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Overview Dashboard Header */}
      <Card className="border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
          <Crown className="size-48 text-amber-500 animate-pulse" />
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Crown className="size-6 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Master Control Panel</p>
              <h3 className="font-black text-xl text-foreground">👑 최고 마스터 권한 제어 센터</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                현재 리그 시스템에 가입하여 전용 구글 시트 데이터베이스를 연동 중인 교사 및 테넌트 계정을 총괄 통제합니다.
              </p>
            </div>
          </div>

          <Button
            onClick={fetchTeachers}
            disabled={isLoading}
            variant="outline"
            className="border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 text-amber-500 font-bold text-xs gap-1.5 shrink-0 active:scale-95"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} /> 
            새로고침
          </Button>
        </div>
      </Card>

      {/* Teachers Accounts Table */}
      <Card className="border-border/60 bg-card/40 p-5 backdrop-blur shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-black uppercase">
            <ShieldCheck className="size-4 text-amber-500" />
            가입된 학급 교사 및 학생 단체 계정 목록 ({teachers.length}개)
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-background/30 overflow-hidden shadow-inner">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="font-bold text-xs text-foreground py-3.5 w-[110px]">계정 ID</TableHead>
                <TableHead className="font-bold text-xs text-foreground py-3.5 w-[140px]">학교명</TableHead>
                <TableHead className="font-bold text-xs text-foreground py-3.5 w-[100px]">이름 (가입자)</TableHead>
                <TableHead className="font-bold text-xs text-foreground py-3.5 w-[100px]">역할 등급</TableHead>
                <TableHead className="font-bold text-xs text-foreground py-3.5">개인 API 주소 (scriptUrl)</TableHead>
                <TableHead className="font-bold text-xs text-foreground py-3.5 w-[130px] text-right">관리 제어</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-xs text-muted-foreground">
                    <span className="flex items-center justify-center gap-2">
                      <span className="size-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                      마스터 서버에서 교사 DB 불러오는 중...
                    </span>
                  </TableCell>
                </TableRow>
              ) : teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-xs text-muted-foreground">
                    가입되어 전용 리그를 운영 중인 교사 계정이 단 한 명도 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                teachers.map((t) => {
                  const isEditing = editingId === t.loginId;
                  return (
                    <TableRow 
                      key={t.loginId} 
                      className="border-border/30 hover:bg-muted/10 transition-colors"
                    >
                      {/* Login ID */}
                      <TableCell className="font-mono text-xs font-bold text-amber-500">{t.loginId}</TableCell>
                      
                      {/* School Name */}
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            value={editSchoolName} 
                            onChange={(e) => setEditSchoolName(e.target.value)}
                            className="h-8 border-amber-500/50 bg-background/50 text-xs py-1"
                          />
                        ) : (
                          <span className="text-xs font-bold flex items-center gap-1">
                            <School className="size-3 text-muted-foreground shrink-0" />
                            {t.schoolName}
                          </span>
                        )}
                      </TableCell>

                      {/* User Name */}
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            value={editUserName} 
                            onChange={(e) => setEditUserName(e.target.value)}
                            className="h-8 border-amber-500/50 bg-background/50 text-xs py-1"
                          />
                        ) : (
                          <span className="text-xs font-medium flex items-center gap-1">
                            <UserCheck className="size-3 text-muted-foreground shrink-0" />
                            {t.userName}
                          </span>
                        )}
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border",
                          t.role === "TEACHER" 
                            ? "bg-neon-blue/10 text-neon-blue border-neon-blue/20" 
                            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        )}>
                          {t.role === "TEACHER" ? "체육 교사" : "학생"}
                        </span>
                      </TableCell>

                      {/* scriptUrl */}
                      <TableCell className="font-mono text-[10px]">
                        {isEditing ? (
                          <Input 
                            value={editScriptUrl} 
                            onChange={(e) => setEditScriptUrl(e.target.value)}
                            className="h-8 border-amber-500/50 bg-background/50 text-[10px] font-mono py-1"
                          />
                        ) : (
                          <span className="text-muted-foreground truncate block max-w-[280px]" title={t.scriptUrl}>
                            {t.scriptUrl || "미연동 (로컬 전용)"}
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right py-2 shrink-0">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              onClick={() => handleSaveClick(t.loginId)}
                              size="sm"
                              className="h-8 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-1 py-1"
                            >
                              <Save className="size-3" /> 저장
                            </Button>
                            <Button
                              onClick={() => setEditingId(null)}
                              variant="outline"
                              size="sm"
                              className="h-8 border-border/50 text-muted-foreground font-bold text-xs gap-1 py-1"
                            >
                              <X className="size-3" /> 취소
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              onClick={() => handleEditClick(t)}
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                              title="계정 정보 편집"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteClick(t.loginId)}
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="계정 완전 삭제"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Dynamic Registered Date Footer */}
        {teachers.length > 0 && (
          <div className="mt-4 text-[10px] text-muted-foreground flex items-center justify-end gap-1.5 font-bold">
            <Calendar className="size-3" />
            각 학교 교사의 데이터 정합성 수정을 완료한 후 [새로고침]을 진행해 주세요.
          </div>
        )}
      </Card>

    </div>
  );
}
