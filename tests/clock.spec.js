// 수업 시계 · 기록 시간(2026-11-23, PR #27 · docs/CLASS-CLOCK.md): 끊김 · 새로고침 · 동시 조작 · 시계 변경 · 멈춤에서
// 실제 경과 시간(시험 실행기의 시계)과 교사 PC · 휴대폰에 보이는 수업 시간, 저장된 기록 시간을 비교해요.
// 기준: 화면은 ±1초(분:초 표시라 1초 단위), 기록 전체는 ±1.5초(시작 · 끝 누름의 지연 포함), 장면 합 = 전체(0.1초 단위), 음수 장면 없음.
// 각 시험은 잰 값을 annotation(‘시간’)으로 남겨요(PR 설명의 수정 전후 표). 실제 Windows 절전은 자동화로 만들 수 없어 여기서는
// 탭 멈춤 + 끊김으로 흉내만 내요(실제 절전은 docs/CLASS-CLOCK.md의 실기기 확인 방법)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LABELS, watch, curLabel, nextBtn, finishLesson, localRecords, toFlow } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, uidAfterSignIn, readDoc, configFor } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|Failed to fetch|Load failed/.test(e));
const secs = (t) => { const [m, s] = t.trim().split(":").map(Number); return m * 60 + s; };
const shown = async (page) => secs(await page.locator(".js-elapsed").first().innerText());
const since = (t0) => (Date.now() - t0) / 1000;
const tenths = (x) => Math.round(x * 10);
const note = (row) => test.info().annotations.push({ type: "시간", description: JSON.stringify(row) });
// 화면의 수업 시간 − 실제 경과(둘 다 초 단위로 내림): 0이면 맞아요
async function off(page, t0) { const s = await shown(page); return s - Math.floor(since(t0)); }
// 이 기기의 Date.now를 바꿀 수 있게(시스템 시계 변경 · 기기 시계 차이 흉내). performance.now(단조 시계)는 그대로예요
const skewable = (ctx, ms) => ctx.addInitScript((ms) => { window.__skew = ms || 0; const realNow = Date.now.bind(Date); Date.now = () => realNow() + (window.__skew || 0); }, ms || 0);

