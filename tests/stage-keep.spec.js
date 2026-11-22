// 교사 PC 새로고침과 수업 화면(TV) 창(2026-11-19, PR #26, docs/STAGE-KEEP.md). 로그인 없이(이 브라우저만) 보는 시험이에요.
// 수업 화면 창은 교사 화면이 직접 그리는 빈 창이에요. 예전에는 교사 PC를 새로고침하면 그 창을 닫았고, ‘이어서 하기’가 1280×720 새 창을
// 교사 화면 쪽에 열어서 TV로 다시 옮기고 전체 화면을 다시 눌러야 했어요. 이제는:
// - 새로고침해도 창은 그대로(자리 · 크기 · 전체 화면). 이어서 하기 전에는 마지막 장면 + ‘교사 화면과 다시 연결하는 중’, 교사 화면은 ‘다시 연결 전’
// - 이어서 하기 → 새 창 없이 그 창에 지금 장면. 끝내기 → ‘수업 끝’, 버리기 → 수업 전 화면
// - 교사 탭을 닫거나 다른 사이트로 가면 창도 스스로 닫혀요(3초쯤 뒤). 로그아웃은 바로 닫아요(로그인 시험은 tests/class-screen.spec.js)
// - 새로고침 뒤에는 옛 페이지가 붙인 손잡이(클릭 · 키)가 남지 않아요: TV 창에서 키 한 번 = 한 장면
import { test, expect } from "@playwright/test";
import { watch, nextBtn, curLabel, LABELS, lesson, isPc, toFlow, localRecords, finishLesson } from "./helpers.js";

