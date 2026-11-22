// 수업 화면은 선택(2026-11-13, docs/CLASS-SCREEN.md) — 교사 PC 혼자(로그인 없이) 보는 것: 수업 화면 없이 시작, 준비 화면에서 열기,
// 이미 열린 창은 새로 만들거나 다시 그리지 않기, 화면 이름(교사 화면 · 수업 화면 · 모바일 리모컨)
import { test, expect } from "@playwright/test";
import { LABELS, watch, curLabel, nextBtn, toFlow, isPc, chip } from "./helpers.js";

const pcOnly = (info) => !isPc(info) || info.project.name.startsWith("tablet");
// 교사 PC 브라우저가 새 창을 막은 것처럼: window.__block이 켜져 있는 동안 window.open이 null을 돌려줘요
const blockable = (page) => page.addInitScript(() => {
  const open = window.open.bind(window);
  window.__block = false;
  window.open = function () { return window.__block ? null : open.apply(window, arguments); };
});

test("교사 PC: 수업 화면 없이 시작해도(새 창이 막힘) 수업은 그대로 진행돼요. 막혔다고 말하고, 나중에 열면 지금 장면부터예요", async ({ page }, info) => {
  test.skip(pcOnly(info), "교사 PC 화면에서 하는 흐름이에요");
  const errors = watch(page, []);
  await blockable(page);
  await page.goto("/");
  await toFlow(page);
  await page.evaluate(() => { window.__block = true; });
  await page.getByRole("button", { name: "수업 시작" }).click();
  // 수업은 시작돼요: 교사 화면 · 키 넘기기 그대로
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  const note = page.locator(".pv-warn");
  await expect(note).toContainText("수업 화면이 열리지 않았어요");
  await expect(note).toContainText("팝업");
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  // 팝업을 허용한 뒤 ‘수업 화면 열기’ → 첫 장면이 아니라 지금 장면
  await page.evaluate(() => { window.__block = false; });
  const [stage] = await Promise.all([page.waitForEvent("popup"), note.getByRole("button", { name: "수업 화면 열기" }).click()]);
  watch(stage, errors);
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await expect(note).toHaveCount(0);
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[2]);
  expect(errors).toEqual([]);
});

test("준비 화면의 ‘수업 화면 열기’: 한 번 누르면 ‘수업 시작 전’ 창, 다시 눌러도 새 창을 만들거나 다시 그리지 않고, 수업을 시작하면 그 창이 첫 장면으로 바뀌어요", async ({ page }, info) => {
  test.skip(pcOnly(info), "교사 PC 화면에서 하는 흐름이에요");
  const errors = watch(page, []);
  let popups = 0;
  page.on("popup", () => { popups++; });
  await page.goto("/");
  await toFlow(page);
  const row = page.locator(".ready .rd").filter({ hasText: "수업 화면" });
  await expect(row).toContainText("수업 화면 열기");
  await expect(row).toContainText("없어도 시작할 수 있어요");
  // 옆의 상태 줄은 단추가 아니라서 할 일이 아니라 지금 상태를 말해요
  const side = page.locator(".side-foot .dstate").filter({ hasText: "수업 화면" });
  await expect(side).toContainText("열려 있지 않아요");
  const [stage] = await Promise.all([page.waitForEvent("popup"), row.click()]);
  watch(stage, errors);
  await expect(chip(stage)).toHaveText("수업 시작 전");
  await expect(row).toContainText("수업 화면 열림");
  await expect(side).toContainText("수업 화면 열림");
  // 창 안에 표시를 하나 남겨 두고, 다시 눌러도 그 창 그대로인지 봐요(새로 그리면 표시가 사라져요)
  await stage.evaluate(() => { document.body.dataset.keep = "1"; });
  await row.click();
  await page.waitForTimeout(800);
  expect(popups, "이미 열린 수업 화면이 하나 더 열렸어요").toBe(1);
  expect(await stage.evaluate(() => document.body.dataset.keep || ""), "이미 열린 수업 화면을 다시 그렸어요").toBe("1");
  // 수업 시작: 열린 창을 그대로 쓰고 첫 장면으로
  await page.getByRole("button", { name: "수업 시작" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect(chip(stage)).toHaveText(LABELS[0]);
  await page.waitForTimeout(500);
  expect(popups, "수업을 시작할 때 수업 화면이 하나 더 열렸어요").toBe(1);
  expect(await stage.evaluate(() => document.body.dataset.keep || "")).toBe("1");
  // 진행 중 ‘수업 화면 켜짐’을 눌러도 같은 창(앞으로 가져오기만)
  await page.locator('.pv-head [data-act="stage-open"]').click();
  await page.waitForTimeout(500);
  expect(popups).toBe(1);
  await nextBtn(page).click();
  await expect(chip(stage)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

test("화면 이름: 교사 화면 · 수업 화면 · 모바일 리모컨으로 하나예요(‘학생 화면’ · ‘휴대폰 리모컨’이 화면에 남아 있지 않아요)", async ({ page }, info) => {
  const errors = watch(page, []);
  const old = /학생 화면|휴대폰 리모컨/;
  const text = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  if (!pcOnly(info)) {
    await page.goto("/");
    await toFlow(page);
    expect(await text(page)).not.toMatch(old);
    await page.getByRole("tab", { name: "발표 설정" }).click();
    expect(await text(page)).not.toMatch(old);
    await page.getByRole("tab", { name: "수업 준비" }).click();
    const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
    watch(stage, errors);
    await expect(curLabel(page)).toHaveText(LABELS[0]);
    expect(await text(page)).not.toMatch(old);
    expect(await text(stage)).not.toMatch(old);
    expect(await stage.title()).toBe("수업 내비 · 수업 화면");
  } else {
    // 휴대폰 · 태블릿: 리모컨 화면(연결 전)과 준비 화면
    await page.goto("/#remote");
    await expect(page.locator(".remote")).toBeVisible();
    expect(await text(page)).not.toMatch(old);
    await page.goto("/");
    await page.reload();
    await expect(page.locator("body")).not.toBeEmpty();
    expect(await text(page)).not.toMatch(old);
  }
  expect(errors).toEqual([]);
});
