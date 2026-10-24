# 교실 리그 사용성 점검 — 실사용 데이터 편 (2026-10-24 기준)

- 접속: `.env.local`의 READONLY_DATABASE_URL(계정 `claude_ro`, select만 됨) + 매 조회를 `begin read only … rollback`으로 감쌈. 쓰기·함수 실행 없음.
- 대상: 지워지지 않은 리그 274개(학교 260 · 동호회 14), 경기 16,846개, 학생 5,860명. 학생 실명·리그 이름은 적지 않음.
- 실행 도구: `scripts/db-query.mjs`가 이 폴더(C:\code)에선 `pg` 모듈이 없어 돌지 않음 → 같은 내용의 복사본을 scratchpad에 두고 OneDrive 옛 사본의 `pg`를 빌려 씀(아래 "부록"). **스킬 `report`의 경로도 옛 OneDrive 주소 그대로**라 고칠 필요가 있음.
- "활동 리그" = 경기 10개 이상(97개). "최근 활동" = 최근 14일 안에 경기 1개 이상.
- 시간은 한국 시간 기준으로 자름.

---

## 1. 리그 수와 이탈 깔때기

### 1-1. 리그 단위

| 단계 | 전체 | 학교 | 동호회 | 앞 단계 대비 남은 비율(전체) |
|---|---:|---:|---:|---:|
| 리그 만듦 | 274 | 260 | 14 | — |
| 학생 1명 이상 | 208 | 200 | 8 | 76% |
| 경기 1개 이상 | 130 | 126 | 4 | **63% (가장 큰 이탈)** |
| 경기 10개 이상 | 97 | 94 | 3 | 75% |
| 경기 50개 이상 | 66 | 65 | 1 | 68% |
| 최근 14일 활동 | 63 | 62 | 1 | (10개 이상 대비 65%) |
| 최근 7일 활동 | 46 | 46 | 0 | |

- 2주 유지율: 만든 지 14일 지난 리그 236개 중 최근 7일 경기 있는 것 25개(11%).
- 인디스쿨 배포(09-14) 뒤 만든 리그가 270개(99%). 배포 전 4개는 제작자·초기 리그로 보임.

해석: **명단까지 넣은 리그의 37%(78개)가 첫 경기를 한 번도 기록하지 않았다.** 명단 단계(−24%)보다 "명단 → 첫 경기"가 더 큰 구멍.

### 1-2. 선생님(만든 사람) 단위

| 단계 | 선생님 수 | 남은 비율 |
|---|---:|---:|
| 리그를 만든 선생님 | 221 | — |
| 학생 넣음 | 160 | 72% |
| 경기 1개 이상 | 92 | **58% (가장 큰 이탈)** |
| 경기 10개 이상 | 70 | 76% |
| 최근 14일 활동 | 43 | 61% |

- 리그 2개 이상 만든 선생님 27명(최대 7개, 중앙값 1개).
- 경기 0개 리그 144개 중 133개(92%)는 **그 선생님의 다른 리그도 전부 0경기** → "시험용 리그를 버리고 진짜 리그로 갔다"가 아니라 진짜로 멈춘 것.
- 경기 0개 리그 중 최근 14일 안에 만든 것은 12개뿐 → 나머지는 "아직 수업 전"이 아니라 이미 손을 놓은 쪽.

### 1-3. 걸리는 시간

| 구간 | 중앙값 | 상위 10% |
|---|---:|---:|
| 리그 만든 뒤 첫 학생 넣기 | 0시간(바로) | 1시간 |
| 첫 학생 넣은 뒤 첫 경기 | 2시간 | 117시간(약 5일) |

해석: 명단을 넣는 선생님은 만든 그 자리에서 넣는다. 첫 경기는 "다음 체육 시간"에 맞춰 들어오는 모양 → 그 사이 며칠 공백에서 많이 빠진다.

### 1-4. 주별 흐름

| 주(월요일) | 새 리그 | 경기 수 | 경기 있는 리그 |
|---|---:|---:|---:|
| 09-14 | 176 | 2,550 | 54 |
| 09-21 | 24 | 3,590 | 44 |
| 09-28 | 21 | 3,088 | 46 |
| 10-05 | 11 | 1,905 | 42 |
| 10-12 | 25 | 2,655 | 50 |
| 10-19 | 13 | 2,522 | 47 |

해석: 새 리그는 배포 주에 몰렸고, **매주 쓰는 리그는 42~50개로 6주째 거의 그대로**. 한번 수업에 들어간 리그는 잘 남는다.

**시사점**: 고칠 곳은 "만든 뒤 첫 수업까지". 첫 경기를 넣은 리그는 75%가 10경기를 넘기고, 주간 활동 리그 수도 안정적이다.

---

## 2. 명단 크기 · 경기 수 · 수업당 경기 수

### 2-1. 명단 크기(지워지지 않은 학생)

| 학생 수 | 리그 | 그중 경기 0개 |
|---|---:|---:|
| 0명 | 66 | 66 |
| 1~10명 | 26 | 7 |
| 11~20명 | 38 | 22 |
| 21~30명 | 131 | 45 |
| 31~60명 | 5 | 2 |
| 61~150명 | 4 | 2 |
| 151명 이상 | 4 | 0 |

- 학생 있는 리그의 명단: 25%=19명, 중앙값 22명, 75%=24명, 90%=28명.

해석: **한 반(20~30명) 리그가 표준.** 학년 단위(60명+) 리그는 8개뿐.

### 2-2. 리그당 경기 수

