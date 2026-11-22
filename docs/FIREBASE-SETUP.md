# 실제 Firebase 프로젝트 만들기 — 콘솔에서 누를 곳 (1단계-1)

> **2026-11-03 진행 상황**: 1–3은 끝났어요. 프로젝트 ID는 **`navi-presenter-fd289`**(콘솔에서 약관 동의와 함께 만듦), Firestore 서울 · 보안 규칙 배포는 Firebase CLI · MCP로 했어요(`docs/STAGE1-1-REALTIME.md` 9-10). 4 구글 로그인 · 5 승인된 도메인 · 6 웹 앱 등록도 CLI · MCP로 끝냈어요(콘솔에서 누를 것 없음): 웹 앱 `navi-presenter-web`, 구글 로그인 켬(창 이름 ‘수업 내비’, 지원 이메일 교사 계정, 다른 로그인 방법은 꺼짐), 승인된 도메인 4개(`navi-presenter-fd289.firebaseapp.com` · `navi-presenter-fd289.web.app` · `navi-presenter.vercel.app` · PR #4 미리보기). 이 PC의 `localhost`는 목록에 없어요(필요할 때 따로 더해요). 아래는 콘솔로 할 때의 안내로 남겨 둬요.

> 교사가 직접 해요(교사 구글 계정 로그인이 필요해요). 무료 **Spark** 그대로, 결제 수단은 넣지 않아요. **‘업그레이드’ · ‘Blaze’는 누르지 않아요.**
> 메뉴 이름은 2026년 Firebase 콘솔 기준이에요. 화면이 한국어면 앞 이름, 영어면 괄호 안 이름이에요. 예전 화면이면 왼쪽 메뉴가 ‘빌드(Build)’ 하나로 묶여 있을 수 있어요.
> 다른 안내 화면(AI 도우미 등)이 끼어들면 기본값 그대로 ‘계속’을 눌러요.
> 끝나면 6단계에서 나온 값 4개만 채팅에 붙여 주세요. 나머지는 제가 해요.

## 1. 프로젝트 만들기

1. https://console.firebase.google.com 에 교사 구글 계정으로 들어가요(학교 Workspace 계정이 막히면 개인 Gmail).
2. **Firebase 프로젝트 만들기**(Create a Firebase project) 또는 **프로젝트 추가**(Add project).
3. 프로젝트 이름에 `navi-presenter`를 써요. 아래에 보이는 **프로젝트 ID**를 적어 두세요(이미 쓰는 이름이면 `navi-presenter-1a2b`처럼 바뀌어요).
4. 약관에 동의하고 **계속**.
5. **Google 애널리틱스**: ‘이 프로젝트에 Google 애널리틱스 사용 설정’을 **끄고** **프로젝트 만들기**.
6. ‘새 프로젝트가 준비되었습니다’ → **계속**.
7. 왼쪽 아래 요금제가 **Spark**인지 확인해요.

## 2. Firestore 만들기 (서울)

1. 왼쪽 메뉴 **데이터베이스 및 스토리지**(Databases & Storage) → **Firestore**.
2. **데이터베이스 만들기**(Create database).
3. 버전(edition)을 물으면 **Standard**. 데이터베이스 ID는 `(default)` 그대로.
4. 위치: **asia-northeast3 (Seoul)**. 한 번 정하면 바꿀 수 없어요.
5. 보안 규칙: **프로덕션 모드에서 시작**(Start in production mode). 처음엔 모두 막혀요.
6. **만들기**(Create).

## 3. 보안 규칙 넣기

1. Firestore 화면 위쪽 탭 **규칙**(Rules).
2. 편집기 안의 글을 모두 지우고, 저장소의 `firestore.rules` 전체를 붙여 넣어요.
   - GitHub에서: `feature/stage-1-realtime` 브랜치 → `firestore.rules` → **Raw** → 전체 복사.
3. **게시**(Publish).
4. 확인(선택): 같은 화면의 **규칙 플레이그라운드**(Rules Playground)
   - 시뮬레이션 유형 `get`, 위치 `teachers/abc/sessions/s1234`, ‘인증됨’ 끄기 → **실행** → **거부됨**(Denied)이면 맞아요.

## 4. 구글 로그인 켜기

1. 왼쪽 메뉴 **보안**(Security) → **Authentication** → **시작하기**(Get started).
2. 탭 **로그인 방법**(Sign-in method) → 제공업체 목록에서 **Google**.
3. **사용 설정**(Enable) 스위치를 켜요.
4. **프로젝트의 공개용 이름**(Public-facing name)에 `수업 내비`(구글 로그인 창에 보여요).
5. **프로젝트 지원 이메일**(Support email)에서 교사 이메일을 골라요.
6. **저장**(Save). 다른 로그인 방법(이메일, 익명 등)은 켜지 않아요.

## 5. 로그인할 수 있는 주소 더하기

1. Authentication 화면 위쪽 탭 **설정**(Settings) → 왼쪽 **승인된 도메인**(Authorized domains).
2. **도메인 추가**(Add domain)로 두 개를 더해요.
   - `navi-presenter.vercel.app` (Production. 나중을 위해 미리)
   - `navi-presenter-git-feature-stage-1-realtime-jin-jin2.vercel.app` (이 PR의 미리보기. 이번 시험용)
3. `localhost`와 `○○.firebaseapp.com`은 처음부터 있어요. 별표(`*`) 주소는 넣을 수 없어요.

## 6. 웹 앱 등록하고 값 4개 받기

1. 왼쪽 위 **프로젝트 개요**(Project Overview) 옆 **톱니바퀴** → **프로젝트 설정**(Project settings) → **일반**(General) 탭.
2. 아래 **내 앱**(Your apps) → 웹 아이콘 **`</>`**.
3. 앱 닉네임 `navi-presenter-web`. **‘이 앱의 Firebase 호스팅도 설정합니다’는 체크하지 않아요**(배포는 Vercel이 해요) → **앱 등록**(Register app).
4. 나오는 `const firebaseConfig = { … }`에서 **`apiKey` · `authDomain` · `projectId` · `appId`** 4개를 채팅에 붙여 주세요.
   - 이 값은 브라우저용 공개 값이라 저장소에 넣어도 돼요. 보호는 3번의 보안 규칙이 해요.
   - **서비스 계정 키**(‘새 비공개 키 생성’, JSON 파일)는 만들지도 보내지도 않아요.
5. **콘솔로 이동**.

## 7. 그다음 (제가 할 일 · 함께 할 일)

1. 값 4개를 `public/navi-config.js`에 넣어 이 PR 브랜치에 커밋 → Vercel 미리보기만 다시 만들어져요(Production 아님).
2. 미리보기 공유 링크(23시간)를 드려요. 교사 PC 크롬과 휴대폰으로 `docs/STAGE1-1-REALTIME.md` 5번의 ‘실제 기기 순서’ 1–8을 해요.
3. (시험이 끝난 뒤 권장) Google Cloud 콘솔 → **API 및 서비스** → **사용자 인증 정보** → ‘Browser key (auto created by Firebase)’ → 애플리케이션 제한 **HTTP 리퍼러**:
   `https://navi-presenter.vercel.app/*`, `https://navi-presenter-*-jin-jin2.vercel.app/*`, `https://<프로젝트 ID>.firebaseapp.com/*`(로그인 창이 써요), `http://localhost:3000/*`.
   다른 사이트가 이 공개 키를 가져다 쓰기 어렵게 해요. 잘못 넣으면 로그인이 막히니 시험이 끝난 뒤에 함께 해요.

## 하지 않는 것

- 요금제 바꾸기(Blaze), 결제 수단 넣기, Cloud Storage 켜기(1단계-2에서 따로 정해요)
- Firebase 호스팅, 서비스 계정 키, 다른 로그인 방법
- main 병합, Production 배포
