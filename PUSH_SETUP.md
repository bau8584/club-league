# 웹 푸시 알림 설정 (Supabase Edge Function 방식)

> Cloudflare 배포 파이프라인이 대시보드 비밀을 유지하지 못해, **발송을 Supabase Edge Function으로 이전**했습니다.
> Cloudflare에는 더 이상 아무 비밀도 설정할 필요가 없습니다. (기존에 넣은 CF 비밀은 지워도 됩니다.)

준비: 공개키는 이미 [src/lib/push-public-key.ts](src/lib/push-public-key.ts)에 넣어 두셨습니다(회원 구독용).

---

## 1. Edge Function 배포 — `send-push`
코드: [supabase/functions/send-push/index.ts](supabase/functions/send-push/index.ts)

**방법 A — Supabase 대시보드(CLI 불필요, 추천)**
1. Supabase 대시보드 → 좌측 **Edge Functions** → **Deploy a new function**(또는 Create function)
2. 이름: `send-push`
3. 에디터에 위 파일 내용을 **그대로 붙여넣기** → **Deploy**

**방법 B — CLI**
```bash
supabase functions deploy send-push
```

---

## 2. 함수 시크릿 3개 설정
Supabase 대시보드 → **Edge Functions → Secrets**(또는 Project Settings → Edge Functions → Secrets)에서 추가:

| 이름 | 값 |
|---|---|
| `VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys`의 Public Key |
| `VAPID_PRIVATE_KEY` | 같은 명령의 **Private Key** |
| `VAPID_SUBJECT` | `mailto:내이메일@example.com` |

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 **Supabase가 자동 주입**하므로 넣지 않아도 됩니다.
> `VAPID_PUBLIC_KEY`는 [push-public-key.ts](src/lib/push-public-key.ts)에 넣은 값과 **같은 값**이어야 합니다.

---

## 3. DB 마이그레이션 적용
Supabase SQL 편집기에서:
- [db/migrations/2026-07-04_push_subscriptions.sql](db/migrations/2026-07-04_push_subscriptions.sql)

---

## 동작 방식
- 회원이 헤더의 **🔔 토글**을 켜면 구독이 `push_subscriptions`에 저장.
- 운영진 **입장 호출** / 회원 **도전장** 시 앱이 `supabase.functions.invoke("send-push")` 호출 → Edge Function이 대상 회원 구독으로 실제 푸시 발송.

## 확인 / 문제 해결
- 함수가 배포됐는지: 대시보드 Edge Functions 목록에 `send-push`가 있는지.
- 설정 누락 진단: 함수가 503을 주면 응답 본문의 `have`에 어떤 시크릿이 빠졌는지 표시됩니다.
- 토글이 안 보임 → 공개키(push-public-key.ts) 배포 반영 여부, 아이폰은 **홈 화면에 추가** 여부.
- 알림이 안 옴 → 함수 배포 + 시크릿 3개 + 마이그레이션 + 브라우저 알림 권한 확인.

## ⚠️ 아이폰(Safari)
홈 화면에 **추가한 경우에만**(iOS 16.4+) 푸시가 옵니다. 사파리 탭만 열어둔 경우는 안 옵니다.
→ 아이폰 회원: 공유 → '홈 화면에 추가' → 그 아이콘으로 열기 → 🔔 켜기.

## (선택) 기존 Cloudflare 비밀 정리
이제 Cloudflare Worker에는 푸시 관련 비밀이 필요 없습니다. 대시보드 Variables and Secrets의
`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` 등은 지워도 됩니다(보안상 지우는 게 좋음).