async function teacherPc(browser, errors, skew) {
  const pc = await device(browser, PC, errors);
  if (skew !== undefined) await skewable(pc.ctx, skew);
  pc.who = email("clock");
  await pc.page.goto("/");
  await signIn(pc.page, pc.who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  pc.url = await qrUrl(pc.page);
  pc.pin = pc.url.match(/#remote-(\d{4})/)[1];
  return pc;
}
async function phoneOf(browser, errors, pc, skew) {
  if (skew === undefined) return phoneJoins(browser, errors, pc.url, pc.who);
  const ph = await device(browser, PHONE, errors);
  await skewable(ph.ctx, skew);
  await ph.page.goto(pc.url);
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toBeVisible();
  await signIn(ph.page, pc.who);
  return ph;
}
async function startClass(pc, errors) {
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  const t0 = Date.now();
  watch(stage, errors);
  pc.stage = stage;
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  // 수업 시작이 서버에 닿은 뒤부터 재요(끊김 시험이 시작 쓰기를 끊지 않게)
  await readDoc(pc.page, "sessions/s" + pc.pin, { started: true });
  return t0;
}
async function endClass(pc, t0) {
  const a = Date.now();
  await finishLesson(pc.page);
  const b = Date.now();
  await expect(pc.page.locator(".memo-sheet")).toBeVisible();
  await expect.poll(async () => (await localRecords(pc.page)).length).toBeGreaterThan(0);
  return ((a + b) / 2 - t0) / 1000;
}
// 가장 최근 기록과 그 검사(전체 · 장면 합 · 음수 · 끝 − 시작)
async function lastRecord(page) { const all = await localRecords(page); return all.sort((x, y) => (y.at || 0) - (x.at || 0))[0]; }
function recCheck(r, realSec) {
  const sum = r.scenes.reduce((a, x) => a + tenths(x.sec || 0), 0);
  return {
    real: Math.round(realSec * 10) / 10, total: r.totalSec, err: Math.round((r.totalSec - realSec) * 10) / 10,
    sumIsTotal: sum === tenths(r.totalSec), negative: r.scenes.filter((x) => (x.sec || 0) < 0).map((x) => x.sec),
    endMinusStart: Math.round((r.endAt - r.startAt) / 100) / 10
  };
}
function recOk(c, tol) {
  expect(c.negative, "음수 장면 시간").toEqual([]);
  expect(c.sumIsTotal, "장면 합 = 전체(0.1초)").toBe(true);
  expect(Math.abs(c.err), "기록 전체 − 실제 경과").toBeLessThanOrEqual(tol || 1.5);
}
const sheetBtn = (page) => page.locator('.thumb-nav [data-act="sheet"]');
// 계정에 있는 기록 하나(서버가 확인한 값, 없으면 null)
const acctRec = (page, id) => page.evaluate(async (id) => {
  const db = await window.claude.use("db");
  return new Promise((res) => { const off = db.doc("records/" + id).onSnapshot((s) => { if (s.metadata.fromCache || s.metadata.hasPendingWrites) return; off(); res(s.exists ? s.data() : null); }, () => res(null)); });
}, id);

test("시계 1 · 정상 연결: PC와 휴대폰이 번갈아 넘겨도 두 화면 · 기록이 실제 시간과 같아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  for (let i = 1; i <= 6; i++) {
    await nextBtn(i % 2 ? ph.page : pc.page).click();
    await expect(curLabel(pc.page)).toHaveText(LABELS[i]);
    await expect(curLabel(ph.page)).toHaveText(LABELS[i]);
    await pc.page.waitForTimeout(1500);
  }
  const row = { pc: await off(pc.page, t0), phone: await off(ph.page, t0) };
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "정상" }, row, rec));
  expect(Math.abs(row.pc)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.phone)).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 2 · 휴대폰 끊김 → PC가 넘김 → 다시 연결: 휴대폰 시계가 끊긴 만큼 늦지 않고, 그 뒤 휴대폰이 넘겨도 기록이 맞아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  await ph.ctx.setOffline(true);
  await nextBtn(pc.page).click();
  await pc.page.waitForTimeout(12000);
  await ph.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 30000 });
  await ph.page.waitForTimeout(2500);
  const row = { phoneAfter: await off(ph.page, t0), pcAfter: await off(pc.page, t0) };
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2]);
  await pc.page.waitForTimeout(2000);
  row.phoneMoved = await off(ph.page, t0); row.pcMoved = await off(pc.page, t0);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "휴대폰 끊김" }, row, rec));
  for (const k of ["phoneAfter", "pcAfter", "phoneMoved", "pcMoved"]) expect(Math.abs(row[k]), k).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 3 · PC 끊김 → 휴대폰이 두 번 넘김 → 다시 연결: PC 시계 · 기록이 끊긴 만큼 짧아지지 않아요(기록 한 건)", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  await pc.ctx.setOffline(true);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(4000);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await ph.page.waitForTimeout(8000);
  await pc.ctx.setOffline(false);
  await expect(curLabel(pc.page)).toHaveText(LABELS[2], { timeout: 30000 });
  await pc.page.waitForTimeout(2500);
  const row = { pcAfter: await off(pc.page, t0), phoneAfter: await off(ph.page, t0) };
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[3]);
  await pc.page.waitForTimeout(2000);
  row.pcMoved = await off(pc.page, t0); row.phoneMoved = await off(ph.page, t0);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "PC 끊김" }, row, rec));
  for (const k of ["pcAfter", "phoneAfter", "pcMoved", "phoneMoved"]) expect(Math.abs(row[k]), k).toBeLessThanOrEqual(1);
  recOk(rec);
  expect((await localRecords(pc.page)).length, "기록 한 건").toBe(1);
  expect(real(errors)).toEqual([]);
});