| 경기 수 | 리그 |
|---|---:|
| 0 | 144 |
| 1~9 | 33 |
| 10~49 | 31 |
| 50~99 | 11 |
| 100~299 | 35 |
| 300 이상 | 20 |

- 경기 있는 리그: 25%=9, 중앙값 51, 75%=173, 90%=363. 최대 1,282.
- 가장 많이 쓴 리그 1곳이 전체 경기의 7.6%, 상위 10곳이 35.6%.

해석: 양극화. 쓰는 리그는 수백 경기까지 가고, 안 쓰는 리그는 0~9에서 멈춘다. 중간(10~99)이 얇다.

### 2-3. 수업(리그 × 하루) 단위 — 09-14 이후

| 지표 | 값 |
|---|---:|
| 수업 수 | 572 (리그 130개) |
| 수업당 경기: 25% / 중앙값 / 75% / 90% | 8 / 18 / 38 / 67 |
| 수업당 평균 경기 | 28.5 |
| 첫 경기~마지막 경기 시간(중앙값) | 37분 |
| 경기 1개만 넣고 끝난 수업 | 31 (5%) |
| 같은 리그 연속 경기 사이 간격 중앙값 | 28초 (10%는 10초 이내) |
| 복식 비율 | 18.6% |
| 학생 직접 입력(QR) 비율 | 2.0% |
| 점수 "1-0"(승패만) 경기 | 5,179 (31%) |

- 리그가 몇 날 쓰였나: 1일 51개 · 2~3일 26개 · 4~7일 31개 · 8~15일 14개 · 16일 이상 8개.
- 경기 몰리는 때: 수요일 10~13시, 화요일 9·12~13시, 목요일 14시.

해석: **한 수업 40분에 18경기, 28초마다 한 경기씩 들어온다** = 선생님이 수업 중 서서 빠르게 누른다. 한 경기 입력에 걸리는 손이 곧 사용성의 핵심. 3분의 1은 점수 없이 승패만 넣는다.

**시사점**: "수업 중 빠른 연속 입력"이 주 사용 장면. 입력 화면 단계 수·버튼 크기·점수 생략 경로가 가장 큰 영향.

---

## 3. 설정을 기본값에서 바꾼 비율

### 3-1. 리그 만들 때 고른 '리그 성향' (점수 기준선 + 다이아 승패 RP로 판별)

| 성향 | 리그 | 활동 리그 | 만든 뒤 세부(보너스·감점·티어별 RP)를 다시 바꾼 리그 |
|---|---:|---:|---:|
| 표준(추천) | 179 (65%) | 50 | 11 |
| 캐주얼·모두 행복 | 40 (15%) | 20 | 10 |
| 단기 이벤트 | 34 (12%) | 16 | 6 |
| 정밀·경쟁 | 6 (2%) | 1 | 0 |
| 어느 성향과도 안 맞음(직접 숫자 조정) | 15 (5%) | 10 | 12 |

- 만든 뒤 RP 세부를 바꾼 리그: 전체 39/274(14%), **활동 리그로 좁히면 33/97(34%)**. (주의: 앱 업데이트로 저장 형식이 달라진 것도 "바뀜"으로 잡혔을 수 있음 — 상한값으로 볼 것.)
- 캐주얼·단기를 고른 리그의 활동 비율(50%·47%)이 표준(28%)보다 높다 → 개설 때 성향을 일부러 고른 사람이 더 진지한 사용자일 가능성.

### 3-2. 설정별 손댄 리그 수

| 설정 | 바꾼 리그(전체 274) | 활동 리그(97) 중 | 기본값 |
|---|---:|---:|---|
| 종목 이름 비워 둠 | 146 (53%) | 69 (71%) | 빈칸 |
| 성별 쓰기 켬 | 45 (16%) | 16 (16%) | 끔 |
| 시즌 이름 바꿈("시즌 1" 아님) | 32 (12%) | 18 (19%) | 시즌 1 |
| 시즌 넘김 실제 실행(지난 시즌 기록 있음) | 16 (6%) | 16 (16%) | — |
| 배치고사 켬 | 18 (7%) | 12 (12%) | 끔 |
| 잠금 핀 정함 | 13 (5%) | 12 (12%) | 없음 |
| 휴면 감점 켬 | 10 (4%) | 9 (9%) | 끔 |
| 휴면 감점 실제 적용 | 1 리그(2건) | | |
| 레드카드 실제 사용 | 5 리그(7건) | | |
| 등급(레벨) 미리 정하기 모드 | 8 (3%) | 2 | 자유 |
| 경기 기록 "누구나" 허용 | 2 (1%) | 2 | 관리자만 |

- 학생 성별 미지정: 5,860명 중 2,536명(43%).

해석: **아무도 안 건드리는 설정** = 기록 권한, 등급 모드, 휴면 감점(켜도 실제 적용 1곳), 레드카드, 정밀 성향. **많이 바꾸는 설정** = 리그 성향 선택(35%가 표준 외 선택), 활동 리그의 RP 세부(최대 34%), 시즌 이름, 성별.

**시사점**: 개설 때 성향 한 번 고르기는 잘 먹힌다. 반면 휴면 감점·레벨 모드·기록 권한 같은 설정은 화면 자리만 차지한다 → 접어 두거나 "고급"으로 내려도 되는 후보.

---

## 4. 기능별 사용 흔적

