// 0단계 확인: 준비 화면 → 미리 넘겨 보기 → 끝내기, 슬라이드 창, QR 주소. window.claude 없이(이 기기만) 동작해야 해요.
import { test, expect } from "@playwright/test";
import { LABELS, isPc, watch, scroll, curLabel, nextBtn, finishLesson, toFlow } from "./helpers.js";

test("준비 화면이 오류 없이 열리고, 이 기기에서만 동작해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  // 첫 화면은 내 수업(머리 막대 없음), 옆 메뉴 ‘수업 준비’에 수업 미리보기 · 수업 시작이 있어요
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(page.getByRole("tab", { name: "수업 준비" })).toBeVisible();
  await toFlow(page);
  await expect(page.locator(".sbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "수업 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "수업 시작" })).toBeVisible();
  expect(await page.evaluate(() => "claude" in window)).toBe(false);
  expect((await scroll(page)).side, "가로 스크롤이 생겨요").toBe(false);
  expect(errors).toEqual([]);
});

test("미리 넘겨 보기로 끝까지 넘기고 끝내요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  // 교사 화면(PC)은 교사 화면으로, 휴대폰은 모바일 리모컨 화면으로 미리 봐요
  await expect(page.locator(isPc(info) ? ".pv-head" : ".rm-pill")).toContainText("기록 안 됨");
  for (let i = 0; i < LABELS.length; i++) {
    await expect(curLabel(page)).toHaveText(LABELS[i]);
    const s = await scroll(page);
    expect(s.side, LABELS[i] + ": 가로 스크롤이 생겨요").toBe(false);
    // 발표자 보기는 교탁 PC에서 스크롤 없이 한 화면
    if (isPc(info)) expect(s.down, LABELS[i] + ": 발표자 보기에 세로 스크롤이 생겨요").toBe(false);
    if (i < LABELS.length - 1) await nextBtn(page).click();
  }
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  await expect(page.locator(".rh-pill")).toContainText("기록하지 않았어요");
  await page.getByRole("button", { name: "끝내기", exact: true }).click();
  await expect(page.locator(".sbar")).toBeVisible();
  expect(errors).toEqual([]);
});

test("수업 시작 → 슬라이드 창이 교탁과 함께 넘어가요 → 수업 끝내기", async ({ page }, info) => {
  test.skip(!isPc(info), "슬라이드 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  const onTv = stage.locator(".stage-bar .chip").first();
  await expect(onTv).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) {
    await page.locator('.pv-bar [data-act="next"]').click();
    await expect(page.locator(".prompter-h b")).toHaveText(LABELS[i]);
    await expect(onTv).toHaveText(LABELS[i]);
  }
  await finishLesson(page);
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(page.locator(".memo-sheet")).toBeVisible();
  expect(errors).toEqual([]);
});

test("휴대폰 QR이 지금 사이트 주소를 가리켜요", async ({ page, baseURL }) => {
  const errors = watch(page, []);
  // QR 그리는 라이브러리 대신 넘겨받은 주소만 기억해요
  await page.addInitScript(() => { window.QRCode = function (box, o) { window.__qrText = o.text; }; });
  await page.goto("/");
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.getByRole("button", { name: /^QR/ }).click();
  await expect.poll(() => page.evaluate(() => window.__qrText)).toMatch(new RegExp("^" + baseURL + "/#remote-\\d{4}$"));
  expect(errors).toEqual([]);
});
