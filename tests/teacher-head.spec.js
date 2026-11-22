// 교사 화면 머리 정보 줄이기 · 다음 장면 그림(2026-11-16, PR #25, docs/TEACHER-HEAD.md). window.claude 없이(이 기기만) 시험해요
// - 머리: 수업 중에는 제목 · 장면 진행 · 시계 · 상태 · 수업 끝내기 · 도구 · ⋯. ‘교사 화면’ 글자와 밝게 · 어둡게 단추는 머리에서 빠지고, 밝게 · 어둡게는 ⋯ 안
// - 문제가 없는 상태(수업 화면 켜짐 · 이 기기만)는 조용한 점과 글자, 경고는 칩 그대로
// - ‘다음’ 칸에 다음 장면 슬라이드가 작게(지금 장면과 같은 그리기, 영상은 재생하지 않아요), 넘기면 바뀌고 마지막 장면 · ‘다음 장면’을 끄면 없어요
// - 1280×590 · 1366×768 · 1920×945에서 스크롤 없이, 지금 장면 미리보기는 그대로
import { test, expect } from "@playwright/test";
import { isPc, watch, fixture, toFlow, startFromPrep, LABELS, openMore } from "./helpers.js";

const head = (page) => page.locator(".pv-head");
const noScroll = async (page, where) => {
  const s = await page.evaluate(() => { const e = document.scrollingElement; return { down: e.scrollHeight > innerHeight + 1, side: e.scrollWidth > innerWidth + 1 }; });
  expect(s, where + ": 스크롤이 생겨요").toEqual({ down: false, side: false });
};
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });

test("머리: 수업 중에는 ‘교사 화면’ 글자 · 밝게 단추 없이, 밝게 · 어둡게는 ⋯ 안에서 한 번 누르면 바뀌고 메뉴가 닫혀요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북 · PC · 태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await startFromPrep(page);
  await expect(head(page)).toBeVisible();
  await expect(head(page).locator(".pv-who")).not.toContainText("교사 화면");
  await expect(head(page).locator(".pv-who b")).not.toBeEmpty();
  // 머리에 그대로 있는 것: 장면 진행 · 이 장면 시계 · 수업 끝내기 · 도구 · ⋯
  for (const sel of [".prog-n", ".pv-clock", '[data-act="end-ask"]', '[data-act="tools"]', '[data-act="more"]']) await expect(head(page).locator(sel).first()).toBeVisible();
  // 밝게 · 어둡게는 ⋯ 안에만
  await expect(head(page).locator('[data-act="tone-toggle"]')).toHaveCount(0);
  const tone = () => page.evaluate(() => document.documentElement.getAttribute("data-tone") || "");
  const before = await tone();
  await head(page).locator('[data-act="more"]').click();
  const menu = head(page).locator(".more-menu");
  await expect(menu.getByRole("button", { name: before === "light" ? "화면 어둡게" : "화면 밝게" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "수업 준비로" })).toBeVisible();
  await menu.locator('[data-act="tone-toggle"]').click();
  await expect(menu).toHaveCount(0);
  await expect.poll(tone).not.toBe(before);
  // 도구는 머리에서 한 번에(수업 중에 자주 써요)
  await head(page).locator('[data-act="tools"]').click();
  await expect(page.locator(".tools-pop")).toBeVisible();
  expect(errors).toEqual([]);
});

