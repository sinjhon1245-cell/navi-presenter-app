// 0.6단계 확인: 수업 고르기 → 준비 → 진행 → 학생 반응 기록 → 다음 수업에 활용. window.claude 없이(이 브라우저만) 시험해요.
import { test, expect } from "@playwright/test";
import { DATA, lesson, LABELS, isPc, fixture, watch, scroll, noSideScroll, curLabel, nextBtn, toFlow, openLesson, localRecords, finishLesson, toExamples, copyCurrent, noFileStore, openMore } from "./helpers.js";

const lastLabel = (L) => L.pages[L.pages.length - 1].label;

test("예시 수업 5개를 하나씩 골라 미리보기로 끝까지 진행하고, 바꿀 때 앞 수업 내용이 섞이지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  // 처음은 ‘내 수업’(2026-11-11). 예시 수업은 따로 둔 메뉴예요
  await expect(page.locator(".mylib")).toContainText("아직 만든 수업이 없어요");
  await expect(page.locator(".lcard")).toHaveCount(0);
  await toExamples(page);
  await expect(page.locator(".lcard")).toHaveCount(5);
  await expect(page.locator(".lib")).toContainText("직접 제작한 예시 수업");
  await expect(page.locator(".lib")).not.toContainText("비바샘");
  for (const L of DATA.lessons) {
    await openLesson(page, L.id);
    await expect(page.locator(".sbar-title b")).toHaveText(L.title);
    // 장면 목록과 수업 자료가 이 수업 것만
    await expect(page.locator(".srow .t")).toHaveText(L.pages.map((p) => p.label));
    const sceneWithRes = L.pages.find((p) => L.res.some((r) => r.scene === p.id));
    await page.locator('.srow[data-v="' + sceneWithRes.id + '"]').click();
    const titles = L.res.filter((r) => r.scene === sceneWithRes.id).map((r) => r.title);
    const shown = await page.locator(".res-pane .res-row .grow").allInnerTexts();
    expect(shown.length).toBe(titles.length);
    shown.forEach((t) => expect(titles.some((x) => t.includes(x)), "다른 수업 자료가 섞였어요: " + t).toBe(true));
    // 미리보기로 끝까지
    await page.getByRole("button", { name: "수업 미리보기" }).click();
    for (let i = 0; i < L.pages.length - 1; i++) await nextBtn(page).click();
    await expect(curLabel(page)).toHaveText(lastLabel(L));
    await finishLesson(page);
    await expect(page.locator(".memo-sheet")).toContainText(L.title);
    await page.getByRole("button", { name: "끝내기", exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test("수업 고르기: 학년·교과로 거르고, 고친 내용은 이 브라우저에 남고, 잃을 것이 있으면 바꾸기 전에 알려요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await noFileStore(page);
  await page.goto("/");
  await toExamples(page);
  await page.locator('.fchip[data-act="lib-grade"][data-v="6"]').click();
  await expect(page.locator(".lcard")).toHaveCount(2);
  await page.locator('.fchip[data-act="lib-subj"][data-v="과학"]').click();
  await expect(page.locator(".lcard")).toHaveCount(0);
  await expect(page.locator(".lib")).toContainText("이 조건의 예시 수업이 없어요");
  await page.locator('.fchip[data-act="lib-grade"][data-v="0"]').click();
  await expect(page.locator(".lcard")).toHaveCount(2);
  await page.locator('.fchip[data-act="lib-subj"][data-v=""]').click();
  await expect(page.locator(".lcard")).toHaveCount(5);
  // 수학 수업을 열면 예시 원본이라 고칠 수 없고, ‘수정해서 사용하기’로 복제해 장면 이름을 고쳐요. 새로고침해도 그대로 열려요
  await openLesson(page, "ex-m3-fraction");
  await expect(page.locator(".ex-ro")).toContainText("고칠 수 없어요");
  await expect(page.locator("#pg-s1-label")).toHaveAttribute("readonly", "");
  await copyCurrent(page);
  await page.locator('.srow[data-v="s2"]').click();
  await page.locator("#pg-s2-label").fill("피자 나누기");
  await page.locator("#pg-s2-label").blur();
  await expect(page.locator('.srow[data-v="s2"] .t')).toHaveText("피자 나누기");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator(".mylib .mrow")).toHaveCount(1);
  await expect(page.locator(".mylib .mrow")).toContainText("예시에서 복제");
  await toFlow(page);
  await expect(page.locator(".sbar-title b")).toHaveText(lesson("ex-m3-fraction").title);
  await expect(page.locator('.srow[data-v="s2"] .t')).toHaveText("피자 나누기");
  // 예시 원본은 그대로예요
  await openLesson(page, "ex-m3-fraction");
  await expect(page.locator('.srow[data-v="s2"] .t')).toHaveText(lesson("ex-m3-fraction").pages[1].label);
  // 파일을 저장할 수 없는 브라우저(사생활 보호 창 등)에서 파일을 올린 뒤 다른 수업으로 바꾸려 하면 먼저 알려 줘요
  // (저장할 수 있으면 올린 파일은 내 수업이 되어 잃을 것이 없어요: tests/files.spec.js)
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("이 브라우저에는 파일을 저장할 수 없어요")).toBeVisible();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".mylib .mrow")).toContainText("예시에서 복제");
  await toExamples(page);
  await page.locator('.lcard[data-v="ex-s5-ecosystem"]').click();
  await page.locator('.lib-sum [data-act="lib-open"]').click();
  const ask = page.locator('.pop[aria-label="바꾸기 전에 확인"]');
  await expect(ask).toContainText("다시 올려야 해요");
  await ask.getByRole("button", { name: "취소" }).click();
  await expect(page.locator(".sbar-sub")).toContainText("내 파일");
  await page.locator('.lib-sum [data-act="lib-open"]').click();
  await page.locator('.pop[aria-label="바꾸기 전에 확인"]').getByRole("button", { name: "그래도 바꾸기" }).click();
  await expect(page.locator(".sbar-title b")).toHaveText(lesson("ex-s5-ecosystem").title);
  expect(errors).toEqual([]);
});

