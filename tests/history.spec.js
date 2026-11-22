// 수업 기록을 계정에(2026-11-12, docs/RECORDS.md): teachers/{UID}/records/r-{수업 시작 시각}. 이 브라우저에 먼저 남기고 계정에 저장해요.
// 서버가 확인하기 전에는 ‘저장했어요’라고 하지 않고, 끊겼다 이어지거나 다시 열어도 같은 기록이 두 번 생기지 않아요.
// Firebase 에뮬레이터(가짜 프로젝트 demo-navi, 가짜 계정)에서만 돌아요. 이 브라우저만의 기록 화면은 tests/records.spec.js
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { LABELS, watch, curLabel, fixture, finishLesson, idbRecords, seedRecords, oldRecord, toFlow } from "./helpers.js";
import { EMU, PROJECT, PC, needEmulator, email, device, signIn, pcLinked, teacherStarts, uidAfterSignIn, readDoc } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const ADMIN = { Authorization: "Bearer owner" };
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
// Firestore REST 값 ↔ 보통 값
const plain = (v) => {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return v;
};
const fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, plain(v)]));
const typed = (v) => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(typed) } } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typed(x)])) } };
async function acctRecs(uid) {
  const r = await fetch(docUrl("teachers/" + uid + "/records") + "?pageSize=300", { headers: ADMIN });
  const j = r.ok ? await r.json() : {};
  return (j.documents || []).map((d) => Object.assign({ id: d.name.split("/").pop() }, fields(d.fields)));
}
const adminPut = (uid, id, o) => fetch(docUrl("teachers/" + uid + "/records/" + id), { method: "PATCH", headers: Object.assign({ "content-type": "application/json" }, ADMIN), body: JSON.stringify({ fields: typed(o).mapValue.fields }) });
const accountRecord = (o) => Object.assign({ v: 3, key: "ex-s4-boiling", title: "계정 기록", grade: 4, subject: "과학", cls: "", startAt: Date.now() - 3600000, endAt: Date.now() - 1800000, at: Date.now() - 1800000,
  totalSec: 1800, plannedMin: 40, scenes: [{ id: "s1", label: "도입", min: 5, sec: 300, sig: "green" }], sig: { red: 0, yellow: 0, green: 1 }, questions: [], again: [], text: "", used: [], usedTitles: [], events: [], trashedAt: null, editedAt: null, from: "", src: "pc" }, o || {});
const records = (page) => page.locator('#records .hist[aria-label="내 수업 기록"] .rec');
const toRecords = async (page) => { await page.getByRole("tab", { name: /^수업 기록/ }).click(); await expect(page.locator("#records")).toBeVisible(); };
async function teacher(browser, errors, who) {
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  return pc;
}
async function endClass(pc) {
  await pc.page.keyboard.press("End");
  await finishLesson(pc.page);
  await expect(pc.page.locator(".memo-sheet")).toBeVisible();
}
// 이 브라우저의 기록과 계정의 기록이 같은 내용인지(주요 칸)
const core = (x) => ({ title: x.title, endAt: x.endAt || x.at, totalSec: x.totalSec, scenes: (x.scenes || []).map((s) => [s.label, s.sec, s.sig || ""]), sig: x.sig, again: x.again || [], text: x.text || "", usedTitles: x.usedTitles || [] });

test("계정에 기록: 수업을 끝내면 계정에 1건(r-수업 시작 시각), 서버가 확인한 뒤에만 ‘계정에 저장했어요’, 같은 계정의 다른 PC에서도 보이고 고친 메모가 이어져요", async ({ browser }) => {
  const errors = [], who = email("records");
  const pc = await teacherStarts(browser, errors, who);
  const uid = await uidAfterSignIn(pc.page);
  await pc.page.keyboard.press("1");
  await endClass(pc);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 15000 });
  const [doc] = await acctRecs(uid), list = await idbRecords(pc.page, "navi-local-" + uid);
  expect((await acctRecs(uid)).length).toBe(1);
  expect(list.length).toBe(1);
  expect(doc.id).toBe("r-" + list[0].id.slice("local-".length));
  expect(core(doc)).toEqual(core(list[0]));
  expect([doc.v, doc.startAt, doc.trashedAt]).toEqual([3, list[0].startAt, null]);
  expect(list[0].srvAt).toBeGreaterThan(0);
  // 같은 계정의 다른 PC: 같은 기록 1건, 메모를 고치면 첫 PC에도
  const b = await teacher(browser, errors, who);
  await toRecords(b.page);
  await b.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(b.page)).toHaveCount(1);
  await expect(records(b.page)).toContainText("계정에 저장됨");
  await records(b.page).locator(".rec-head").click();
  await records(b.page).locator("textarea[data-rec]").fill("B PC에서 남긴 메모");
  await records(b.page).locator("textarea[data-rec]").blur();
  await expect.poll(async () => (await acctRecs(uid))[0].text, { timeout: 15000 }).toBe("B PC에서 남긴 메모");
  expect((await acctRecs(uid)).length).toBe(1);
  await pc.page.getByRole("button", { name: "수업 기록 보기" }).click();
  await expect(pc.page.locator('#records .rec.open textarea[data-rec]')).toHaveValue("B PC에서 남긴 메모", { timeout: 15000 });
  expect(real(errors)).toEqual([]);
});

