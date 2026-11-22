// 슬라이드 중심 수업 준비(2026-11-14, docs/SLIDE-PREP.md). window.claude 없이(이 기기만) 시험해요.
// 지키는 것: 올린 슬라이드가 가운데에 가장 크게, 교사 노트 · 핵심 발화는 옆에 바로(입력은 선택), 나머지는 ‘더 넣기’에 접어 두고,
// 선택 항목이 비었다고 경고하지 않으며, 아무것도 고치지 않고 바로 수업할 수 있어요. 작은 화면에서도 글자를 줄이거나 기능을 숨기지 않아요.
import { test, expect } from "@playwright/test";
import { watch, fixture, isPc, noSideScroll, openMore } from "./helpers.js";

// 시험마다 PDF · PPTX 읽기 도구(pdf.js · JSZip)를 CDN에서 새로 받아요. 한꺼번에 여러 번 돌리면 받는 데만 30초를 넘길 때가 있어 시험 하나에 60초를 줘요
test.describe.configure({ timeout: 60000 });
const pick = (page, ...names) => page.locator("#pdf-in").setInputFiles(names.map(fixture));
// 저장이 끝나 화면이 다시 그려지는 순간에는 잠깐 위치가 없을 수 있어서, 자리가 잡힐 때까지 다시 재요
const box = async (page, sel) => { let b = null; await expect.poll(async () => (b = await page.locator(sel).first().boundingBox()) !== null).toBe(true); return b; };
const prepPc = (info) => isPc(info) && info.project.name !== "tablet-768x1024";