test("수업 준비 화면: 장면 목록 · 슬라이드 · 교사 노트가 한 화면에 있고, 수업 자료는 ‘더 넣기’ 안에서 고른 장면에 맞춰 함께 바뀌어요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  // 고치는 화면은 내 수업에서: 예시 원본을 복제해요(장면 · 자료는 같아요)
  await copyCurrent(page);
  const vp = page.viewportSize();
  await noSideScroll(page, "수업 준비");
  if (vp.width >= 1100) {
    // 교사 화면(PC)에서는 화면 전체가 길어지지 않고, 칸마다 따로 스크롤해요.
    // 슬라이드가 가운데에 크게, 교사 노트 · 핵심 발화가 그 옆에 바로 보여요(2026-11-14, docs/SLIDE-PREP.md)
    expect((await scroll(page)).down, "수업 준비 화면 전체에 세로 스크롤이 생겨요").toBe(false);
    for (const sel of [".slist", ".scene-pane", ".sp-slide .slide", ".note-pane", 'textarea[data-k="notes"]', 'textarea[data-k="say"]']) await expect(page.locator(sel)).toBeInViewport();
  }
  const L = lesson("ex-s4-boiling");
  for (const p of [L.pages[0], L.pages[2]]) {
    await page.locator('.srow[data-v="' + p.id + '"]').click();
    await expect(page.locator('.srow[data-v="' + p.id + '"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".sp-title")).toHaveValue(p.label);
    await expect(page.locator('textarea[data-k="say"]')).toHaveValue(p.say.join("\n"));
    const n = L.res.filter((r) => r.scene === p.id).length;
    // 넣은 자료가 있는 장면은 ‘더 넣기’가 펼쳐져 있어요(넣은 것을 숨기지 않아요)
    if (n) await expect(page.locator("#sp-more")).toHaveAttribute("open", "");
    await expect(page.locator(".res-pane .res-row")).toHaveCount(n);
    if (!n) {
      // 자료가 없는 장면은 빈 상자 대신 짧은 안내와 '+ 자료'만 보여요
      await openMore(page);
      await expect(page.locator(".res-pane")).toHaveClass(/empty/);
      await expect(page.locator(".res-pane")).toContainText("이 장면에 넣은 자료가 없어요");
      const add = page.locator(".res-pane").getByRole("button", { name: "+ 자료" });
      // 저장이 끝나 화면이 다시 그려지는 순간과 겹쳐도 다시 해 봐요(펼친 채로 다시 그려져요)
      await expect(async () => { await add.scrollIntoViewIfNeeded(); await expect(add).toBeInViewport(); }).toPass({ timeout: 10000 });
    }
  }
  // 수업 자료 '보기'로 수업 화면에 어떻게 보일지 미리 봐요
  await page.locator('.res-row:has-text("입자 그림 카드") [data-act="res-pv"]').click();
  await expect(page.locator(".res-pv .slide.pic img")).toBeVisible();
  expect(errors).toEqual([]);
});

test("교사 화면: 핵심 발화·수업 화면·다음 장면·학생 반응·수업 자료가 스크롤 없이 보이고, 수업 화면에는 교사용 내용이 없어요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC) 시험이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await nextBtn(page).click();
  await nextBtn(page).click();
  expect((await scroll(page)).down, "교사 화면에 세로 스크롤이 생겨요").toBe(false);
  for (const sel of [".pv .prompter .say", ".pv-screen .slide", ".next-line", ".sigs", ".pv-bar .dock-res", '.pv-bar [data-act="next"]']) await expect(page.locator(sel).first()).toBeInViewport();
  // 수업 자료는 필요할 때만: 처음엔 닫혀 있고, 열어도 한 화면 안이에요
  await expect(page.locator(".pv-right .drawer")).toHaveCount(0);
  await page.locator(".pv-bar .dock-res").click();
  await expect(page.locator(".pv-right .drawer")).toBeInViewport();
  expect((await scroll(page)).down, "자료 서랍을 열면 세로 스크롤이 생겨요").toBe(false);
  await page.locator(".pv-bar .dock-res").click();
  // 핵심 발화가 가장 크게
  const sayPx = await page.locator(".pv .prompter .say").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(sayPx).toBeGreaterThanOrEqual(22);
  await expect(page.locator(".next-line")).toContainText(LABELS[3]);
  await expect(page.locator(".next-line")).toContainText("분");
  // 수업 화면에는 발화·메모·반응·질문이 보이지 않아요
  const L = lesson("ex-s4-boiling"), p = L.pages[2];
  await page.locator(".sig.s-yellow").click();
  const tvText = await stage.locator("body").innerText();
  for (const t of p.say.concat([p.notes, "교사 메모", "조금 더 확인해요", "질문 메모"])) expect(tvText).not.toContain(t);
  expect(errors).toEqual([]);
});

