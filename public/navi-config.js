// ⚠ 시험 전용 브랜치(test/live-firebase)의 설정이에요. main · PR에 병합하지 않아요(2026-11-23, PR #5 실기기 시험).
// - 시험 Firebase 프로젝트 navi-presenter-test(운영 navi-presenter-fd289와 완전히 따로)의 브라우저용 공개 값 네 개만 있어요.
//   운영 프로젝트의 값은 이 브랜치에 넣지 않았어요. 비밀 키가 아니에요(누가 무엇을 읽고 쓰는지는 시험 프로젝트의 보안 규칙이 정해요).
// - 시험 주소(Vercel의 이 브랜치 고정 주소) 한 곳에서만 켜요. 그 밖의 주소(정식 사이트 · localhost · 다른 미리보기)에서는 비어 있어서
//   앱은 이 기기 안에서만 동작해요. 화면 오른쪽 위에 ‘시험 환경 · navi-presenter-test’가 보여요.
// - pin: false = 구글 계정 로그인과 같은 계정 휴대폰만. drive: false = PPTX → Google 변환은 끔(이번 시험과 상관없어요).
(function () {
  const TEST_PROJECT = "navi-presenter-test";
  const TEST_HOSTS = { "navi-presenter-git-test-live-firebase-jin-jin2.vercel.app": { pin: false, drive: false } };
  const TEST = {
    env: "test",
    app: {
      apiKey: "AIzaSyAr68TkgKoxtHI9xoQjGTsW8n5X-mJ26l0",
      authDomain: "navi-presenter-test.firebaseapp.com",
      projectId: TEST_PROJECT,
      appId: "1:365385133525:web:c36f7882ecddd510a9a15c"
    }
  };
  const host = Object.prototype.hasOwnProperty.call(TEST_HOSTS, location.hostname) ? TEST_HOSTS[location.hostname] : null;
  // 시험 프로젝트가 아니면 켜지 않아요(값을 잘못 바꿔도 운영에 붙지 않게)
  const mine = host && TEST.app.projectId === TEST_PROJECT && TEST.app.authDomain === TEST_PROJECT + ".firebaseapp.com" ? Object.assign({}, TEST, host) : null;
  window.NAVI_FIREBASE = window.NAVI_FIREBASE || mine;
  if (!mine || window.NAVI_FIREBASE !== mine) return;
  const tag = () => {
    if (document.getElementById("navi-env-tag")) return;
    const t = document.createElement("div");
    t.id = "navi-env-tag";
    t.setAttribute("aria-hidden", "true");
    t.textContent = "시험 환경 · " + TEST_PROJECT;
    t.style.cssText = "position:fixed;top:2px;right:2px;z-index:2147483647;pointer-events:none;font:600 10px/1.4 system-ui,sans-serif;" +
      "padding:1px 6px;border-radius:4px;background:#B45309;color:#fff;opacity:.85";
    document.body.appendChild(t);
  };
  if (document.body) tag(); else document.addEventListener("DOMContentLoaded", tag);
})();