| 기능 | 쓴 리그 | 활동 리그(97) 중 | 비고 |
|---|---:|---:|---|
| 대기열(줄 세우기) | 90 | — | 최근 14일 경기 있는 64개 중 30개가 대기열 씀. 09-28 이후 경기의 약 36%(3,649/10,170)가 대기열을 거쳐 들어옴 |
| 대기열 운영 방식 바꿈 | 17 수업설정 | | 모두 동시에 12 · 줄서기 명시 5 · 기본(빈값) 119 |
| 코트 수 정함 | 19 수업설정 | | 1:1 · 2:5 · 3:6 · 4:6 · 6:1 |
| 한 바퀴 자동 | 켬 1 · 껐음 9 | | 사실상 안 씀 |
| 남녀 따로 대진 | 14 수업설정 | | 섞기 122 |
| 학생 점수 입력판(QR) 열어 봄 | 14 | | 실제 학생 입력 7리그 334경기(전체 2%) |
| 공동 관리자 초대 | 8 (3%) | 8 (8%) | 공동 관리자 7 · 공동 방장 1 |
| 학생/회원 계정 연결 | 5 리그(44명) | 4 | |
| 칭호 장착 | 2 리그(13명) | | |
| 같이 안 붙이기 | 0 | | 만든 지 얼마 안 됨 |
| 알림 구독(푸시) | 0 | | |
| 남아 있는 대기열 줄(하루 넘게 '대기') | 329줄 / 44리그 | | 끝난 수업의 줄이 안 비워짐 |
| 공개 순위표 · 하이라이트 | 측정 불가 | | DB에 열람 기록이 없음(화면에서 계산·무인증 조회) |

해석: **대기열은 핵심 기능으로 자리 잡았다**(최근 활동 리그의 절반, 경기의 3분의 1). QR 학생 입력·공동 관리자·푸시·칭호는 거의 안 쓴다. 대기열에 하루 넘은 '대기' 줄이 44개 리그에 남아 있다 → 다음 수업 때 옛 줄이 보이는지 확인할 거리.

**시사점**: 다듬을 곳은 대기열(수업 끝 정리 포함). 학생 입력·공동 관리자는 "있는지 몰라서"인지 "필요 없어서"인지 데이터로는 못 가른다 → 현장 질문 1개로 확인.

---

## 5. 입력 실수 흔적

| 지표 | 값 | 해석 |
|---|---:|---|
| 같은 선수·같은 결과·같은 점수가 3초 안에 다시 | 0 | 버튼 두 번 눌림은 막혀 있음 |
| 같은 경기가 3~10초 안에 다시 | 77경기 / 13리그 (0.5%) | **중복 입력 유력** |
| 같은 경기가 10~30초 안에 다시 | 102경기 / 18리그 | 승패만(1-0) 리그는 실제 재경기일 수도 |
| 같은 경기가 30~90초 안에 다시 | 202경기 / 28리그 | 대부분 실제 재경기로 봄 |
| 승패 뒤집힌 같은 대진이 5분 안에(상한) | 550경기 / 45리그 | 복수전과 "거꾸로 넣어 다시 넣음"이 섞임 — 구분 불가 |
| 한 경기에 같은 선수가 양쪽 | 0 | |
| 진 쪽 점수가 더 높거나 같음 | 0 | |
| 경기 수정(10-03 이후, 상한) | 21경기 / 10리그 (0.3%) | 수정 기능은 거의 안 씀 |
| 경기 삭제 | 측정 불가 | 삭제는 행을 지우고 기록이 안 남음 |
| 지운 학생 | 547명 / 36리그 (전체의 9%) | 명단 다시 넣기·정리가 흔함 |
| 첫 경기 1시간 뒤 학생 추가 | 291명 / 14리그 | 수업 중 명단 보충 |
| 활동 리그에서 0경기 학생 | 437 / 3,497명 (12.5%) | 결석·전학 또는 대진에서 빠짐 |
| 같은 리그 같은 이름 둘 이상 | 8리그 | 학년 리그의 동명이인일 수 있음 |

- 리그 자체를 지운 것: 18개(그중 학생 넣은 것 11, 경기 있던 것 5).

해석: 큰 실수 흔적은 적다. **확실한 중복 입력은 0.5% 수준**, 수정은 0.3%. 다만 삭제는 기록이 안 남아 "잘못 넣고 지운" 빈도는 모른다. 학생 지우기 9%는 명단 넣기 단계의 시행착오로 보인다.

**시사점**: 입력 정확도는 괜찮다. 10초 안 같은 경기 재입력에 "방금 같은 경기 넣었어요" 한 줄 확인을 붙이면 남은 중복을 잡는다. 삭제 빈도를 알고 싶으면 삭제 기록(누가·언제)만 남기는 칸이 필요.

---

## 데이터로 본 우선 개선 후보 5개

1. **명단 넣은 뒤 첫 경기까지 끌어 주기** — 명단 있는 리그의 37%(78개), 선생님 기준 42%가 첫 경기 전에 멈춤. 이 선생님들의 다른 리그도 전부 0경기. 명단 저장 직후 "연습 경기 1개 넣어 보기"나 다음 수업 대진표 바로 만들기로 첫 경기를 그 자리에서 만들게.
2. **리그 만든 직후 명단 넣기 쉽게** — 24%(66개)는 학생을 한 명도 안 넣음. 넣는 사람은 바로(중앙값 0시간) 넣으므로, 붙여넣기·반 번호로 한 번에 넣기를 개설 흐름 안에 둔다.
3. **수업 중 연속 입력 속도** — 한 수업 18경기, 28초 간격, 31%는 승패만. 경기 입력 단계 줄이기, 승패만 넣는 길을 기본에 가깝게.
4. **대기열 다듬기와 수업 끝 정리** — 최근 활동 리그의 절반이 쓰고 경기의 36%가 대기열을 거침. 하루 넘은 '대기' 줄이 44리그 329줄 남아 있음 → 다음 날 자동 비우기 또는 "어제 줄 지울까요?".
5. **안 쓰는 설정 접기** — 휴면 감점(실제 적용 1곳), 레벨 모드, 기록 권한, 한 바퀴 자동, 푸시는 거의 0. "고급"으로 내리면 관리자 화면이 가벼워진다(관리자 손 최소 원칙). 대신 많이 쓰는 성향 고르기·시즌 이름·성별은 앞에.

