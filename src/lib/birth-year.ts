// 연생(출생연도) 입력 처리 유틸 — 회원 추가/편집 폼에서 공용 사용.

export const CURRENT_YEAR = new Date().getFullYear();

// 2자리 연생 입력(94, 01, 67)을 4자리(1994, 2001, 1967)로 인식. 빈값/무효 → null.
export function normalizeBirthYear(raw: string): number | null {
  const t = (raw || "").trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = parseInt(t, 10);
  if (t.length >= 3) return n; // 3~4자리는 그대로(전체 연도 입력)
  const pivot = CURRENT_YEAR % 100; // 올해 두 자리 이하면 2000년대, 초과면 1900년대
  return n <= pivot ? 2000 + n : 1900 + n;
}

// 4자리 연도 → 2자리 표기 (1994 → "94")
export const yy2 = (year?: number | null) => (year ? String(year % 100).padStart(2, "0") : "");