test("인터넷이 끊긴 채 끝내도 이 브라우저에 남고 ‘아직 계정에 저장하지 못했어요’, 창을 닫았다 다시 열면 계정에 1건만(중복 없음)", async ({ browser }) => {
  const errors = [], who = email("records-off");
  const pc = await teacherStarts(browser, errors, who);
  const uid = await uidAfterSignIn(pc.page);
  // 수업 시작이 서버에 닿은 뒤에 끊어요(이 시험은 ‘끊긴 채 끝내기’를 봐요)
  await readDoc(pc.page, "sessions/s" + pc.url.match(/#remote-(\d{4})/)[1], { started: true });
  await pc.ctx.setOffline(true);
  await endClass(pc);
  await expect(pc.page.locator(".memo-sheet .warn-note")).toContainText("인터넷이 끊겨 아직 계정에 저장하지 못했어요", { timeout: 15000 });
  await expect(pc.page.locator(".memo-sheet")).not.toContainText("계정에 저장했어요");
  expect((await idbRecords(pc.page, "navi-local-" + uid)).length).toBe(1);
  expect((await acctRecs(uid)).length).toBe(0);
  // 저장을 기다리던 창을 닫고(보내지 못한 쓰기는 사라져요), 인터넷이 돌아온 뒤 다시 열면 이 브라우저의 기록을 계정에 보내요
  await pc.stage.close().catch(() => {});
  await pc.page.close();
  await pc.ctx.setOffline(false);
  const page = await pc.ctx.newPage();
  watch(page, errors);
  await page.goto("/");
  await pcLinked(page);
  await expect.poll(async () => (await acctRecs(uid)).length, { timeout: 20000 }).toBe(1);
  const [local] = await idbRecords(page, "navi-local-" + uid);
  expect((await acctRecs(uid))[0].id).toBe("r-" + local.id.slice("local-".length));
  await page.waitForTimeout(2500);
  expect((await acctRecs(uid)).length, "같은 기록이 두 번 생겼어요").toBe(1);
  await expect.poll(async () => !!(await idbRecords(page, "navi-local-" + uid))[0].srvAt).toBe(true);
  expect(real(errors)).toEqual([]);
});

test("계정 A · B: 같은 브라우저에서 A의 기록은 B에게 보이지 않고 B 계정에도 없어요. A로 다시 로그인하면 그대로예요", async ({ browser }) => {
  const errors = [], whoA = email("rec-a"), whoB = email("rec-b");
  const pc = await teacherStarts(browser, errors, whoA);
  const uidA = await uidAfterSignIn(pc.page);
  await endClass(pc);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 15000 });
  await pc.page.getByRole("button", { name: "수업 기록 보기" }).click();
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await Promise.all([pc.page.waitForEvent("load"), pc.page.locator(".set-layout").getByRole("button", { name: "로그아웃" }).click()]);
  await signIn(pc.page, whoB);
  await pcLinked(pc.page);
  const uidB = await uidAfterSignIn(pc.page);
  await toRecords(pc.page);
  await pc.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(pc.page)).toHaveCount(0);
  await expect(pc.page.locator("#records")).toContainText("전체 0");
  expect((await acctRecs(uidB)).length).toBe(0);
  expect((await acctRecs(uidA)).length).toBe(1);
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await Promise.all([pc.page.waitForEvent("load"), pc.page.locator(".set-layout").getByRole("button", { name: "로그아웃" }).click()]);
  await signIn(pc.page, whoA);
  await pcLinked(pc.page);
  await toRecords(pc.page);
  await pc.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(pc.page)).toHaveCount(1);
  expect(real(errors)).toEqual([]);
});

