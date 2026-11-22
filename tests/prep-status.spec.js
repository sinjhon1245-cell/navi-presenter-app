// 수업 준비 위쪽 상태 영역(2026-11-16, PR #24). window.claude 없이(이 기기만) 시험해요. Google 변환은 tests/gslides.spec.js(에뮬레이터 · 가짜 Google)
// - 올린 직후에도 슬라이드가 첫 화면에 보여요(1366×768 · 1280×590). 안내는 칩 한 줄 + 조치가 필요한 것만 + 닫을 수 있는 결과 한 줄, 나머지는 ‘자세히’
// - 방식별 상태: PDF · PDF+PPTX(그림) · PPTX만(글자 화면 · 원본 디자인 아님) · 일반 한계와 실제로 찾은 것(PPTX에서만, PDF만이면 추정하지 않음)
// - 경고는 닫아도 사라지지 않아요(노트 불일치 · 파일 없음 · 글자 화면). 수업 끝 기록 시트는 ‘수업 기록 보기’가 주 단추
import { test, expect } from "@playwright/test";
import { isPc, watch, fixture, startFromPrep, localRecords, touchMisses } from "./helpers.js";

const pick = (page, ...names) => page.locator("#pdf-in").setInputFiles(names.map(fixture));
const pst = (page) => page.locator(".pst");
const chips = (page) => page.locator(".pst .pchip");
// the slide's top edge on screen, and how much of it shows in the first screen
const slideSeen = (page) => page.evaluate(() => { const el = document.querySelector(".sp-slide .slide, .scene-pane .slide"); const r = el.getBoundingClientRect(); return { top: r.top, seen: Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)), h: r.height }; });

test("PDF만: ‘PDF 그림’ · 노트 0, 일반 한계는 ‘자세히’ 안에, 애니메이션은 추정하지 않아요. 노트북 첫 화면에 슬라이드가 보여요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "anim.pdf");
  await expect(page.getByText("12장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  await expect(chips(page).nth(0)).toHaveText("PDF 그림 12장");
  await expect(chips(page).nth(1)).toHaveText("노트 0 / 12장");
  await expect(pst(page).getByRole("button", { name: /확인할 장/ })).toHaveCount(0);
  const more = pst(page).locator(".pst-more");
  await expect(page.locator(".pst-detail")).toBeHidden();
  await more.click();
  await expect(page.locator(".pst-limit")).toContainText("애니메이션 · 전환 · 동영상 · 소리는 재생되지 않아요");
  await expect(page.locator(".pst-found")).toHaveCount(0);
  await more.click();
  if (isPc(info)) {
    const s = await slideSeen(page);
    expect(s.seen, "첫 화면에 슬라이드가 거의 다 보여야 해요 " + JSON.stringify(s)).toBeGreaterThan(s.h * 0.6);
  }
  expect(errors).toEqual([]);
});

test("PDF + PPTX: 노트를 붙이고, PPTX에서 찾은 애니메이션 · 동영상 · 소리 장을 ‘확인할 장’으로(누르면 그 장면, 확인해도 목록은 남아요)", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "anim.pdf", "anim.pptx");
  await expect(page.getByText("12장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  await expect(chips(page).nth(0)).toHaveText("PDF 그림 · PPTX 노트 12장");
  await expect(chips(page).nth(1)).toHaveText("노트 12 / 12장");
  const found = pst(page).getByRole("button", { name: /확인할 장 6/ });
  await expect(found).toBeVisible();
  await found.click();
  const list = page.locator(".pst-found");
  await expect(list.getByRole("button", { name: "3장 · 애니메이션" })).toBeVisible();
  await expect(list.getByRole("button", { name: "2장 · 동영상 · 소리" })).toBeVisible();
  await expect(list.getByRole("button", { name: "10장 · 동영상 · 소리" })).toBeVisible();
  await list.getByRole("button", { name: "10장 · 동영상 · 소리" }).click();
  await expect(page.locator(".srow").nth(9)).toHaveAttribute("aria-current", "true");
  // 수업 시작 옆에도 한 마디
  await expect(page.locator(".sbar-sub .start-note")).toHaveText("확인할 장 6");
  await list.getByRole("button", { name: "확인했어요" }).click();
  await expect(page.locator(".pst-found")).toContainText("확인한 장");
  await expect(pst(page).getByRole("button", { name: /확인한 장 6/ })).toBeVisible();
  await expect(page.locator(".sbar-sub .start-note")).toHaveCount(0);
  if (isPc(info)) { const s = await slideSeen(page); expect(s.seen).toBeGreaterThan(0); }
  expect(errors).toEqual([]);
});

test("PPTX만: ‘글자 화면 · 원본 디자인 아님’을 칩 · 한 줄 · 수업 시작 옆에서 말하고, 한계는 ‘자세히’ 안에", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "anim.pptx");
  await expect(page.getByText("12장을 가져왔어요").first()).toBeVisible({ timeout: 30000 });
  await expect(chips(page).nth(0)).toHaveText("글자 화면 · 원본 디자인 아님");
  await expect(chips(page).nth(0)).toHaveClass(/warn/);
  // 한 줄 안에서: 경고 칩 + 원래 모양으로 가는 길(1280×590에서 따로 한 줄을 차지하지 않게, 2026-11-16)
  await expect(page.locator(".words-only")).toContainText("글자 화면 · 원본 디자인 아님");
  await expect(page.locator(".words-only")).toContainText("원래 모양으로");
  await expect(page.locator(".words-only .pchip")).toHaveAttribute("title", /학생에게 보이지 않고/);
  await expect(page.locator(".words-only").getByText("PDF 넣기")).toBeVisible();
  await expect(page.locator(".sbar-sub .start-note")).toHaveText("글자 화면 · 원본 디자인 아님");
  await expect(page.locator(".pst-limit")).toContainText("그림 · 도형 · 표 · 차트 · 글꼴 · 배치는 학생에게 보이지 않고");
  // 결과 줄을 닫아도 경고는 그대로
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(page.locator(".words-only")).toBeVisible();
  await expect(chips(page).nth(0)).toHaveText("글자 화면 · 원본 디자인 아님");
  if (isPc(info)) { const s = await slideSeen(page); expect(s.seen, JSON.stringify(s)).toBeGreaterThan(s.h * 0.6); }
  expect(errors).toEqual([]);
});