test("시계 4 · PC 새로고침 → 이어서 하기: 시계 · 기록이 새로고침 전후로 이어져요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(2000);
  await pc.page.reload();
  const offer = pc.page.locator(".run-offer");
  await expect(offer).toContainText("끝나지 않은 수업이 있어요", { timeout: 20000 });
  await offer.getByRole("button", { name: "이어서 하기" }).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(2000);
  const row = { pcAfter: await off(pc.page, t0), phoneAfter: await off(ph.page, t0) };
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2]);
  await pc.page.waitForTimeout(2000);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "새로고침" }, row, rec));
  expect(Math.abs(row.pcAfter)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.phoneAfter)).toBeLessThanOrEqual(1);
  recOk(rec);
  expect((await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("시계 5 · PC 멈춤(절전 흉내: 탭 멈춤 + 끊김 20초) 동안 휴대폰이 넘김 → 돌아온 뒤: PC 시계 · 기록이 맞아요(실제 절전은 실기기 확인)", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  const cdp = await pc.ctx.newCDPSession(pc.page);
  await pc.ctx.setOffline(true);
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(20000);
  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await pc.ctx.setOffline(false);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1], { timeout: 30000 });
  await pc.page.waitForTimeout(2500);
  const row = { pcAfter: await off(pc.page, t0), phoneAfter: await off(ph.page, t0) };
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await pc.page.waitForTimeout(2000);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "멈춤 흉내" }, row, rec));
  expect(Math.abs(row.pcAfter)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.phoneAfter)).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 6 · 동시 조작: PC와 휴대폰이 같은 순간 넘기기를 여러 번 해도 두 화면이 같고, 기록에 음수가 없고 합 = 전체", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  for (let i = 0; i < 4; i++) {
    await Promise.all([nextBtn(pc.page).click(), nextBtn(ph.page).click()]);
    await pc.page.waitForTimeout(2000);
    await expect.poll(async () => (await curLabel(pc.page).innerText()) === (await curLabel(ph.page).innerText()), { timeout: 15000 }).toBe(true);
  }
  const row = { pc: await off(pc.page, t0), phone: await off(ph.page, t0) };
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "동시 조작" }, row, rec));
  expect(Math.abs(row.pc)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.phone)).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 7 · 이전 수업과 새 수업: 끝낸 뒤 바로 새 수업을 시작하면 새 수업 시간은 0부터, 기록은 수업마다 따로 한 건씩", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const a0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(3000);
  const ra = await endClass(pc, a0);
  const recA = recCheck(await lastRecord(pc.page), ra);
  // 새 수업: 수업 준비로 → 수업 시작(앞 수업 화면을 비워요)
  await pc.page.locator('.memo-sheet [data-act="reset-ask"]').click();
  await pc.page.locator('[data-act="reset"]').click();
  await toFlow(pc.page);
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  const b0 = Date.now();
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  const row = { pcB: await off(pc.page, b0), phoneB: await off(ph.page, b0) };
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(2000);
  const rb = await endClass(pc, b0);
  const all = await localRecords(pc.page);
  const recB = recCheck(await lastRecord(pc.page), rb);
  note(Object.assign({ case: "이전 · 새 수업" }, row, { recA, recB, records: all.length }));
  expect(Math.abs(row.pcB)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.phoneB)).toBeLessThanOrEqual(1);
  recOk(recA); recOk(recB);
  expect(all.length).toBe(2);
  expect(new Set(all.map((r) => r.id)).size).toBe(2);
  expect(real(errors)).toEqual([]);
});