test("신호등: 학급 전체 반응을 한 번에 기록·수정·지우고, 시간순 기록이 남고, 맞는 자료가 위로 와요(수업 화면은 그대로)", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 확인해요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  const first = () => page.locator(".pv-right .item").first();
  await page.keyboard.press("m");
  const stageBefore = await stage.locator(".stage").innerHTML();
  // 버튼마다 색 + 아이콘 + 글자
  for (const k of ["red", "yellow", "green"]) {
    await expect(page.locator(".sig.s-" + k + " i svg")).toHaveCount(1);
    await expect(page.locator(".sig.s-" + k)).toContainText(/다시 설명|더 확인|잘 이해/);
    await expect(page.locator(".sig.s-" + k)).toHaveAttribute("title", /다시 설명이 필요해요|조금 더 확인해요|잘 이해했어요/);
  }
  await page.locator(".sig.s-red").click();
  await expect(page.locator(".sig.s-red")).toHaveAttribute("aria-pressed", "true");
  await expect(first().locator(".kind-tag")).toHaveText("다시 설명");
  await expect(first().locator(".up-tag")).toHaveText("추천");
  // 다른 색을 고르면 최신 판단으로 바뀌어요
  await page.locator(".sig.s-green").click();
  await expect(page.locator(".sig.s-red")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".sig.s-green")).toHaveAttribute("aria-pressed", "true");
  await expect(first().locator(".kind-tag")).toHaveText("심화");
  // 노랑 → 더 확인 자료가 위로
  await page.locator(".sig.s-yellow").click();
  await expect(first().locator(".kind-tag")).toHaveText("더 확인");
  // 같은 색을 다시 누르면 지워져요
  await page.locator(".sig.s-yellow").click();
  await expect(page.locator(".sig.on")).toHaveCount(0);
  await expect(page.locator(".pv-right .up-tag")).toHaveCount(0);
  await page.locator(".sig.s-green").click();
  // 수업 화면은 저절로 바뀌거나 자료가 열리지 않아요
  await expect(stage.locator(".stage .slide.media, .stage .slide.pic, .stage .overlay")).toHaveCount(0);
  expect(await stage.locator(".stage").innerHTML()).toBe(stageBefore);
  // 끝내면 장면의 최신 반응과 시간순 기록이 함께 남아요
  for (let i = 3; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  const recs = await localRecords(page);
  expect(recs.length).toBe(1);
  const scene = recs[0].scenes.find((s) => s.label === LABELS[2]);
  expect(scene.sig).toBe("green");
  expect(recs[0].sig).toEqual({ red: 0, yellow: 0, green: 1 });
  expect(recs[0].events.filter((e) => e.label === LABELS[2]).map((e) => e.type)).toEqual(["red", "green", "yellow", "clear", "green"]);
  expect(errors).toEqual([]);
});