test("노트가 맞지 않으면: 안 붙였다고 말하고, 결과 줄을 닫아도 · 새로고침해도 경고와 ‘PPTX에서 노트 붙이기’가 남아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "other.pptx");
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요", { timeout: 30000 });
  await expect(chips(page).nth(1)).toHaveClass(/warn/);
  const close = page.getByRole("button", { name: "알림 닫기" });
  if (await close.count()) await close.click();
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요");
  await page.reload();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요");
  await expect(page.locator(".pair-warn").getByText("PPTX에서 노트 붙이기")).toBeVisible();
  expect(errors).toEqual([]);
});

// PR #24 검토(2026-11-16): 같은 자료인지 묻는 중에 새로고침하거나 다른 수업을 열었다 와도, 노트는 저절로 붙지 않고
// ‘아직 붙이지 않았어요’와 다시 고르는 방법이 남아요. 다시 고르면 같은 비교로 다시 묻고, 고른 대로만 해요
const toPrep = async (page) => { await page.reload(); await page.getByRole("tab", { name: "수업 준비" }).click(); };
const saved = (page) => expect(page.locator(".sbar .save")).toHaveText("이 브라우저에 저장");
const wait = (page) => page.locator(".pair-warn.notes-wait");

test("노트를 붙일지 묻는 중에 새로고침: 저절로 붙이지 않고 ‘아직 붙이지 않았어요’ · ‘PPTX에서 노트 붙이기’가 남아요. 다시 고르면 다시 묻고, 붙이면 사라져요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "shapes.pdf", "shapes.pptx");
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  // 묻는 동안에는 기다리는 줄을 겹쳐 보이지 않아요
  await expect(wait(page)).toHaveCount(0);
  await saved(page);
  for (let k = 0; k < 2; k++) {
    await toPrep(page);
    await expect(page.locator(".notes-ask")).toHaveCount(0);
    await expect(wait(page)).toContainText("노트를 아직 붙이지 않았어요");
    await expect(wait(page).getByText("PPTX에서 노트 붙이기")).toBeVisible();
    await expect(chips(page).nth(1)).toHaveText("노트 0 / 3장");
    await expect(chips(page).nth(1)).toHaveClass(/warn/);
    await expect(page.locator(".np-notes textarea")).toHaveValue("");
  }
  // 다시 고르면 같은 비교로 다시 물어요(아직 붙이지 않아요)
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pptx"));
  const ask = page.locator(".notes-ask");
  await expect(ask).toBeVisible({ timeout: 30000 });
  await expect(ask.locator(".pc-row img")).toHaveCount(3);
  await expect(wait(page)).toHaveCount(0);
  await expect(chips(page).nth(1)).toHaveText("노트 0 / 3장");
  await ask.getByRole("button", { name: "노트 붙이기" }).click();
  await expect(chips(page).nth(1)).toHaveText("노트 3 / 3장");
  await expect(wait(page)).toHaveCount(0);
  await saved(page);
  await toPrep(page);
  await expect(chips(page).nth(0)).toHaveText("PDF 그림 · PPTX 노트 3장");
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("PDF 수업에 ‘PPTX에서 노트 붙이기’로 묻는 중 새로고침해도 같아요. ‘붙이지 않기’는 교사의 답이라 더 묻지 않고, 노트 칸의 ‘+ PPTX에서 노트 붙이기’는 남아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "shapes.pdf");
  await expect(page.getByText("3장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  await expect(chips(page).nth(1)).not.toHaveClass(/warn/);
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pptx"));
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  await saved(page);
  await toPrep(page);
  await expect(page.locator(".notes-ask")).toHaveCount(0);
  await expect(wait(page)).toContainText("노트를 아직 붙이지 않았어요");
  await expect(page.locator(".np-notes textarea")).toHaveValue("");
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pptx"));
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  await page.locator(".notes-ask").getByRole("button", { name: "붙이지 않기" }).click();
  await expect(page.getByText("노트를 붙이지 않았어요. 노트 없이 PDF로 수업해요.")).toBeVisible();
  await expect(wait(page)).toHaveCount(0);
  await toPrep(page);
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  await expect(chips(page).nth(1)).toHaveText("노트 0 / 3장");
  await expect(page.locator(".add-notes")).toHaveText("+ PPTX에서 노트 붙이기");
  expect(errors).toEqual([]);
});

test("글자 화면 PPTX 수업에 PDF를 넣을지 묻는 중 새로고침: PDF를 넣지 않고, 글자 화면 경고와 ‘원래 모양으로 [PDF 넣기]’가 남아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pptx");
  await expect(page.locator(".words-only")).toBeVisible({ timeout: 30000 });
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pdf"));
  await expect(page.locator(".notes-ask")).toContainText("원래 모양을 넣어 주세요", { timeout: 30000 });
  await saved(page);
  await toPrep(page);
  await expect(page.locator(".notes-ask")).toHaveCount(0);
  await expect(page.locator(".sp-slide .slide.img")).toHaveCount(0);
  await expect(page.locator(".words-only")).toContainText("글자 화면 · 원본 디자인 아님");
  await expect(page.locator(".words-only").getByText("PDF 넣기")).toBeVisible();
  expect(errors).toEqual([]);
});