### 데이터로 못 본 것 (현장 확인 필요)
- 공개 순위표·하이라이트 열람(DB에 흔적 없음), 경기 삭제 빈도(기록 안 남음), QR 학생 입력·공동 관리자를 안 쓰는 이유.

---

## 부록 A — 실행 도구(scratchpad/q.mjs)

```js
// 읽기 전용 조회 (scripts/db-query.mjs 복사본 + 읽기 전용 트랜잭션 강제). pg는 OneDrive 사본 node_modules에서.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/bau85/OneDrive - 한울초등학교 (1)/code/club-league/package.json");
const pg = require("pg");
const env = Object.fromEntries(readFileSync("C:/code/club-league/.env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const url = env.READONLY_DATABASE_URL; if(!url){console.error("no READONLY_DATABASE_URL");process.exit(1);}
const arg = process.argv[2] ?? "select now()";
const sql = existsSync(arg) ? readFileSync(arg,"utf8") : arg;
const c = new pg.Client({connectionString:url, ssl:{rejectUnauthorized:false}});
await c.connect();
try { await c.query("begin read only"); const r = await c.query(sql); const rows = Array.isArray(r)? r.at(-1).rows : r.rows; console.log(JSON.stringify(rows)); await c.query("rollback"); }
finally { await c.end(); }
```

## 부록 B — 쓴 SQL

### [1-1] 리그 깔때기 (q1.sql)
```sql
with l as (select id, league_type, owner_uid, created_at, created_at >= '2026-09-14 05:00' as post_launch from leagues where is_deleted is not true),
s as (select l.*,
  (select count(*) from players p where p.league_id=l.id and p.is_deleted is not true) np,
  (select count(*) from matches m where m.league_id=l.id) nm,
  (select max(created_at) from matches m where m.league_id=l.id) lastm
 from l)
select coalesce(league_type,'ALL') t, coalesce(post_launch::text,'all') pl, count(*) leagues,
 count(*) filter (where np>=1) has_players,
 count(*) filter (where nm>=1) m1,
 count(*) filter (where nm>=10) m10,
 count(*) filter (where nm>=50) m50,
 count(*) filter (where lastm >= now()-interval '14 days') active14,
 count(*) filter (where lastm >= now()-interval '7 days') active7,
 count(*) filter (where created_at <= now()-interval '14 days') older14,
 count(*) filter (where created_at <= now()-interval '14 days' and lastm >= now()-interval '7 days') older14_active7
from s group by grouping sets ((league_type,post_launch),(league_type),(post_launch),()) order by 1,2
```

### [1-2·1-3] 선생님 깔때기·걸린 시간 (q2.sql)
```sql
with l as (select id, owner_uid, created_at from leagues where is_deleted is not true),
s as (select l.*,
  (select count(*) from players p where p.league_id=l.id and p.is_deleted is not true) np,
  (select count(*) from matches m where m.league_id=l.id) nm,
  (select max(created_at) from matches m where m.league_id=l.id) lastm,
  (select min(created_at) from players p where p.league_id=l.id) firstp,
  (select min(created_at) from matches m where m.league_id=l.id) firstm
 from l),
o as (select owner_uid, count(*) nl, max(np) np, sum(nm) nm, max(lastm) lastm, min(created_at) c0 from s group by owner_uid)
select 'owners' k, count(*) total, count(*) filter (where np>=1) p1, count(*) filter (where nm>=1) m1, count(*) filter (where nm>=10) m10,
 count(*) filter (where lastm>=now()-interval '14 days') a14, count(*) filter (where nl>1) multi_league, max(nl) max_leagues_one_owner,
 percentile_cont(0.5) within group (order by nl) med_leagues
from o
union all
select 'first_player_delay_hours_median', count(*), percentile_cont(0.5) within group (order by extract(epoch from firstp-created_at)/3600)::int, percentile_cont(0.9) within group (order by extract(epoch from firstp-created_at)/3600)::int,null,null,null,null,null from s where firstp is not null
union all
select 'first_match_after_player_hours_median', count(*), percentile_cont(0.5) within group (order by extract(epoch from firstm-firstp)/3600)::int, percentile_cont(0.9) within group (order by extract(epoch from firstm-firstp)/3600)::int,null,null,null,null,null from s where firstm is not null
```

### [2-1·2-2] 명단·경기 수 분포 (q3.sql)
```sql
with l as (select id, league_type from leagues where is_deleted is not true),
s as (select l.*, (select count(*) from players p where p.league_id=l.id and p.is_deleted is not true) np,
  (select count(*) from matches m where m.league_id=l.id) nm from l)
select 'roster' what, case when np=0 then 'a 0' when np<=10 then 'b 1-10' when np<=20 then 'c 11-20' when np<=30 then 'd 21-30' when np<=60 then 'e 31-60' when np<=150 then 'f 61-150' else 'g 151+' end bucket, count(*) n,
  count(*) filter (where nm=0) zero_match from s group by 2
union all
select 'matches', case when nm=0 then 'a 0' when nm<=9 then 'b 1-9' when nm<=49 then 'c 10-49' when nm<=99 then 'd 50-99' when nm<=299 then 'e 100-299' else 'f 300+' end, count(*), null from s group by 2
order by 1,2
```

