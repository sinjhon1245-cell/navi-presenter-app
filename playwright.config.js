// 화면 확인: 교탁 PC(1536×864, 1366×768), 태블릿(1024×768 가로 · 768×1024 세로), 휴대폰(390×844, 360×800) 크기에서 시험해요. `npm test`로 실행.
// TV·프로젝터(1024×768, 1280×720, 1280×800, 1920×1080)는 시험 안에서 학생 화면 창 크기를 바꿔 확인해요.
// BASE_URL을 주면 그 주소(예: 배포된 주소)를 시험하고, 없으면 내 컴퓨터에 서버를 띄워 시험해요.
// 로그인이 필요한 Vercel Preview는 STORAGE_STATE에 쿠키를 담은 파일을 함께 줘요(저장소에 올리지 않아요).
// firebase 묶음(보안 규칙 · 휴대폰 ↔ 교사 PC 실시간)은 Firebase 에뮬레이터 안에서 돌아요: npm run test:emu, 전부는 npm run test:all.
import { defineConfig } from "@playwright/test";
import os from "node:os";

const PORT = 3123;
// 동시에 돌리는 시험 수: CI는 Playwright 기본값(CPU의 절반, GitHub 서버 4코어 → 2개) 그대로.
// 내 컴퓨터는 최대 4개: 16코어 PC의 기본값 8개로 전체를 돌리면 화면 크기 시험 3개 + Firebase 시험 5개가 에뮬레이터 하나를 함께 써서,
// 휴대폰 ↔ PC 소식이 늦어 Firebase 시험 하나가 매번 다른 곳에서 시간 초과가 났어요(3번 중 3번). 4개로는 전부 통과하고 걸리는 시간도 같아요(docs/STAGE-SCREEN.md)
const WORKERS = process.env.CI ? undefined : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const FIREBASE = /(rules|realtime|roundtrip|connect|control|library|history|e2e|class-screen|gslides)\.spec\.js$/;

export default defineConfig({
  testDir: "tests",
  workers: WORKERS,
  // GitHub Actions(CI)에서는 실패 줄을 PR에 표시하고, 요약용 결과 파일(scripts/ci-summary.js가 읽어요)도 남겨요
  reporter: process.env.CI ? [["list"], ["github"], ["json", { outputFile: "playwright-report/results.json" }]] : "list",
  forbidOnly: !!process.env.CI,
  use: { baseURL: BASE_URL || "http://localhost:" + PORT, browserName: "chromium", storageState: process.env.STORAGE_STATE || undefined },
  projects: [
    { name: "pc-1536x864", testIgnore: FIREBASE, use: { viewport: { width: 1536, height: 864 } } },
    { name: "pc-1366x768", testIgnore: FIREBASE, use: { viewport: { width: 1366, height: 768 } } },
    { name: "tablet-1024x768", testIgnore: FIREBASE, use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: "tablet-768x1024", testIgnore: FIREBASE, use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "phone-390x844", testIgnore: FIREBASE, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: "phone-360x800", testIgnore: FIREBASE, use: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    // 교사 PC(1366×768)와 휴대폰(390×844)은 시험 안에서 따로 열어요
    { name: "firebase", testMatch: FIREBASE }
  ],
  webServer: BASE_URL ? undefined : {
    command: "node scripts/serve.js",
    url: "http://localhost:" + PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI
  }
});
