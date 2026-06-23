// 종목별 레벨(급수) 체계 프리셋.
//  - 리그 개설 시 "레벨 체계 따름(preset)"을 고르면 해당 종목의 레벨 목록을 settings.levels 로 복사한다.
//  - 목록 순서는 높은 → 낮은 순(표 기준). 점수에는 영향 없는 순수 분류/표시용.
//  - 관리자 탭에서 이름/설명 수정·추가·삭제 가능(추후 단계).

export type LevelDef = { name: string; description?: string };
export type SportPreset = { sport: string; levels: LevelDef[] };

export const SPORT_PRESETS: SportPreset[] = [
  {
    sport: "배드민턴",
    levels: [
      { name: "선출", description: "실업·대학·고교 선수 경력. 자강·준자강 포함 (일반 동호회에서 보기 드문 수준)" },
      { name: "A급", description: "지역 대회 입상권. 스매시·헤어핀·네트플레이 안정" },
      { name: "B급", description: "기본기 완성, 경기 운영 가능. 구력 3~5년" },
      { name: "C급", description: "클리어·드롭 구사, 기본 랠리 가능. 구력 1~3년" },
      { name: "D급", description: "처음 배우는 단계. 구력 6개월~1년" },
      { name: "초심", description: "입문 3개월 이내. 규칙 익히는 중" },
    ],
  },
  {
    sport: "탁구",
    levels: [
      { name: "선수부", description: "중·고·대학·실업 선수 등록 경력. 에이스부 포함 (일반 동호인과 별도 취급)" },
      { name: "1부", description: "지역 대회 상위권. 드라이브·커트·서브 전술 완성" },
      { name: "2부", description: "드라이브 안정적, 전술 이해. 지역 중상위. 구력 5~10년" },
      { name: "3부", description: "기본 드라이브 가능, 랠리 지속. 구력 3~5년. 2부와 핸디 1점 차" },
      { name: "4부", description: "포·백핸드 안정적, 서브 다양화 시작. 구력 1~3년" },
      { name: "5~6부", description: "기본 랠리 가능, 포핸드 위주. 구력 6개월~1년" },
      { name: "7부/초심", description: "입문. 공 받기·넘기기 연습 중" },
    ],
  },
  {
    sport: "테니스",
    levels: [
      { name: "선출", description: "중·고·대학 선수 경력. 오픈부 포함 (NTRP 4.5↑, 전국대회 씬)" },
      { name: "슈퍼부", description: "전국대회 입상 경험. 서브·발리·전술 완성 (NTRP 4.0~4.5)" },
      { name: "신인부", description: "전국대회 참가 가능 수준 (NTRP 3.5~4.0)" },
      { name: "중급", description: "랠리·서브 안정적. 구력 3~5년 (NTRP 3.0~3.5)" },
      { name: "초급", description: "기본기 연습 중. 구력 1~2년 (NTRP 2.0~3.0)" },
    ],
  },
  {
    sport: "피클볼",
    levels: [
      { name: "오픈부", description: "전국대회 상위권. PRO 포함. 딩크·스피드업·랠리 완성 (DUPR 4.0↑)" },
      { name: "2부", description: "안정적 랠리·딩크·3번째 샷 드롭 구사 (DUPR 3.5~3.99)" },
      { name: "3부", description: "기본기 숙지, 경기 운영 가능 (DUPR 3.0~3.49)" },
      { name: "신인부", description: "입문~초보. 기본 서브·랠리 배우는 중 (DUPR 3.0↓)" },
    ],
  },
  {
    sport: "볼링",
    levels: [
      { name: "프로", description: "KPBA 프로 자격증 보유. 자격증으로 명확히 구분" },
      { name: "고수", description: "에버리지 190↑. 훅볼·스페어 처리 완성. 마이볼 맞춤 제작" },
      { name: "상급", description: "에버리지 160~190. 마이볼 사용, 훅 구사" },
      { name: "중급", description: "에버리지 130~160. 스페어 처리 가능. 마이볼 사용 시작" },
      { name: "초급", description: "에버리지 130↓. 하우스볼 사용. 직구 위주" },
    ],
  },
  {
    sport: "비치발리볼",
    levels: [
      { name: "선출", description: "실업·대학 배구 또는 비치발리볼 선수 경력" },
      { name: "오픈부", description: "전국대회 참가. 서브·스파이크·블로킹 완성" },
      { name: "일반부", description: "대회 참가 가능. 패스·토스 안정적. 구력 2년↑" },
      { name: "초보부", description: "기본 패스 연습 중. 입문~1년" },
    ],
  },
  {
    sport: "컬링",
    levels: [
      { name: "선출", description: "국가대표·실업팀 경력" },
      { name: "오픈부", description: "전국대회 참가. 스위핑·웨이트·스트래티지 완성" },
      { name: "일반부", description: "기본 투구·스위핑 가능. 팀 플레이 숙지. 구력 2년↑" },
      { name: "초보부", description: "슬라이딩·해머 투구 배우는 단계" },
    ],
  },
  {
    sport: "스쿼시",
    levels: [
      { name: "선출", description: "선수 등록 경력. 국내 PSA 랭킹 보유" },
      { name: "A조", description: "전국대회 입상권. 드롭·로브·닉 샷 완성. 풀코트 커버" },
      { name: "B조", description: "지역 대회 입상권. 기본 전술·볼 컨트롤 안정" },
      { name: "C조", description: "랠리 지속 가능. 기본 샷 구사. 구력 2~4년" },
      { name: "D조/초심", description: "기초 배우는 단계. 구력 1년 이내" },
    ],
  },
];

export const SPORT_OPTIONS: string[] = SPORT_PRESETS.map((p) => p.sport);

export function getSportPreset(sport: string | null | undefined): SportPreset | undefined {
  if (!sport) return undefined;
  return SPORT_PRESETS.find((p) => p.sport === sport.trim());
}
