// 휴대폰 연결 두 가지(구글 계정 자동 연결 · PIN 4자리) · 휴대폰에서 수업 시작 (1단계-1 UX, docs/UX-1-1.md 3 · 9)
// Firebase 에뮬레이터 안의 가짜 프로젝트 demo-navi와 가짜 계정만 써요. 실행: npm run test:emu
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LABELS, watch, curLabel, nextBtn, localRecords, finishLesson, idbRecords, videoLesson, toFlow } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, stageLabel, configFor, readDoc, uidAfterSignIn, unusedPin } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

// 끊긴 기기(setOffline)나 연결이 끝난 휴대폰이 남기는 네트워크 오류는 빼고 봐요
const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
// 교사 PC: 로그인만(수업은 시작하지 않아요). 구글로 가입한 교사는 누구나 PIN 연결 자리를 열어요(2026-11-11)
async function teacherReady(browser, errors, who) {
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  return pc;
}
// 교사 PC: 발표 설정에서 수업 화면 창만 먼저 열어요(사람이 누른 것처럼)
async function openStage(pc, errors) {
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.locator('.set-layout [data-act="stage-open"]').first().click()]);
  watch(stage, errors);
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  return stage;
}
const startBtn = (page) => page.locator('[data-act="m-start-ask"]');

// 2026-11-12 CI(PR #13): 새 PIN을 무작위로 고를 때 지금 PIN을 빼지 않아서, ‘PIN 바꾸기’가 가끔 같은 숫자를 다시 뽑아 PIN이 그대로였어요
// (시험의 기기별 PIN 구간 40개에서는 40번에 1번, 실제로는 1만 번에 1번). 고를 수 있는 PIN을 2개로 좁히면 고치기 전에는 거의 늘 드러나요
test("PIN 바꾸기는 늘 지금과 다른 PIN으로 바꿔요(무작위로 같은 숫자가 다시 뽑혀도)", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  // 이 기기가 고를 수 있는 PIN을 자기 구간의 앞 2개로 좁혀요(다른 시험의 PIN과 겹치지 않아요)
  await pc.ctx.addInitScript(() => { const r = window.NAVI_TEST_PINS; if (r) window.NAVI_TEST_PINS = { from: r.from, to: r.from + 2 }; });
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  await uidAfterSignIn(pc.page);
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await pc.page.getByRole("button", { name: "QR 보기" }).click();
  const pinIn = (u) => ((u || "").match(/#remote-(\d{4})$/) || [])[1];
  await expect.poll(async () => pinIn(await pc.page.evaluate(() => window.__qrText))).toMatch(/^\d{4}$/);
  for (let i = 0; i < 8; i++) {
    const before = pinIn(await pc.page.evaluate(() => window.__qrText));
    await expect(pc.page.getByRole("button", { name: "PIN 바꾸기" })).toBeEnabled();
    await pc.page.getByRole("button", { name: "PIN 바꾸기" }).click();
    await expect.poll(async () => pinIn(await pc.page.evaluate(() => window.__qrText)), { message: (i + 1) + "번째 PIN 바꾸기가 같은 PIN이에요" }).not.toBe(before);
  }
  expect(real(errors)).toEqual([]);
});

test("구글 계정: 한 번 로그인한 휴대폰은 PIN이 바뀐 옛 QR로 다시 열어도 로그인 · PIN 없이 그 계정의 수업으로 이어져요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const oldUrl = await qrUrl(pc.page);
  const ph = await phoneJoins(browser, errors, oldUrl, who);
  await expect(ph.page.locator(".checks")).toBeVisible();
  await expect(ph.page.locator("#pin-in")).toHaveCount(0);
  // 교사 PC가 PIN을 바꿔요 → QR 주소가 달라져요
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  // 앞에서 연 QR은 1분 동안 열려 있어요(이미 열렸으면 단추가 ‘숨기기’)
  const show = pc.page.getByRole("button", { name: "QR 보기" });
  if (await show.count()) await show.click();
  await pc.page.getByRole("button", { name: "PIN 바꾸기" }).click();
  // QR은 PC가 교사 표시(?t=)를 더할 때도 바뀌어서, PIN 숫자 자체가 바뀌고 서버에 저장된 것을 기다려요
  const pinIn = (u) => ((u || "").match(/#remote-(\d{4})$/) || [])[1];
  await expect.poll(async () => pinIn(await pc.page.evaluate(() => window.__qrText))).not.toBe(pinIn(oldUrl));
  await expect(pc.page.getByRole("button", { name: "PIN 바꾸기" })).toBeEnabled();
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  // 휴대폰이 옛 QR을 다시 열어도: 로그인 화면도 PIN 입력도 없이 대기 화면
  await ph.page.goto("about:blank");
  await ph.page.goto(oldUrl);
  await expect(ph.page.locator(".checks")).toBeVisible();
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toHaveCount(0);
  await expect(ph.page.locator("#pin-in")).toHaveCount(0);
  // 교사 PC가 시작하면 그 수업을 그대로 따라가고 넘겨요
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

test("PIN을 바꾸는 중에 바로 ‘수업 시작’을 눌러도: PIN이 바뀐 뒤에 시작해서 수업은 새 PIN에 있고, 휴대폰은 그 수업을 따라가요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const url = await qrUrl(pc.page), oldPin = url.match(/#remote-(\d{4})$/)[1];
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(ph.page.locator(".checks")).toBeVisible();
  // PIN 바꾸기의 저장(설정 문서)이 서버에 닿기까지 2초 걸리게 해요
  await pc.ctx.route(/documents:commit/, async (route) => {
    if ((route.request().postData() || "").includes("lessons/settings")) await new Promise((r) => setTimeout(r, 2000));
    await route.continue().catch(() => {});
  });
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await pc.page.getByRole("button", { name: "PIN 바꾸기" }).click();
  await expect(pc.page.getByRole("button", { name: "PIN 바꾸는 중…" })).toBeDisabled();
  // 그 사이 ‘수업 시작’: 수업 화면 창은 바로 열리고, 수업은 PIN이 바뀐 뒤에 시작해요
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0], { timeout: 15000 });
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 15000 });
  const uid = pc.uid, base = "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/teachers/" + uid + "/";
  const get = async (p) => { const r = await fetch(base + p, { headers: { Authorization: "Bearer owner" } }); return r.ok ? r.json() : null; };
  const pin = (await get("lessons/settings")).fields.pin.stringValue;
  expect(pin).not.toBe(oldPin);
  expect((await get("sessions/s" + pin)).fields.started.booleanValue).toBe(true);
  const old = await get("sessions/s" + oldPin);
  expect(!!(old && old.fields.started && old.fields.started.booleanValue), "옛 PIN에는 수업이 시작되지 않아요").toBe(false);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  expect(real(errors)).toEqual([]);
});

