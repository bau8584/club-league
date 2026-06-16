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
export async function apiFetchStudents(classId: string) {
  return supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .neq("is_deleted", true);
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

export async function apiUpdateStudentName(studentId: string, studentName: string) {
  return supabase
    .from("students")
    .update({ student_name: studentName })
    .eq("id", studentId);
}

export async function apiInsertStudent(classId: string, studentName: string) {
  return supabase
    .from("students")
    .insert({
      class_id: classId,
      rp: 1000,
      student_name: studentName
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

export async function apiUpdateStudentInfo(studentId: string, payload: { student_name: string; rp?: number }) {
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