### [2-3] 수업 단위 (q4.sql)
```sql
with d as (select m.league_id, (m.created_at at time zone 'Asia/Seoul')::date d0, count(*) n,
   extract(epoch from max(m.created_at)-min(m.created_at))/60 span_min,
   count(*) filter (where winner2_id is not null) dbl,
   count(*) filter (where winner_score is not null) scored,
   count(*) filter (where input_source='student') stu
  from matches m join leagues l on l.id=m.league_id and l.is_deleted is not true
  where m.created_at >= '2026-09-14' group by 1,2)
select count(*) class_days, count(distinct league_id) leagues,
 percentile_cont(array[0.25,0.5,0.75,0.9]) within group (order by n) per_day_q,
 percentile_cont(0.5) within group (order by span_min)::int span_med_min,
 round(avg(n),1) avg_per_day,
 round(100.0*sum(dbl)/sum(n),1) dbl_pct, round(100.0*sum(scored)/sum(n),1) scored_pct, round(100.0*sum(stu)/sum(n),1) student_input_pct,
 count(*) filter (where n=1) one_match_days
from d
```

### [3-2] 설정별 최빈값과 다른 리그 (q5.sql)
```sql
with l as (select id, settings s, (select count(*) from matches m where m.league_id=leagues.id) nm from leagues where is_deleted is not true),
k as (select k from (values ('tierThresholds'),('rpVariables'),('tierSettings'),('dynamicBonuses'),('dynamicPenalties'),('matchInputMode'),('levelMode'),('levels'),('genderEnabled'),('season'),('placement'),('lockPin'),('decayEnabled'),('sport'),('tiers'),('activeBonuses')) v(k)),
modes as (select k.k, (select s->k.k from l where s ? k.k group by s->k.k order by count(*) desc limit 1) mode from k)
select m.k,
  count(*) filter (where l.s ? m.k) has_key,
  count(*) filter (where l.s->m.k = m.mode) eq_mode,
  count(*) filter (where l.s ? m.k and l.s->m.k is distinct from m.mode) diff_mode,
  count(*) filter (where l.nm>=10 and l.s ? m.k and l.s->m.k is distinct from m.mode) diff_mode_active,
  count(*) filter (where l.nm>=10) active,
  left(m.mode::text,70) mode
from modes m cross join l group by m.k, m.mode order by 1
```

### [3-1] 리그 성향 판별과 만든 뒤 변경 (q6.sql)
```sql
with l as (select id, settings s, (select count(*) from matches m where m.league_id=leagues.id) nm,
 case
  when settings->'tierThresholds' @> '{"Silver":870,"Gold":1120,"Platinum":1400,"Diamond":1720}' and settings->'rpVariables' = '{"winDelta":11,"loseDelta":27}' then 'standard'
  when settings->'tierThresholds' @> '{"Silver":900,"Gold":1050,"Platinum":1200,"Diamond":1380}' and settings->'rpVariables' = '{"winDelta":12,"loseDelta":28}' then 'casual'
  when settings->'tierThresholds' @> '{"Silver":900,"Gold":1050,"Platinum":1200,"Diamond":1380}' and settings->'rpVariables' = '{"winDelta":20,"loseDelta":46}' then 'shortevent'
  when settings->'tierThresholds' @> '{"Silver":820,"Gold":1080,"Platinum":1450,"Diamond":1900}' and settings->'rpVariables' = '{"winDelta":10,"loseDelta":34}' then 'precise'
  else 'custom' end b
 from leagues where is_deleted is not true),
g as (select b, (select s->'dynamicBonuses' from l l2 where l2.b=l.b group by 1 order by count(*) desc limit 1) mb,
               (select s->'dynamicPenalties' from l l2 where l2.b=l.b group by 1 order by count(*) desc limit 1) mp,
               (select s->'tierSettings' from l l2 where l2.b=l.b group by 1 order by count(*) desc limit 1) mt from l group by b)
select l.b, count(*) n, count(*) filter (where nm>=10) active,
 count(*) filter (where s->'dynamicBonuses' is distinct from g.mb) bonus_diff,
 count(*) filter (where s->'dynamicPenalties' is distinct from g.mp) pen_diff,
 count(*) filter (where s->'tierSettings' is distinct from g.mt) tier_diff,
 count(*) filter (where s->'dynamicBonuses' is distinct from g.mb or s->'dynamicPenalties' is distinct from g.mp or s->'tierSettings' is distinct from g.mt) any_diff,
 count(*) filter (where nm>=10 and (s->'dynamicBonuses' is distinct from g.mb or s->'dynamicPenalties' is distinct from g.mp or s->'tierSettings' is distinct from g.mt)) any_diff_active
from l join g using (b) group by l.b order by n desc
```