test("휴대폰에서 수업 시작: 수업 화면은 없어도 되고(있으면 그대로 알려요), PC에서 미리 열어 두면 확인 한 번 뒤 교사 화면 · 수업 화면 · 휴대폰이 함께 시작해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), who);
  const checks = ph.page.locator(".checks");
  // 수업 화면 창이 아직 없어요: 수업 화면은 선택이라 막지 않고, 열려 있지 않다고만 말해요(2026-11-13, docs/CLASS-SCREEN.md)
  await expect(checks).toContainText("켜져 있어요");
  await expect(checks).toContainText(LABELS.length + "장면");
  await expect(checks).toContainText("열려 있지 않아요 · 없어도 시작할 수 있어요");
  await expect(startBtn(ph.page)).toBeEnabled();
  await expect(ph.page.locator(".stage-how")).toContainText("교사 PC에서 ‘수업 화면 열기’");
  // 이번에는 교사가 PC에서 수업 화면을 미리 열어 둬요
  const stage = await openStage(pc, errors);
  await expect(ph.page.locator(".stage-how")).toHaveCount(0);
  await expect(ph.page.locator(".ph-top .chip")).toContainText("준비 완료");
  await expect(checks).toContainText("열려 있어요");
  await expect(startBtn(ph.page)).toBeEnabled();
  // 한 번 누르면 확인 줄만 나오고 아직 시작하지 않아요. 취소하면 그대로
  await startBtn(ph.page).click();
  await expect(ph.page.locator(".start-confirm")).toContainText("함께 시작할까요");
  await ph.page.locator('[data-act="m-start-no"]').click();
  await ph.page.waitForTimeout(800);
  await expect(curLabel(pc.page)).toHaveCount(0);
  await expect(stageLabel(stage)).toHaveText("수업 시작 전");
  // 확인하면 세 화면이 함께 시작해요(수업 화면은 PC가 이미 연 그 창)
  await startBtn(ph.page).click();
  await ph.page.locator('[data-act="m-start"]').click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await expect(ph.page.locator(".rm-top .chip")).toContainText("수업 진행 중");
  // 진행 · 끝내기 · 기록은 예전 그대로: 끝까지 넘기고 끝내면 교사 PC에 기록 하나
  for (let i = 1; i < LABELS.length; i++) {
    await nextBtn(ph.page).click();
    await expect(stageLabel(stage)).toHaveText(LABELS[i]);
  }
  await finishLesson(ph.page);
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("휴대폰에서 수업 시작: 교사 PC가 답하지 않으면 시작하지 않고 이유를 말해요(다시 이어져도 늦게 시작하지 않아요)", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), who);
  const stage = await openStage(pc, errors);
  await expect(startBtn(ph.page)).toBeEnabled();
  // 교사 PC의 인터넷이 끊겨요(창은 열려 있어서 휴대폰에는 아직 ‘켜져 있어요’)
  await pc.ctx.setOffline(true);
  await startBtn(ph.page).click();
  await ph.page.locator('[data-act="m-start"]').click();
  await expect(ph.page.locator(".warn-note")).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  await expect(curLabel(ph.page)).toHaveCount(0);
  // 조금 지나면(휴대폰이 20초마다 묻고 PC가 답하지 않으면) ‘준비 완료’ 대신 ‘응답이 없어요’, 누를 수 없어요
  await expect(ph.page.locator(".checks")).toContainText("응답이 없어요", { timeout: 40000 });
  await expect(ph.page.locator(".ph-top .chip")).toContainText("PC 응답 없음");
  await expect(startBtn(ph.page)).toBeDisabled();
  // PC가 다시 이어져도 그 요청으로 저절로 시작하지 않아요
  await pc.ctx.setOffline(false);
  await expect(pc.page.locator(".side-foot .dstate").filter({ hasText: "모바일 리모컨" })).toContainText("연결됨", { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  await expect(curLabel(pc.page)).toHaveCount(0);
  await expect(stageLabel(stage)).toHaveText("수업 시작 전");
  await expect(curLabel(ph.page)).toHaveCount(0);
  // 다음 물음에 PC가 답하면 다시 ‘준비 완료’
  await expect(ph.page.locator(".ph-top .chip")).toContainText("준비 완료", { timeout: 40000 });
  // 휴대폰 인터넷이 끊기면 누를 수 없어요
  await ph.ctx.setOffline(true);
  await expect(ph.page.locator(".ph-top .chip")).toContainText("연결 끊김", { timeout: 15000 });
  await expect(startBtn(ph.page)).toBeDisabled();
  await ph.ctx.setOffline(false);
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 20000 });
  // 교사 PC가 수업 미리보기 중이면 PC가 받지 않고 그 이유를 돌려줘요
  await pc.page.getByRole("button", { name: "수업 미리보기" }).click();
  await startBtn(ph.page).click();
  await ph.page.locator('[data-act="m-start"]').click();
  await expect(ph.page.locator(".warn-note")).toContainText("수업 미리보기", { timeout: 10000 });
  await expect(curLabel(ph.page)).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

