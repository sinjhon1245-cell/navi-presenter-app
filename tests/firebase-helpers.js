// Firebase 에뮬레이터 시험 공통 도우미 (1단계-1)
// 가짜 프로젝트 demo-navi와 에뮬레이터의 가짜 구글 계정만 써요. 실제 Firebase 프로젝트 · 실제 구글 계정과 상관없어요.
import { test, expect, chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { LABELS, watch, curLabel } from "./helpers.js";

export const EMU = process.env.FIRESTORE_EMULATOR_HOST, AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const ADMIN = { Authorization: "Bearer owner" };

// ---------- 시험끼리 PIN이 겹치지 않게 (2026-11-10) ----------
// PIN 자리(pins/{PIN})는 모든 교사가 함께 쓰는 곳이라, 동시에 도는 시험이 우연히 같은 PIN을 맡으면 서로의 결과가 바뀌어요.
// 그래서 시험 작업자(동시 실행 칸)마다 겹치지 않는 PIN 구간을 주고, 그 안에서도 기기(브라우저)마다 40개씩 따로 줘요(앱의 newPin이 에뮬레이터에서만 이 구간을 써요).
// 1000–2999 · 3000–4999 · 5000–6999 · 7000–8999 = 작업자 0–3(로컬은 동시 4개까지, CI는 1개). 9000–9999는 어떤 시험에도 주지 않아요(‘아무도 열지 않은 PIN’ 확인용)
const PIN_SLOT = 40, lane = (Number(process.env.TEST_PARALLEL_INDEX) || 0) % 4, laneFrom = 1000 + lane * 2000;
let slot = 0;
const nextPins = () => { const from = laneFrom + ((slot++ * PIN_SLOT) % 2000); return { from, to: from + PIN_SLOT }; };
export const unusedPin = () => String(9000 + Math.floor(Math.random() * 1000));
// 이 시험이 로그인한 교사들: 시험이 끝나면 그 교사들이 맡았던 PIN 자리를 지워요(같은 작업자의 다음 시험에 남지 않게)
const teachers = new Set();
// 에뮬레이터 없이 npm test로 돌리면 이 파일을 쓰는 시험은 '건너뜀'으로 나와요
// GitHub Actions(CI)는 늘 에뮬레이터 안에서 돌려서(npm run test:all), 에뮬레이터가 없으면 건너뛰지 않고 실패로 알려요
// 시험이 device()로 연 기기(브라우저 창)는 그 시험이 끝나면 닫아요. browser.newContext()로 연 창은 Playwright가 저절로 닫지 않아서
// 같은 작업자의 다음 시험까지 남아요. 동시 1개로 도는 GitHub(2코어)에서는 Firebase 시험 80여 개의 휴대폰 · PC · 학생 창과
// 실시간 연결이 계속 쌓여, 끝 무렵 실행 서버가 멈췄어요(2026-11-10). 시험 파일마다 맨 위에서 부르는 needEmulator()가 이 정리를 걸어요
const opened = new Set();
export const needEmulator = () => {
  if (process.env.CI && (!EMU || !AUTH)) throw new Error("CI에서는 Firebase 에뮬레이터 안에서 시험해야 해요(npm run test:all)");
  test.skip(!EMU || !AUTH, "Firebase 에뮬레이터 없이 실행했어요(npm run test:emu로 돌려요)");
  // 이 시험들의 앱은 PIN을 켠 설정(CFG pin: true)이라, 규칙의 PIN 스위치(config/pin, 관리자만 만듦)도 켜 둬요(2026-11-15).
  // 정식 사이트 1차 활성화는 스위치가 꺼진 상태이고, 그 경우는 tests/rules.spec.js 맨 아래 시험이 봐요
  test.beforeAll(async () => {
    if (!EMU) return;
    await fetch("http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/config/pin", {
      method: "PATCH", headers: Object.assign({ "Content-Type": "application/json" }, ADMIN), body: JSON.stringify({ fields: { on: { booleanValue: true } } })
    }).catch(() => {});
  });
  test.afterEach(async () => {
    const list = [...opened];
    opened.clear();
    await Promise.all(list.map((c) => c.close().catch(() => {})));
    // 이 시험의 교사가 맡았던 PIN 자리를 지워요(관리자 권한, 에뮬레이터만). 교사 계정 · 수업 문서는 시험마다 새 계정이라 그대로 둬요
    const owners = new Set([...teachers].map((u) => createHash("sha256").update(u).digest("hex")));
    teachers.clear();
    if (!owners.size || !EMU) return;
    const base = "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/pins";
    const got = await fetch(base + "?pageSize=1000", { headers: ADMIN }).then((r) => r.json()).catch(() => ({}));
    await Promise.all((got.documents || []).filter((d) => d.fields && d.fields.owner && owners.has(d.fields.owner.stringValue))
      .map((d) => fetch("http://" + EMU + "/v1/" + d.name, { method: "DELETE", headers: ADMIN }).catch(() => {})));
  });
};

export const PROJECT = "demo-navi";
// 가짜 프로젝트 하나를 위한 Firebase 설정. pin: 연결 코드(익명 로그인 + 새 규칙)를 켤지
export const configFor = (project, pin) => ({ app: { apiKey: "demo-key", authDomain: project + ".firebaseapp.com", projectId: project, appId: project }, emulator: { auth: "http://" + AUTH, firestore: EMU }, pin: !!pin });
const CFG = { app: { apiKey: "demo-key", authDomain: PROJECT + ".firebaseapp.com", projectId: PROJECT, appId: PROJECT }, emulator: { auth: "http://" + AUTH, firestore: EMU }, pin: true };
export const PC = { viewport: { width: 1366, height: 768 } };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
let n = 0;
// 시험마다 새 교사 계정(서로 섞이지 않게)
export const email = (who) => who + "-" + Date.now().toString(36) + "-" + process.pid + "-" + (++n) + "@example.com";

// 한 기기 = 브라우저 하나(쿠키 · 저장소가 따로). Firebase 설정은 navi-config.js보다 먼저 넣어요(시험 주소 localhost에서는 navi-config.js가 비어 있어요)
// cfg: 다른 가짜 프로젝트로 열 때(예: 지금 배포된 규칙을 넣은 demo-navi-old)
const deviceInit = ([cfg, pins]) => {
  window.NAVI_FIREBASE = cfg;
  // 이 기기(브라우저)가 새로 만드는 PIN의 구간(에뮬레이터 시험에서만 앱이 써요)
  window.NAVI_TEST_PINS = pins;
  // QR 그림 대신 QR에 담긴 주소만 받아요(외부 QR 도구 없이)
  window.QRCode = function (box, o) { window.__qrText = o.text; };
};
export async function device(browser, opts, errors, cfg) {
  const ctx = await browser.newContext(opts);
  opened.add(ctx);
  await ctx.addInitScript(deviceInit, [cfg || CFG, nextPins()]);
  const page = await ctx.newPage();
  watch(page, errors);
  return { ctx, page };
}
// 사용자 데이터 폴더가 남는 기기(2026-11-12, tests/e2e.spec.js): 닫고 같은 폴더로 다시 열면 ‘브라우저를 껐다 켠 것’과 같아요
// (로그인 유지 · 내 수업 · 이 브라우저의 파일이 그대로). PIN 구간은 처음 연 그 기기의 것을 그대로 써요
export async function lastingDevice(dir, opts, errors, pins) {
  const baseURL = test.info().project.use.baseURL;
  const ctx = await chromium.launchPersistentContext(dir, Object.assign({ baseURL }, opts));
  opened.add(ctx);
  const p = pins || nextPins();
  await ctx.addInitScript(deviceInit, [CFG, p]);
  const page = ctx.pages()[0] || await ctx.newPage();
  watch(page, errors);
  return { ctx, page, pins: p };
}
// 에뮬레이터의 가짜 구글 계정으로 로그인 → 페이지가 다시 열려요. 승인 목록 없이 바로 계정과 이어져요(2026-11-11 자유 가입).
// keep: 로그인 화면의 ‘이 브라우저에서 로그인 유지’(기본 켜짐, false면 이 탭에서만) · name: 구글 계정 이름(표시 이름의 기본값)
export async function signIn(page, who, { keep = true, name = "" } = {}) {
  await expect.poll(() => page.evaluate(() => !!window.naviAuth)).toBe(true);
  await Promise.all([page.waitForEvent("load"), page.evaluate(([e, o]) => window.naviAuth.testSignIn(e, o), [who, { keep, name }]).catch(() => {})]);
  await uidAfterSignIn(page);
}
// 로그인 뒤 연결 코드가 알려 주는 구글 계정 id. 시험이 끝나면 이 교사가 맡았던 PIN 자리를 지워요
export async function uidAfterSignIn(page) {
  await expect.poll(() => page.evaluate(() => (window.naviAuth && window.naviAuth.uid) || ""), { timeout: 15000 }).not.toBe("");
  const uid = await page.evaluate(() => window.naviAuth.uid);
  teachers.add(uid);
  return uid;
}
export const pcLinked = (page) => expect(page.locator(".side-foot .dstate").filter({ hasText: "모바일 리모컨" })).toContainText("연결됨", { timeout: 20000 });
// 발표 설정의 ‘QR 보기’에서 휴대폰이 열 주소(QR에 담긴 주소)
export async function qrUrl(page) {
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.getByRole("button", { name: "QR 보기" }).click();
  await expect.poll(() => page.evaluate(() => window.__qrText || "")).toMatch(/#remote-\d{4}$/);
  const url = await page.evaluate(() => window.__qrText);
  await page.getByRole("tab", { name: "수업 준비" }).click();
  return url;
}
// 교사 PC: 로그인 → 수업 시작(수업 화면 창이 열려요)
export async function teacherStarts(browser, errors, who) {
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  return Object.assign(pc, { stage, url, who });
}
// 휴대폰: QR 주소 열기 → 같은 계정으로 로그인 → 지금 장면이 보여요
export async function phoneJoins(browser, errors, url, who) {
  const ph = await device(browser, PHONE, errors);
  await ph.page.goto(url);
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toBeVisible();
  await signIn(ph.page, who);
  return ph;
}
export const stageLabel = (stage) => stage.locator(".stage-bar .chip").first();
// 계정의 문서를 그 기기의 연결 코드(shim)로 읽어요: 서버가 확인한 값(fromCache 아님)이 올 때까지 기다려요
// 45초 안에 오지 않으면 그동안 받은 소식(시각 · 있음 · 기다린 칸 값 · 캐시 · 보내는 중)을 담아 실패해요(멈춘 까닭을 남기려고)
export const readDoc = (page, path, until) => page.evaluate(([path, until]) => new Promise(async (res, rej) => {
  const db = await window.claude.use("db");
  if (!db) return rej(new Error("로그인 안 됨"));
  const t0 = Date.now(), seen = [];
  const timer = setTimeout(() => { off(); rej(new Error(path + " 서버 값이 45초 안에 오지 않아요 " + JSON.stringify(until) + " 받은 것 " + JSON.stringify(seen.slice(-6)))); }, 45000);
  const off = db.doc(path).onSnapshot((s) => {
    const d = s.exists ? s.data() : null;
    seen.push([Date.now() - t0, s.exists, d && until ? Object.keys(until).map((k) => d[k]).join(",") : "", s.metadata.fromCache, s.metadata.hasPendingWrites]);
    if (!s.exists || s.metadata.fromCache || s.metadata.hasPendingWrites) return;
    if (until && Object.keys(until).some((k) => d[k] !== until[k])) return;
    clearTimeout(timer); off(); res(d);
  }, (e) => { clearTimeout(timer); rej(e); });
}), [path, until || null]);
