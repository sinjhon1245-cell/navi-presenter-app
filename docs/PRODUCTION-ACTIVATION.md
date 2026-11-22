# 정식 사이트 1차 Firebase 활성화 (2026-11-15)

정식 사이트(navi-presenter.vercel.app)에서 **구글 계정 로그인 · 교사별 수업 저장 · 수업 기록 저장**을 켜요. **PIN 4자리 연결은 끕니다**(`pin: false`).
같은 구글 계정으로 로그인한 휴대폰은 PIN 없이 그 계정의 지금 수업을 따라가요. 예전 PR #6(시범 교사 목록 정책)은 쓰지 않고 그대로 둬요.

## 바뀌는 것

| 무엇 | 전 | 후 |
| --- | --- | --- |
| `public/navi-config.js` | PR #4 · #5 미리보기 주소에서만 Firebase | **정식 주소에서만**, `pin: false`. 미리보기 · localhost · 그 밖은 비어 있어요 |
| 운영 Firestore 규칙 | 2026-11-04판(`d82d1828…`, 시범 교사 목록 `allowed`) | 자유 가입 규칙(PR #10–#14) + **PIN 스위치**(`config/pin`) |
| PIN 서버 권한 | 시범 목록의 교사만 | **꺼짐**: `config/pin { on: true }` 문서가 없으면 PIN 자리 열기 · 읽기, 휴대폰 요청, 휴대폰 허용이 모두 거절 |
| 익명 로그인 | PIN 휴대폰이 씀 | 앱이 쓰지 않아요(`pinJoin`이 `cfg.pin`이 false면 바로 돌아감) |

## 권한(새 규칙)

- 구글 계정 본인만 `teachers/{자기 UID}/…`(지금 수업 · 설정 · 진행 · 내 수업 `decks` · 기록 `records` · 표시 이름 `profile/me`)를 읽고 써요.
- 다른 교사 · 로그인 안 함 · 익명 · 같은 UID의 다른 로그인 방식은 모두 거절(에뮬레이터 `tests/rules.spec.js`, 시험 프로젝트 실서버 확인).
- PIN 경로(`pins/*` · `asks` · `devices`)는 스위치가 없으면 닫혀요. 휴대폰이 남의 수업을 읽는 길(`inRun`)도 기기 문서가 생기지 않아 닫혀요.
- `config/*`는 앱에서 누구도 읽거나 쓰지 못해요(관리자만 콘솔에서).
- 앞으로 PIN을 켤 때: 따로 승인받아 `navi-config.js`의 `pin: true` + 콘솔에서 `config/pin { on: true }`. 규칙은 다시 배포하지 않아요.

## 순서

1. 시험 프로젝트(`navi-presenter-test`)에 같은 규칙을 먼저 배포하고 실서버로 확인.
2. 에뮬레이터 시험 · CI 통과.
3. **운영 규칙 먼저** 배포(이때 정식 사이트는 아직 Firebase 꺼짐이라 영향 없음). 다시 읽어 지문 확인.
4. 앱(이 변경)을 main에 → Vercel이 Production을 배포 → 정식 주소의 `navi-config.js`가 운영 프로젝트 · `pin: false`인지 확인.

## 백업 · 되돌리기

- 바꾸기 전 운영 규칙: `tests/fixtures/deployed-2026-11-04.rules`(`d82d18285c724423`). 배포 직전에 운영에서 다시 읽어 같은지 확인해요.
- **앱 되돌리기(Firebase 끄기)**: Vercel Instant Rollback으로 전 Production(`a720d03`) 또는 이 병합 커밋을 `git revert -m 1`. 정식 사이트가 다시 이 브라우저 저장만 써요. 계정에 저장된 수업 · 기록은 지워지지 않고, 각 브라우저의 예전 데이터도 그대로예요.
- **규칙 되돌리기**: 사본을 다시 배포(`firebase deploy --only firestore:rules --project navi-presenter-fd289`, 파일을 사본으로 바꿔서) 또는 콘솔 규칙 기록에서 그 판을 게시. 데이터는 옮기거나 지우지 않아요.
- 되돌리는 순서: **앱 먼저(Firebase 끄기) → 그다음 규칙**. Firebase가 켜진 새 앱 아래에서 규칙만 옛것으로 되돌리면 내 수업 · 기록 저장이 거절돼요.

## 알고 있는 영향

- PR #5 미리보기(`…-git-feature-stage-1-ux-…`, 옛 앱)는 새 규칙에서 시범 목록을 못 읽어 PIN 연결이 꺼져요. 같은 구글 계정 연결은 그대로예요.
- 운영 Authentication의 익명 로그인 공급자는 켜진 채예요(앱 · 규칙 모두 쓰지 않음). 끄는 것은 운영 인증 설정 변경이라 따로 정해요.
- 무료(Spark) 한도: 읽기 5만 · 쓰기 2만/일. 넘으면 그날 저장이 거절되고 화면이 그대로 말해요(유료 전환 안 함).