test("질문 메모는 신호등과 따로 남아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 확인해요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").fill("수증기가 눈에 보이는지 묻는 질문");
  await page.locator("#q-in").press("Enter");
  await expect(page.locator(".qline")).toContainText("수증기가 눈에 보이는지 묻는 질문");
  await expect(page.locator(".sig.on")).toHaveCount(0);
  await page.locator(".sig.s-red").click();
  await expect(page.getByRole("button", { name: "질문 메모 1" })).toBeVisible();
  // 질문만 남긴 장면에는 신호등이 없어요
  await nextBtn(page).click();
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").fill("세 가지 상태가 언제 바뀌는지 질문");
  await page.locator("#q-in").press("Enter");
  await expect(page.locator(".sig.on")).toHaveCount(0);
  for (let i = 3; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  const memo = page.locator(".memo-sheet");
  await expect(memo).toContainText("수증기가 눈에 보이는지 묻는 질문");
  await expect(memo).toContainText("세 가지 상태가 언제 바뀌는지 질문");
  const rec = (await localRecords(page))[0];
  expect(rec.sig).toEqual({ red: 1, yellow: 0, green: 0 });
  expect(rec.questions.map((q) => q.label)).toEqual([LABELS[1], LABELS[2]]);
  expect(rec.scenes.find((s) => s.label === LABELS[2]).sig).toBe("");
  expect(errors).toEqual([]);
});

