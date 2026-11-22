// 쓰기 편하게(2026-11-15): 누른 것에 대한 확인은 화면 가운데 팝업(휴대폰은 아래에서 올라오는 시트), 맨 위 이름을 누르면 ‘내 수업’,
// 왼쪽 메뉴는 칸이 보이고 지금 화면은 강조색, 수업 기록은 이 수업에 기록이 없으면 ‘전체’부터. window.claude 없이(이 기기만) 시험해요
import { test, expect } from "@playwright/test";
import { isPc, watch, curLabel, toFlow, startFromPrep, copyLesson, rowAction, seedRecords, oldRecord, LABELS } from "./helpers.js";

const pop = (page) => page.locator(".pop-layer .pop");

test("확인 팝업: 가운데(휴대폰은 아래 시트) · 어두운 바탕 · 초점은 취소 · Esc와 바깥 누르기는 취소 · Tab은 팝업 안에서만 · 확인하면 그대로 해요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await copyLesson(page, "ex-s4-boiling");
  await page.getByRole("tab", { name: "내 수업" }).click();
  const row = page.locator(".mylib .mrow").first();
  await rowAction(row, "삭제");
  const d = pop(page);
  await expect(d).toBeVisible();
  await expect(d).toHaveAttribute("role", "dialog");
  await expect(d).toHaveAttribute("aria-modal", "true");
  await expect(d).toHaveAttribute("aria-label", "수업 지우기");
  await expect(page.locator(".pop-back")).toBeVisible();
  // 자리: PC는 화면 가운데, 휴대폰은 아래쪽
  // 저장이 끝나면 화면이 다시 그려져요: 다시 그려진 팝업으로 재요
  const vp = page.viewportSize(), box = () => d.evaluate((e) => { const r = e.getBoundingClientRect(); return { y: r.y, h: r.height }; }).catch(() => null);
  if (vp.width > 760) await expect.poll(async () => { const b = await box(); return b ? Math.abs(b.y + b.h / 2 - vp.height / 2) < vp.height * 0.15 : false; }, { message: "가운데" }).toBe(true);
  else await expect.poll(async () => { const b = await box(); return b ? b.y + b.h > vp.height - 4 : false; }, { message: "아래 시트" }).toBe(true);
  // 초점은 덜 위험한 쪽(취소), 지우기는 경고색
  await expect(d.getByRole("button", { name: "취소" })).toBeFocused();
  await expect(d.getByRole("button", { name: "지우기" })).toHaveClass(/danger/);
  // Tab은 팝업 안을 돌아요
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement.closest(".pop"))).toBe(true); }
  // Esc = 취소(지우지 않아요)
  await page.keyboard.press("Escape");
  await expect(page.locator(".pop-layer")).toHaveCount(0);
  await expect(page.locator(".mylib .mrow")).toHaveCount(1);
  // 바깥(어두운 바탕) 누르기 = 취소
  await rowAction(row, "삭제");
  await page.mouse.click(5, 5);
  await expect(page.locator(".pop-layer")).toHaveCount(0);
  await expect(page.locator(".mylib .mrow")).toHaveCount(1);
  // 확인하면 지워요
  await rowAction(row, "삭제");
  await pop(page).getByRole("button", { name: "지우기" }).click();
  await expect(page.locator(".mylib .mrow")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("수업 중 ‘수업 끝내기’ 팝업이 열려 있는 동안은 다음 키로 넘어가지 않고, Esc면 수업이 그대로 이어져요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await page.locator('.pv-head [data-act="end-ask"]').click();
  await expect(pop(page)).toHaveAttribute("aria-label", "수업 끝내기");
  await expect(pop(page).getByRole("button", { name: "계속 수업" })).toBeFocused();
  // 팝업이 열려 있는 동안: 넘기기 · 신호 키는 기다려요
  for (const k of ["ArrowRight", "PageDown", "1"]) await page.keyboard.press(k);
  await expect(pop(page)).toBeVisible();
  // Space는 초점이 있는 ‘계속 수업’을 눌러 팝업이 닫혀요. 장면 · 신호는 그대로
  await page.keyboard.press("Space");
  await expect(page.locator(".pop-layer")).toHaveCount(0);
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect(page.locator('.sig[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.pv-head [data-act="end-ask"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pop-layer")).toHaveCount(0);
  await expect(stage.locator(".stage-msg")).toHaveCount(0);
  // 닫힌 뒤에는 키가 다시 장면을 넘겨요
  await page.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

test("맨 위 ‘수업 내비’를 누르면 내 수업으로, 왼쪽 메뉴는 칸이 보이고 지금 화면은 강조색이에요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 내비 · 내 수업으로" }).first().click();
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(page.getByRole("tab", { name: "내 수업" })).toHaveAttribute("aria-selected", "true");
  const st = (name) => page.getByRole("tab", { name }).evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, bw: parseFloat(c.borderTopWidth), bc: c.borderTopColor }; });
  const on = await st("내 수업"), off = await st("수업 기록");
  expect(on.bg).not.toBe(off.bg);
  expect(off.bw, "메뉴 칸 테두리").toBeGreaterThan(0);
  expect(off.bc).not.toBe("rgba(0, 0, 0, 0)");
  expect(errors).toEqual([]);
});

test("수업 기록: 지금 수업의 기록이 없고 다른 수업 기록이 있으면 ‘전체’부터 보여요(탭을 고르면 그대로)", async ({ page }) => {
  const errors = watch(page, []);
  await seedRecords(page, "navi-local", [oldRecord("local-ui-1", { days: 2 })]);
  await page.goto("/");
  await page.getByRole("tab", { name: /수업 기록/ }).click();
  const tabs = page.locator("#records .tabs");
  await expect(tabs.locator(".tab.on")).toContainText("전체 1");
  await expect(page.getByLabel("내 수업 기록")).toContainText("분수 수업");
  await tabs.getByRole("button", { name: /이 수업/ }).click();
  await expect(tabs.locator(".tab.on")).toContainText("이 수업 0");
  await expect(page.locator("#records")).toContainText("아직 이 수업의 기록이 없어요");
  expect(errors).toEqual([]);
});
