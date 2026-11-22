// 0.7단계 확인: 준비는 차분한 밝은 화면, 수업은 어두운 발표 화면, 기록은 문서처럼.
// 실제 수업 한 번을 처음부터 끝까지 돌리고, 기기 크기·접근성·대비·글꼴·수업 화면 원본 유지를 함께 봐요.
import { test, expect } from "@playwright/test";
import { lesson, LABELS, isPc, fixture, watch, scroll, noSideScroll, curLabel, nextBtn, localRecords, slideFits, finishLesson, noFileStore, toFlow, startFromPrep, rowAction } from "./helpers.js";

const L = lesson("ex-m3-fraction");
const red = L.pages[2]; // 똑같이 나누기: 다시 설명 자료가 둘 있어요

// 화면 밖으로 삐져나온 요소(가로로 스크롤되는 줄 안은 빼고)
const overflowing = (page) => page.evaluate(() => {
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  return [...document.querySelectorAll("#app *")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && !clipped(el);
  }).slice(0, 5).map((el) => el.className || el.tagName);
});
// 글자색과 그 뒤 바탕색의 대비 (WCAG)
const contrast = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  let bg = null;
  for (let p = el; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) { bg = c; break; } }
  bg = bg || rgb(getComputedStyle(document.body).backgroundColor);
  const fg = lum(rgb(getComputedStyle(el).color)), b = lum(bg);
  return +((Math.max(fg, b) + 0.05) / (Math.min(fg, b) + 0.05)).toFixed(2);
});
const tone = (page) => page.evaluate(() => document.documentElement.getAttribute("data-tone") || "");
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("수업 한 번 전체: 내 수업 → 준비 → 수업(교사 화면·수업 화면) → 끝 → 기록, 새로고침 뒤에도 남아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.goto("/");
  // 처음은 내 수업. 예시 수업에서 고르면 오른쪽에 요약, ‘수정해서 사용하기’로 내 수업에 복제해 준비해요(예시 원본은 읽기 전용)
  await expect(page.getByRole("tab", { name: "내 수업" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await expect(page.getByRole("tab", { name: "예시 수업" })).toHaveAttribute("aria-selected", "true");
  await page.locator('.lcard[data-v="' + L.id + '"]').click();
  await expect(page.locator(".lib-sum")).toContainText(L.title);
  await page.locator('.lib-sum [data-act="ex-copy"]').click();
  await expect(page.getByRole("tab", { name: "수업 준비" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sbar-title b")).toHaveText(L.title);
  expect(await tone(page)).toBe("");
  expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
  expect(await overflowing(page)).toEqual([]);
  // 준비: 장면을 고르고 핵심 발화를 고쳐요
  await page.locator('.srow[data-v="' + red.id + '"]').click();
  const say = page.locator("#pg-" + red.id + "-say");
  await say.fill(red.say.concat(["조각의 크기를 겹쳐서 비교해 볼까요?"]).join("\n"));
  await say.blur();
  await expect(page.locator(".res-pane .res-row")).toHaveCount(L.res.filter((r) => r.scene === red.id).length);
  // 수업 시작: 수업 화면 창이 열리고, 교사 화면은 어두운 발표 화면이 돼요
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  expect(await tone(page)).toBe("dark");
  expect(await bodyBg(page)).not.toBe("rgb(255, 255, 255)");
  // 수업 화면(슬라이드)은 교사 화면이 어두워져도 원래 색 그대로.
  // 다시 찾아 확인하는 단언으로 봐요(2026-11-15): 수업 시작 직후 저장이 끝나 화면이 다시 그려지는 순간 떨어져 나간 요소를 읽으면 색이 ""였어요
  await expect(page.locator(".pv-screen .slide")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(stage.locator(".stage .slide")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(red.label);
  await expect(page.locator(".pv .prompter")).toContainText("조각의 크기를 겹쳐서 비교해 볼까요?");
  expect((await scroll(page)).down, "교사 화면에 세로 스크롤이 생겨요").toBe(false);
  expect(await overflowing(page)).toEqual([]);
  // 빨강 → 자료 단추가 맞는 자료를 알려 주고, 서랍을 열면 위에 있어요. 수업 화면은 그대로
  const before = await stage.locator(".stage").innerHTML();
  await page.locator(".sig.s-red").click();
  await expect(page.locator(".pv-bar .dock-res")).toContainText("다시 설명 맞춤 2");
  expect(await stage.locator(".stage").innerHTML()).toBe(before);
  await page.locator(".pv-bar .dock-res").click();
  const first = page.locator(".pv-right .item").first();
  await expect(first.locator(".kind-tag")).toHaveText("다시 설명");
  // 교사가 고른 자료만 수업 화면에
  await first.getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".stage .slide.pic img")).toBeVisible();
  await expect(page.locator(".pv-screen .onair")).toHaveText("자료 보이는 중");
  await page.locator('.pv-bar [data-act="tv-close"]').click();
  await expect(stage.locator(".stage .slide.pic")).toHaveCount(0);
  // 질문 메모(학생 이름 없이)
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").fill("조각 수가 같으면 같은 분수인지 묻는 질문");
  await page.locator("#q-in").press("Enter");
  // 끝까지 넘기고 끝내기 → 밝은 기록 화면
  for (let i = 3; i < L.pages.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  const memo = page.locator(".memo-sheet");
  await expect(memo).toBeVisible();
  expect(await tone(page)).toBe("");
  await expect(memo.locator(".again ol")).toContainText(red.label);
  await expect(memo.locator(".tl.band .seg.sig-red")).toHaveCount(1);
  await expect(memo).toContainText("조각 수가 같으면 같은 분수인지 묻는 질문");
  await stage.close();
  // 수업 기록 보기 → 그 기록이 열린 채로
  await page.getByRole("button", { name: "수업 기록 보기" }).click();
  await expect(page.getByRole("tab", { name: "수업 기록 1" })).toHaveAttribute("aria-selected", "true");
  const rec = page.locator('#records .hist[aria-label="내 수업 기록"] .rec.open');
  await expect(rec.locator(".again-list")).toContainText(red.label);
  await expect(rec.locator(".tl.band .seg")).toHaveCount(L.pages.length);
  // 새로고침 뒤에도: 고친 발화와 기록이 이 브라우저에 남아요
  await page.waitForTimeout(600);
  await page.reload();
  // 다시 열면 내 수업(머리 막대 없음) → 수업 준비에 같은 수업이 열려 있어요
  await expect(page.locator(".mylib")).toBeVisible();
  await toFlow(page);
  await expect(page.locator(".sbar-title b")).toHaveText(L.title);
  await page.locator('.srow[data-v="' + red.id + '"]').click();
  await expect(page.locator("#pg-" + red.id + "-say")).toHaveValue(/조각의 크기를 겹쳐서/);
  const recs = await localRecords(page);
  expect(recs.length).toBe(1);
  expect(recs[0].scenes.find((s) => s.label === red.label).sig).toBe("red");
  expect(errors).toEqual([]);
});

test("모바일 리모컨: 핵심 발화와 넘기기·신호가 스크롤 없이 한 손 안에, 누르는 곳은 충분히 커요", async ({ page }, info) => {
  test.skip(isPc(info), "휴대폰 시험이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.getByRole("tab", { name: "예시 수업" }).tap();
  await page.locator('.lcard[data-v="' + L.id + '"]').tap();
  await page.locator('.lib-sum [data-act="lib-open"]').tap();
  await page.getByRole("button", { name: "수업 미리보기" }).tap();
  expect(await tone(page)).toBe("dark");
  await nextBtn(page).tap();
  await nextBtn(page).tap();
  await expect(curLabel(page)).toHaveText(red.label);
  // 맨 위 상태, 가운데 핵심 발화, 아래 엄지 영역이 한 화면에
  for (const sel of [".rm-top", ".prompter .say", ".rm-tv", ".thumb-nav .sigs", '.thumb-nav [data-act="next"]']) await expect(page.locator(sel).first()).toBeInViewport();
  await noSideScroll(page, "모바일 리모컨");
  expect(await overflowing(page)).toEqual([]);
  // 엄지로 누르는 것: 높이 56px 이상, 다음은 가장 넓게
  const box = async (sel) => page.locator(sel).first().boundingBox();
  for (const sel of [".thumb-nav .sig.s-red", ".thumb-nav .sig.s-green", '.thumb-nav [data-act="prev"]', '.thumb-nav [data-act="toc"]', '.thumb-nav [data-act="sheet"]', '.thumb-nav [data-act="next"]']) {
    const b = await box(sel);
    expect(b.height, sel + " 높이").toBeGreaterThanOrEqual(56);
    expect(b.width, sel + " 너비").toBeGreaterThanOrEqual(48);
  }
  expect((await box('.thumb-nav [data-act="next"]')).width).toBeGreaterThan((await box('.thumb-nav [data-act="prev"]')).width * 2);
  // 신호와 자료판: 화면 뒤를 눌러도 닫혀요
  await page.locator(".thumb-nav .sig.s-red").tap();
  await expect(page.locator(".thumb-nav .sig.s-red")).toHaveAttribute("aria-pressed", "true");
  await page.locator('.thumb-nav [data-act="sheet"]').tap();
  await expect(page.locator(".sheet .item").first().locator(".kind-tag")).toHaveText("다시 설명");
  await page.locator(".scrim").tap({ position: { x: 20, y: 120 } });
  await expect(page.locator(".sheet")).toHaveCount(0);
  // 핵심 발화 대비가 충분해요(어두운 바탕)
  expect(await contrast(page, ".prompter .say")).toBeGreaterThanOrEqual(7);
  expect(errors).toEqual([]);
});

test("글꼴 서버가 답하지 않아도(학교망 · CDN 멈춤) 앱은 바로 열리고, 시스템 글꼴로 수업을 시작할 수 있어요", async ({ page }, info) => {
  const errors = watch(page, []);
  // Pretendard를 주는 곳이 아무 답도 하지 않게 해요(끊기지도 않고 기다리기만 하는 상태)
  await page.route(/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/, () => {});
  const t = Date.now();
  await page.goto("/", { timeout: 10000 });
  expect(Date.now() - t, "페이지가 열리기까지").toBeLessThan(10000);
  // 첫 화면 내 수업이 바로 열리고, 수업 준비의 ‘수업 시작’도 바로 눌러요
  await expect(page.getByRole("button", { name: "새 수업 만들기" })).toBeVisible();
  await toFlow(page);
  await expect(page.getByRole("button", { name: "수업 시작" })).toBeVisible();
  // 글꼴 파일 목록은 아직 오지 않았어요(받는 중). 그동안 화면은 시스템 글꼴로 그려져 있어요
  const font = await page.evaluate(() => {
    const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find((x) => /pretendard/i.test(x.href));
    return { asked: !!l, state: l ? l.dataset.state || "기다리는 중" : "", faces: [...document.fonts].filter((f) => /Pretendard/i.test(f.family)).length };
  });
  expect(font).toEqual({ asked: true, state: "기다리는 중", faces: 0 });
  if (isPc(info)) {
    await page.getByRole("button", { name: "수업 미리보기" }).click();
    await nextBtn(page).click();
    await expect(curLabel(page)).toHaveText(LABELS[1]);
  }
  expect(errors).toEqual([]);
});

test("접근성: 버튼마다 이름이 있고, 글자 대비가 충분하고, 키보드 초점이 보이고, 글꼴이 바뀌어요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  // 내 수업 → 수업 준비
  await toFlow(page);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("#app button, #app a, #app [role=tab]")].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return !((el.getAttribute("aria-label") || "").trim() || (el.innerText || "").trim() || (el.getAttribute("title") || "").trim());
  }).map((el) => el.outerHTML.slice(0, 80)));
  expect(unnamed, "이름 없는 버튼").toEqual([]);
  // 밝은 화면의 본문·보조 글자
  expect(await contrast(page, ".sbar-title b")).toBeGreaterThanOrEqual(7);
  expect(await contrast(page, ".srow .n")).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page, ".sgroup")).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page, ".rd")).toBeGreaterThanOrEqual(4.5);
  // 키보드 초점이 눈에 보여요
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return el === document.body ? "none" : s.outlineStyle + " " + s.outlineWidth; });
  expect(outline).not.toMatch(/^none/);
  // 글꼴: Pretendard를 받을 수 있으면 실제로 쓰여요 (인터넷이 막히면 시스템 글꼴로 대신해요)
  // 글꼴은 페이지가 다 열린 뒤에 받아요. 받기가 끝날 때까지(성공 · 실패) 기다린 뒤에 봐요
  // (글꼴 서버가 10초 넘게 답하지 않으면 받지 못한 것으로 봐요. 그때도 앱은 시스템 글꼴로 이미 동작하고 있어요)
  await page.waitForFunction(() => { const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find((x) => /pretendard/i.test(x.href)); return !!(l && l.dataset.state); }, null, { timeout: 10000 }).catch(() => {});
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => /pretendard/i.test(l.href));
    let loaded = false; try { loaded = link.dataset.state === "loaded" && !!(link.sheet && link.sheet.cssRules.length); } catch (e) { loaded = link.dataset.state === "loaded"; }
    if (loaded) await document.fonts.load('16px "Pretendard Variable"', "수업");
    return { family: getComputedStyle(document.body).fontFamily, loaded, ok: document.fonts.check('16px "Pretendard Variable"', "수업") };
  });
  expect(font.family).toMatch(/^"?Pretendard/);
  if (font.loaded) expect(font.ok, "Pretendard 글꼴이 안 쓰여요").toBe(true);
  // 신호등 버튼: 색 + 아이콘 + 글자, 누른 색도 대비가 충분
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  for (const k of ["red", "yellow", "green"]) {
    const sig = page.locator(".sig.s-" + k).first();
    await expect(sig.locator("svg")).toHaveCount(1);
    await expect(sig).toContainText(/다시 설명|더 확인|잘 이해/);
    expect(await contrast(page, ".sig.s-" + k + " span")).toBeGreaterThanOrEqual(4.5);
    await sig.click();
    expect(await contrast(page, ".sig.s-" + k + ".on span"), k + " 누른 상태").toBeGreaterThanOrEqual(4.5);
  }
  expect(errors).toEqual([]);
});