// 교사 PC: ‘휴대폰 연결’을 열면 PIN 자리를 맡아요(연결 기다리는 중). 화면의 PIN과 QR 주소를 돌려줘요
async function openConn(pc) {
  // ‘휴대폰 연결’은 수업 준비 화면의 머리 막대에 있어요(내 수업에는 머리 막대가 없어요)
  await toFlow(pc.page);
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(pc.page.locator(".conn-pop .pair-state")).toContainText("연결 기다리는 중");
  const pin = (await pc.page.locator(".conn-pop .pin-block .code").innerText()).trim();
  await expect.poll(() => pc.page.evaluate(() => window.__qrText || "")).toContain("#remote-" + pin);
  return { pin, url: await pc.page.evaluate(() => window.__qrText) };
}
const tapPin = (ph) => ph.page.getByRole("button", { name: /PIN 4자리로 연결/ }).click();
const asksOf = (pc) => pc.page.locator(".conn-pop .ask-row");
const stateOf = (pc) => pc.page.locator(".conn-pop .pair-state");
// 에뮬레이터에서만: PIN 자리의 끝나는 시각을 지금 앞으로 당겨요(3분을 기다리지 않고 ‘시간 지남’을 봐요)
const expire = (pin) => fetch("http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/pins/" + pin + "?updateMask.fieldPaths=exp", {
  method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" },
  body: JSON.stringify({ fields: { exp: { integerValue: String(Date.now() - 1000) } } }) });
// 그 교사 계정의 PIN을 바꿔요(우연히 다른 반과 같은 PIN이 된 경우를 만들 때)
// 계정의 설정이 서버에 저장된 뒤에 바꿔요(처음 쓰는 계정은 PC가 수업을 맡을 때 설정을 저장해요)
const setPin = async (pc, pin) => { await readDoc(pc.page, "lessons/settings"); return pc.page.evaluate(async (pin) => { const db = await window.claude.use("db"); await db.doc("lessons/settings").update({ pin }); }, pin); };