// 손가락으로 누르는 칸(PR #24 검토): 상태 영역에서 누르는 것은 모두 44px 안쪽 어디를 눌러도 그것이 눌려요(이웃과 겹치지 않아요).
// 보이는 크기는 그대로라 슬라이드가 내려가지 않아요(휴대폰 슬라이드 먼저 시험이 함께 봐요)
const hits = (page) => touchMisses(page, ".pst button, .pst label.btn");

test("휴대폰 · 터치: 상태 영역의 칩 · ‘자세히’ · 변환 · 노트 · 닫기 단추는 44px 칸 어디를 눌러도 눌리고, 이웃과 겹치지 않아요", async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, "휴대폰에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  // PDF + PPTX: 칩(확인할 장) · 시작 전 확인 · 자세히 · 결과 닫기, 펼치면 찾은 장 · 확인했어요
  await pick(page, "anim.pdf", "anim.pptx");
  await expect(pst(page).getByRole("button", { name: /확인할 장 6/ })).toBeVisible({ timeout: 30000 });
  let h = await hits(page);
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  await pst(page).getByRole("button", { name: /확인할 장 6/ }).click();
  await expect(page.locator(".pst-found")).toBeVisible();
  h = await hits(page);
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  // PPTX만: 원래 모양으로 [PDF 넣기](슬라이드 위)
  await page.goto("/");
  await pick(page, "anim.pptx");
  await expect(page.locator(".words-only")).toBeVisible({ timeout: 30000 });
  h = await hits(page);
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  // 노트를 붙일지 묻기(같은 수업이에요 · 붙이지 않기), 그리고 새로고침 뒤 ‘PPTX에서 노트 붙이기’
  await page.goto("/");
  await pick(page, "shapes.pdf", "shapes.pptx");
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  h = await hits(page);
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  await saved(page);
  await toPrep(page);
  await expect(wait(page)).toBeVisible();
  h = await hits(page);
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  expect(errors).toEqual([]);
});

test("원본 파일이 이 브라우저에 없으면: 칩 줄 바로 아래에 ‘파일 다시 넣기’와 함께 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf");
  await expect(page.getByText("3장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase("navi-files"); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await page.reload();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  const need = page.locator(".pst .file-need");
  await expect(need).toContainText("이 브라우저에 없어요");
  await expect(need.getByText("파일 다시 넣기")).toBeVisible();
  expect(errors.filter((e) => !/ERR_FILE_NOT_FOUND|blob:/.test(e))).toEqual([]);
});