test("로그인 전 기록: 고를 때만 이 계정으로 가져오고, ‘계정에 저장하기’로 계정에. 저장이 실패하면 원본은 그대로, 다시 누르면 남은 것만(중복 없음). 변환 전후 주요 정보가 같아요(0.5 · 0.6 모양)", async ({ browser }) => {
  const errors = [], who = email("rec-old");
  const v2 = JSON.parse(readFileSync(fixture("navi-local-v06.json"), "utf8")).records[0];
  const v1 = { id: "local-v1old0", key: "ex-s4-boiling", title: "아주 예전 기록", at: Date.now() - 3 * 86400000, totalSec: 1200, plannedMin: 20, again: ["다시 볼 것"], text: "예전 메모", rc: { confused: 2, good: 1, questions: 1 } };
  const pc = await device(browser, PC, errors);
  await seedRecords(pc.page, "navi-local", [v1, v2]);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const uid = await uidAfterSignIn(pc.page);
  await toRecords(pc.page);
  // 로그인했다고 저절로 가져오거나 계정에 올리지 않아요
  await expect(pc.page.locator(".old-note")).toContainText("수업 기록 2건");
  await pc.page.waitForTimeout(1500);
  expect((await acctRecs(uid)).length).toBe(0);
  await pc.page.getByRole("button", { name: "이 계정으로 가져오기" }).click();
  await pc.page.getByRole("button", { name: "가져오기", exact: true }).click();
  const up = pc.page.locator(".rec-up");
  await expect(up).toContainText("이 브라우저에만 있는 기록 2건");
  expect((await acctRecs(uid)).length, "가져오기만으로는 계정에 쓰지 않아요").toBe(0);
  // 첫 저장 하나가 거절된다고 해요(서버 오류): 원본은 그대로, 하나만 저장
  await pc.page.evaluate(async () => {
    const db = await window.claude.use("db"), doc = db.doc;
    let n = 1;
    db.doc = (p) => { const r = doc(p); if (/^records\//.test(p) && n-- > 0) r.set = () => Promise.reject(Object.assign(new Error("시험: 저장 실패"), { code: "unavailable" })); return r; };
  });
  await up.getByRole("button", { name: "계정에 저장하기" }).click();
  await expect(pc.page.locator("#records")).toContainText("2건 중 1건을 계정에 저장했어요");
  expect((await acctRecs(uid)).length).toBe(1);
  await expect(up).toContainText("이 브라우저에만 있는 기록 1건");
  const orig = await idbRecords(pc.page, "navi-local");
  expect(orig.map((x) => x.id).sort()).toEqual(["local-mvre0tzr", "local-v1old0"]);
  // 다시 누르면 남은 것만
  await up.getByRole("button", { name: "계정에 저장하기" }).click();
  await expect(pc.page.locator("#records")).toContainText("1건을 계정에 저장했어요");
  await expect(up).toHaveCount(0);
  const docs = await acctRecs(uid);
  expect(docs.map((d) => d.id).sort()).toEqual(["r-mvre0tzr", "r-v1old0"]);
  // 변환 전후: 제목 · 끝난 시각 · 걸린 시간 · 장면별 시간과 신호 · 신호 수 · 질문 · 다시 지도할 것 · 메모 · 자료
  const d2 = docs.find((d) => d.id === "r-mvre0tzr"), d1 = docs.find((d) => d.id === "r-v1old0");
  expect(core(d2)).toEqual(core(v2));
  expect(d2.questions.map((q) => [q.label, q.text])).toEqual(v2.questions.map((q) => [q.label, q.text]));
  expect([d2.startAt, d2.from, d2.src]).toEqual([null, v2.id, "old"]);
  expect(core(d1)).toEqual(Object.assign(core(v1), { sig: { red: 2, yellow: 0, green: 1 } }));
  expect(d1.questions).toEqual([{ sid: "", label: "", text: "질문이 있었어요" }]);
  // 이 브라우저의 원본(로그인 전 칸)은 지우지 않았어요
  const still = await idbRecords(pc.page, "navi-local");
  expect(still.find((x) => x.id === v2.id).title).toBe(v2.title);
  // 화면: 두 기록이 한 번씩, 계정에 저장됨
  await pc.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(pc.page)).toHaveCount(2);
  await expect(records(pc.page).filter({ hasText: "계정에 저장됨" })).toHaveCount(2);
  expect(real(errors)).toEqual([]);
});

test("휴지통(계정): 휴지통으로 옮기면 다른 PC에서도 휴지통, 되살리면 같은 id · 같은 내용. 휴지통에 30일 넘은 기록은 계정을 열 때 영구 삭제, 29일은 남아요", async ({ browser }) => {
  const errors = [], who = email("rec-trash"), day = 86400000;
  const a = await teacher(browser, errors, who);
  await adminPut(a.uid, "r-trash31d", accountRecord({ title: "31일 된 휴지통", trashedAt: Date.now() - 31 * day }));
  await adminPut(a.uid, "r-trash29d", accountRecord({ title: "29일 된 휴지통", trashedAt: Date.now() - 29 * day }));
  await adminPut(a.uid, "r-keep0001", accountRecord({ title: "계정 기록 하나", endAt: Date.now() - 7200000, at: Date.now() - 7200000 }));
  await a.page.reload();
  await pcLinked(a.page);
  await toRecords(a.page);
  await expect.poll(async () => (await acctRecs(a.uid)).map((d) => d.id).sort().join(), { timeout: 15000 }).toBe("r-keep0001,r-trash29d");
  await a.page.locator("#records").locator('[data-act="rec-filter"][data-v="trash"]').click();
  await expect(a.page.locator('#records .hist[aria-label="휴지통"] .rec')).toHaveCount(1);
  await expect(a.page.locator('#records .hist[aria-label="휴지통"] .rec')).toContainText("1일 뒤 영구 삭제");
  // 휴지통으로
  const before = (await acctRecs(a.uid)).find((d) => d.id === "r-keep0001");
  await a.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  const rec = records(a.page).filter({ hasText: "계정 기록 하나" });
  await rec.locator(".rec-head").click();
  await rec.getByRole("button", { name: "휴지통으로" }).click();
  await rec.page().locator('.pop[aria-label="기록 지우기"]').getByRole("button", { name: "휴지통으로" }).click();
  await expect.poll(async () => typeof (await acctRecs(a.uid)).find((d) => d.id === "r-keep0001").trashedAt, { timeout: 15000 }).toBe("number");
  // 다른 PC에서도 휴지통에, 되살리기
  const b = await teacher(browser, errors, who);
  await toRecords(b.page);
  await b.page.locator("#records").locator('[data-act="rec-filter"][data-v="trash"]').click();
  const t = b.page.locator('#records .hist[aria-label="휴지통"] .rec').filter({ hasText: "계정 기록 하나" });
  await expect(t).toContainText("30일 뒤 영구 삭제");
  await t.locator(".rec-head").click();
  await t.getByRole("button", { name: "되살리기" }).click();
  await expect.poll(async () => (await acctRecs(a.uid)).find((d) => d.id === "r-keep0001").trashedAt, { timeout: 15000 }).toBe(null);
  const after = (await acctRecs(a.uid)).find((d) => d.id === "r-keep0001");
  const same = (x) => { const o = Object.assign({}, x); delete o.trashedAt; delete o.editedAt; return o; };
  expect(same(after)).toEqual(same(before));
  await a.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(a.page).filter({ hasText: "계정 기록 하나" })).toHaveCount(1, { timeout: 15000 });
  expect(real(errors)).toEqual([]);
});