test("수업 기록: 예시 기록 3건은 따로 표시되고, 내 기록은 새로고침 뒤에도 남아요", async ({ page, context }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 확인해요");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = watch(page, []);
  await page.goto("/");
  await page.getByRole("tab", { name: "수업 기록" }).click();
  const ex = page.locator("#ex-recs");
  await expect(ex).toHaveAttribute("open", "");
  await expect(ex.locator(".rec.ex")).toHaveCount(3);
  await expect(ex.locator(".rec.ex .ex-badge")).toHaveText(["예시 기록", "예시 기록", "예시 기록"]);
  await expect(page.locator('#records .hist[aria-label="내 수업 기록"]')).toHaveCount(0);
  await ex.locator(".rec-head").first().click();
  const body = ex.locator(".rec-body");
  for (const t of ["다시 지도할 것", "수업 흐름", "질문 메모", "보여 준 자료", "교사 메모"]) await expect(body).toContainText(t);
  await body.getByRole("button", { name: "글로 복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("[수업 기록 · 예시]");
  // 실제 수업 한 번
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await page.locator(".sig.s-yellow").click();
  for (let i = 2; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  await page.locator("#memo-text").fill("다음 시간에 수증기 다시");
  await page.locator("#memo-text").blur();
  await page.getByRole("button", { name: "수업 기록 보기" }).click();
  const mine = page.locator('#records .hist[aria-label="내 수업 기록"] .rec');
  await expect(mine).toHaveCount(1);
  await expect(mine.locator(".ex-badge")).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await toFlow(page);
  await page.getByRole("tab", { name: "수업 기록 1" }).click();
  await expect(mine).toHaveCount(1);
  await mine.locator(".rec-head").click();
  await expect(mine.locator("textarea")).toHaveValue("다음 시간에 수증기 다시");
  await expect(page.locator("#records")).toContainText("이 브라우저에만");
  expect(errors).toEqual([]);
});

test("처음부터 다시 시작: 장면과 자료는 그대로, 진행·반응만 처음으로, 끝난 기록은 그대로", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 확인해요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const scenes = await page.locator(".srow").count(), mats = DATA.lessons.find((L) => L.id === "ex-s4-boiling").res.length;
  // 끝난 기록 하나
  await page.getByRole("button", { name: "수업 시작" }).click();
  for (let i = 1; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  await page.getByRole("button", { name: "새 수업 준비" }).click();
  await page.getByRole("button", { name: "비우기" }).click();
  await expect(page.locator(".sbar")).toBeVisible();
  expect((await localRecords(page)).length).toBe(1);
  // 다시 수업, 세 번째 장면에서 빨강
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await nextBtn(page).click();
  await page.locator(".sig.s-red").click();
  // 메인 버튼에는 없고 '더보기' 안에 있어요
  await expect(page.locator(".pv-bar")).not.toContainText("처음부터");
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "처음부터 다시 시작" }).click();
  const ask = page.locator(".confirm").filter({ hasText: "처음부터 다시 시작할까요?" });
  await expect(ask).toContainText("끝난 수업 기록은 지우지 않아요");
  await ask.getByRole("button", { name: "기록 버리고 다시 시작" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect(page.locator(".tl .seg.sig-red")).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(1);
  // 이번에는 저장하고 다시 시작
  await nextBtn(page).click();
  await page.locator(".sig.s-green").click();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "처음부터 다시 시작" }).click();
  await page.getByRole("button", { name: "지금까지 기록 저장하고 다시 시작" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect.poll(async () => (await localRecords(page)).length).toBe(2);
  // 장면과 수업 자료는 그대로
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "수업 준비로" }).click();
  await expect(page.locator(".srow")).toHaveCount(scenes);
  const placed = await page.locator(".srow .badge:not(.empty)").allInnerTexts();
  expect(placed.reduce((a, x) => a + Number(x), 0)).toBe(mats - 1);
  expect(errors).toEqual([]);
});

test("수업 자료 초기화: 고친 내용을 처음 상태로 되돌리고, 내가 넣은 자료는 보관함에 남길 수 있어요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(page.getByRole("button", { name: "수업 자료 초기화" })).toBeDisabled();
  await expect(page.locator(".scard").filter({ hasText: "초기화" })).toContainText("예시 원본은 늘 처음 상태예요");
  await page.getByRole("tab", { name: "수업 준비" }).click();
  // 예시 원본은 읽기 전용이라 내 수업으로 복제해 고쳐요. 되돌리면 복제한 예시의 처음 상태로 가요
  await copyCurrent(page);
  await page.locator(".srow").first().click();
  await page.locator("#pg-s1-label").fill("고친 표지");
  await page.locator("#pg-s1-label").blur();
  await openMore(page);
  await page.getByRole("button", { name: "+ 자료" }).click();
  await page.locator("#d-title").fill("내 그림 자료");
  await page.getByRole("button", { name: "넣기" }).click();
  await expect(page.locator(".res-pane")).toContainText("내 그림 자료");
  // 수업 중에는 초기화할 수 없어요
  await page.getByRole("button", { name: "수업 시작" }).click();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "수업 준비로" }).click();
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(page.getByRole("button", { name: "수업 자료 초기화" })).toBeDisabled();
  await expect(page.locator(".scard").filter({ hasText: "초기화" })).toContainText("수업 중에는 쓸 수 없어요");
  // 수업을 끝내고 나서
  await page.getByRole("button", { name: "진행 중인 수업으로" }).click();
  await page.keyboard.press("End");
  await finishLesson(page);
  await page.getByRole("button", { name: "새 수업 준비" }).click();
  await page.getByRole("button", { name: "비우기" }).click();
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.getByRole("button", { name: "수업 자료 초기화" }).click();
  const ask = page.locator(".confirm").filter({ hasText: "처음 상태로 되돌릴까요?" });
  await expect(ask).toContainText("수업 기록은 그대로예요");
  await expect(ask.getByRole("checkbox", { name: /내가 넣은 자료 1개는 보관함에 남기기/ })).toBeChecked();
  await ask.getByRole("button", { name: "처음 상태로 되돌리기" }).click();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await expect(page.locator('.srow[data-v="s1"] .t')).toHaveText("표지");
  // 내가 넣은 자료는 보관함에 있어요 (자료 넣기 칸은 열어 둔 채예요)
  await page.locator(".srow").first().click();
  await openMore(page);
  const add = page.getByRole("button", { name: "+ 자료" });
  if (await add.count()) await add.click();
  await expect(page.locator("#bank-pick")).toContainText("내 그림 자료");
  expect((await localRecords(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("화면 크기별: 수업 고르기·수업 준비·미리보기에서 가로 스크롤과 잘림이 없어요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await noSideScroll(page, "내 수업");
  await toExamples(page);
  await noSideScroll(page, "예시 수업");
  await expect(page.locator(".lcard").first()).toBeVisible();
  await page.locator('.lcard[data-v="ex-k6-cardnews"]').click();
  await expect(page.locator(".lib-sum")).toBeInViewport();
  await page.locator('.lib-sum [data-act="lib-open"]').click();
  await noSideScroll(page, "수업 준비");
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await noSideScroll(page, "수업 미리보기");
  if (isPc(info)) expect((await scroll(page)).down, "교사 화면에 세로 스크롤이 생겨요").toBe(false);
  else await expect(page.locator(".thumb-nav")).toBeInViewport();
  await expect(page.locator(".sigs")).toBeVisible();
  expect(errors).toEqual([]);
});