test("시계 8 · 낡은 PC 쓰기: PC가 끊긴 동안 휴대폰이 두 번 넘기고 PC도 옛 장면에서 넘기고 신호를 눌러도, 이어진 뒤 휴대폰 진행이 남고 PC는 반영하지 않은 것을 알려요(새로고침 뒤에도). 신호는 남고 기록은 한 건", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  await pc.ctx.setOffline(true);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(3000);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await ph.page.waitForTimeout(2000);
  // PC는 아직 첫 장면이라고 알아요: 신호(빨강)를 누르고 다음 장면으로
  await pc.page.locator(".sig.s-red").first().click();
  await nextBtn(pc.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(3000);
  await pc.ctx.setOffline(false);
  // 휴대폰이 넘긴 장면이 남아요(되돌아가지 않아요)
  await pc.page.waitForTimeout(6000);
  const row = { pcLabel: await curLabel(pc.page).innerText(), phoneLabel: await curLabel(ph.page).innerText(), want: LABELS[2] };
  row.pcAfter = await off(pc.page, t0); row.phoneAfter = await off(ph.page, t0);
  const held = pc.page.locator(".clk-held");
  row.notice = (await held.count()) ? await held.first().innerText() : "";
  // 새로고침해도 알림이 남아요
  await pc.page.reload();
  const offer = pc.page.locator(".run-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await offer.getByRole("button", { name: "이어서 하기" }).click();
  row.noticeAfterReload = (await pc.page.locator(".clk-held").count()) > 0;
  const rs = await endClass(pc, t0);
  const r = await lastRecord(pc.page);
  const rec = recCheck(r, rs);
  row.red = (r.events || []).filter((e) => e.type === "red").length;
  note(Object.assign({ case: "낡은 PC 쓰기" }, row, rec));
  expect(row.pcLabel, "PC가 휴대폰 진행을 따라가요").toBe(LABELS[2]);
  expect(row.phoneLabel, "휴대폰 진행이 남아요").toBe(LABELS[2]);
  expect(row.notice).toContain("반영하지 않았어요");
  expect(row.noticeAfterReload).toBe(true);
  expect(row.red, "끊긴 동안 누른 신호").toBe(1);
  recOk(rec);
  expect((await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("시계 9 · PC 시스템 시계가 수업 중 −60초 · +60초 바뀜: 수업 시계가 거꾸로 가거나 튀지 않고, 장면 시간이 음수가 되지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors, 0);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(4000);
  await pc.page.evaluate(() => { window.__skew = -60000; });
  await pc.page.waitForTimeout(2500);
  const row = { pcBack: await off(pc.page, t0) };
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(2500);
  row.phoneBack = await off(ph.page, t0);
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2]);
  await pc.page.evaluate(() => { window.__skew = 0; });
  await pc.page.waitForTimeout(3500);
  row.pcFwd = await off(pc.page, t0);
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[3]);
  await pc.page.waitForTimeout(2500);
  row.phoneFwd = await off(ph.page, t0);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "PC 시계 ∓60초" }, row, rec));
  for (const k of ["pcBack", "phoneBack", "pcFwd", "phoneFwd"]) expect(Math.abs(row[k]), k).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 10 · 휴대폰 기기 시계가 12초 늦고 30초 빠를 때: 휴대폰 화면 · 휴대폰이 넘긴 장면의 기록이 맞아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const slow = await phoneOf(browser, errors, pc, -12000);
  const fast = await phoneOf(browser, errors, pc, 30000);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(slow.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await expect(curLabel(fast.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  const row = { slow: await off(slow.page, t0), fast: await off(fast.page, t0) };
  await nextBtn(slow.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(3000);
  await nextBtn(fast.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2]);
  await pc.page.waitForTimeout(3000);
  row.pc = await off(pc.page, t0); row.slowMoved = await off(slow.page, t0); row.fastMoved = await off(fast.page, t0);
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "휴대폰 시계 −12 · +30초" }, row, rec));
  for (const k of ["slow", "fast", "pc", "slowMoved", "fastMoved"]) expect(Math.abs(row[k]), k).toBeLessThanOrEqual(1);
  recOk(rec);
  expect(real(errors)).toEqual([]);
});

test("시계 11 · 1초 미만 빠른 이동 20번: 기록 전체 = 장면 합 = 끝 − 시작(0.1초 단위), 짧은 장면이 0으로 사라지지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const t0 = await startClass(pc, errors);
  await pc.page.waitForTimeout(1500);
  for (let k = 0; k < 20; k++) { await pc.page.keyboard.press(k % 2 ? "PageUp" : "PageDown"); await pc.page.waitForTimeout(300); }
  await pc.page.waitForTimeout(1500);
  const rs = await endClass(pc, t0);
  const r = await lastRecord(pc.page);
  const rec = recCheck(r, rs);
  note(Object.assign({ case: "빠른 이동" }, rec, { scenes: r.scenes.map((x) => x.sec) }));
  recOk(rec);
  expect(Math.abs(rec.total - rec.endMinusStart), "전체 = 끝 − 시작").toBeLessThanOrEqual(0.1);
  expect(r.scenes[1].sec, "0.3초씩 머문 장면도 남아요").toBeGreaterThan(0);
  expect(real(errors)).toEqual([]);
});

