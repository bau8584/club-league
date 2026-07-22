// ─────────────────────────────────────────────────────────────
// VAPID 공개키(Public Key)
//
// 이 값은 브라우저에 전송되는 "공개" 키라 커밋해도 안전합니다.
// `npx web-push generate-vapid-keys` 로 만든 결과 중 **Public Key** 를
// 아래 따옴표 안에 그대로 붙여넣고 저장 → 커밋 → 배포하면 됩니다.
//
// (비밀 키 Private Key 는 여기 넣지 말고, Cloudflare Worker 시크릿에만 넣으세요.)
// 비워 두면 알림 토글이 표시되지 않습니다(안전).
// ─────────────────────────────────────────────────────────────
export const VAPID_PUBLIC_KEY: string = "BAJq_MU3UnXaYfrN8jetM20OaH0uObQtulfsc5pDZmZS5zGq0HI_6Uqb1d5cM5ISTgqQjE0KD163dTHz45xkD1g";