### [3-2·4] 기능·설정 사용 수 (q7.sql)
```sql
with l as (select l.*, (select count(*) from matches m where m.league_id=l.id) nm from leagues l where is_deleted is not true)
select 'leagues' k, count(*)::text v1, count(*) filter (where nm>=10)::text v2 from l
union all select 'co_owner(공동관리자)', count(*) filter (where cardinality(co_owner_uids)>0)::text, count(*) filter (where nm>=10 and cardinality(co_owner_uids)>0)::text from l
union all select 'admin_uids>0', count(*) filter (where cardinality(admin_uids)>0)::text, count(*) filter (where nm>=10 and cardinality(admin_uids)>0)::text from l
union all select 'member_uids>0(학생/회원 계정)', count(*) filter (where cardinality(member_uids)>0)::text, count(*) filter (where nm>=10 and cardinality(member_uids)>0)::text from l
union all select 'join_code set', count(*) filter (where join_code is not null)::text, count(*) filter (where nm>=10 and join_code is not null)::text from l
union all select 'lockPin set', count(*) filter (where settings ? 'lockPin')::text, count(*) filter (where nm>=10 and settings ? 'lockPin')::text from l
union all select 'matchInputMode=free', count(*) filter (where settings->>'matchInputMode'='free')::text, count(*) filter (where nm>=10 and settings->>'matchInputMode'='free')::text from l
union all select 'genderEnabled=true', count(*) filter (where settings->>'genderEnabled'='true')::text, count(*) filter (where nm>=10 and settings->>'genderEnabled'='true')::text from l
union all select 'placement enabled', count(*) filter (where settings->'placement'->>'enabled'='true')::text, count(*) filter (where nm>=10 and settings->'placement'->>'enabled'='true')::text from l
union all select 'levelMode=preset', count(*) filter (where settings->>'levelMode'='preset')::text, count(*) filter (where nm>=10 and settings->>'levelMode'='preset')::text from l
union all select 'decayEnabled', count(*) filter (where settings->>'decayEnabled'='true')::text, count(*) filter (where nm>=10 and settings->>'decayEnabled'='true')::text from l
union all select 'season != 시즌 1', count(*) filter (where settings->>'season' <> '시즌 1')::text, count(*) filter (where nm>=10 and settings->>'season' <> '시즌 1')::text from l
union all select 'sport 빈칸', count(*) filter (where coalesce(settings->>'sport','')='')::text, count(*) filter (where nm>=10 and coalesce(settings->>'sport','')='')::text from l
union all select 'season archived(season_standings)', count(distinct league_id)::text, count(distinct league_id) filter (where league_id in (select id from l where nm>=10))::text from season_standings where league_id in (select id from l)
union all select 'decay_log decay leagues/rows', count(distinct league_id) filter (where kind='decay')::text, count(*) filter (where kind='decay')::text from decay_log
union all select 'redcard leagues/rows', count(distinct league_id) filter (where kind='redcard')::text, count(*) filter (where kind='redcard')::text from decay_log
union all select 'player_apart leagues/pairs', count(distinct league_id)::text, count(*)::text from player_apart
union all select 'push_sub leagues/rows', count(distinct league_id)::text, count(*)::text from push_subscriptions
union all select 'equipped_title players/leagues', count(*) filter (where equipped_title is not null)::text, count(distinct league_id) filter (where equipped_title is not null)::text from players where is_deleted is not true
union all select 'players with user_id / leagues', count(*) filter (where user_id is not null)::text, count(distinct league_id) filter (where user_id is not null)::text from players where is_deleted is not true
union all select 'players gender U / total', count(*) filter (where gender='U')::text, count(*)::text from players where is_deleted is not true
union all select 'players grade/class set', count(*) filter (where grade is not null or class_num is not null)::text, count(*) filter (where student_no is not null)::text from players where is_deleted is not true
```

### [4] 수업 설정·대기열·QR 입력 (q8.sql)
```sql
with l as (select id from leagues where is_deleted is not true),
a as (select * from assignment_sessions where league_id in (select id from l))
select 'sessions rows / leagues' k, count(*)::text a, count(distinct league_id)::text b from a
union all select 'match_type', string_agg(distinct match_type, ','), (select json_object_agg(match_type,c)::text from (select match_type,count(*) c from a group by 1) t) from a
union all select 'gender_mode', '', (select json_object_agg(coalesce(gender_mode,'null'),c)::text from (select gender_mode,count(*) c from a group by 1) t)
union all select 'queue_mode', '', (select json_object_agg(coalesce(queue_mode,'null'),c)::text from (select queue_mode,count(*) c from a group by 1) t)
union all select 'court_count', '', (select json_object_agg(coalesce(court_count::text,'null'),c)::text from (select court_count,count(*) c from a group by 1) t)
union all select 'auto_round', '', (select json_object_agg(coalesce(auto_round::text,'null'),c)::text from (select auto_round,count(*) c from a group by 1) t)
union all select 'input_key ever (input_key_day not null)', count(*) filter (where input_key_day is not null)::text, count(distinct league_id) filter (where input_key_day is not null)::text from a
union all select 'sessions updated last 14d', count(*) filter (where updated_at>=now()-interval '14 days')::text, '' from a
union all select 'scheduled_matches rows / leagues', count(*)::text, count(distinct league_id)::text from scheduled_matches where league_id in (select id from l)
union all select 'sched status', '', (select json_object_agg(status,c)::text from (select status,count(*) c from scheduled_matches group by 1) t)
union all select 'sched with session_id / leagues', count(*) filter (where session_id is not null)::text, count(distinct league_id) filter (where session_id is not null)::text from scheduled_matches
union all select 'sched → result_match linked', count(*) filter (where result_match_id is not null)::text, count(distinct league_id) filter (where result_match_id is not null)::text from scheduled_matches
union all select 'matches since 10-02 total / via queue', (select count(*) from matches where created_at>='2026-10-02')::text, (select count(*) from scheduled_matches s join matches m on m.id=s.result_match_id where m.created_at>='2026-10-02')::text
union all select 'student input matches / leagues', count(*)::text, count(distinct league_id)::text from matches where input_source='student'
union all select 'leagues w/ matches since 10-02 / with queue use', (select count(distinct league_id) from matches where created_at>='2026-10-02')::text, (select count(distinct league_id) from scheduled_matches where created_at>='2026-10-02')::text
```