test("시계 12 · PIN 휴대폰이 끊긴 동안 PC가 넘김 → 다시 연결된 뒤 휴대폰의 넘기기가 ‘늦은 명령’으로 거절되지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  await toFlow(pc.page);
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(pc.page.locator(".conn-pop .pair-state")).toContainText("연결 기다리는 중");
  const ph = await device(browser, PHONE, errors);
  await ph.page.goto(pc.url);
  await ph.page.getByRole("button", { name: /PIN 4자리로 연결/ }).click();
  await expect(pc.page.locator(".conn-pop .ask-row")).toHaveCount(1);
  await Promise.all([ph.page.waitForEvent("load"), pc.page.locator('.conn-pop .ask-row [data-act="pair-allow"]').click()]);
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await ph.ctx.setOffline(true);
  await nextBtn(pc.page).click();
  await pc.page.waitForTimeout(12000);
  await ph.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 30000 });
  await ph.page.waitForTimeout(2500);
  const row = { phoneAfter: await off(ph.page, t0) };
  const got = [];
  for (const n of [2, 3]) {
    await nextBtn(ph.page).click();
    await pc.page.waitForTimeout(5500);
    got.push(await curLabel(pc.page).innerText());
  }
  row.pcLabels = got;
  note(Object.assign({ case: "PIN 휴대폰" }, row));
  expect(Math.abs(row.phoneAfter)).toBeLessThanOrEqual(1);
  expect(got).toEqual([LABELS[2], LABELS[3]]);
  expect(real(errors)).toEqual([]);
});

test("시계 13 · 휴대폰이 끊겼다 이어진 뒤 켠 타이머: 교사 PC와 수업 화면의 남은 시간이 맞아요(끊긴 만큼 짧아지지 않음)", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await ph.ctx.setOffline(true);
  await nextBtn(pc.page).click();
  await pc.page.waitForTimeout(12000);
  await ph.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 30000 });
  await ph.page.waitForTimeout(2500);
  await sheetBtn(ph.page).click();
  await ph.page.locator('[data-act="tool-timer"][data-v="60"]').first().click();
  const tap = Date.now();
  const timer = pc.stage.locator(".js-tool-timer");
  await expect(timer).toBeVisible({ timeout: 15000 });
  await pc.page.waitForTimeout(1000);
  const left = secs(await timer.innerText()), want = 60 - Math.floor((Date.now() - tap) / 1000);
  note({ case: "휴대폰 타이머", left, want, err: left - want });
  expect(Math.abs(left - want)).toBeLessThanOrEqual(1);
  expect(real(errors)).toEqual([]);
});

// ---------- 호환: 예전 앱 · 다른 창의 쓰기는 시계 표본이 아니에요. 새 앱 + 지금 운영 규칙(by를 모름)에서도 수업은 그대로 ----------
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
const adminPatch = (p, fields) => fetch(docUrl(p) + "?" + Object.keys(fields).map((k) => "updateMask.fieldPaths=" + k).join("&"), {
  method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields }) });
const num = (n) => ({ integerValue: String(Math.round(n)) });
const byOf = (pc, at) => ({ mapValue: { fields: { pc: { stringValue: pc }, at: num(at) } } });

test("시계 14 · 예전 앱처럼 at만 바꾼 쓰기(by.at ≠ at)와 다른 창의 by(by.pc ≠ hub.pc)는 시계 표본이 아니에요: 30초 늦은 시각이 와도 휴대폰 시계가 튀지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  const path = "teachers/" + pc.uid + "/sessions/s" + pc.pin;
  // 예전 앱 PC: 장면을 넘기며 at · enteredAt을 자기 시계(30초 늦음)로 쓰고, 서버에서 받은 by를 그대로 다시 실어요
  const late = Date.now() - 30000;
  expect((await adminPatch(path, { cur: { stringValue: "s2" }, enteredAt: num(late), at: num(late), by: byOf("old-window", late - 5000) })).ok).toBe(true);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(2000);
  const row = { oldApp: await off(ph.page, t0) };
  // 다른 창이 쓴 by(지금 맡은 창이 아님)
  const late2 = Date.now() - 30000;
  expect((await adminPatch(path, { cur: { stringValue: "s3" }, enteredAt: num(late2), at: num(late2), by: byOf("other-window", late2) })).ok).toBe(true);
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await ph.page.waitForTimeout(2000);
  row.otherWindow = await off(ph.page, t0);
  note(Object.assign({ case: "예전 앱 · 다른 창의 쓰기" }, row));
  expect(Math.abs(row.oldApp)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.otherWindow)).toBeLessThanOrEqual(1);
  expect(real(errors)).toEqual([]);
});