test("PDF와 PPTX를 올린 직후: 슬라이드가 가장 크고 노트 · 발화가 바로 옆에, 선택 항목은 접혀 있고 경고가 없어요. 고치지 않고 시작하면 교사 화면에 노트가 크게", async ({ page }, info) => {
  test.skip(!prepPc(info), "수업 준비는 교사 PC에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "lesson.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  // 가운데 슬라이드가 장면 목록 · 오른쪽 칸보다 넓어요(교사 PC · 가로 태블릿은 세 칸)
  const slide = await box(page, ".sp-slide .slide"), side = await box(page, ".note-pane"), list = await box(page, ".slist");
  expect(slide.width).toBeGreaterThan(list.width);
  expect(slide.width).toBeGreaterThan(side.width);
  expect(slide.x).toBeGreaterThan(list.x);
  expect(side.x).toBeGreaterThan(slide.x);
  // 슬라이드 · 노트 · 발화가 한 화면에(올린 직후 알림이 있어도)
  for (const sel of [".sp-slide .slide", 'textarea[data-k="notes"]', 'textarea[data-k="say"]']) await expect(page.locator(sel)).toBeInViewport();
  // 장면 목록은 슬라이드 그림으로 알아봐요
  await expect(page.locator(".srow .th img")).toHaveCount(3);
  // 노트는 PPTX에서 와 있고, 붙이기 단추는 이미 노트가 있어 보이지 않아요
  await expect(page.locator('textarea[data-k="notes"]')).toHaveValue("씨앗을 직접 보여 주며 시작해요.");
  await expect(page.locator(".add-notes")).toHaveCount(0);
  // 선택 항목(개념 · 단계 · 시간 · 영상 · 자료)은 접혀 있고, 무엇이 있는지 한 줄로 말해요
  const more = page.locator("#sp-more");
  await expect(more).not.toHaveAttribute("open", "");
  await expect(more.locator("summary")).toContainText("더 넣기");
  await expect(more.locator("summary")).toContainText("선택");
  await expect(page.locator('input[data-k="concepts"]')).toBeHidden();
  // 비어 있는 선택 항목을 경고하지 않아요
  await expect(page.locator(".rd.warn")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("발화 빈 장면");
  await expect(page.locator(".srow .nosay")).toHaveCount(0);
  // 아무것도 고치지 않고 바로 시작: 학생에게는 PDF 그대로, 교사 화면에는 핵심 발화 대신 노트가 크게
  await page.locator(".srow").first().click();
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(stage.locator(".stage .slide.img img")).toBeVisible();
  await expect(page.locator(".pv .note-lead")).toContainText("씨앗을 직접 보여 주며 시작해요.");
  await expect(page.locator(".pv")).not.toContainText("핵심 발화가 없어요");
  // 수업 화면에는 노트가 없어요
  await expect(stage.locator("body")).not.toContainText("씨앗을 직접 보여 주며 시작해요.");
  // 둘째 장면은 물음표 제목이 핵심 발화가 되어(기본 정리) 발화가 위, 노트는 아래에 작게
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pv .say-list")).toBeVisible();
  await expect(page.locator(".pv .pr-foot .notes")).toContainText("조건 세 가지를 칠판에 적어요.");
  expect(errors).toEqual([]);
});

test("더 넣기: 펼치면 개념 · 단계 · 시간 · 영상 · 수업 자료가 있고, 한 번 펼치면 다른 장면에서도 펼친 채예요. 넣은 것이 있는 장면은 처음부터 펼쳐져요", async ({ page }, info) => {
  test.skip(!prepPc(info), "수업 준비는 교사 PC에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await page.locator(".srow").first().click();
  await openMore(page);
  for (const k of ["concepts", "stage", "min", "video"]) await expect(page.locator('[data-k="' + k + '"]')).toBeVisible();
  await expect(page.locator(".res-pane")).toContainText("이 장면에 넣은 자료가 없어요");
  await page.locator('input[data-k="concepts"]').fill("씨앗, 싹");
  await page.locator('input[data-k="concepts"]').blur();
  await expect(page.locator("#sp-more summary")).toContainText("개념 2");
  // 다른 장면에서도 펼친 채
  await page.locator(".srow").nth(1).click();
  await expect(page.locator("#sp-more")).toHaveAttribute("open", "");
  // 다시 열면(새로고침) 넣은 것이 있는 장면만 펼쳐져 있어요. 교사처럼 ‘이 브라우저에 저장’을 본 뒤에 새로고침해요
  await expect(page.locator(".sbar .save")).toHaveText("이 브라우저에 저장");
  await page.reload();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.locator(".srow").first().click();
  await expect(page.locator("#sp-more")).toHaveAttribute("open", "");
  await page.locator(".srow").nth(1).click();
  await expect(page.locator("#sp-more")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});

test("올린 뒤 알림은 닫을 수 있어요: 닫으면 슬라이드가 위로 올라오고, 노트를 붙이지 않았다는 경고와 확인 줄은 남아요", async ({ page }, info) => {
  test.skip(!prepPc(info), "수업 준비는 교사 PC에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "other.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  const before = await box(page, ".sp-slide .slide");
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(page.getByText("3장을 올렸어요")).toHaveCount(0);
  await expect(page.locator(".analysis")).toHaveCount(0);
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요");
  const after = await box(page, ".sp-slide .slide");
  expect(after.y).toBeLessThan(before.y);
  // 묻는 중인 확인 줄은 닫히지 않아요(교사가 골라야 해요)
  await pick(page, "shapes.pdf", "shapes.pptx");
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(page.locator(".notes-ask")).toBeVisible();
  expect(errors).toEqual([]);
});

test("작은 화면에서도 글자를 줄이거나 노트 · 더 넣기를 숨기지 않아요(필요하면 스크롤로 닿아요). 가로 스크롤은 없어요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  if (!isPc(info)) {
    // 휴대폰: 올리기는 PC에서 하지만, 예시를 복제한 준비 화면도 가로로 넘치지 않고 노트 칸이 있어요
    await page.getByRole("tab", { name: "준비" }).click();
    await page.locator('.ex-ro [data-act="ex-copy"]').click();
    await expect(page.locator('textarea[data-k="notes"]')).toHaveCount(1);
    await expect(page.locator(".srow .th").first()).toBeHidden();
    await noSideScroll(page, "휴대폰 수업 준비");
    expect(errors).toEqual([]);
    return;
  }
  await pick(page, "lesson.pdf", "lesson.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  // 저장이 끝나 화면이 다시 그려진 뒤에 재요
  await expect(page.locator(".sbar .save")).toHaveText("이 브라우저에 저장");
  const sizes = [[1536, 864], [1280, 590], [1024, 768]];
  const fontOf = (sel) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  let base = null;
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await noSideScroll(page, w + "×" + h + " 수업 준비");
    const f = { notes: await fontOf('textarea[data-k="notes"]'), say: await fontOf('textarea[data-k="say"]'), title: await fontOf(".sp-title"), row: await fontOf(".srow .t") };
    if (!base) base = f;
    expect(f, w + "×" + h + " 글자가 작아졌어요").toEqual(base);
    expect(Math.min(...Object.values(f))).toBeGreaterThanOrEqual(14);
    for (const sel of ['textarea[data-k="notes"]', 'textarea[data-k="say"]', "#sp-more summary"]) {
      const el = page.locator(sel);
      await expect(async () => { await el.scrollIntoViewIfNeeded(); await expect(el).toBeInViewport(); }, w + "×" + h + " " + sel).toPass({ timeout: 10000 });
    }
  }
  expect(errors).toEqual([]);
});

// 장면 목록에서 이름이 잘리지 않아요(2026-11-15): 실제 교사 PPTX처럼 같은 활동 제목이 되풀이되는 자료는 “활동1 · 그 장의 첫 줄”로
// 이름이 갈리는데, 좁은 목록이 한 줄로 자르면 “활동1. 문…”만 보였어요. 이름은 두 줄까지, PPTX만이라 슬라이드 그림이 없으면
// 모두 같은 모양인 작은 그림 자리를 이름에 내줘요. 휴대폰의 장면 알약은 예전처럼 한 줄이에요
test("장면 목록: 겹치지 않는 장면 이름이 두 줄까지 보이고, 슬라이드 그림이 없는 PPTX 수업은 같은 모양 작은 그림 대신 이름을 넓게 보여요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "우리 고장 문제 찾기.pptx");
  await expect(page.getByText("18장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  const rows = page.locator(".slist .srow");
  await expect(rows).toHaveCount(18);
  // 장면 알약(한 줄)은 폭 760px 이하(휴대폰)에서만. 세로 태블릿(768)부터는 세로 목록이라 이름이 두 줄까지예요
  const pills = page.viewportSize().width <= 760;
  if (!pills) {
    await expect(page.locator(".slist")).toHaveClass(/no-th/);
    await expect(page.locator(".slist .srow .th")).toHaveCount(18);
    expect(await page.locator(".slist .srow .th").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length)).toBe(0);
    // 같은 활동의 장면들: 이름 전체가 보여요(두 줄 안에서 잘리지 않음), 마우스를 올리면 번호와 이름
    // 글꼴(Pretendard)은 글자마다 나눠 받아요. 다 오기 전의 대신 글꼴로 재지 않게, 글꼴이 다 온 뒤에 재요(기준은 그대로)
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    for (const i of [6, 7, 8, 10]) {
      const t = rows.nth(i).locator(".t");
      // 나눠 받는 웹 글꼴 조각이 늦게 오면 잠깐 대신 글꼴로 세 줄이 돼요: 글꼴이 다 온 뒤의 모습을 기다려 재요(기준은 그대로)
      await expect.poll(() => t.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) * 2 + 2), { timeout: 10000 }).toBe(true);
    }
    await expect(rows.nth(7)).toHaveAttribute("title", "8. 활동1 · 지도에 붙임 쪽지 붙이기");
  } else {
    // 휴대폰: 장면 알약은 한 줄
    expect(await rows.nth(7).locator(".t").evaluate((e) => getComputedStyle(e).whiteSpace)).toBe("nowrap");
  }
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("장면 목록: PDF 슬라이드가 있는 수업은 작은 슬라이드 그림을 그대로 두고 이름은 두 줄까지 보여요", async ({ page }, info) => {
  test.skip(!prepPc(info), "수업 준비는 교사 PC에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "우리 고장 문제 찾기.pdf", "우리 고장 문제 찾기.pptx");
  await expect(page.getByText("18장을 올렸어요")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".slist")).not.toHaveClass(/no-th/);
  await expect(page.locator(".slist .srow .th img").first()).toBeVisible();
  const t = page.locator(".slist .srow").nth(6).locator(".t");
  await expect(t).toHaveText("활동1 · 역할 나누기");
  // 나눠 받는 웹 글꼴이 다 온 뒤에 재요(기준은 그대로, 위 장면 목록 시험과 같은 대기)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await expect.poll(() => t.evaluate((e) => e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) * 2 + 2), { timeout: 10000 }).toBe(true);
  expect(errors).toEqual([]);
});