test("기록이 많아도: 계정의 기록은 30건씩 불러오고 ‘기록 더 보기’로 다음 30건, 검색은 불러온 기록 안에서라고 말해요", async ({ browser }) => {
  const errors = [], who = email("rec-many");
  const a = await teacher(browser, errors, who);
  const t = Date.now() - 86400000;
  await Promise.all(Array.from({ length: 35 }, (_, i) => adminPut(a.uid, "r-many" + String(i).padStart(3, "0"), accountRecord({ title: "많은 기록 " + (i + 1), endAt: t - i * 60000, at: t - i * 60000 }))));
  await a.page.reload();
  await pcLinked(a.page);
  await toRecords(a.page);
  await a.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(records(a.page)).toHaveCount(30, { timeout: 15000 });
  await expect(records(a.page).first()).toContainText("많은 기록 1");
  await a.page.locator("#rec-q").fill("많은 기록 3");
  await expect(a.page.locator("#records")).toContainText("불러온 기록 안에서 찾아요");
  await a.page.locator("#rec-q").fill("");
  await a.page.getByRole("button", { name: "기록 더 보기" }).click();
  await expect(records(a.page)).toHaveCount(35, { timeout: 15000 });
  await expect(records(a.page).last()).toContainText("많은 기록 35");
  await expect(a.page.getByRole("button", { name: "기록 더 보기" })).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

// 2026-11-12(PR #15, docs/STABILITY.md 6): 기록이 많은 계정 · 이 브라우저 저장소를 못 쓰는 PC
test("기록이 많은 계정(두 수업 · 40건): ‘이 수업’ 탭 · 학년 · 교과 · 검색이 ‘더 보기’로 불러온 기록까지 맞게 찾아요", async ({ browser }) => {
  const errors = [], who = email("rec-40");
  const a = await teacher(browser, errors, who);
  const t = Date.now() - 3600000;
  // 지금 연 수업(기본 예시: 4학년 과학 물이 끓을 때)의 기록 15건과 다른 수업(3학년 수학 분수) 25건, 끝난 시각이 섞여 있어요
  await Promise.all(Array.from({ length: 40 }, (_, i) => {
    const boil = i % 8 < 3;
    return adminPut(a.uid, "r-mix" + String(i).padStart(3, "0"), accountRecord(boil
      ? { key: "ex-s4-boiling", title: "물이 끓을 때 " + (i + 1), grade: 4, subject: "과학", endAt: t - i * 60000, at: t - i * 60000 }
      : { key: "ex-m3-fraction", title: "분수 " + (i + 1), grade: 3, subject: "수학", endAt: t - i * 60000, at: t - i * 60000 }));
  }));
  const boilN = Array.from({ length: 40 }, (_, i) => i % 8 < 3).filter(Boolean).length;
  await a.page.reload();
  await pcLinked(a.page);
  await toRecords(a.page);
  const tabs = a.page.locator("#records .tabs");
  // 처음에는 최근 30건만: 이 수업 탭은 그 안의 이 수업 기록
  await expect(tabs).toContainText("전체 30", { timeout: 15000 });
  await a.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  // 40번째 기록(분수 40)은 두 번째 쪽에 있어서, 더 불러오기 전에는 찾지 못해요(그렇다고 말해요)
  await a.page.locator("#rec-q").fill("분수 40");
  await expect(records(a.page)).toHaveCount(0);
  await expect(a.page.locator("#records")).toContainText("불러온 기록 안에서 찾아요");
  await a.page.getByRole("button", { name: "기록 더 보기" }).click();
  await expect(records(a.page)).toHaveCount(1, { timeout: 15000 });
  await expect(records(a.page)).toContainText("분수 40");
  await a.page.locator("#rec-q").fill("");
  await expect(tabs).toContainText("전체 40");
  await expect(tabs).toContainText("이 수업 " + boilN);
  await a.page.locator("#rec-grade").selectOption("3");
  await expect(records(a.page)).toHaveCount(40 - boilN);
  await a.page.locator("#rec-grade").selectOption("");
  await a.page.locator("#rec-subj").selectOption("과학");
  await expect(records(a.page)).toHaveCount(boilN);
  await a.page.locator("#rec-subj").selectOption("");
  await a.page.locator("#records").getByRole("button", { name: /^이 수업/ }).click();
  await expect(records(a.page)).toHaveCount(boilN);
  await expect(records(a.page).filter({ hasText: "분수" })).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

test("이 브라우저 저장소(IndexedDB)를 못 쓰는 PC에서도: 수업 기록은 계정에 저장되고, 화면이 그대로 말해요", async ({ browser }) => {
  const errors = [], who = email("rec-noidb");
  const pc = await device(browser, PC, errors);
  // 이 브라우저의 기록 저장소(navi-local…)만 열리지 않게 해요(저장이 꺼진 브라우저처럼)
  await pc.ctx.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name) {
      if (String(name).indexOf("navi-local") !== 0) return open.apply(this, arguments);
      const req = {};
      setTimeout(() => { req.error = new DOMException("저장 꺼짐", "InvalidStateError"); if (req.onerror) req.onerror({ target: req }); }, 0);
      return req;
    };
  });
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const uid = await uidAfterSignIn(pc.page);
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await pc.page.keyboard.press("1");
  await endClass(pc);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 15000 });
  expect((await acctRecs(uid)).length).toBe(1);
  await pc.page.getByRole("button", { name: "수업 기록 보기" }).click();
  await expect(records(pc.page)).toHaveCount(1);
  await expect(records(pc.page)).toContainText("계정에 저장됨");
  expect(real(errors)).toEqual([]);
});
