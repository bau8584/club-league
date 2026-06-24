import { useCallback, useEffect, useState } from "react";

export type ThemeName = "game" | "black" | "modern" | "clay";

export const THEMES: { value: ThemeName; label: string; hint: string }[] = [
  { value: "game", label: "게임", hint: "사이버펑크 네온" },
  { value: "black", label: "블랙", hint: "OLED · 고급 미니멀" },
  { value: "modern", label: "모던", hint: "웜 뉴트럴 · 유리" },
  { value: "clay", label: "클레이", hint: "말랑 3D · 귀여움" },
];

const VALID: ThemeName[] = ["game", "black", "modern", "clay"];
const STORAGE_KEY = "ui-theme";

// 과거 제거된 테마 정규화: pastel→clay, glass→modern(모던에 흡수)
function normalize(v: string | null | undefined): ThemeName {
  if (v === "pastel") return "clay";
  if (v === "glass") return "modern";
  return (VALID as string[]).includes(v ?? "") ? (v as ThemeName) : "game";
}

function readTheme(): ThemeName {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr && (VALID as string[]).includes(attr)) return attr as ThemeName;
  }
  try { return normalize(localStorage.getItem(STORAGE_KEY)); } catch { return "game"; }
}

// 테마 읽기/변경 훅. data-theme 속성 + localStorage 동기화.
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>("game");

  // 초기 마운트 시 현재 적용된 테마로 동기화 (SSR/무플래시 스크립트가 미리 설정)
  useEffect(() => { setThemeState(readTheme()); }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  return { theme, setTheme };
}
