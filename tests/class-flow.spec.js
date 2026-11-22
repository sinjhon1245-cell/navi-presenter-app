// 수업 끝내기 · 학습 상황 체크(2026-11-15). window.claude 없이(이 기기만) 시험해요. 같은 계정 휴대폰은 tests/realtime.spec.js(에뮬레이터)
// - ‘수업 끝내기’는 첫 장면부터 교사 화면 머리(휴대폰은 위쪽 줄)에 있고, 확인 한 번(계속 수업 · 수업 종료)으로 끝나요. 기록은 한 건만
// - 신호를 누르면 그 기기에 ‘지금 쓸 것’을 두 개까지: 이 장면에 넣은 그 신호의 자료 → 이 수업 자료 → 수업의 추천 → 모자라면 바로 쓸 발문 · 활동
//   (없는 자료나 확인하지 않은 링크를 만들지 않아요). 교사가 ‘띄우기’를 누를 때만 수업 화면이 바뀌어요. 발문은 말로 묻는 것이라 띄우기가 없어요
import { test, expect } from "@playwright/test";
import { LABELS, isPc, watch, curLabel, nextBtn, toFlow, startFromPrep, localRecords, noSideScroll } from "./helpers.js";

const noScroll = async (page, where) => expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), where + ": 세로 스크롤").toBeLessThanOrEqual(1);
const sug = (page) => page.locator(".sug");
const items = (page) => sug(page).locator("li");