test("PIN 4자리: QR로 연 휴대폰은 한 번 눌러 요청하고, PC가 허용해야만 넘겨요. 한 번에 한 대 · 거절 · 수업이 끝나면 끊기고 다음 수업은 다시 허용받아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const { pin, url } = await openConn(pc);
  expect(pin).toMatch(/^\d{4}$/);
  // QR에는 PIN과 이 교사의 표시(?t=)가 들어 있어요. PC에는 PIN 4자리 하나만 보여요
  expect(url).toMatch(new RegExp("\\?t=[0-9a-f]{8}#remote-" + pin + "$"));
  await expect(pc.page.locator(".conn-pop")).not.toContainText("6자리");
  await expect(pc.page.locator(".conn-pop")).not.toContainText("연결 코드");
  // 휴대폰 b: QR로 열고 ‘PIN 4자리로 연결’ 한 번 → PIN을 넣지 않고 바로 요청해요. 같은 4자리가 보여요
  const b = await device(browser, PHONE, errors);
  await b.page.goto(url);
  await expect(b.page.getByRole("button", { name: /PIN 4자리로 연결/ })).toContainText(pin);
  await tapPin(b);
  await expect(b.page.getByText("교사 PC에서 ‘허용’을 눌러 주세요")).toBeVisible();
  await expect(b.page.locator(".pin-show")).toHaveAttribute("aria-label", "휴대폰 연결 PIN " + pin);
  await expect(b.page.locator(".ph-top .chip")).toContainText("허용 기다리는 중");
  await expect(asksOf(pc)).toHaveCount(1);
  await expect(stateOf(pc)).toContainText("허용을 기다려요");
  // 허용하면 로그인 없이 그 수업의 대기 화면
  await Promise.all([b.page.waitForEvent("load"), asksOf(pc).locator('[data-act="pair-allow"]').click()]);
  await expect(b.page.locator(".checks")).toContainText("켜져 있어요");
  await expect(b.page.locator(".ph-foot")).toContainText("PIN으로 연결한 휴대폰");
  await expect(stateOf(pc)).toContainText("휴대폰을 연결했어요");
  await expect(pc.page.locator(".dev-row")).toHaveCount(1);
  // 한 번 열면 한 대만: 다른 휴대폰 c는 닫힌 자리라 요청하지 못하고, 그 까닭(연결 닫힘)을 말해요
  const c = await device(browser, PHONE, errors);
  await c.page.goto(url);
  await tapPin(c);
  await expect(c.page.locator(".ph-hero h1")).toContainText("PC의 연결 창이 닫혀 있어요");
  await expect(c.page.locator(".ph-top .chip")).toContainText("연결 닫힘");
  // PC가 ‘한 대 더 연결’로 다시 열어도, 거절한 휴대폰은 들어오지 못해요
  await pc.page.getByRole("button", { name: "한 대 더 연결" }).click();
  await expect(stateOf(pc)).toContainText("연결 기다리는 중");
  await c.page.getByRole("button", { name: "다시 요청" }).click();
  await expect(asksOf(pc)).toHaveCount(1);
  await asksOf(pc).locator('[data-act="pair-deny"]').click();
  await expect(c.page.locator(".ph-hero h1")).toContainText("교사 PC가 연결을 거절했어요");
  await expect(c.page.locator(".ph-top .chip")).toContainText("거절됨");
  await expect(c.page.locator(".checks")).toHaveCount(0);
  // 교사 PC가 시작 → PIN 휴대폰의 넘기기 · 신호는 명령으로 가고 PC가 적용해요
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(b.page)).toHaveText(LABELS[0]);
  await nextBtn(b.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(b.page)).toHaveText(LABELS[1]);
  await b.page.locator(".thumb-nav .sig.s-red").click();
  await expect(pc.page.locator(".pv-bar .sig.s-red")).toHaveAttribute("aria-pressed", "true");
  await expect(b.page.locator(".thumb-nav .sig.s-red")).toHaveAttribute("aria-pressed", "true");
  await nextBtn(b.page).click();
  await nextBtn(b.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[3]);
  await expect(curLabel(b.page)).toHaveText(LABELS[3]);
  // 이 휴대폰이 수업 문서를 직접 바꾸려 하면(끝내기 · 기록 지우기 · 장면 건너뛰기 · 통째로 덮기) 서버가 모두 거절해요
  const tries = await b.page.evaluate(async () => {
    const db = await window.claude.use("db"), sid = "sessions/" + db.account.sid, out = {};
    const t = async (k, f) => { try { await f(); out[k] = "들어감"; } catch (e) { out[k] = e.code || String(e); } };
    await t("끝내기", () => db.doc(sid).update({ ended: true }));
    await t("신호 기록 지우기", () => db.doc(sid).update({ reactions: [] }));
    await t("지난 장면 기록 지우기", () => db.doc(sid).update({ log: [] }));
    await t("장면 건너뛰기", () => db.doc(sid).update({ cur: "x", enteredAt: 1 }));
    await t("통째로 덮기", () => db.doc(sid).set({ v: 5, started: false, ended: false }));
    return out;
  });
  expect(Object.values(tries).every((v) => v === "permission-denied"), JSON.stringify(tries)).toBe(true);
  await pc.page.waitForTimeout(500);
  await expect(stageLabel(stage)).toHaveText(LABELS[3]);
  // 장면 2의 빨간 신호 기록도 그대로 남아 있어요(진행 막대의 빨간 표시)
  await expect(pc.page.locator(".pv-head .tl .seg.sig-red")).toHaveCount(1);
  // 수업이 끝나면 PIN 휴대폰의 권한이 사라지고, 휴대폰은 연결 화면에서 그 까닭을 말해요
  for (let i = 4; i < LABELS.length; i++) {
    await nextBtn(pc.page).click();
    await expect(stageLabel(stage)).toHaveText(LABELS[i]);
  }
  await finishLesson(pc.page);
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(b.page.locator(".warn-note")).toContainText("이 휴대폰 연결을 끝냈어요", { timeout: 20000 });
  await expect(b.page.getByRole("button", { name: /PIN 4자리로 연결/ })).toBeVisible();
  expect(await b.page.evaluate(() => localStorage.getItem("navi-device"))).toBeNull();
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  // 다음 수업: PIN이 같아도 b는 다시 허용받아야 해요. PC가 연결 창을 열기 전에는 요청할 곳이 없어요
  await tapPin(b);
  await expect(b.page.locator(".ph-hero h1")).toContainText(/닫혀 있어요|시간이 지났어요/);
  await pc.page.getByRole("button", { name: "수업 기록 보기" }).click();
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(stateOf(pc)).toContainText("연결 기다리는 중");
  expect((await pc.page.locator(".conn-pop .pin-block .code").innerText()).trim()).toBe(pin);
  await b.page.getByRole("button", { name: "다시 요청" }).click();
  await expect(asksOf(pc)).toHaveCount(1);
  await Promise.all([b.page.waitForEvent("load"), asksOf(pc).locator('[data-act="pair-allow"]').click()]);
  // 다시 허용받은 휴대폰은 새 수업의 대기 화면에서 시작까지 해요(수업 화면 창은 PC에 열려 있어요)
  await expect(b.page.locator(".ph-top .chip")).toContainText("준비 완료", { timeout: 30000 });
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  await startBtn(b.page).click();
  await b.page.locator('[data-act="m-start"]').click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  await expect(curLabel(b.page)).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

