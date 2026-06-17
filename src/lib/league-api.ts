import { supabase } from "../supabaseClient";

// --- Auth API ---
export async function apiGetUser() {
  return supabase.auth.getUser();
}

export async function apiSignOut() {
  return supabase.auth.signOut();
}

// --- Classes API ---
export async function apiFetchClass(classId: string) {
  return supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();
}

export async function apiFetchClassSettings(classId: string) {
  return supabase
    .from("classes")
    .select("settings")
    .eq("id", classId)
    .single();
}

export async function apiUpdateClassSettings(classId: string, settings: any) {
  return supabase
    .from("classes")
    .update({ settings })
    .eq("id", classId);
}

export async function apiUpdateClassSettingsAndName(classId: string, className: string, settings: any) {
  return supabase
    .from("classes")
    .update({ class_name: className, settings })
    .eq("id", classId);
}

// --- Matches API ---
export async function apiFetchMatches(classId: string) {
  return supabase
    .from("matches")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
}

export async function apiInsertMatch(classId: string, winnerId: string, loserId: string) {
  return supabase
    .from("matches")
    .insert({
      class_id: classId,
      winner_id: winnerId,
      loser_id: loserId
    });
}

export async function apiDeleteMatch(matchId: string) {
  return supabase
    .from("matches")
    .delete()
    .eq("id", matchId);
}

export async function apiDeleteStudentMatches(studentId: string) {
  return supabase
    .from("matches")
    .delete()
    .or(`winner_id.eq.${studentId},loser_id.eq.${studentId}`);
}

export async function apiDeleteClassMatches(classId: string) {
  return supabase
    .from("matches")
    .delete()
    .eq("class_id", classId);
}

export async function apiInsertMatchesBulk(matches: any[]) {
  return supabase
    .from("matches")
    .insert(matches);
}

export async function apiUpdateMatchWinnerLoser(matchId: string, winnerId: string, loserId: string) {
  return supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      loser_id: loserId
    })
    .eq("id", matchId);
}

// --- Students API ---
// 교사용 학생 목록 조회 (real_name 포함)
export async function apiFetchStudents(classId: string) {
  return supabase
    .from("students")
    .select("id, class_id, rp, tier, win_count, lose_count, nickname, real_name, grade, class_number, student_no, gender, is_deleted, recent_matches, display_name")
    .eq("class_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

// 학생용/리더보드용 학생 목록 조회 (real_name 제외, display_name 사용)
export async function apiFetchStudentsPublic(classId: string) {
  return supabase
    .from("students_public")
    .select("id, class_id, rp, tier, win_count, lose_count, nickname, grade, class_number, student_no, gender, is_deleted, recent_matches, display_name")
    .eq("class_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

export async function apiUpdateStudentRp(studentId: string, rp: number) {
  return supabase
    .from("students")
    .update({ rp })
    .eq("id", studentId);
}

export async function apiResetStudentRp(studentId: string) {
  return supabase
    .from("students")
    .update({ rp: 1000 })
    .eq("id", studentId);
}

export async function apiResetAllClassStudentsRp(classId: string) {
  return supabase
    .from("students")
    .update({ rp: 1000 })
    .eq("class_id", classId);
}

export async function apiUpdateStudentFields(studentId: string, fields: {
  grade?: number;
  class_number?: number;
  student_no?: number;
  real_name?: string;
  nickname?: string | null;
  gender?: string;
}) {
  return supabase
    .from("students")
    .update(fields)
    .eq("id", studentId);
}

export async function apiInsertStudent(classId: string, info: {
  grade: number;
  class_number: number;
  student_no: number;
  real_name: string;
  nickname?: string | null;
  gender?: string;
  rp?: number;
}) {
  return supabase
    .from("students")
    .insert({
      class_id: classId,
      rp: info.rp ?? 1000,
      grade: info.grade,
      class_number: info.class_number,
      student_no: info.student_no,
      real_name: info.real_name,
      nickname: info.nickname ?? null,
      gender: info.gender ?? "U"
    })
    .select("id")
    .single();
}

export async function apiSoftDeleteStudent(studentId: string) {
  return supabase
    .from("students")
    .update({ is_deleted: true })
    .eq("id", studentId);
}

export async function apiUpdateStudentInfo(studentId: string, payload: {
  grade?: number;
  class_number?: number;
  student_no?: number;
  real_name?: string;
  nickname?: string | null;
  gender?: string;
  rp?: number;
}) {
  return supabase
    .from("students")
    .update(payload)
    .eq("id", studentId);
}

export async function apiDeleteClassStudents(classId: string) {
  return supabase
    .from("students")
    .delete()
    .eq("class_id", classId);
}

export async function apiInsertStudentsBulk(students: any[]) {
  return supabase
    .from("students")
    .insert(students);
}

export async function apiRecordMatchTransaction(payload: {
  classId: string;
  matchId: string;
  winnerId: string;
  loserId: string;
  playerUpdates: { id: string; rp: number }[];
}) {
  const { error } = await supabase.rpc('record_match_transaction', {
    p_class_id: payload.classId,
    p_match_id: payload.matchId,
    p_winner_id: payload.winnerId,
    p_loser_id: payload.loserId,
    p_player_updates: payload.playerUpdates
  });
  if (error) throw error;
}

// --- Class Secrets API ---
export async function apiFetchClassSecret(classId: string) {
  return supabase
    .from("class_secrets")
    .select("admin_code")
    .eq("class_id", classId)
    .single();
}

export async function apiUpdateClassSecret(classId: string, adminCode: string) {
  return supabase
    .from("class_secrets")
    .update({ admin_code: adminCode })
    .eq("class_id", classId);
}
