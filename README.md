# 수업 내비 (navi-presenter)

초등 교사가 교탁 PC · TV(전자칠판) · 휴대폰 세 기기로 수업하는 프레젠터 겸 프롬프터예요.
교사가 올린 PDF · PPTX를 장면별로 정리하고, 수업 중에는 휴대폰에 그 장면의 핵심 발화 · 노트 · 수업 자료를 보여 주며, 수업이 끝나면 수업 기록을 남겨요.

- 정식 주소: https://navi-presenter.vercel.app
- 학생 정보는 저장하지 않아요. 신호등(다시 설명 · 더 확인 · 잘 이해)은 학급 전체에 대한 교사의 수업 관찰 기록이에요.

## 구조

| 경로 | 내용 |
| --- | --- |
| `public/` | 배포되는 앱(빌드 없음, 바닐라 JS). `index.html` 하나에 화면 전부, `claude-shim.js`는 Firebase 연결, `lessons.js`는 직접 만든 예시 수업 |
| `public/navi-config.js` | Firebase 웹 앱 설정. 브라우저용 공개 값이고 비밀 키가 아니에요(보호는 보안 규칙이 해요) |
| `firestore.rules` | Firestore 보안 규칙 |
| `tests/` | Playwright 시험(화면 크기 6가지 + Firebase 에뮬레이터 묶음), `tests/fixtures/`는 직접 만든 시험용 PDF · PPTX |
| `docs/` | 화면 · 기능 · 설계 문서(`SPEC.md`, `DESIGN-SYSTEM.md` 등) |
| `CLAUDE.md` | Claude Code로 작업할 때의 규칙과 지금 상태 |

## 내 컴퓨터에서 열기

Node.js 22 이상에서:

```
npm ci
npm run dev
```

http://localhost:3000 을 열어요. localhost에서는 Firebase가 꺼져 있어서 앱이 이 브라우저 안에서만 동작해요.

## 시험

```
npx playwright install chromium
npm test            # 화면 시험(Firebase 묶음은 건너뜀)
npm run test:emu    # Firebase 에뮬레이터 묶음(자바 21 필요, 가짜 프로젝트 demo-navi)
npm run test:all    # 전부
```

PR과 main에서는 GitHub Actions(`.github/workflows/test.yml`)가 같은 시험을 에뮬레이터 안에서 돌려요. 실제 Firebase 프로젝트 · 실제 계정에는 닿지 않고, 비밀 값을 쓰지 않아요.

## 배포

Vercel이 `public/`을 그대로 올려요(`vercel.json`). Firebase 보안 규칙은 앱과 따로, 규칙을 먼저 배포해요.

## 저작권

예시 수업과 시험 자료는 이 프로젝트에서 직접 만든 것이에요. 출판사 자료를 옮기지 않았어요.
