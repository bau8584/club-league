export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>페이지를 로드할 수 없습니다</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #121212; color: #e5e7eb; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid rgba(255,255,255,0.08); background: rgba(30,30,30,0.6); backdrop-filter: blur(16px); border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
      h1 { font-size: 1.5rem; margin: 0 0 0.5rem; font-weight: 800; color: #ffffff; }
      p { color: #9ca3af; margin: 0 0 1.5rem; font-size: 0.9rem; line-height: 1.5; }
      .actions { display: flex; flex-direction: column; gap: 0.5rem; }
      .btn-group { display: grid; grid-template-cols: 1fr 1fr; gap: 0.5rem; }
      a, button { padding: 0.6rem 1rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer; text-decoration: none; border: 1px solid transparent; font-size: 0.85rem; transition: all 0.2s; }
      .reset { background: linear-gradient(135deg, #00b4d8, #90e0ef); color: #000; border: none; width: 100%; margin-bottom: 0.5rem; }
      .reset:hover { opacity: 0.9; }
      .primary { background: rgba(255,255,255,0.08); color: #ffffff; border-color: rgba(255,255,255,0.1); }
      .primary:hover { background: rgba(255,255,255,0.15); }
      .secondary { background: transparent; color: #9ca3af; border-color: rgba(255,255,255,0.08); }
      .secondary:hover { color: #ffffff; background: rgba(255,255,255,0.05); }
    </style>
  </head>
  <body>
    <div class="card">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️</div>
      <h1>페이지를 로드할 수 없습니다</h1>
      <p>웹 어플리케이션 로딩 중 오류가 발생했습니다.<br>이전의 최고 권한(MASTER) 세션 캐시가 원인일 수 있으므로 세션 초기화를 추천합니다.</p>
      <div class="actions">
        <button class="reset" onclick="try { localStorage.removeItem('bdm.session.v1'); localStorage.removeItem('bdm.students.v2'); localStorage.removeItem('bdm.matches.v1'); } catch(e){} location.href='/';">🔑 로그인 세션 초기화 및 안전 로그아웃</button>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <button class="primary" onclick="location.reload()">🔄 다시 시도</button>
          <a class="secondary" href="/">🏠 홈으로</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
