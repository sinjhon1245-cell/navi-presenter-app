// 수업 기록 관리(2026-11-12, docs/RECORDS.md): 로그인하지 않은 이 브라우저에서 봐요. 계정(Firestore) 저장 · 계정 A · B · 가져오기는 tests/history.spec.js(에뮬레이터)
// 기록은 학생 개인 평가가 아니라 교사의 수업 관찰 기록이에요. 장면마다 마지막 신호 하나(학급 전체에 대한 교사의 판단)를 남기고 신호별 장면 수를 세요
import { test, expect } from "@playwright/test";
import { lesson, isPc, watch, curLabel, nextBtn, finishLesson, toFlow, openLesson, idbRecords, seedRecords, oldRecord } from "./helpers.js";

const L = lesson("ex-s4-boiling");
const mine = (page) => page.locator('#records .hist[aria-label="내 수업 기록"] .rec');
async function startClass(page) {
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  await expect(curLabel(page)).toHaveText(L.pages[0].label);
  return stage;
}
async function endClass(page) {
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
}
const toRecords = async (page) => { await page.getByRole("tab", { name: /^수업 기록/ }).click(); await expect(page.locator("#records")).toBeVisible(); };

test("수업을 끝내면 기록 1건: 시작 · 끝 시각, 장면별 시간과 마지막 신호, 신호별 장면 수, 질문 메모, 보충할 내용이 맞아요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  await openLesson(page, L.id);
  const t0 = Date.now();
  const stage = await startClass(page);
  watch(stage, errors);
  // 1장면: 빨강 → 초록(마지막은 초록), 2초쯤
  await page.keyboard.press("1");
  await page.keyboard.press("3");
  await page.waitForTimeout(2200);
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(L.pages[1].label);
  // 2장면: 노랑, 질문 메모 하나, 1초쯤
  await page.keyboard.press("2");
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").fill("수증기가 보이는지 묻는 질문");
  await page.locator("#q-in").press("Enter");
  await page.waitForTimeout(1200);
  await nextBtn(page).click();
  // 3장면: 빨강을 눌렀다 다시 눌러 지움(마지막 신호 없음)
  await page.keyboard.press("1");
  await page.keyboard.press("1");
  await endClass(page);
  const t1 = Date.now();
  await expect.poll(async () => (await idbRecords(page, "navi-local")).length).toBe(1);
  const [r] = await idbRecords(page, "navi-local");
  expect(r.v).toBe(3);
  expect(r.id).toMatch(/^local-[0-9a-z]+$/);
  expect(r.startAt).toBeGreaterThanOrEqual(t0);
  expect(r.endAt).toBeGreaterThanOrEqual(r.startAt);
  expect(r.endAt).toBeLessThanOrEqual(t1);
  expect(r.at).toBe(r.endAt);
  expect([r.title, r.grade, r.subject]).toEqual([L.title, L.grade, L.subject]);
  expect(r.scenes.map((x) => x.id)).toEqual(L.pages.map((p) => p.id));
  expect(r.scenes.slice(0, 3).map((x) => x.sig)).toEqual(["green", "yellow", ""]);
  expect(r.sig).toEqual({ red: 0, yellow: 1, green: 1 });
  expect(r.scenes[0].sec).toBeGreaterThanOrEqual(2);
  expect(r.scenes[0].sec).toBeLessThanOrEqual(5);
  expect(r.scenes[1].sec).toBeGreaterThanOrEqual(1);
  // 수업 전체 시간 = 장면별 시간의 합(지나간 장면만). 기록은 0.1초 단위라(2026-11-23, docs/CLASS-CLOCK.md R2) 0.1초로 세어 정확히 같아요
  expect(Math.round(r.totalSec * 10)).toBe(r.scenes.reduce((a, x) => a + Math.round(x.sec * 10), 0));
  expect(r.scenes.every((x) => Math.abs(x.sec * 10 - Math.round(x.sec * 10)) < 1e-9)).toBe(true);
  expect(r.questions).toEqual([{ sid: L.pages[1].id, label: L.pages[1].label, text: "수증기가 보이는지 묻는 질문" }]);
  expect(r.again.join(" ")).toContain(L.pages[1].label);
  // 학생 정보 칸은 없어요
  expect(Object.keys(r).sort()).toEqual(["again", "at", "cls", "endAt", "events", "grade", "id", "key", "plannedMin", "questions", "scenes", "sig", "startAt", "subject", "text", "title", "totalSec", "used", "usedTitles", "v"]);
  // 기록 화면: 장면별 이해도와 시간, 보충할 장면 수
  await page.getByRole("button", { name: "수업 기록 보기" }).click();
  const open = page.locator('#records .hist[aria-label="내 수업 기록"] .rec.open');
  await expect(open.locator(".scene-rec li")).toHaveCount(L.pages.length);
  await expect(open.locator(".scene-rec li").nth(0)).toContainText("잘 이해");
  await expect(open.locator(".scene-rec li").nth(1)).toContainText("더 확인");
  await expect(open.locator(".scene-rec li.need")).toHaveCount(1);
  await expect(open.locator(".rec-head")).toContainText("보충할 장면 1");
  await expect(open.locator(".rec-when")).toContainText("시작 ");
  expect(errors).toEqual([]);
});