test("화면 크기마다: 내 수업·준비·설정·기록·수업 화면에서 넘치거나 잘리는 요소가 없어요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  const check = async (where) => { await noSideScroll(page, where); expect(await overflowing(page), where + "에서 넘친 요소").toEqual([]); };
  await check("내 수업");
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await check("예시 수업");
  await page.locator('[data-act="lib-view"][data-v="gallery"]').click();
  await expect(page.locator(".lcards.gallery .lcard")).toHaveCount(5);
  await check("예시 수업 · 갤러리");
  await page.locator('.lib-sum [data-act="lib-close"], .lib-sum [data-act="lib-open"]').first().click();
  await check("수업 준비");
  if (isPc(info)) { await page.locator('[data-act="phone-pv"]').click(); await expect(page.locator(".d-phone .phone")).toBeVisible(); await check("휴대폰 미리보기"); }
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await check("발표 설정");
  await page.getByRole("tab", { name: "수업 기록" }).click();
  await page.locator("#ex-recs .rec-head").first().click();
  await expect(page.locator("#ex-recs .rec.open .tl.band")).toBeVisible();
  await check("수업 기록");
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await nextBtn(page).click();
  await check(isPc(info) ? "교사 화면" : "모바일 리모컨");
  if (isPc(info)) {
    await page.locator(".pv-bar .dock-res").click();
    await check("교사 화면 · 자료 서랍");
    expect((await scroll(page)).down, "교사 화면에 세로 스크롤이 생겨요").toBe(false);
  }
  expect(errors).toEqual([]);
});