test("시계 15 · 새 앱 + 지금 운영 규칙(by를 모름, 2026-11-15 배포본): PC의 수업 쓰기가 by 때문에 거절되면 by 없이 다시 보내 수업 · 휴대폰 넘기기 · 기록이 그대로예요", async ({ browser }) => {
  const PREV = "demo-navi-prev", cfg = configFor(PREV, true);
  const rules = readFileSync("tests/fixtures/deployed-2026-11-15.rules", "utf8");
  expect(createHash("sha256").update(rules).digest("hex").slice(0, 16), "main 6bf6c13의 규칙(운영과 같은 판)").toBe("1f09270f50a822a3");
  const put = await fetch("http://" + EMU + "/emulator/v1/projects/" + PREV + ":securityRules", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
  expect(put.ok).toBe(true);
  const errors = [], who = email("clock-prev");
  const pc = await device(browser, PC, errors, cfg);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await uidAfterSignIn(pc.page);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  const ph = await device(browser, PHONE, errors, cfg);
  await ph.page.goto(url);
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toBeVisible();
  await signIn(ph.page, who);
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  const t0 = Date.now();
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  const row = { pc: await off(pc.page, t0), phone: await off(ph.page, t0) };
  const rs = await endClass(pc, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "새 앱 + 지금 운영 규칙" }, row, rec));
  recOk(rec);
  expect(Math.abs(row.pc)).toBeLessThanOrEqual(1);
  expect(real(errors).filter((e) => !/permission|insufficient/i.test(e))).toEqual([]);
});

test("시계 16 · PC가 끊긴 채 끝냄 → 그 사이 휴대폰이 누른 신호: 이어진 뒤 서버의 마지막 수업으로 같은 기록을 다시 저장해요(기록 한 건, 신호 포함, 시간 그대로)", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  await pc.ctx.setOffline(true);
  // 휴대폰은 연결된 채 노랑을 눌러요(PC는 아직 몰라요)
  await ph.page.locator(".thumb-nav .sig.s-yellow").click();
  await ph.page.waitForTimeout(2000);
  const rs = await endClass(pc, t0);
  const first = await lastRecord(pc.page);
  const yellow = (r) => (r.events || []).filter((e) => e.type === "yellow").length;
  const row = { yellowAtEnd: yellow(first) };
  await pc.ctx.setOffline(false);
  await expect.poll(async () => yellow(await lastRecord(pc.page)), { timeout: 30000 }).toBe(1);
  const r = await lastRecord(pc.page);
  const rec = recCheck(r, rs);
  row.yellowAfter = yellow(r); row.sameId = r.id === first.id;
  // 계정 기록(teachers/{UID}/records/r-…)도 마지막 수업 그대로예요. 계정 기록은 메모 · 휴지통만 고칠 수 있어서(규칙), 처음 저장이 마지막 수업이어야 해요
  const aid = "r-" + r.id.slice("local-".length);
  await expect.poll(async () => { const d = await acctRec(pc.page, aid); return d ? yellow(d) : -1; }, { timeout: 30000, message: "계정 기록에도 노랑" }).toBe(1);
  const acct = await acctRec(pc.page, aid);
  row.acctYellow = yellow(acct); row.acctTotal = acct.totalSec;
  await expect(pc.page.locator(".memo-sheet")).not.toContainText("계정에 저장하지 못했어요");
  note(Object.assign({ case: "끊긴 채 끝냄 · 휴대폰 신호" }, row, rec));
  expect(row.sameId, "같은 기록을 다시 저장").toBe(true);
  expect(acct.totalSec, "계정 기록 = 이 브라우저 기록").toBe(r.totalSec);
  recOk(rec);
  expect((await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("시계 17 · 끊긴 PC가 옛 장면에서 화면을 가림 → 그 사이 휴대폰이 넘김: 가림은 반영하지 않고 알려요, [다시 띄우기]로 지금 장면에 다시 가려요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(1500);
  await pc.ctx.setOffline(true);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(1500);
  // PC는 아직 첫 장면이라고 알아요: 화면 가리기(B)
  await pc.page.keyboard.press("b");
  await expect(pc.stage.locator(".blankout.black")).toBeVisible();
  await pc.page.waitForTimeout(2000);
  await pc.ctx.setOffline(false);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1], { timeout: 30000 });
  const held = pc.page.locator(".clk-held");
  await expect(held).toContainText("띄운 것은 반영하지 않았어요", { timeout: 15000 });
  await expect(pc.stage.locator(".blankout")).toHaveCount(0);
  await held.getByRole("button", { name: "다시 띄우기" }).click();
  await expect(pc.stage.locator(".blankout.black")).toBeVisible();
  await expect(held).toHaveCount(0);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  note({ case: "끊긴 PC의 화면 가림", notice: true, again: true });
  expect(real(errors)).toEqual([]);
});