test.beforeEach(async ({}, info) => test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요"));

const L = lesson("ex-s4-boiling");
const stageLabel = (stage) => stage.locator(".stage-bar .chip").first();
const waitNote = (stage) => stage.locator(".stage-wait");
const tvSide = (page) => page.locator(".side-foot .dstate").filter({ hasText: "수업 화면" });
async function startWithTv(page, errors) {
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  return stage;
}

test("TV 창을 연 채 PC 새로고침: 창은 그대로 · 이어서 하기 전에는 마지막 장면과 ‘다시 연결하는 중’ · 교사 화면은 ‘다시 연결 전’, 이어서 하기는 새 창 없이 지금 장면. 노트는 TV에 없고, TV 창의 키 한 번은 한 장면", async ({ context, page }) => {
  const errors = watch(page, []);
  const stage = await startWithTv(page, errors);
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[2]);
  await stage.evaluate(() => { window.__mark = "같은 창"; });
  const box0 = await stage.evaluate(() => [outerWidth, outerHeight, screenX, screenY]);
  let popups = 0;
  context.on("page", () => popups++);
  await page.reload();
  // 새로고침 뒤: 같은 창, 마지막 장면 그대로, ‘다시 연결하는 중’. 교사 화면은 켜졌다고 말하지 않아요
  const offer = page.locator(".run-offer");
  await expect(offer).toContainText("끝나지 않은 수업이 있어요");
  expect(stage.isClosed()).toBe(false);
  expect(await stage.evaluate(() => window.__mark)).toBe("같은 창");
  await expect(stageLabel(stage)).toHaveText(LABELS[2]);
  await expect(waitNote(stage)).toHaveText("교사 화면과 다시 연결하는 중이에요");
  await expect(offer).toContainText("수업 화면(TV)은 열린 그대로예요");
  await expect(tvSide(page)).toContainText("다시 연결 전");
  // 그 안내는 잠깐 뒤에 보여요(바로 이어지면 깜박이지 않게)
  await expect.poll(() => waitNote(stage).evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  await stage.screenshot({ path: test.info().outputPath("tv-held.png") });
  await page.screenshot({ path: test.info().outputPath("pc-offer-held.png") });
  // 이어서 하기: 새 창 없이 그 창에 지금 장면, ‘다시 연결하는 중’은 사라져요
  await offer.getByRole("button", { name: "이어서 하기" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await expect(waitNote(stage)).toHaveCount(0);
  await expect(page.locator(".pv-status")).toContainText("수업 화면 켜짐");
  expect(popups, "새 창을 열지 않아요").toBe(0);
  expect(await stage.evaluate(() => [outerWidth, outerHeight, screenX, screenY]), "자리 · 크기 그대로").toEqual(box0);
  expect(await stage.evaluate(() => window.__mark)).toBe("같은 창");
  // 학생 화면에는 교사 노트가 없어요
  expect(await stage.locator("body").innerText()).not.toContain(L.pages[2].notes);
  // 교사 화면에서 넘기면 그 창이 따라와요
  await nextBtn(page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[3]);
  // TV 창에서 키 한 번 = 한 장면(옛 페이지가 붙인 손잡이는 남지 않아요)
  await stage.bringToFront();
  await stage.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText(LABELS[4]);
  await stage.waitForTimeout(500);
  await expect(curLabel(page)).toHaveText(LABELS[4]);
  await expect(stageLabel(stage)).toHaveText(LABELS[4]);
  // 두 번째 새로고침도 같아요
  await page.reload();
  await expect(waitNote(stage)).toHaveText("교사 화면과 다시 연결하는 중이에요");
  await page.locator(".run-offer").getByRole("button", { name: "이어서 하기" }).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[4]);
  await expect(waitNote(stage)).toHaveCount(0);
  await stage.bringToFront();
  await stage.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText(LABELS[5]);
  await stage.waitForTimeout(500);
  await expect(curLabel(page)).toHaveText(LABELS[5]);
  expect(popups).toBe(0);
  // 끝까지 가서 끝내면 기록은 하나
  await page.bringToFront();
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  expect((await localRecords(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("새로고침 뒤 ‘기록 저장하고 끝내기’는 그 창에 ‘수업 끝’, ‘기록 없이 버리기’는 그 창에 수업 전 화면. 어느 쪽도 새 창을 열지 않아요", async ({ context, page }) => {
  const errors = watch(page, []);
  let stage = await startWithTv(page, errors);
  await nextBtn(page).click();
  let popups = 0;
  context.on("page", () => popups++);
  await page.reload();
  await page.locator(".run-offer").getByRole("button", { name: "지금까지 기록 저장하고 끝내기" }).click();
  await expect(page.locator(".memo-sheet")).toBeVisible();
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(waitNote(stage)).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(1);
  // 다음 수업: 같은 창에 띄워요(이미 열려 있어요)
  await page.getByRole("button", { name: "수업 준비로" }).click();
  await toFlow(page);
  await page.getByRole("button", { name: "수업 시작" }).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  await nextBtn(page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await page.reload();
  const offer = page.locator(".run-offer");
  await offer.getByRole("button", { name: "기록 없이 버리기" }).click();
  await offer.getByRole("button", { name: "버리기", exact: true }).click();
  await expect(offer).toHaveCount(0);
  await expect(stageLabel(stage)).toHaveText("수업 시작 전");
  await expect(waitNote(stage)).toHaveCount(0);
  expect(popups).toBe(0);
  expect((await localRecords(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("수업 전(준비 중)에 수업 화면을 열어 둔 채 새로고침: 이어서 할 수업이 없으니 그 창이 바로 수업 전 화면 · ‘열림’, 수업 시작도 그 창에", async ({ context, page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.locator('[data-act="stage-open"]').first().click()]);
  watch(stage, errors);
  await expect(stageLabel(stage)).toHaveText("수업 시작 전");
  await stage.evaluate(() => { window.__mark = "같은 창"; });
  let popups = 0;
  context.on("page", () => popups++);
  await page.reload();
  await expect(tvSide(page)).toContainText("수업 화면 열림");
  await expect(waitNote(stage)).toHaveCount(0);
  await expect(stageLabel(stage)).toHaveText("수업 시작 전");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 시작" }).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  expect(await stage.evaluate(() => window.__mark)).toBe("같은 창");
  expect(popups).toBe(0);
  expect(errors).toEqual([]);
});

test("수업 화면 창을 직접 닫으면 교사 화면이 바로 말하고, 다시 열면 지금 장면. 닫힌 채 새로고침하면 알림이 ‘새로 열려요’라고 미리 말하고 이어서 하기가 새 창에 지금 장면. 그 창은 다음 새로고침에 그대로예요", async ({ page }) => {
  const errors = watch(page, []);
  const stage = await startWithTv(page, errors);
  await nextBtn(page).click();
  await stage.close();
  await expect(page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  const [tv2] = await Promise.all([page.waitForEvent("popup"), page.locator(".pv-warn").getByRole("button", { name: "수업 화면 열기" }).click()]);
  watch(tv2, errors);
  await expect(stageLabel(tv2)).toHaveText(LABELS[1]);
  // 닫힌 채 새로고침: 알림이 새 창을 연다고 미리 말해요
  await tv2.close();
  await page.reload();
  const offer = page.locator(".run-offer");
  await expect(offer).toContainText("수업 화면(TV) 창은 닫혀 있어요. ‘이어서 하기’를 누르면 새로 열려요");
  await expect(tvSide(page)).not.toContainText("다시 연결 전");
  const [again] = await Promise.all([page.waitForEvent("popup"), offer.getByRole("button", { name: "이어서 하기" }).click()]);
  watch(again, errors);
  await expect(stageLabel(again)).toHaveText(LABELS[1]);
  await page.reload();
  await page.locator(".run-offer").getByRole("button", { name: "이어서 하기" }).click();
  await expect(stageLabel(again)).toHaveText(LABELS[1]);
  await expect(waitNote(again)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("교사 탭을 닫거나 다른 사이트로 가면 남은 수업 화면 창도 스스로 닫혀요(학생에게 지난 화면이 남지 않게)", async ({ context, page }) => {
  const errors = watch(page, []);
  // 교사 탭 닫기
  let stage = await startWithTv(page, errors);
  await nextBtn(page).click();
  let closed = stage.waitForEvent("close", { timeout: 8000 }), t = Date.now();
  await page.close({ runBeforeUnload: true });
  await closed;
  test.info().annotations.push({ type: "탭을 닫은 뒤 TV 창이 닫히기까지(ms)", description: String(Date.now() - t) });
  // 다른 사이트로 가기
  await context.route("http://other.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>다른 사이트</title><p>다른 사이트</p>" }));
  page = await context.newPage();
  watch(page, errors);
  stage = await startWithTv(page, errors);
  closed = stage.waitForEvent("close", { timeout: 8000 }); t = Date.now();
  await page.goto("http://other.test/");
  await closed;
  test.info().annotations.push({ type: "다른 사이트로 간 뒤 TV 창이 닫히기까지(ms)", description: String(Date.now() - t) });
  expect(errors).toEqual([]);
});