test("프로젝터·TV: 4:3 프로젝터와 와이드 TV에서 슬라이드가 잘리지 않고 원래 색 그대로예요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  watch(stage, errors);
  for (const [w, h] of [[1024, 768], [1280, 800], [1280, 720], [1920, 1080], [2560, 1440]]) {
    await stage.setViewportSize({ width: w, height: h });
    const f = await slideFits(stage);
    expect(f.ok, w + "×" + h + " 슬라이드가 잘려요 " + JSON.stringify(f)).toBe(true);
    expect(f.ratio).toBeCloseTo(16 / 9, 1);
  }
  const look = await stage.locator(".stage .slide").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color, stage: getComputedStyle(el.parentElement).backgroundColor }));
  expect(look).toEqual({ bg: "rgb(255, 255, 255)", ink: "rgb(31, 42, 68)", stage: "rgb(14, 17, 22)" });
  // 교사 화면에는 수업 화면 창이 켜졌다고 그대로 말해요
  await expect(page.locator(".pv-head")).toContainText("수업 화면 켜짐");
  expect(errors).toEqual([]);
});

test("테마: 색 계열을 바꿔도 신호등 색은 그대로, 수업 중 교사 화면은 밝게도 쓸 수 있어요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 확인해요");
  const errors = watch(page, []);
  await page.goto("/");
  const sigBg = () => page.locator(".sig.s-red.on").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  // 기본(네이비·보라)에서 빨강 신호 색
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await page.locator(".sig.s-red").click();
  const base = await sigBg();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "수업 준비로" }).click();
  // 색 계열 바꾸기 → 강조색만 바뀌어요
  await page.getByRole("tab", { name: "발표 설정" }).click();
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pal-accent").trim());
  const before = await accent();
  await page.locator('[data-act="palette"][data-v="mint"]').click();
  expect(await accent()).not.toBe(before);
  // 수업 중 교사 화면을 밝게
  await page.locator('[data-act="set"][data-k="liveTone"][data-v="light"]').click();
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  expect(await tone(page)).toBe("light");
  expect(await bodyBg(page)).toBe("rgb(255, 255, 255)");
  await page.locator(".sig.s-red").click();
  expect(await sigBg()).toBe(base);
  // 머리 막대의 ⋯ 안에서 다시 어둡게(PR #25: 밝게 · 어둡게는 ⋯ 안에, 고른 것은 그대로 남아요)
  await page.locator(".pv-head").getByRole("button", { name: "더보기" }).click();
  await page.locator(".pv-head .more-menu").getByRole("button", { name: "화면 어둡게" }).click();
  expect(await tone(page)).toBe("dark");
  expect(await sigBg()).toBe(base);
  expect(errors).toEqual([]);
});