// ---------- 독립 리뷰에서 찾은 것(2026-11-23) ----------
test("시계 18 · 수업 중에 새로 연 휴대폰(시계 30초 빠름, 아직 못 맞춤)이 넘긴 뒤 PC가 쓰면: 그 시각은 표본이 아니라 다른 휴대폰 시계가 끌려가지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const b = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(b.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(2000);
  // 수업 중에 연 휴대폰: 첫 값은 건너뛰고, PC가 아직 아무것도 쓰지 않아 자기 시계(30초 빠름)로 넘겨요
  const a = await phoneOf(browser, errors, pc, 30000);
  await expect(curLabel(a.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(a.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1], { timeout: 20000 });
  // 곧바로 PC가 신호를 눌러요: 서버의 at(휴대폰 시계)보다 뒤로 밀린 at이라 표본이 아니어야 해요
  await pc.page.locator(".pv-bar .sig.s-yellow").click();
  await expect(curLabel(b.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(3000);
  const row = { phoneB: await off(b.page, t0), pc: await off(pc.page, t0) };
  note(Object.assign({ case: "못 맞춘 휴대폰의 시각" }, row));
  expect(Math.abs(row.phoneB), "맞춰 둔 휴대폰은 그대로").toBeLessThanOrEqual(1);
  expect(Math.abs(row.pc), "PC는 그대로").toBeLessThanOrEqual(1);
  expect(real(errors)).toEqual([]);
});

test("시계 19 · 끊긴 PC가 끝내고 메모까지 씀 → 그 사이 휴대폰이 넘김: 끝내기는 반영하지 않고(수업 id · run 그대로), 다시 끝내도 교사 메모가 남고 기록은 한 건", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  const runBefore = (await readDoc(pc.page, "lessons/hub")).run;
  await pc.page.waitForTimeout(1500);
  await pc.ctx.setOffline(true);
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await ph.page.waitForTimeout(1500);
  await finishLesson(pc.page);
  await expect(pc.page.locator(".memo-sheet")).toBeVisible();
  await pc.page.locator("#memo-text").fill("[시험] 다시 볼 것");
  await pc.page.locator("#memo-text").press("Tab");
  await pc.page.waitForTimeout(800);
  await pc.ctx.setOffline(false);
  // 수업은 휴대폰이 넘긴 곳에서 이어지고, PC는 끝내기가 반영되지 않았다고 말해요
  await expect(curLabel(pc.page)).toHaveText(LABELS[1], { timeout: 30000 });
  await expect(pc.page.locator(".clk-held")).toContainText("끝내기 뒤에도", { timeout: 15000 });
  const s = await readDoc(pc.page, "sessions/s" + pc.pin, { started: true, ended: false });
  const row = { memoIdWhileRunning: s.memoId || null, runKept: (await readDoc(pc.page, "lessons/hub")).run === runBefore };
  // 휴대폰은 계속 넘길 수 있어요
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[2], { timeout: 20000 });
  const rs = await endClass(pc, t0);
  const r = await lastRecord(pc.page);
  const rec = recCheck(r, rs);
  const aid = "r-" + r.id.slice("local-".length);
  await expect.poll(async () => { const d = await acctRec(pc.page, aid); return d ? d.text : null; }, { timeout: 30000, message: "계정 기록에도 교사 메모" }).toBe("[시험] 다시 볼 것");
  row.text = r.text;
  note(Object.assign({ case: "끊긴 채 끝냄 · 메모 · 다시 끝냄" }, row, rec));
  expect(row.memoIdWhileRunning, "진행 중인 수업에는 기록 id가 없어요").toBe(null);
  expect(row.runKept, "끝나지 않은 수업의 run은 그대로").toBe(true);
  expect(r.text, "다시 끝내도 교사 메모가 남아요").toBe("[시험] 다시 볼 것");
  recOk(rec);
  expect((await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("시계 20 · 수업 중에 규칙을 예전 것(by를 모름)으로 되돌려도: by가 남은 세션에 PC 쓰기가 by를 지우고 들어가, 넘기기 · 기록이 그대로예요", async ({ browser }) => {
  const RB = "demo-navi-rb", cfg = configFor(RB, true);
  const putRules = (content) => fetch("http://" + EMU + "/emulator/v1/projects/" + RB + ":securityRules", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }) });
  expect((await putRules(readFileSync("firestore.rules", "utf8"))).ok).toBe(true);
  const errors = [], who = email("clock-rb");
  const pc = await device(browser, PC, errors, cfg);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await uidAfterSignIn(pc.page);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page), pin = url.match(/#remote-(\d{4})/)[1];
  const ph = await device(browser, PHONE, errors, cfg);
  await ph.page.goto(url);
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toBeVisible();
  await signIn(ph.page, who);
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  const t0 = Date.now();
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  const before = await readDoc(pc.page, "sessions/s" + pin);
  const row = { byBefore: !!(before && before.by) };
  // 규칙을 되돌려요(운영에서 규칙만 되돌린 경우)
  expect((await putRules(readFileSync("tests/fixtures/deployed-2026-11-15.rules", "utf8"))).ok).toBe(true);
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2], { timeout: 20000 });
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[3], { timeout: 20000 });
  const after = await readDoc(pc.page, "sessions/s" + pin, { started: true });
  row.byAfter = "by" in after;
  const rs = await endClass({ page: pc.page }, t0);
  const rec = recCheck(await lastRecord(pc.page), rs);
  note(Object.assign({ case: "규칙 되돌림 · by가 남은 세션" }, row, rec));
  expect(row.byBefore, "새 규칙에서는 by가 있어요").toBe(true);
  expect(row.byAfter, "되돌린 규칙에서는 by가 지워져요").toBe(false);
  recOk(rec);
  expect(real(errors).filter((e) => !/permission|insufficient/i.test(e))).toEqual([]);
});