test("PIN 4자리 직접 넣기: 네 칸이 저절로 넘어가고 붙여넣기도 되며, 틀린 PIN · 취소 · 시간 지남을 따로 말해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const { pin } = await openConn(pc);
  // QR 없이 연 휴대폰: PIN을 직접 넣어요
  const a = await device(browser, PHONE, errors);
  await a.page.goto("/#remote");
  await tapPin(a);
  const boxes = a.page.locator(".pin-box");
  const typed = () => boxes.evaluateAll((els) => els.map((e) => e.value).join(""));
  await expect(boxes).toHaveCount(4);
  await expect(boxes.nth(0)).toBeFocused();
  await expect(a.page.locator("#pin-send")).toBeDisabled();
  // 한 자리씩 치면 다음 칸으로 넘어가고, 빈 칸에서 지우기를 누르면 앞 칸으로 돌아가 지워요
  // 어떤 시험도 맡지 않는 구간의 PIN(동시에 도는 다른 시험이 우연히 열어 둔 PIN과 겹치지 않게)
  const wrong = unusedPin();
  await a.page.keyboard.type(wrong.slice(0, 3));
  await expect(boxes.nth(3)).toBeFocused();
  await a.page.keyboard.press("Backspace");
  await expect(boxes.nth(2)).toBeFocused();
  await expect(boxes.nth(2)).toHaveValue("");
  await expect(a.page.locator("#pin-send")).toBeDisabled();
  await a.page.keyboard.type(wrong.slice(2));
  await expect(a.page.locator("#pin-send")).toBeEnabled();
  expect(await typed()).toBe(wrong);
  // 아무도 열지 않은 PIN
  await a.page.locator("#pin-send").click();
  await expect(a.page.locator(".warn-note")).toContainText("이 PIN으로 열린 연결이 없어요");
  // 붙여넣기: 어느 칸에 붙여도 숫자만 골라 네 칸을 채워요
  await boxes.nth(1).focus();
  await a.page.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text/plain", t); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, "PIN " + pin.slice(0, 2) + " " + pin.slice(2));
  expect(await typed()).toBe(pin);
  await a.page.locator("#pin-send").click();
  await expect(a.page.getByText("교사 PC에서 ‘허용’을 눌러 주세요")).toBeVisible();
  await expect(asksOf(pc)).toHaveCount(1);
  // 휴대폰이 취소하면 PC의 요청 목록에서도 빠져요. 넣은 PIN은 그대로라 다시 보내면 다시 보여요
  await a.page.getByRole("button", { name: "취소" }).click();
  await expect(asksOf(pc)).toHaveCount(0);
  expect(await typed()).toBe(pin);
  await a.page.locator("#pin-send").click();
  await expect(asksOf(pc)).toHaveCount(1);
  // 3분이 지나면(에뮬레이터에서 끝나는 시각만 앞당겨요): 휴대폰은 ‘시간 지남’, PC는 허용 단추가 사라지고 ‘다시 열기’
  expect((await expire(pin)).ok).toBe(true);
  await expect(a.page.locator(".ph-hero h1")).toContainText("연결 시간이 지났어요");
  await expect(a.page.locator(".ph-top .chip")).toContainText("시간 지남");
  await expect(stateOf(pc)).toContainText("연결 시간이 지났어요");
  await expect(asksOf(pc)).toHaveCount(0);
  // PC가 다시 열면 휴대폰은 같은 PIN으로 다시 요청해 허용받아요
  await pc.page.getByRole("button", { name: "다시 열기" }).click();
  await expect(stateOf(pc)).toContainText("연결 기다리는 중");
  await a.page.getByRole("button", { name: "다시 요청" }).click();
  await expect(asksOf(pc)).toHaveCount(1);
  await Promise.all([a.page.waitForEvent("load"), asksOf(pc).locator('[data-act="pair-allow"]').click()]);
  await expect(a.page.locator(".checks")).toContainText("켜져 있어요");
  expect(real(errors)).toEqual([]);
});

