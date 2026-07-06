# 웹 푸시 알림 설정 (경기 입장·도전장)

앱 코드는 모두 준비됐고, **아래 4가지만 설정**하면 웹 푸시가 동작합니다.
(설정 전에는 알림 토글이 아예 표시되지 않으니 안전합니다.)

---

## 1. VAPID 키 1쌍 생성
터미널에서:
```bash
npx web-push generate-vapid-keys
```
출력의 **Public Key / Private Key** 를 복사해 둡니다. (둘 다 URL-safe base64)

---

## 2. 공개키(Public Key) 붙여넣기 — 파일 한 줄만 수정
공개키는 비밀이 아니라 **파일에 넣고 커밋**하면 됩니다. (환경변수 설정 불필요)
[src/lib/push-public-key.ts](src/lib/push-public-key.ts) 를 열어 따옴표 안에 Public Key를 붙여넣고 저장:
```ts
export const VAPID_PUBLIC_KEY = "여기에_Public_Key_붙여넣기";
```
> 이 값이 있어야 회원 화면에 "🔔 경기 알림" 토글이 나타납니다. (비우면 토글 숨김)

---

## 3. Cloudflare Worker 시크릿 (발송 서버용)
`wrangler`로 설정(또는 Cloudflare 대시보드 → Worker → Settings → Variables → Secrets):
```bash
npx wrangler secret put SUPABASE_URL                 # 예: https://xxxx.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # Supabase → Project Settings → API → service_role 키
npx wrangler secret put VAPID_PUBLIC_KEY             # 1번 Public Key (2번과 동일 값)
npx wrangler secret put VAPID_PRIVATE_KEY            # 1번 Private Key
npx wrangler secret put VAPID_SUBJECT                # 예: mailto:you@example.com
```
> `SUPABASE_SERVICE_ROLE_KEY`는 **절대 클라이언트/깃에 넣지 마세요.** Worker 시크릿에만.

---

## 4. DB 마이그레이션 적용
Supabase SQL 편집기에서 실행:
- [db/migrations/2026-07-04_push_subscriptions.sql](db/migrations/2026-07-04_push_subscriptions.sql)

---

## 배포
```bash
npm run build
npx wrangler deploy      # (또는 기존 배포 파이프라인)
```

---

## 동작 방식
- 회원이 헤더의 **🔔 토글**을 켜면 브라우저 구독이 `push_subscriptions`에 저장됩니다.
- 운영진이 **"입장 호출"** 하거나 회원이 **도전장**을 보내면, 앱이 `/api/push`(Worker)에 요청 → 대상 회원의 구독으로 실제 푸시 발송.
- 앱을 꺼도 폰/PC에 알림이 뜹니다(단, 아래 iOS 제약).

## ⚠️ 아이폰(Safari) 제약
iOS는 **홈 화면에 앱을 추가(공유 → 홈 화면에 추가)한 경우에만** 웹 푸시가 옵니다(iOS 16.4+).
그냥 사파리 탭으로 열어둔 회원에게는 **푸시가 오지 않습니다.** (안드로이드·데스크톱 크롬/엣지는 정상)
→ 아이폰 회원에게는 "홈 화면에 추가 후 알림 켜기"를 안내하세요.

## 문제 해결
- 토글이 안 보임 → `VITE_VAPID_PUBLIC_KEY` 빌드 반영 여부 확인.
- 알림 안 옴 → Worker 시크릿(5개) 설정, 마이그레이션 적용, 브라우저 알림 권한 허용 확인.
- `/api/push`가 503 → Worker 시크릿 누락. 401 → 로그인 필요.