// ---------- 병합 전 회귀 확인: 눈에 보이는 단추로 하는 기존 기능 ----------
// 파일을 저장할 수 있는 브라우저(2026-11-11, docs/LOCAL-FILES.md): 올린 PDF는 내 수업이 되고, 지우기는 내 수업의 ‘삭제’(확인 줄)로 해요
test("회귀: 내 수업의 ‘파일 고르기’ 단추로 PDF를 올리면 내 수업으로 저장되고, 내 수업에서 지우면(확인 줄) 내 수업 목록으로 돌아가요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(노트북·PC·태블릿)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#up-box summary").click();
  await expect(page.locator("#drop")).toContainText("끌어다 놓거나");
  await expect(page.locator("#drop")).toContainText("이 브라우저에 저장해요");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#drop").getByText("파일 고르기").click()]);
  await chooser.setFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("tab", { name: "수업 준비" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sbar-sub")).toContainText("내 수업 · PDF 파일에서");
  await expect(page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await expect(page.locator(".srow")).toHaveCount(3);
  await expect(page.locator(".add-file")).toContainText("PDF · PPTX에서 장면 더하기");
  await noSideScroll(page, "올린 PDF 준비 화면");
  await page.getByRole("tab", { name: "내 수업" }).click();
  const row = page.locator(".mylib .mrow").filter({ hasText: "lesson" });
  await expect(row).toHaveCount(1);
  await rowAction(row, "삭제");
  await page.locator('.pop[aria-label="수업 지우기"]').getByRole("button", { name: "지우기" }).click();
  await expect(page.locator(".mylib .mrow")).toHaveCount(0);
  // 내 수업 목록에 남고, 지금 수업은 기본 예시예요(수업 준비에서 확인)
  await expect(page.locator(".mylib")).toBeVisible();
  await toFlow(page);
  await expect(page.locator(".sbar-sub")).toContainText("직접 제작한 예시");
  expect(errors).toEqual([]);
});

// 파일을 저장할 수 없는 브라우저(사생활 보호 창 등): 예전처럼 이 창에서만 쓰는 ‘내 파일’ 수업이고, ‘올린 파일 빼기’로 빼요
test("회귀: 파일을 저장할 수 없는 브라우저에서 ‘파일 고르기’ 단추로 PDF를 올리고, 올린 파일을 빼면 내 수업으로 돌아가요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(노트북·PC·태블릿)에서 해요");
  const errors = watch(page, []);
  await noFileStore(page);
  await page.goto("/");
  await page.locator("#up-box summary").click();
  await expect(page.locator("#drop")).toContainText("끌어다 놓거나");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#drop").getByText("파일 고르기").click()]);
  await chooser.setFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("tab", { name: "수업 준비" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sbar-sub")).toContainText("내 파일 · PDF");
  await expect(page.locator(".srow")).toHaveCount(3);
  await noSideScroll(page, "올린 PDF 준비 화면");
  // 빼기는 확인 줄로 묻고, 빼면 내 수업으로
  await page.getByRole("button", { name: "올린 파일 빼기" }).click();
  await page.locator(".confirm").getByRole("button", { name: "빼기" }).click();
  await expect(page.locator(".lib")).toBeVisible();
  // 지금 수업은 기본 예시로 돌아가요(수업 준비의 머리 막대에서 확인)
  await toFlow(page);
  await expect(page.locator(".sbar-sub")).toContainText("직접 제작한 예시");
  expect(errors).toEqual([]);
});

test("회귀: 수업 화면 창 — 전체 화면, 눌러 넘기기(왼쪽은 이전), B·W 가리기, 창을 닫으면 교사 화면이 바로 알려요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  const stage = await startFromPrep(page);
  watch(stage, errors);
  await stage.setViewportSize({ width: 1280, height: 720 });
  // 전체 화면: 창 안의 단추가 브라우저 전체 화면을 요청해요
  await stage.evaluate(() => { window.__fs = 0; document.documentElement.requestFullscreen = () => { window.__fs++; return Promise.resolve(); }; });
  await stage.locator('.stage-bar [data-act="full"]').click();
  expect(await stage.evaluate(() => window.__fs)).toBe(1);
  // 전자칠판처럼 화면을 눌러 넘겨요: 오른쪽은 다음, 왼쪽 1/3은 이전
  await stage.mouse.click(1000, 300);
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  await stage.mouse.click(1000, 300);
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await stage.mouse.click(150, 300);
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  // 수업 화면 창에서 누른 키도 똑같이 들어요
  await stage.keyboard.press("b");
  await expect(stage.locator(".blankout.black")).toBeVisible();
  await expect(page.locator(".pv-screen .onair")).toHaveText("화면 가림");
  await stage.keyboard.press("b");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  await page.keyboard.press("w");
  await expect(stage.locator(".blankout.white")).toBeVisible();
  await page.keyboard.press("w");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  // 창 닫기 → 교사 화면에 ‘열려 있지 않아요’ 안내와 다시 여는 단추(수업 화면은 선택이라 경고가 아니에요)
  // 누른 단추가 자기 창을 닫아서, 누르는 도중 창이 사라졌다는 시험 도구의 알림은 넘겨요(창이 실제로 닫혔는지는 close로 확인)
  await Promise.all([stage.waitForEvent("close"), stage.locator('.stage-bar [data-act="stage-close"]').click().catch((e) => { if (!/closed/i.test(e.message)) throw e; })]);
  await expect(page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  const [again] = await Promise.all([page.waitForEvent("popup"), page.locator(".pv-warn").getByRole("button", { name: "수업 화면 열기" }).click()]);
  await expect(again.locator(".stage-bar .chip").first()).toHaveText(LABELS[1]);
  await expect(page.locator(".pv-warn")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("회귀: 키보드 — N·P, Home·End, M 자료 서랍, Esc로 메뉴·서랍 닫기", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿) 키보드 시험이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await page.keyboard.press("n");
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  await page.keyboard.press("p");
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await page.keyboard.press("End");
  await expect(curLabel(page)).toHaveText(LABELS[LABELS.length - 1]);
  await expect(page.locator(".pv-bar .nav-main")).toContainText("수업 끝내기");
  await page.keyboard.press("Home");
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await page.keyboard.press("m");
  await expect(page.locator(".pv-right .drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pv-right .drawer")).toHaveCount(0);
  await page.getByRole("button", { name: "더보기" }).click();
  await expect(page.locator(".more-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".more-menu")).toHaveCount(0);
  // 글자를 쓰는 중에는 키가 넘기기로 가지 않아요
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").press("n");
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  expect(errors).toEqual([]);
});