test("같은 수업을 두 번 하면 기록이 따로 2건이고, 끝난 뒤 새로고침해도 늘지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  await openLesson(page, L.id);
  for (let k = 0; k < 2; k++) {
    const stage = await startClass(page);
    watch(stage, errors);
    await endClass(page);
    await stage.close().catch(() => {});
    await page.getByRole("button", { name: "새 수업 준비" }).click();
    await page.getByRole("button", { name: "비우기" }).click();
  }
  await expect.poll(async () => (await idbRecords(page, "navi-local")).length).toBe(2);
  const ids = (await idbRecords(page, "navi-local")).map((x) => x.id);
  expect(new Set(ids).size).toBe(2);
  await page.reload();
  await page.waitForTimeout(800);
  expect((await idbRecords(page, "navi-local")).map((x) => x.id).sort()).toEqual(ids.slice().sort());
  await toRecords(page);
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(mine(page)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("기록 찾기: 제목 검색 · 기간 · 학년 · 교과 · 보충할 장면만, 보충할 내용 · 질문 메모 · 교사 메모 고치기(새로고침 뒤에도)", async ({ page }, info) => {
  test.skip(!isPc(info), "기록 화면은 교사 화면(PC)에서 봐요");
  const errors = watch(page, []);
  await seedRecords(page, "navi-local", [
    oldRecord("local-a1aaaa", { title: "분수 나누기", grade: 3, subject: "수학", days: 1 }),
    oldRecord("local-b2bbbb", { title: "물의 상태 변화", grade: 4, subject: "과학", days: 10, key: "ex-s4-boiling", scenes: [{ label: "끓음", min: 5, sec: 300, sig: "green" }], sig: { red: 0, yellow: 0, green: 1 }, again: [] }),
    oldRecord("local-c3cccc", { title: "분수의 크기", grade: 3, subject: "수학", days: 40 })
  ]);
  await page.goto("/");
  await toRecords(page);
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(mine(page)).toHaveCount(3);
  await page.locator("#rec-q").fill("분수");
  await expect(mine(page)).toHaveCount(2);
  await expect(page.locator("#records")).toContainText("2건 찾았어요");
  await page.locator("#rec-when").selectOption("30");
  await expect(mine(page)).toHaveCount(1);
  await expect(mine(page)).toContainText("분수 나누기");
  await page.locator("#rec-q").fill("");
  await expect(mine(page)).toHaveCount(2);
  await page.locator("#rec-grade").selectOption("4");
  await expect(mine(page)).toHaveCount(1);
  await expect(mine(page)).toContainText("물의 상태 변화");
  await page.locator("#rec-grade").selectOption("");
  await page.locator("#rec-subj").selectOption("수학");
  await expect(mine(page)).toHaveCount(1);
  await page.locator("#rec-subj").selectOption("");
  await page.locator("#rec-when").selectOption("all");
  await page.locator("#rec-need").check();
  await expect(mine(page)).toHaveCount(2);
  await expect(mine(page).filter({ hasText: "물의 상태 변화" })).toHaveCount(0);
  await page.locator("#rec-need").uncheck();
  // 고치기: 보충할 내용 · 질문 메모 · 교사 메모
  const rec = mine(page).filter({ hasText: "분수 나누기" });
  await rec.locator(".rec-head").click();
  await expect(rec.locator(".again-list")).toContainText("다시 설명이 필요했어요");
  await rec.getByRole("button", { name: "다시 지도할 것 · 질문 메모 고치기" }).click();
  await rec.locator("textarea[data-reca]").fill("나누기 그림으로 다시 보여 주기\n분모 뜻 짚기");
  await rec.locator("textarea[data-reca]").blur();
  await rec.locator("input[data-recq]").first().fill("똑같이 나누는 까닭을 물었어요");
  await rec.locator("input[data-recq]").first().blur();
  await rec.getByRole("button", { name: "고치기 끝" }).click();
  await rec.locator("textarea[data-rec]").fill("다음 시간 첫 장면에서 다시");
  await rec.locator("textarea[data-rec]").blur();
  await expect(rec.locator(".again-list li")).toHaveText(["나누기 그림으로 다시 보여 주기", "분모 뜻 짚기"]);
  await page.waitForTimeout(400);
  await page.reload();
  await toRecords(page);
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  const again = mine(page).filter({ hasText: "분수 나누기" });
  await again.locator(".rec-head").click();
  await expect(again.locator(".again-list li")).toHaveText(["나누기 그림으로 다시 보여 주기", "분모 뜻 짚기"]);
  await expect(again).toContainText("똑같이 나누는 까닭을 물었어요");
  await expect(again.locator("textarea[data-rec]")).toHaveValue("다음 시간 첫 장면에서 다시");
  const saved = (await idbRecords(page, "navi-local")).find((x) => x.id === "local-a1aaaa");
  expect([saved.again, saved.questions[0].text, saved.text]).toEqual([["나누기 그림으로 다시 보여 주기", "분모 뜻 짚기"], "똑같이 나누는 까닭을 물었어요", "다음 시간 첫 장면에서 다시"]);
  expect(errors).toEqual([]);
});

test("휴지통: 지우면 바로 없어지지 않고 휴지통(삭제한 날 · 남은 날), 되살리면 같은 id · 같은 내용, 30일 지난 휴지통 기록만 열 때 영구 삭제(29일은 남아요)", async ({ page }, info) => {
  test.skip(!isPc(info), "기록 화면은 교사 화면(PC)에서 봐요");
  const errors = watch(page, []);
  const day = 86400000;
  await seedRecords(page, "navi-local", [
    oldRecord("local-keep01", { title: "지울 기록", days: 2 }),
    oldRecord("local-old31d", { title: "31일 된 휴지통", days: 40, trashedAt: Date.now() - 31 * day }),
    oldRecord("local-old29d", { title: "29일 된 휴지통", days: 40, trashedAt: Date.now() - 29 * day })
  ]);
  const before = (await idbRecords(page, "navi-local")).find((x) => x.id === "local-keep01");
  await page.goto("/");
  await toRecords(page);
  await expect.poll(async () => (await idbRecords(page, "navi-local")).map((x) => x.id).sort().join()).toBe("local-keep01,local-old29d");
  await page.locator("#records").locator('[data-act="rec-filter"][data-v="trash"]').click();
  const trash = page.locator('#records .hist[aria-label="휴지통"] .rec');
  await expect(trash).toHaveCount(1);
  await expect(trash).toContainText("29일 된 휴지통");
  await expect(trash).toContainText("1일 뒤 영구 삭제");
  await expect(page.locator("#records .trash-note")).toContainText("정해진 시각에 저절로 지워지지는 않아요");
  // 지우기 → 휴지통
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  const rec = mine(page).filter({ hasText: "지울 기록" });
  await rec.locator(".rec-head").click();
  await rec.getByRole("button", { name: "휴지통으로" }).click();
  await expect(rec.page().locator('.pop[aria-label="기록 지우기"]')).toContainText("30일 안에는 되살릴 수 있어요");
  await rec.page().locator('.pop[aria-label="기록 지우기"]').getByRole("button", { name: "휴지통으로" }).click();
  await expect(mine(page)).toHaveCount(0);
  await page.locator("#records").locator('[data-act="rec-filter"][data-v="trash"]').click();
  await expect(trash).toHaveCount(2);
  await expect(trash.filter({ hasText: "지울 기록" })).toContainText("30일 뒤 영구 삭제");
  // 되살리기: 같은 id, 같은 내용(휴지통 표시만 비워요)
  const back = trash.filter({ hasText: "지울 기록" });
  await back.locator(".rec-head").click();
  await back.getByRole("button", { name: "되살리기" }).click();
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(mine(page)).toHaveCount(1);
  await expect.poll(async () => { const x = (await idbRecords(page, "navi-local")).find((y) => y.id === "local-keep01"); return x && x.trashedAt; }).toBe(null);
  const after = (await idbRecords(page, "navi-local")).find((x) => x.id === "local-keep01");
  const same = (x) => { const o = Object.assign({}, x); delete o.trashedAt; delete o.editedAt; return o; };
  expect(same(after)).toEqual(same(before));
  expect(errors).toEqual([]);
});

test("예전 기록(0.5 · 0.6 모양)도 그대로 보여요: 장면별 표 · 시작 시각 없음 안내 · 신호 수", async ({ page }, info) => {
  test.skip(!isPc(info), "기록 화면은 교사 화면(PC)에서 봐요");
  const errors = watch(page, []);
  // v1: 신호등 전(rc = { confused, good, questions })
  const v1 = { id: "local-v1old0", key: "ex-s4-boiling", title: "아주 예전 기록", at: Date.now() - 3 * 86400000, totalSec: 1200, plannedMin: 20, again: [], text: "예전 메모", rc: { confused: 2, good: 1, questions: 1 } };
  await seedRecords(page, "navi-local", [v1, oldRecord("local-v2old0", { title: "0.6 기록", days: 1 })]);
  await page.goto("/");
  await toRecords(page);
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(mine(page)).toHaveCount(2);
  const a = mine(page).filter({ hasText: "아주 예전 기록" });
  await expect(a.locator(".sd.s-red")).toContainText("2");
  await a.locator(".rec-head").click();
  await expect(a.locator(".rec-when")).toContainText("시작 시각 기록 없음(예전 기록)");
  await expect(a).toContainText("질문이 있었어요");
  await expect(a.locator("textarea[data-rec]")).toHaveValue("예전 메모");
  const b = mine(page).filter({ hasText: "0.6 기록" });
  await b.locator(".rec-head").click();
  await expect(b.locator(".scene-rec li")).toHaveCount(3);
  await expect(b.locator(".scene-rec li.need")).toHaveCount(1);
  expect(errors).toEqual([]);
});

// 저장이 꺼진 브라우저(2026-11-12, docs/STABILITY.md 6): 이 브라우저의 기록 저장소(navi-local)가 열리지 않으면, 저장한 것처럼 말하지 않고 이 창에만 남는다고 말해요
test("이 브라우저 저장소(IndexedDB)를 못 쓰는 PC(로그인 안 함): 수업을 끝내면 기록이 ‘이 창에만 남아요’라고 그대로 말하고, ‘글로 복사’로 남길 수 있어요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name) {
      if (String(name).indexOf("navi-local") !== 0) return open.apply(this, arguments);
      const req = {};
      setTimeout(() => { req.error = new DOMException("저장 꺼짐", "InvalidStateError"); if (req.onerror) req.onerror({ target: req }); }, 0);
      return req;
    };
  });
  await page.goto("/");
  await openLesson(page, L.id);
  const stage = await startClass(page);
  watch(stage, errors);
  await page.keyboard.press("1");
  await endClass(page);
  await expect(page.locator(".memo-sheet .warn-note")).toContainText("이 창에만 남아요");
  await expect(page.locator(".memo-sheet")).not.toContainText("이 브라우저에 저장했어요");
  await expect(page.locator('.memo-sheet [data-act="rec-copy"]')).toBeVisible();
  expect(errors).toEqual([]);
});