test("시계 21 · 서버는 받았는데 답만 잃은 PC 쓰기(다시 보냄): 이미 들어간 넘기기를 ‘반영하지 않았어요’라고 잘못 말하지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors);
  const ph = await phoneOf(browser, errors, pc);
  await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(1500);
  // 다음 한 번의 저장(commit)은 서버에 닿게 두고, PC에는 답 대신 끊김을 줘요
  let lost = 0;
  await pc.page.route(/documents:commit/, async (route) => {
    if (lost) return route.continue();
    lost++;
    await route.fetch();
    await route.abort("internetdisconnected");
  });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  await pc.page.waitForTimeout(5000);
  const row = { lost, pc: await curLabel(pc.page).innerText(), notice: await pc.page.locator(".clk-held").count() };
  note(Object.assign({ case: "답만 잃은 쓰기" }, row));
  expect(row.lost, "답을 한 번 잃었어요").toBe(1);
  expect(row.pc).toBe(LABELS[1]);
  expect(row.notice, "잘못된 알림 없음").toBe(0);
  expect(real(errors)).toEqual([]);
});

test("시계 22 · PC 시계가 앞으로 튄 바로 그때 넘김(사이트 시각 확인 전): 그 쓰기는 표본이 아니라 휴대폰 시계가 튀지 않아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherPc(browser, errors, 0);
  const ph = await phoneOf(browser, errors, pc);
  const t0 = await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  await pc.page.evaluate(() => { window.__skew = 60000; });
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  await pc.page.waitForTimeout(3000);
  const row = { phone: await off(ph.page, t0), pc: await off(pc.page, t0) };
  note(Object.assign({ case: "앞으로 튄 순간의 쓰기" }, row));
  expect(Math.abs(row.phone), "휴대폰은 그대로").toBeLessThanOrEqual(1);
  expect(Math.abs(row.pc), "PC는 사이트 시각으로 되돌려요").toBeLessThanOrEqual(1);
  expect(real(errors)).toEqual([]);
});
