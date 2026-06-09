교사가 비밀번호(인증코드)를 분실했을 때 이메일로 안전하게 자가 복구할 수 있는 **'이메일 자동 발송 시스템'**을 마스터 DB 서버(GAS) 연동 규격에 맞추어 완벽히 구현하였습니다.

수정한 프론트엔드 변경 사항은 원격 저장소(`main` 브랜치)에 빌드 통과 후 안전하게 푸쉬 완료되었습니다.

---

### 1. 구글 앱스 스크립트(GAS) 마스터 DB 업그레이드 코드
구글 스프레드시트의 **[확장 프로그램] ➔ [Apps Script]** 편집기를 열고, 기존 코드를 아래 코드로 **교체(덮어쓰기)한 후 새 배포(새 배포 버전 생성)**를 수행해 주세요.

> [!IMPORTANT]
> 본 코드는 교사 데이터 탭(`teachers` 시트)에 `email` 헤더가 없는 경우 최초 1회 가입 시 자동으로 해당 컬럼을 추가하며, 입력받은 이메일로 MailApp API를 통해 비밀번호를 HTML 형식으로 안전하게 발송합니다.

```javascript
// ==========================================
// Google Apps Script (GAS) 마스터 DB 통합 코드
// ==========================================

function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    
    // 시트 정보 연결 (기본적으로 "teachers" 시트 사용)
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName("teachers") || doc.getSheets()[0];
    
    if (action === "REGISTER") {
      return handleRegister(sheet, requestData);
    }
    
    if (action === "LOGIN") {
      return handleLogin(sheet, requestData);
    }
    
    if (action === "RECOVER_PASSWORD") {
      return handleRecoverPassword(sheet, requestData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "알 수 없는 작업(action)입니다."
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
    
<truncated 8154 bytes>
습니다.</p>" +
      "<p style='font-size: 12px; color: #e11d48; line-height: 1.5;'>※ 보안을 위해 타인에게 인증코드를 절대로 공유하지 마세요.</p>" +
      "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 15px 0;' />" +
      "<p style='font-size: 10px; color: #94a3b8; text-align: center;'>본 이메일은 초등 스포츠 리그 자가 메일 복구 시스템에서 발송된 자동 메일입니다.</p>" +
    "</div>";
    
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}
```

---

### 2. 프론트엔드 작업 완료 및 개선점
* **가입 시 이메일 필수 수집**: [LoginPanel.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/LoginPanel.tsx) 교사 가입 폼에 `이메일 주소` 필수 인풋 필드를 배치하여 신규 등록 시 이메일이 마스터 DB로 전송되도록 바인딩을 확장했습니다.
* **비밀번호 찾기 버튼 제공**: 교사 로그인 코드 아래에 `"비밀번호를 잊으셨나요?"` 링크 버튼을 배치했습니다.
* **비밀번호 찾기 자가 복구 팝업**: 링크를 클릭하면 학교명과 이메일을 기입하는 유리 모핑 오버레이 팝업 모달이 노출됩니다.
* **GAS 연동**: 모달에서 인증코드 찾기를 요청하면 [league-store.ts](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/lib/league-store.ts)의 `recoverPassword` API를 통해 구글 마스터 DB로 데이터를 쏘며, 성공 시와 실패 시 상황에 맞추어 `Toaster`가 명확한 알림 피드백을 전달합니다.

이제 구글 마스터 DB에 상기 Apps Script 코드를 얹으시고 새로 배포를 돌리시면 이메일 자동 복구 시스템이 완전하게 작동합니다. 상세 내역은 [walkthrough.md](file:///C:/Users/com/.gemini/antigravity/brain/7d94db8b-d21c-486a-a794-5adca450476d/walkthrough.md)에 안전하게 커밋되어 있습니다!