### [5] 중복·뒤집힘·이상 점수·수정 (q9.sql)
```sql
with m as (select m.*, least(winner_id,loser_id)::text||coalesce(least(winner2_id,loser2_id)::text,'') k1 from matches m join leagues l on l.id=m.league_id and l.is_deleted is not true),
dup as (select a.id from m a join m b on a.league_id=b.league_id and a.id<>b.id and a.created_at>b.created_at and a.created_at-b.created_at < interval '90 seconds'
   and a.winner_id=b.winner_id and a.loser_id=b.loser_id and a.winner2_id is not distinct from b.winner2_id and a.loser2_id is not distinct from b.loser2_id
   and a.winner_score is not distinct from b.winner_score and a.loser_score is not distinct from b.loser_score),
swap as (select a.id from m a join m b on a.league_id=b.league_id and a.created_at>b.created_at and a.created_at-b.created_at < interval '5 minutes'
   and a.winner_id=b.loser_id and a.loser_id=b.winner_id and a.winner2_id is not distinct from b.loser2_id and a.loser2_id is not distinct from b.winner2_id)
select 'total matches' k, (select count(*) from m)::text v, ''::text w
union all select 'exact dup within 90s (rows/leagues)', (select count(distinct id) from dup)::text, (select count(distinct league_id) from m where id in (select id from dup))::text
union all select 'reverse-result within 5min (rows/leagues)', (select count(distinct id) from swap)::text, (select count(distinct league_id) from m where id in (select id from swap))::text
union all select 'same player both sides', (select count(*) from m where winner_id in (loser_id, loser2_id) or winner2_id in (loser_id,loser2_id))::text, ''
union all select 'score tie or winner<loser', (select count(*) from m where winner_score<=loser_score and not (winner_score=0 and loser_score=0))::text, (select count(*) from m where winner_score=0 and loser_score=0)::text
union all select 'rp_breakdown null since 10-03 (edited or not)', (select count(*) from m where created_at>='2026-10-03' and rp_breakdown is null)::text, (select count(*) from m where created_at>='2026-10-03')::text
```

### [5] 같은 경기 재입력 간격 (q10.sql)
```sql
with m as (select m.*, extract(epoch from m.created_at - lag(m.created_at) over (partition by m.league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score order by m.created_at)) gap_same,
  extract(epoch from m.created_at - lag(m.created_at) over (partition by m.league_id order by m.created_at)) gap_any
  from matches m join leagues l on l.id=m.league_id and l.is_deleted is not true)
select case when gap_same<3 then 'a <3s' when gap_same<10 then 'b 3-10s' when gap_same<30 then 'c 10-30s' when gap_same<90 then 'd 30-90s' else 'e none' end g, count(*) n, count(distinct league_id) leagues,
 count(*) filter (where winner_score>1 or loser_score>0) real_score, count(*) filter (where input_source='student') student,
 count(*) filter (where gap_any<3) any_lt3
from m group by 1 order by 1
```

### [5] 수정·삭제·명단 실수 흔적 (q11.sql)
```sql
with l as (select id from leagues where is_deleted is not true)
select 'rp_breakdown null since 10-03 by source' k, (select json_object_agg(coalesce(input_source,'teacher'), c)::text from (select input_source, count(*) c from matches where created_at>='2026-10-03' and rp_breakdown is null group by 1) t) v, ''::text w
union all select 'leagues with null-breakdown since 10-03', (select count(distinct league_id) from matches where created_at>='2026-10-03' and rp_breakdown is null)::text, ''
union all select 'queue done w/ result id but match missing (=deleted after queue)', (select count(*) from scheduled_matches s where result_match_id is not null and not exists (select 1 from matches m where m.id=s.result_match_id))::text, (select count(*) from scheduled_matches where result_match_id is not null)::text
union all select 'queue waiting older than 1 day / leagues', (select count(*) from scheduled_matches where status='waiting' and created_at<now()-interval '1 day')::text, (select count(distinct league_id) from scheduled_matches where status='waiting' and created_at<now()-interval '1 day')::text
union all select 'players deleted / total', (select count(*) from players where is_deleted and league_id in (select id from l))::text, (select count(*) from players where league_id in (select id from l))::text
union all select 'leagues w/ deleted players', (select count(distinct league_id) from players where is_deleted and league_id in (select id from l))::text, ''
union all select 'leagues w/ dup active names / dup groups', (select count(distinct league_id) from (select league_id, name from players where is_deleted is not true and league_id in (select id from l) group by 1,2 having count(*)>1) t)::text, (select count(*) from (select league_id, name from players where is_deleted is not true and league_id in (select id from l) group by 1,2 having count(*)>1) t)::text
union all select 'players added after league first match (leagues)', (select count(*) from players p where is_deleted is not true and created_at > (select min(created_at)+interval '1 hour' from matches m where m.league_id=p.league_id))::text, (select count(distinct league_id) from players p where is_deleted is not true and created_at > (select min(created_at)+interval '1 hour' from matches m where m.league_id=p.league_id))::text
union all select 'players with 0 games in active leagues', (select count(*) filter (where win_count+lose_count=0) from players p where is_deleted is not true and (select count(*) from matches m where m.league_id=p.league_id)>=10)::text, (select count(*) from players p where is_deleted is not true and (select count(*) from matches m where m.league_id=p.league_id)>=10)::text
union all select 'deleted leagues: had players/matches', (select count(*) from leagues l2 where is_deleted and exists(select 1 from players p where p.league_id=l2.id))::text, (select count(*) from leagues l2 where is_deleted and exists(select 1 from matches m where m.league_id=l2.id))::text
```