test("수업 시작 → 끝: 기록 시트의 주 단추는 ‘수업 기록 보기’(휴대폰은 넓게), 누르면 그 기록이 열려요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "lesson.pptx");
  await expect(page.getByText("3장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  if (isPc(info)) await startFromPrep(page);
  else { await page.getByRole("tab", { name: /수업 준비|준비/ }).first().click(); await page.getByRole("button", { name: "수업 시작" }).first().click(); }
  await page.locator('[data-act="end-ask"]').first().click();
  await page.locator(".end-confirm").getByRole("button", { name: "수업 종료" }).click();
  await expect(page.locator(".memo-sheet")).toBeVisible();
  const go = page.locator(".memo-sheet .rec-go");
  await expect(go).toHaveText(/수업 기록 보기/);
  await expect(go).toHaveClass(/primary/);
  // 기록 저장이 끝나면 시트가 다시 그려져요: 다시 그려진 단추로 재요
  await expect.poll(() => go.evaluate((e) => Math.round(e.getBoundingClientRect().height)).catch(() => 0)).toBeGreaterThanOrEqual(isPc(info) ? 44 : 52);
  if (!isPc(info)) await expect.poll(() => go.evaluate((e) => e.getBoundingClientRect().width).catch(() => 0)).toBeGreaterThan(page.viewportSize().width * 0.8);
  // 수업 흐름 칸의 장면 이름은 줄임표로 잘리지 않고 두 줄까지
  const clip = await page.locator(".memo-sheet .tl.band .seg b").first().evaluate((e) => getComputedStyle(e).whiteSpace);
  expect(clip).not.toBe("nowrap");
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  await go.click();
  await expect(page.locator("#records")).toBeVisible();
  await expect(page.getByLabel("내 수업 기록")).toBeVisible();
  expect(errors).toEqual([]);
});

test("‘자세히’는 키보드로: Enter로 펼치고 접고, 초점은 그 단추에 남고, 펼친 칸과 이어져 있어요(aria-controls)", async ({ page }, info) => {
  test.skip(!isPc(info), "키보드는 교사 PC에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "anim.pdf", "anim.pptx");
  await expect(page.getByText("12장을 올렸어요").first()).toBeVisible({ timeout: 30000 });
  const more = page.locator(".pst .pst-more");
  await expect(more).toHaveAttribute("aria-controls", "pst-detail");
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#pst-detail")).toBeVisible();
  await expect(page.locator(".pst .pst-more")).toBeFocused();
  // PPTX 검사가 끝나 ‘확인할 장’ 칩이 늦게 생겨도 초점은 ‘자세히’에 그대로예요(같은 이름표라 옆 칩으로 옮겨 가던 것, 2026-11-16)
  await expect(page.locator(".pst").getByRole("button", { name: /확인할 장/ })).toBeVisible();
  await expect(page.locator(".pst .pst-more")).toBeFocused();
  // 펼친 칸의 장면 단추까지 Tab으로 가요
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest(".pst"))).toBe(true);
  await page.locator(".pst .pst-more").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".pst .pst-more")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#pst-detail")).toBeHidden();
  await expect(page.locator(".pst .pst-more")).toBeFocused();
  expect(errors).toEqual([]);
});

test("휴대폰: 슬라이드가 먼저(첫 화면에 다 보여요), 꼭 볼 것(글자 화면 경고 · 원래 모양으로)은 그 위에, 칩 · 결과 · 수업 정보는 그 아래", async ({ page }, info) => {
  test.skip(isPc(info), "휴대폰에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "anim.pptx");
  await expect(page.locator(".words-only")).toBeVisible({ timeout: 30000 });
  const s = await slideSeen(page);
  expect(s.seen, "슬라이드가 첫 화면에 다 보여요 " + JSON.stringify(s)).toBeGreaterThanOrEqual(s.h - 1);
  // 다시 그려지는 사이(자리 없음)면 조금 기다려 다시 재요
  const y = async (sel) => { for (let i = 0; i < 30; i++) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (b) return b.y; await page.waitForTimeout(100); } throw new Error("자리를 못 쟀어요: " + sel); };
  expect(await y(".words-only")).toBeLessThan(s.top);
  await expect(page.locator(".words-only").getByText("PDF 넣기")).toBeInViewport();
  expect(await y(".pst-result")).toBeGreaterThan(s.top);
  expect(await y(".notice-row.lmeta")).toBeGreaterThan(s.top);
  // 글자 크기 · 누르는 칸은 그대로
  // 저장 표시로 화면이 다시 그려지는 사이에 재면 0이 나와요: 다시 그려진 뒤의 단추로 재요
  await expect.poll(() => page.locator(".words-only .btn").first().evaluate((e) => e.getBoundingClientRect().height).catch(() => 0)).toBeGreaterThanOrEqual(32);
  await expect.poll(() => page.locator(".sbar").getByRole("button", { name: "수업 시작" }).evaluate((e) => e.getBoundingClientRect().height).catch(() => 0)).toBeGreaterThanOrEqual(40);
  expect(errors).toEqual([]);
});