test("같은 PIN을 쓰는 두 교사: 수업 전이면 PIN을 바꿔 섞이지 않고, 수업 중이면 기다렸다 다시 열어요. 요청은 그 PIN을 맡은 교사에게만 가요", async ({ browser }) => {
  const errors = [];
  const A = await teacherReady(browser, errors, email("teacher-a"));
  const B = await teacherReady(browser, errors, email("teacher-b"));
  const a = await openConn(A);
  const b0 = await openConn(B);
  // B의 PIN이 A와 같아지면(우연히 같은 PIN): A가 맡고 있어서, 수업 전인 B는 새 PIN을 받아요. PC와 휴대폰에는 여전히 한 번호예요
  await setPin(B, a.pin);
  await expect(B.page.locator(".conn-pop .pin-block")).toContainText("같은 PIN을 다른 반이 쓰고 있어서 PIN을 바꿨어요");
  await expect(stateOf(B)).toContainText("연결 기다리는 중");
  const bPin = (await B.page.locator(".conn-pop .pin-block .code").innerText()).trim();
  expect(bPin).not.toBe(a.pin);
  await expect.poll(() => B.page.evaluate(() => window.__qrText || "")).toContain("#remote-" + bPin);
  const bTag = new URL(await B.page.evaluate(() => window.__qrText)).searchParams.get("t");
  expect(bTag).not.toBe(new URL(a.url).searchParams.get("t"));
  expect(b0.pin).toMatch(/^\d{4}$/);
  // A의 QR로 연 휴대폰의 요청은 A에게만 가요
  const p = await device(browser, PHONE, errors);
  await p.page.goto(a.url);
  await tapPin(p);
  await expect(asksOf(A)).toHaveCount(1);
  await B.page.waitForTimeout(800);
  await expect(asksOf(B)).toHaveCount(0);
  await Promise.all([p.page.waitForEvent("load"), asksOf(A).locator('[data-act="pair-allow"]').click()]);
  await expect(p.page.locator(".checks")).toContainText("켜져 있어요");
  await expect(A.page.locator(".dev-row")).toHaveCount(1);
  await expect(B.page.locator(".dev-row")).toHaveCount(0);
  // B의 표시가 담긴 QR로 A의 PIN에 요청하면(예: 예전 QR 사진) 보내지 않고 그 까닭을 말해요
  const q = await device(browser, PHONE, errors);
  await q.page.goto("/?t=" + bTag + "#remote-" + a.pin);
  await tapPin(q);
  await expect(q.page.locator(".warn-note")).toContainText("이 QR은 지금 열린 연결과 맞지 않아요");
  await expect(asksOf(A)).toHaveCount(0);
  // B는 연결 창을 닫고 수업을 시작해요(수업 중)
  await B.page.locator('.conn-pop [data-act="conn"]').click();
  const [stage] = await Promise.all([B.page.waitForEvent("popup"), B.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(B.page)).toHaveText(LABELS[0]);
  await B.page.locator('.pv-head [data-act="more"]').click();
  await B.page.locator('.more-menu [data-act="roles"]').click();
  // 그 사이 A의 PIN이 B와 같아지면: B가 닫아 둔 자리라 A가 맡아요(A에 PIN으로 연결했던 휴대폰은 다시 연결해야 해요)
  await setPin(A, bPin);
  await expect(A.page.locator(".conn-pop .pin-block .code")).toHaveText(bPin);
  await expect(stateOf(A)).toContainText("연결 기다리는 중");
  await expect(A.page.locator(".dev-row")).toHaveCount(0);
  // 수업 중인 B가 연결 창을 열면: PIN을 바꾸지 않고 ‘다른 반이 잠깐 쓰고 있어요’ · B의 수업은 그대로
  await B.page.locator('.sbar [data-act="conn"]').click();
  await expect(stateOf(B)).toContainText("같은 PIN을 다른 반이 잠깐 쓰고 있어요");
  await expect(B.page.locator(".conn-pop .pin-block .code")).toHaveText(bPin);
  await expect(asksOf(B)).toHaveCount(0);
  // A가 창을 닫으면 B가 ‘다시 열기’로 맡아요
  await A.page.locator('.conn-pop [data-act="conn"]').click();
  await B.page.getByRole("button", { name: "다시 열기" }).click();
  await expect(stateOf(B)).toContainText("연결 기다리는 중");
  await expect(stage.locator(".stage-bar .chip").first()).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

// 에뮬레이터에서만(관리자 권한): 모르는 휴대폰 n대가 그 PIN 자리에 요청을 남긴 상태를 만들어요(요청 수도 함께)
const strangers = async (pin, n) => {
  const base = "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/pins/" + pin, h = { "content-type": "application/json", Authorization: "Bearer owner" };
  const d = await (await fetch(base, { headers: h })).json();
  const lease = d.fields.lease.stringValue, asks = Number(d.fields.asks.integerValue);
  for (let i = 1; i <= n; i++) await fetch(base + "/asks/stranger-" + i, { method: "PATCH", headers: h, body: JSON.stringify({ fields: { lease: { stringValue: lease }, at: { integerValue: String(Date.now()) }, kind: { stringValue: "모르는 기기" } } }) });
  await fetch(base + "?updateMask.fieldPaths=asks", { method: "PATCH", headers: h, body: JSON.stringify({ fields: { asks: { integerValue: String(asks + n) } } }) });
};

test("모르는 요청이 자리를 채워도: 교사가 거절하면 자리가 비어 내 휴대폰이 들어오고, 실수로 거절한 휴대폰도 다시 요청할 수 있어요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const { pin, url } = await openConn(pc);
  // 모르는 기기 셋이 먼저 요청해서 기다리는 자리(3개)가 찼어요
  await strangers(pin, 3);
  await expect(asksOf(pc)).toHaveCount(3);
  await expect(pc.page.locator(".conn-pop .warn-note")).toContainText("요청이 3개예요");
  const me = await device(browser, PHONE, errors);
  await me.page.goto(url);
  await tapPin(me);
  await expect(me.page.locator(".warn-note")).toContainText("요청이 너무 많아요");
  // 교사가 모르는 요청 하나를 거절하면 자리가 비어서, 내 휴대폰이 다시 보내면 들어가요
  await asksOf(pc).filter({ hasText: "모르는 기기" }).first().locator('[data-act="pair-deny"]').click();
  await expect(asksOf(pc)).toHaveCount(2);
  await me.page.locator("#pin-send").click();
  await expect(me.page.getByText("교사 PC에서 ‘허용’을 눌러 주세요")).toBeVisible();
  await expect(asksOf(pc)).toHaveCount(3);
  // 내 휴대폰을 실수로 거절해도: 휴대폰은 새 익명 계정으로 다시 요청하고, 교사가 허용하면 이어져요
  await asksOf(pc).filter({ hasNotText: "모르는 기기" }).locator('[data-act="pair-deny"]').click();
  await expect(me.page.locator(".ph-top .chip")).toContainText("거절됨");
  await me.page.getByRole("button", { name: "다시 요청" }).click();
  await expect(me.page.getByText("교사 PC에서 ‘허용’을 눌러 주세요")).toBeVisible();
  await expect(asksOf(pc).filter({ hasNotText: "모르는 기기" })).toHaveCount(1);
  await Promise.all([me.page.waitForEvent("load"), asksOf(pc).filter({ hasNotText: "모르는 기기" }).locator('[data-act="pair-allow"]').click()]);
  await expect(me.page.locator(".checks")).toContainText("켜져 있어요");
  await expect(pc.page.locator(".dev-row")).toHaveCount(1);
  // 공개된 PIN 자리에는 교사 id가 없고 해시만 있어요
  const raw = await (await fetch("http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/pins/" + pin, { headers: { Authorization: "Bearer owner" } })).json();
  expect(Object.keys(raw.fields).sort()).toEqual(["asks", "exp", "lease", "no", "open", "owner", "sid"]);
  expect(raw.fields.owner.stringValue).toMatch(/^[0-9a-f]{64}$/);
  expect(new URL(url).searchParams.get("t")).toBe(raw.fields.owner.stringValue.slice(0, 8));
  expect(real(errors)).toEqual([]);
});

// ---------- 가입 · 로그인 정책(2026-11-11, docs/AUTH-POLICY.md) ----------
const adminGet = (p, project = PROJECT) => fetch("http://" + EMU + "/v1/projects/" + project + "/databases/(default)/documents/" + p, { headers: { Authorization: "Bearer owner" } });

test("자유 가입: 운영자 승인 없이 처음 로그인한 구글 계정도 바로 계정과 이어지고 PIN 연결을 열어요. 처음 한 번 표시 이름을 정하고(구글 이름이 기본값 · 학교명은 묻지 않음), 나중에 바꿀 수 있어요. PIN 자리는 자기 설정의 PIN만 열려요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who, { name: "김선생" });
  await pcLinked(pc.page);
  const uid = await uidAfterSignIn(pc.page);
  // 승인 목록 문서가 없어도 돼요(목록을 읽지도 않아요)
  expect((await adminGet("allowed/" + uid)).status).toBe(404);
  // 처음 로그인: 표시 이름만 물어요. 구글 계정 이름이 기본값이에요
  const ask = pc.page.locator(".name-ask");
  await expect(ask).toContainText("화면에 보일 이름을 정해 주세요");
  await expect(ask).not.toContainText("학교");
  await expect(ask.locator("#name-in")).toHaveValue("김선생");
  await ask.locator("#name-in").fill("  김하늘   선생님 ");
  await ask.getByRole("button", { name: "이 이름으로 시작" }).click();
  await expect(ask).toHaveCount(0);
  // 화면은 보내는 중인 값으로 먼저 닫혀요. 서버에 닿은 것을 확인해요
  await expect.poll(async () => (await adminGet("teachers/" + uid + "/profile/me")).status).toBe(200);
  const prof = await (await adminGet("teachers/" + uid + "/profile/me")).json();
  expect(Object.keys(prof.fields).sort()).toEqual(["at", "name", "v"]);
  expect(prof.fields.name.stringValue).toBe("김하늘 선생님");
  // 다시 열어도 묻지 않아요. 발표 설정에서 보이고 바꿀 수 있어요(빈 이름은 안 돼요)
  await pc.page.reload();
  await pcLinked(pc.page);
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(pc.page.locator(".name-ask")).toHaveCount(0);
  await expect(pc.page.locator(".set-layout .acct")).toContainText("김하늘 선생님");
  await pc.page.getByRole("button", { name: "이름 바꾸기" }).click();
  await pc.page.locator(".set-layout #name-in").fill("   ");
  await pc.page.locator(".set-layout").getByRole("button", { name: "저장", exact: true }).click();
  await expect(pc.page.locator(".set-layout .warn-note")).toContainText("한 글자 이상");
  await pc.page.locator(".set-layout #name-in").fill("하늘");
  await pc.page.locator(".set-layout").getByRole("button", { name: "저장", exact: true }).click();
  await expect(pc.page.locator(".set-layout .acct")).toContainText("하늘");
  await expect.poll(async () => (await (await adminGet("teachers/" + uid + "/profile/me")).json()).fields.name.stringValue).toBe("하늘");
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  // 승인 없이 PIN 연결 자리를 열어요
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(pc.page.locator(".conn-pop .pair-state")).toContainText("연결 기다리는 중", { timeout: 15000 });
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  // 자기 설정에 없는 PIN 자리는 서버가 거절해요(한 계정이 여러 PIN을 맡아 두지 못하게)
  const other = unusedPin();
  const tried = await pc.page.evaluate(async (p) => { const db = await window.claude.use("db"); try { await db.pair.open(p); return "ok"; } catch (e) { return e.code || String(e); } }, other);
  expect(tried).toBe("permission-denied");
  expect((await adminGet("pins/" + other)).status).toBe(404);
  expect(real(errors)).toEqual([]);
});

test("지금 실제로 배포된 규칙(PR #4)과 함께 써도: 새 준비 상태 쓰기는 한 번 거절되면 멈추고, PC 시작 · 휴대폰 넘기기는 그대로예요. 표시 이름을 읽지 못해도 ‘없다’고 잘못 묻지 않아요", async ({ browser }) => {
  // 실제 프로젝트에는 새 규칙을 아직 배포하지 않아요. 그 규칙 사본(tests/fixtures/deployed-pr4.rules, sha256 72ebdc4d…)을 다른 가짜 프로젝트에 넣어요
  const OLD = "demo-navi-old", cfg = configFor(OLD, false);
  const put = await fetch("http://" + EMU + "/emulator/v1/projects/" + OLD + ":securityRules", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: readFileSync("tests/fixtures/deployed-pr4.rules", "utf8") }] } }) });
  expect(put.ok).toBe(true);
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors, cfg);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  await pc.page.waitForTimeout(2000);
  const w0 = await pc.page.evaluate(() => window.__naviWrites || 0);
  for (let i = 0; i < 6; i++) await pc.page.getByRole("tab", { name: i % 2 ? "수업 준비" : "발표 설정" }).click();
  await pc.page.waitForTimeout(1000);
  expect(await pc.page.evaluate(() => window.__naviWrites || 0)).toBe(w0);
  await expect(pc.page.locator(".name-ask")).toHaveCount(0);
  // PIN 4자리 연결은 보이지 않아요(이 배포에서는 꺼져 있어요). QR에도 교사 표시(?t=)가 없어요
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(pc.page.locator(".conn-pop")).not.toContainText("PIN 4자리로 연결");
  await expect(pc.page.locator(".conn-pop .pin-block")).toHaveCount(0);
  await expect.poll(() => pc.page.evaluate(() => window.__qrText || "")).toMatch(/\/#remote-\d{4}$/);
  const url = await pc.page.evaluate(() => window.__qrText);
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  const ph = await device(browser, PHONE, errors, cfg);
  await ph.page.goto(url);
  await expect(ph.page.getByRole("button", { name: /PIN 4자리로 연결/ })).toHaveCount(0);
  await signIn(ph.page, who);
  await expect(ph.page.locator(".remote.wait")).toBeVisible();
  // PC에서 시작하고 휴대폰으로 넘기는 기존 방법
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  expect(real(errors)).toEqual([]);
});

