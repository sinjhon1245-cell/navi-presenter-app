// Firebase 웹 앱 설정 (1단계-1, 프로젝트 navi-presenter-fd289 · 웹 앱 navi-presenter-web)
// - 브라우저용 공개 값 네 개만 있어요. 비밀 키가 아니에요(서비스 계정 키 · OAuth 비밀값은 여기에도, 저장소 어디에도 넣지 않아요).
// - 누가 무엇을 읽고 쓸 수 있는지는 Firestore 보안 규칙(firestore.rules)이 정해요. 아래의 주소 확인은 보안 장치가 아니라
//   ‘어디에서 먼저 켤지’만 정해요(이 공개 값은 누구나 볼 수 있고, 다른 곳에서 써도 규칙이 똑같이 막아요).
// - 정식 사이트(navi-presenter.vercel.app)에서만 켜요(2026-11-15 1차 정식 활성화, docs/PRODUCTION-ACTIVATION.md). 이 PC(localhost) ·
//   GitHub 시험 · 미리보기 주소에서는 비어 있어서 앱은 이 기기 안에서만 동작해요(미리보기는 저마다 자기 브랜치 코드라 여기 적지 않아요).
// - pin: false = 구글 계정 로그인과 같은 계정 휴대폰 연결만. PIN 4자리 연결(익명 로그인)은 꺼요. 서버 규칙의 PIN 권한도
//   스위치(config/pin)가 없어 닫혀 있어요. PIN을 켤 때는 따로 승인받아 이 줄을 true로, 콘솔에서 config/pin { on: true }를 함께 만들어요.
//   되돌릴 때(Firebase 끄기)는 HOSTS를 비우는 커밋 하나예요. 계정에 저장된 수업 · 기록은 지워지지 않아요.
(function () {
  // - drive: true = PPTX를 Google Drive · Slides로 원래 모양 만들기(docs/PPTX-GOOGLE.md). 정식 주소에서 켰어요(2026-11-15: 시험 주소에서
  //   실제 Google로 확인, 운영 프로젝트의 Drive · Slides API 켬). 끌 때는 drive를 지우는 커밋 하나(교사 동의 전에는 어차피 아무것도 보내지 않아요).
  const HOSTS = { "navi-presenter.vercel.app": { pin: false, drive: true } };
  const FIREBASE = {
    app: {
      apiKey: "AIzaSyDTF-X9woV361jcvHiS68dbYtwkBfvIbUw",
      authDomain: "navi-presenter-fd289.firebaseapp.com",
      projectId: "navi-presenter-fd289",
      appId: "1:961192167598:web:495dec47ba1a027acf453f"
    }
  };
  const host = Object.prototype.hasOwnProperty.call(HOSTS, location.hostname) ? HOSTS[location.hostname] : null;
  window.NAVI_FIREBASE = window.NAVI_FIREBASE || (host ? Object.assign({}, FIREBASE, host) : null);
})();