test("머리: 문제가 없는 상태는 조용한 점과 글자(칩 바탕 없음), 수업 화면이 열려 있지 않다는 안내는 그대로예요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  const st = head(page).locator(".pv-status");
  await expect(st).toContainText("수업 화면 켜짐");
  await expect(st.locator(".chip")).toContainText("이 기기만");
  const bg = await st.locator(".chip").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg === "rgba(0, 0, 0, 0)" || bg === "transparent", "칩 바탕 " + bg).toBe(true);
  // 수업 화면을 닫으면 알리는 줄과 ‘수업 화면 열기’가 그대로 나와요
  await stage.close();
  await expect(page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  await expect(page.locator('.pv-warn [data-act="stage-open"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("다음 장면 그림: ‘다음’ 칸에 다음 장면 슬라이드가 작게, 넘기면 바뀌고, 마지막 장면에서는 없어요. 글자 · 시간 줄은 그대로", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await startFromPrep(page);
  const card = page.locator(".next-card"), pic = card.locator(".nl-pic .slide");
  await expect(pic).toHaveCount(1);
  await expect(pic).toHaveAttribute("aria-label", /.+/);
  const second = await pic.getAttribute("aria-label");
  await expect(card.locator(".next-line")).toContainText(LABELS[1]);
  // 지금 장면 미리보기와 다른 그림(다음 장면)이고, 다음 칸 안에 다 보여요
  expect(await page.locator(".pv-screen .slide").first().getAttribute("aria-label")).not.toBe(second);
  const p = await box(card.locator(".nl-pic")), c = await box(card);
  expect(p.top >= c.top - 1 && p.bottom <= c.bottom + 1, "그림이 다음 칸 안에").toBe(true);
  expect(p.w).toBeGreaterThanOrEqual(100);
  // 화면 읽기에는 글자 줄만(그림은 숨김)
  await expect(card.locator(".nl-pic")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("ArrowRight");
  await expect(card.locator(".next-line")).toContainText(LABELS[2]);
  await expect(pic).not.toHaveAttribute("aria-label", second);
  // 마지막 장면: 그림 없이 ‘마지막 장면이에요’
  for (let i = 2; i < LABELS.length; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".next-line")).toContainText("마지막 장면이에요");
  await expect(page.locator(".next-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("다음 장면 그림: PDF 수업은 다음 쪽 그림, ‘다음 장면’을 끄면 다음 칸이 없어요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  await startFromPrep(page);
  const img = page.locator(".next-card .nl-pic .slide.img img");
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((i) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);
  const now = await page.locator(".pv-screen .slide.img img").getAttribute("src");
  expect(await img.getAttribute("src")).not.toBe(now);
  // 발표 설정에서 ‘다음 장면’을 끄면 다음 칸이 없어요
  await head(page).locator('[data-act="more"]').click();
  await head(page).locator(".more-menu").getByRole("button", { name: "수업 준비로" }).click();
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.locator('input[data-set="showNext"]').uncheck();
  await toFlow(page);
  await page.locator(".sbar").getByRole("button", { name: "진행 중인 수업으로" }).click();
  await expect(page.locator(".pv-head")).toBeVisible();
  await expect(page.locator(".next-card")).toHaveCount(0);
  await expect(page.locator(".next-line")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("다음 장면이 영상이면: 그림 칸은 영상이라고만 보여 주고 재생하지 않아요(교사 화면에 영상 창이 생기지 않아요)", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  const ids = await page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
  await page.locator('.srow[data-v="' + ids[1] + '"]').click();
  await openMore(page);
  await page.locator("#pg-" + ids[1] + "-video").fill("https://youtu.be/navitest001");
  await page.locator("#pg-" + ids[1] + "-video").blur();
  await page.locator('.srow[data-v="' + ids[0] + '"]').click();
  await startFromPrep(page);
  const pic = page.locator(".next-card .nl-pic");
  await expect(pic.locator(".slide.media.vid")).toHaveCount(1);
  await expect(pic.locator("iframe")).toHaveCount(0);
  await expect(pic).toContainText("YouTube 영상");
  expect(errors).toEqual([]);
});

test("크기: 1280×590 · 1366×768 · 1920×945에서 스크롤 없이, 지금 장면 미리보기는 다음 칸 위에 다 보이고, 신호 뒤 추천이 열려도 그래요", async ({ page }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "창 크기를 바꿔 한 번 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await startFromPrep(page);
  for (const [w, h] of [[1280, 590], [1366, 768], [1920, 945]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".next-card")).toBeVisible();
    await noScroll(page, w + "×" + h);
    const s = await box(page.locator(".pv-screen .slide").first()), n = await box(page.locator(".next-card"));
    expect(s.bottom, w + "×" + h + ": 지금 장면이 다음 칸 위에").toBeLessThanOrEqual(n.top + 1);
    expect(n.bottom, w + "×" + h + ": 다음 칸이 화면 안").toBeLessThanOrEqual(h - 60);
    expect(s.h, w + "×" + h + ": 지금 장면 미리보기 높이").toBeGreaterThanOrEqual(h >= 700 ? 280 : 240);
  }
  // 신호 뒤 추천이 열려도(1280×590) 스크롤 없이
  await page.setViewportSize({ width: 1280, height: 590 });
  await page.locator(".sig.s-red").click();
  await noScroll(page, "1280×590 · 추천");
  expect(errors).toEqual([]);
});