// 운영 배포 순서(2026-11-12, docs/STABILITY.md 7): 지금 운영 규칙은 main의 규칙(2026-11-04 배포, sha256 d82d1828…)이에요.
// 그 사본을 다른 가짜 프로젝트에 넣고, 이 앱만 먼저 올렸을 때 무엇이 되고 무엇이 안 되는지 봐요. 안 되는 것도 화면이 그대로 말해야 해요
test("지금 운영 규칙(2026-11-04)에 이 앱만 먼저 올리면: 예시 수업은 PC 시작 · 휴대폰 넘기기가 되고 기록은 이 브라우저에 남아 ‘계정에 저장하지 못했어요’라고 말해요. 내 수업은 ‘저장 안 됨’이고, 휴대폰은 PC의 장면을 받지 못한 채 다른 장면을 보여 주거나 넘기지 않아요(그래서 규칙을 먼저 올려요)", async ({ browser }) => {
  const LIVE = "demo-navi-live", cfg = configFor(LIVE, false);
  const rules = readFileSync("tests/fixtures/deployed-2026-11-04.rules", "utf8");
  expect(createHash("sha256").update(rules).digest("hex").slice(0, 16), "운영 배포 기록(docs/PREVIEW-PR5.md)의 지문").toBe("d82d18285c724423");
  const put = await fetch("http://" + EMU + "/emulator/v1/projects/" + LIVE + ":securityRules", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
  expect(put.ok).toBe(true);
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors, cfg);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  const uid = await uidAfterSignIn(pc.page);
  await pcLinked(pc.page);
  await toFlow(pc.page);
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect.poll(() => pc.page.evaluate(() => window.__qrText || "")).toMatch(/\/#remote-\d{4}$/);
  const url = await pc.page.evaluate(() => window.__qrText);
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  const ph = await device(browser, PHONE, errors, cfg);
  await ph.page.goto(url);
  await signIn(ph.page, who);
  await expect(ph.page.locator(".remote.wait")).toBeVisible();

  // 1) 예시 수업: 세션 칸이 예전과 같아서(영상 표시 vid 없음) 예전 규칙도 받아요
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.keyboard.press("End");
  await finishLesson(pc.page);
  // 기록: 계정(records)은 아직 없는 자리라 거절 → 이 브라우저에 1건이 남고, 화면이 그대로 말해요
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장하지 못했어요", { timeout: 15000 });
  expect((await idbRecords(pc.page, "navi-local-" + uid)).length).toBe(1);

  // 2) 내 수업: 계정의 내 수업(decks) · 지금 수업(kind mine)이 거절 → ‘저장 안 됨’
  await pc.page.getByRole("button", { name: "새 수업 준비" }).click();
  await pc.page.locator('[data-act="reset"]').click();
  await videoLesson(pc.page);
  await expect(pc.page.locator(".sbar")).toContainText("저장 안 됨");
  // 앞 수업의 수업 화면 창이 아직 열려 있어서 그 창에 그대로 띄워요
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  await expect(curLabel(pc.page)).toHaveText("영상 장면");
  await expect(stageLabel(stage)).toHaveText("영상 장면");
  // 휴대폰은 PC의 이 수업을 받지 못했어요: 예시 수업의 장면을 지어내 보여 주지 않고, 넘기는 단추도 없어요
  const lost = ph.page.locator(".remote [role=status]").filter({ hasText: "교사 PC의 지금 장면을 아직 받지 못했어요" });
  await expect(lost).toBeVisible();
  await expect(curLabel(ph.page)).toHaveCount(0);
  await expect(ph.page.locator('[data-act="next"]')).toHaveCount(0);
  // PC에서 넘기면 PC · 수업 화면은 이어지고, 휴대폰은 그대로 ‘받지 못했어요’예요(첫 장면으로 되돌리지 않아요)
  await nextBtn(pc.page).click();
  await expect(curLabel(pc.page)).toHaveText("둘째 장면");
  await expect(stageLabel(stage)).toHaveText("둘째 장면");
  await ph.page.waitForTimeout(1500);
  await expect(lost).toBeVisible();
  await expect(curLabel(pc.page)).toHaveText("둘째 장면");
  expect(real(errors)).toEqual([]);
});

test("Firestore에 닿지 못한 채 열면: 로그인은 확인돼도 ‘연결됨’이라고 하지 않고(연결하는 중), 표시 이름을 ‘없다’고 묻지 않고, 아무것도 쓰지 않아요. 연결이 돌아온 뒤 다시 열면 이어져요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  await expect(pc.page.locator(".name-ask")).toBeVisible();
  // Firestore 서버로 가는 요청만 끊고(로그인 서버는 그대로) 다시 열어요
  const fsHost = new RegExp(EMU.replace(/[.]/g, "\\.") + "/");
  await pc.ctx.route(fsHost, (r) => r.abort("internetdisconnected"));
  await pc.page.reload();
  const linkState = pc.page.locator(".side-foot .dstate").filter({ hasText: "모바일 리모컨" });
  await expect(linkState).toContainText("연결하는 중");
  await pc.page.waitForTimeout(3000);
  await expect(linkState).not.toContainText("연결됨");
  await expect(pc.page.locator(".name-ask")).toHaveCount(0);
  expect(await pc.page.evaluate(() => window.__naviWrites || 0)).toBe(0);
  // 연결이 돌아오면 다시 열어 이어져요(서버가 ‘이름 없음’이라고 답한 뒤에만 다시 물어요)
  await pc.ctx.unroute(fsHost);
  await pc.page.reload();
  await pcLinked(pc.page);
  await expect(pc.page.locator(".name-ask")).toBeVisible();
  expect(real(errors)).toEqual([]);
});