test("수업 끝내기: 첫 장면부터 머리에 있고, 확인 한 번으로 끝나요(계속 수업 · 수업 종료) · 기록은 한 건", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요. 휴대폰은 realtime.spec.js");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  const endBtn = page.locator('.pv-head [data-act="end-ask"]');
  await expect(endBtn).toBeVisible();
  await expect(endBtn).toBeInViewport();
  await expect(endBtn).toContainText("수업 끝내기");
  // 확인 줄: 계속 수업이면 그대로 이어져요
  await endBtn.click();
  const ask = page.locator(".end-confirm");
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "수업 종료" })).toBeVisible();
  await ask.getByRole("button", { name: "계속 수업" }).click();
  await expect(ask).toHaveCount(0);
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect(stage.locator(".stage-msg")).toHaveCount(0);
  // 가운데 장면에서도 같은 단추로 끝내요(마지막 장면까지 가지 않아도)
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await endBtn.click();
  await noScroll(page, "확인 줄");
  await ask.getByRole("button", { name: "수업 종료" }).click();
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(page.locator(".memo-sheet")).toBeVisible();
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  // 새로고침해도 기록은 한 건(같은 수업이 두 번 기록되지 않아요)
  await page.reload();
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("신호 → 지금 쓸 것 두 개까지: 이 장면 자료가 먼저, 없으면 바로 쓸 발문 · 활동, 띄우기 전에는 수업 화면 그대로", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  // 아무 신호도 없으면 추천도 없어요
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await expect(sug(page)).toHaveCount(0);
  const before = await stage.locator("#stage-root").innerHTML();
  // 빨강: 이 장면에 넣은 빨강 자료 하나(입자 그림 카드) + 모자란 자리는 바로 쓸 발문 · 활동(이 장면의 핵심 개념으로)
  await page.locator(".pv-bar .sig.s-red").click();
  await expect(page.locator(".pv-bar .sig.s-red")).toHaveAttribute("aria-pressed", "true");
  await expect(sug(page)).toBeVisible();
  await expect(sug(page)).toContainText("다시 설명이 필요해요");
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0).locator(".t")).toHaveText("입자 그림 카드");
  await expect(items(page).nth(0)).toContainText("이 장면 자료");
  await expect(items(page).nth(1)).toHaveClass(/tip/);
  await expect(items(page).nth(1)).toContainText("고체");
  await expect(items(page).nth(1).locator("button")).toHaveCount(0);
  await expect(sug(page)).toBeInViewport();
  await noScroll(page, "추천이 뜬 교사 화면");
  // 신호만으로는 수업 화면이 바뀌지 않아요
  await page.waitForTimeout(300);
  expect(await stage.locator("#stage-root").innerHTML(), "신호만 눌렀는데 수업 화면이 바뀌었어요").toBe(before);
  await expect(stage.getByRole("img", { name: "입자 그림 카드" })).toHaveCount(0);
  // 교사가 ‘띄우기’를 눌러야 수업 화면에 나가요. 다시 누르면 내려요
  await items(page).nth(0).getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.getByRole("img", { name: "입자 그림 카드" }).first()).toBeVisible();
  await expect(items(page).nth(0).getByRole("button", { name: "내리기" })).toBeVisible();
  await items(page).nth(0).getByRole("button", { name: "내리기" }).click();
  await expect(stage.getByRole("img", { name: "입자 그림 카드" })).toHaveCount(0);
  // × 로 닫아요(신호는 그대로)
  await sug(page).getByRole("button", { name: "추천 닫기" }).click();
  await expect(sug(page)).toHaveCount(0);
  await expect(page.locator(".pv-bar .sig.s-red")).toHaveAttribute("aria-pressed", "true");
  // 노랑: 이 장면의 노랑 자료 → 이 수업 자료(장면 없이 넣은 노랑)
  await page.locator(".pv-bar .sig.s-yellow").click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0).locator(".t")).toHaveText("상태 분류 카드 짝 활동");
  await expect(items(page).nth(0)).toContainText("이 장면 자료");
  await expect(items(page).nth(1).locator(".t")).toHaveText("다음 차시 예고: 차가운 컵 겉의 물방울");
  await expect(items(page).nth(1)).toContainText("이 수업 자료");
  // 같은 신호를 다시 누르면 신호도 추천도 지워져요
  await page.locator(".pv-bar .sig.s-yellow").click();
  await expect(page.locator(".pv-bar .sig.s-yellow")).toHaveAttribute("aria-pressed", "false");
  await expect(sug(page)).toHaveCount(0);
  // 다음 장면: 빨강 자료가 둘(발문 · 보충)이면 둘 다 이 장면 것, 발문은 말로 묻는 것이라 띄우기가 없어요
  await page.locator(".pv-bar .sig.s-red").click();
  await expect(sug(page)).toBeVisible();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(LABELS[3]);
  await expect(sug(page)).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0).locator(".t")).toHaveText("물속에 공기가 그렇게 많이 있었을까?");
  await expect(items(page).nth(0)).toContainText("말로 물어요");
  await expect(items(page).nth(0).locator("button")).toHaveCount(0);
  await expect(items(page).nth(1).locator(".t")).toHaveText("거품 속 들여다보기 그림");
  await expect(items(page).nth(1).getByRole("button", { name: "수업 화면에 띄우기" })).toBeVisible();
  // 기록에는 신호가 장면별로 남아요(수업 뒤 보충할 장면으로 이어져요)
  await page.locator('.pv-head [data-act="end-ask"]').click();
  await page.locator(".end-confirm").getByRole("button", { name: "수업 종료" }).click();
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  const rec = (await localRecords(page))[0];
  const on = (label) => rec.events.filter((e) => e.label === label).map((e) => e.type);
  expect(on(LABELS[2])).toEqual(["red", "yellow", "clear", "red"]);
  expect(on(LABELS[3])).toEqual(["red"]);
  expect(errors).toEqual([]);
});

test("휴대폰: 신호를 누르면 엄지 자리 위에 지금 쓸 것이 떠요(스크롤 없이)", async ({ page }, info) => {
  test.skip(isPc(info), "휴대폰에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  // 이 기기만일 때는 휴대폰 크기의 수업 미리보기가 리모컨 화면이에요(같은 계정 휴대폰의 끝내기 단추는 realtime.spec.js)
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  for (let i = 0; i < 2; i++) await page.locator('.thumb-nav [data-act="next"]').click();
  await expect(page.locator(".rm-top .rm-n")).toHaveText("3 / 8");
  await page.locator(".thumb-nav .sig.s-red").click();
  const s = page.locator(".thumb-nav .sug");
  await expect(s).toBeVisible();
  await expect(s.locator("li")).toHaveCount(2);
  await expect(s.locator("li").first().locator(".t")).toHaveText("입자 그림 카드");
  for (const sel of [".thumb-nav .sug", ".thumb-nav .sigs", '.thumb-nav [data-act="next"]', ".rm-top"]) await expect(page.locator(sel).first()).toBeInViewport();
  await noScroll(page, "휴대폰 추천");
  await noSideScroll(page, "휴대폰 추천");
  // 장면을 넘기면 사라져요
  await page.locator('.thumb-nav [data-act="next"]').click();
  await expect(s).toHaveCount(0);
  expect(errors).toEqual([]);
});