### [1-2] 멈춘 리그의 주인이 다른 리그는 쓰나 (q12.sql)
```sql
with s as (select l.id, l.owner_uid, l.created_at, (select count(*) from players p where p.league_id=l.id and p.is_deleted is not true) np, (select count(*) from matches m where m.league_id=l.id) nm from leagues l where is_deleted is not true),
o as (select owner_uid, max(nm) best from s group by 1)
select case when np=0 then 'no_players' else 'players_no_match' end stage, count(*) n,
 count(*) filter (where o.best>0) owner_has_other_active, count(*) filter (where o.best=0) owner_stuck_everywhere,
 count(*) filter (where s.created_at >= now()-interval '14 days') created_last14
from s join o using(owner_uid) where nm=0 group by 1
```

### 짧은 조회들
```sql
-- [2-2] 사분위·집중도
with s as (select l.id,(select count(*) from players p where p.league_id=l.id and p.is_deleted is not true) np,(select count(*) from matches m where m.league_id=l.id) nm from leagues l where is_deleted is not true)
select percentile_cont(array[0.25,0.5,0.75,0.9]) within group (order by np) np_q_nonzero, (select percentile_cont(array[0.25,0.5,0.75,0.9]) within group (order by nm) from s where nm>0) nm_q, (select sum(nm) from s) total_matches, (select max(nm) from s) max_nm, (select round(100.0*max(nm)/sum(nm),1) from s) top1_share, (select round(100.0*sum(nm)/(select sum(nm) from s),1) from (select nm from s order by nm desc limit 10) t) top10_share from s where np>0;
-- [2-3] 리그가 쓰인 날 수
with d as (select m.league_id, count(distinct (m.created_at at time zone 'Asia/Seoul')::date) days, count(*) n from matches m join leagues l on l.id=m.league_id and l.is_deleted is not true group by 1) select case when days=1 then 'a 1' when days<=3 then 'b 2-3' when days<=7 then 'c 4-7' when days<=15 then 'd 8-15' else 'e 16+' end b, count(*) leagues, sum(n) matches from d group by 1 order by 1;
-- [2-3] 요일·시간대
select extract(isodow from created_at at time zone 'Asia/Seoul') dow, extract(hour from created_at at time zone 'Asia/Seoul') hr, count(*) from matches where created_at>='2026-09-14' group by 1,2 order by 3 desc limit 8;
-- [2-3] 연속 경기 간격
with g as (select a.id, extract(epoch from a.created_at - (select max(b.created_at) from matches b where b.league_id=a.league_id and b.created_at<a.created_at)) gap from matches a) select percentile_cont(array[0.1,0.25,0.5]) within group (order by gap) q, count(*) filter (where gap<3) lt3, count(*) filter (where gap<10) lt10 from g where gap is not null;
-- [2-3] 점수 분포
select winner_score||'-'||loser_score sc, count(*) from matches group by 1 order by 2 desc limit 8;
-- [3] 설정 키 목록
select k, jsonb_typeof(v) t, count(*) n, count(distinct v::text) nd from leagues l, jsonb_each(l.settings) e(k,v) where is_deleted is not true group by 1,2 order by n desc;
-- [3-1] 기준선 묶음
select settings->'tierThresholds'->>'Silver' sv, settings->'tierThresholds'->>'Gold' g, settings->'tierThresholds'->>'Platinum' p, settings->'tierThresholds'->>'Diamond' d, count(*) n from leagues where is_deleted is not true group by 1,2,3,4 order by n desc;
select settings->'rpVariables'::text rv, count(*) from leagues where is_deleted is not true group by 1 order by 2 desc;
-- [4] 대기열 비중·최근 14일
select (select count(*) from matches where created_at>='2026-09-28') matches_since0928, (select count(*) from scheduled_matches where status='done' and created_at>='2026-09-28') queue_done_since0928, (select count(distinct league_id) from matches where created_at>=now()-interval '14 days') lg14, (select count(distinct league_id) from scheduled_matches where created_at>=now()-interval '14 days') q_lg14;
-- [5] 대기열→경기 연결(주별) — 학생 입력만 연결됨을 확인, 삭제 추정 불가 판정에 씀
select date_trunc('week', created_at)::date wk, count(*) filter (where status='done') done, count(*) filter (where status='done' and result_match_id is not null) linked from scheduled_matches where created_at>='2026-09-28' group by 1 order by 1;
-- [1-4] 주별
select to_char(date_trunc('week', created_at at time zone 'Asia/Seoul'),'MM-DD') wk, count(*) new_leagues from leagues where is_deleted is not true and created_at>='2026-09-01' group by 1 order by 1;
select to_char(date_trunc('week', created_at at time zone 'Asia/Seoul'),'MM-DD') wk, count(*) matches, count(distinct league_id) leagues from matches where created_at>='2026-09-01' group by 1 order by 1;
```
