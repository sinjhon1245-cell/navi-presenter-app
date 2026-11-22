// 장면 진행 UI: 교사 화면 머리와 모바일 리모컨 위쪽에서 ‘지금 몇 번째 장면인지’를 가장 먼저, 수업 시간은 작고 얇게 보여 줘요.
// 장면 막대는 장면마다 같은 너비(지나온 = 강조색 · 지금 = 더 선명하게 · 앞으로 = 조용한 색), 도입 · 전개 · 정리는 묶음 사이 틈으로,
// 장면이 많으면 한 줄 막대로. 시간 막대는 수업 시계(시작 뒤 지난 시간)를 계획 시간과 견줘요. 장면 수로 시간을 짐작하지 않아요.
// 수업 화면(TV)에는 아무것도 더하지 않아요. 휴대폰과 PC가 같은지는 tests/realtime.spec.js(Firebase 에뮬레이터)에서 봐요.
import { test, expect } from "@playwright/test";
import { LABELS, isPc, watch, curLabel, toFlow, fixture } from "./helpers.js";

// 시험용 수업을 이 브라우저에 넣어 두고 열어요(2026-11-11 내 수업부터. 예전에는 ‘고친 예시’로 넣었지만 예시 원본은 이제 읽기 전용이에요)
// - 예시 모양 수업: ‘내 수업’ 하나로 넣고 마지막에 연 수업으로 적어 두면, 페이지가 열릴 때 그 수업이 지금 수업이 돼요
// - 파일(PDF · PPTX) 수업: 파일은 저장하지 않아서, 첫 장면에서 막 시작한 ‘끝나지 않은 수업’ 사본으로 넣고 ‘이어서 하기’로 열어요
const stagesFor = (n) => (i) => i < Math.max(1, Math.round(n * 0.2)) ? "도입" : i >= n - Math.max(1, Math.round(n * 0.2)) ? "정리" : "전개";
function makeDeck(n, o = {}) {
  const st = o.stages || stagesFor(n);
  return Object.assign({ kind: "example", title: "시험 수업 " + n + "장면", tag: "시험", res: [],
    pages: Array.from({ length: n }, (_, i) => ({ id: "t" + (i + 1), n: i + 1, stage: st(i), label: "장면 " + (i + 1), min: o.min === undefined ? 2 : o.min,
      layout: "question", eye: "시험", title: "장면 " + (i + 1) + " 질문", sub: "", notes: "", concepts: [], say: ["장면 " + (i + 1) + "의 핵심 발화"], rec: [], want: "" })) }, o.deck || {});
}
let seq = 0, resumeNext = false;
async function seed(page, deck) {
  await page.goto("/lessons.js");
  if (deck.kind === "pdf" || deck.kind === "pptx") {
    await page.evaluate((d) => {
      const t = Date.now(), S = { v: 5, started: true, ended: false, cur: d.pages[0].id, t0: t, enteredAt: t, log: [], reactions: [], qs: [], used: [], tv: null, blank: null, tool: null, memoId: null };
      localStorage.setItem("navi-run", JSON.stringify({ v: 1, at: t, lessonId: null, title: d.title, deck: Object.assign({ v: 5 }, d), S, said: {} }));
    }, deck);
    await page.goto("/");
    await expect(page.locator(".run-offer")).toContainText(deck.title);
    resumeNext = true;
    return;
  }
  resumeNext = false;
  const id = "m-" + String(Date.now().toString(16) + (++seq)).padStart(16, "0").slice(-16);
  const d = Object.assign({}, deck, { v: 5, kind: "mine", myId: id, key: "mine:" + id });
  await page.evaluate(([entry, id]) => new Promise((res, rej) => {
    localStorage.setItem("navi-last", "mine:" + id);
    const r = indexedDB.open("navi-local", 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => { const t = r.result.transaction("lessons", "readwrite"); t.objectStore("lessons").put(entry); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }), [{ id, at: 9e12, made: 9e12, kind: "mine", title: d.title, grade: 4, subject: "과학", from: "", deck: d }, id]);
  await page.goto("/");
  // 페이지는 내 수업으로 열리고(머리 막대 없음), 마지막에 연 그 수업이 수업 준비에 열려 있어요
  await toFlow(page);
  await expect(page.locator(".sbar-title b")).toHaveText(deck.title);
}
// 수업 시작(파일 수업은 넣어 둔 ‘끝나지 않은 수업’을 이어서 해요)
// 수업 화면 창은 페이지를 다시 열어도 그대로라(2026-11-19, docs/STAGE-KEEP.md), 이미 열려 있으면 새 창 없이 그 창을 그대로 써요
let stageOpen = null;
async function start(page) {
  // 끝나지 않은 수업은 내 수업 맨 위 알림의 ‘이어서 하기’, 새 수업은 수업 준비의 ‘수업 시작’
  if (!resumeNext) await toFlow(page);
  const go = resumeNext ? page.locator(".run-offer").getByRole("button", { name: "이어서 하기" }) : page.getByRole("button", { name: "수업 시작" });
  resumeNext = false;
  const kept = stageOpen && !stageOpen.isClosed() && stageOpen.context() === page.context() ? stageOpen : null;
  if (kept) await go.click();
  else [stageOpen] = await Promise.all([page.waitForEvent("popup"), go.click()]);
  await expect(page.locator(".pv-head .prog")).toBeVisible();
  if (kept) await expect(kept.locator(".stage-wait")).toHaveCount(0);
  return stageOpen;
}
const head = (page) => page.locator(".pv-head");
const count = (page) => head(page).locator(".prog-n");
const steps = (page) => head(page).locator(".tl.by-scene .seg");
const states = (page) => steps(page).evaluateAll((els) => els.map((e) => e.classList.contains("now") ? "now" : e.classList.contains("done") ? "done" : e.classList.contains("skip") ? "skip" : e.classList.contains("seen") ? "seen" : "-").join(""));
// 화면 읽기 프로그램이 읽는 지금 장면(경과 시간과는 따로 읽어요)
const said = (page) => head(page).locator(".prog-top > .vh").first().innerText();
const pad = (x, n) => String(x).padStart(String(n).length, "0");
const contrast = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  let bg = null;
  for (let p = el; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) { bg = c; break; } }
  bg = bg || rgb(getComputedStyle(document.body).backgroundColor);
  const fg = lum(rgb(getComputedStyle(el).color)), b = lum(bg);
  return +((Math.max(fg, b) + 0.05) / (Math.min(fg, b) + 0.05)).toFixed(2);
});
const noScroll = async (page, where) => {
  const s = await page.evaluate(() => { const e = document.scrollingElement; return { down: e.scrollHeight > innerHeight + 1, side: e.scrollWidth > innerWidth + 1 }; });
  expect(s, where + ": 스크롤이 생겨요").toEqual({ down: false, side: false });
};

test("장면 수 1 · 3 · 12 · 20 · 50: 번호와 칸 수가 맞고, 칸이 너무 작아지지 않으며, 많으면 한 줄 막대로 바뀌어요", async ({ page }, info) => {
  test.skip(info.project.name !== "pc-1536x864" && info.project.name !== "tablet-768x1024", "교탁 PC와 가장 좁은 교사 화면(세로 태블릿)에서 봐요");
  test.setTimeout(90000);
  const errors = watch(page, []);
  for (const n of [1, 3, 12, 20, 50]) {
    await seed(page, makeDeck(n));
    const stage = await start(page);
    await expect(count(page)).toHaveText(pad(1, n) + " / " + n + " 장면");
    await expect(steps(page)).toHaveCount(n);
    expect(await states(page)).toBe("now" + "-".repeat(n - 1));
    const flat = await head(page).locator(".tl.by-scene").evaluate((e) => e.classList.contains("flat"));
    expect(flat, n + "장면: 한 줄 막대 여부").toBe(n > 24);
    // 칸 너비: 따로 보이는 칸은 10px 이상, 한 줄 막대는 칸이 붙어 있어도 누를 자리(높이 18px 이상)가 있어요. 막대가 머리 밖으로 넘치지 않아요.
    // 화면이 자리 잡은 모양으로 재요(2026-11-15): 수업 시작 0.4초쯤 뒤 저장이 끝나 화면이 다시 그려지는 순간과 겹치면 위치가 없거나 0으로
    // 읽혀 세로 태블릿에서 가끔 실패했어요(앱 화면은 20ms마다 재도 0이 되지 않았어요). 한 번에 재고, 자리 잡을 때까지 다시 재요. 기준은 그대로예요
    const measure = () => head(page).evaluate((h) => {
      const segs = Array.from(h.querySelectorAll(".tl.by-scene .seg")).map((e) => e.getBoundingClientRect()), p = h.querySelector(".prog").getBoundingClientRect(), r = h.getBoundingClientRect();
      return { n: segs.length, minW: Math.min(...segs.map((x) => x.width)), minH: Math.min(...segs.map((x) => x.height)), right: p.x + p.width, headRight: r.x + r.width };
    });
    let m = await measure();
    await expect.poll(async () => { m = await measure(); return m.n === n && m.minW > 0 && m.minH > 0; }, { message: n + "장면: 칸이 자리 잡기" }).toBe(true);
    expect(m.n, n + "장면: 칸 수").toBe(n);
    if (!flat) expect(m.minW, n + "장면: 칸이 너무 좁아요").toBeGreaterThanOrEqual(10);
    expect(m.minW, n + "장면: 누를 자리가 너무 좁아요").toBeGreaterThanOrEqual(5);
    expect(m.minH).toBeGreaterThanOrEqual(18);
    expect(m.right).toBeLessThanOrEqual(m.headRight + 1);
    await noScroll(page, n + "장면");
    // 가운데쯤으로 가면 그만큼 지나와요(장면 번호 = 지금 장면, 지나온 장면 = 그 앞)
    if (n > 1) {
      const mid = Math.ceil(n / 2);
      await steps(page).nth(mid - 1).click();
      await expect(count(page)).toHaveText(pad(mid, n) + " / " + n + " 장면");
      await expect(curLabel(page)).toHaveText("장면 " + mid);
      // 바로 건너뛰었으니 앞 장면은 첫 장면만 ‘지나옴’이고 나머지는 ‘건너뜀’
      expect(await states(page)).toBe((mid > 1 ? "done" + "skip".repeat(mid - 2) : "") + "now" + "-".repeat(n - mid));
    }
    await stage.close();
  }
  expect(errors).toEqual([]);
});

test("처음 · 마지막 · 이전 · 건너뛰기: 지금 장면 번호와 지나온 장면 수를 섞지 않고, 마지막 장면에서 다음은 끝내지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await seed(page, makeDeck(12));
  await start(page);
  // 첫 장면: 01 / 12, 지나온 장면 없음
  await expect(count(page)).toHaveText("01 / 12 장면");
  expect(await said(page)).toContain("12장면 중 1번째");
  expect(await said(page)).not.toContain("지나온");
  // 세 번 넘기면 4번째 장면, 지나온 장면 3개
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect(count(page)).toHaveText("04 / 12 장면");
  expect(await states(page)).toBe("done".repeat(3) + "now" + "-".repeat(8));
  expect(await said(page)).toContain("12장면 중 4번째, 지나온 장면 3개");
  // 이전: 3번째, 4번째는 ‘이미 본 장면’(앞으로 할 칸 중 옅은 강조색)
  await page.keyboard.press("PageUp");
  await expect(count(page)).toHaveText("03 / 12 장면");
  expect(await states(page)).toBe("done".repeat(2) + "now" + "seen" + "-".repeat(8));
  // 막대를 눌러 9번째로 건너뛰기: 5–8은 건너뜀, 지나온 장면은 실제로 본 4개(1–4)
  await steps(page).nth(8).click();
  await expect(count(page)).toHaveText("09 / 12 장면");
  expect(await states(page)).toBe("done".repeat(4) + "skip".repeat(4) + "now" + "-".repeat(3));
  expect(await said(page)).toContain("12장면 중 9번째, 지나온 장면 4개");
  expect(await steps(page).nth(5).getAttribute("title")).toContain("건너뜀");
  // 지금 칸은 aria-current로도 알려요
  await expect(steps(page).nth(8)).toHaveAttribute("aria-current", "step");
  // 마지막 장면: 12 / 12, 다음을 눌러도 끝나지 않아요
  await page.keyboard.press("End");
  await expect(count(page)).toHaveText("12 / 12 장면");
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect(count(page)).toHaveText("12 / 12 장면");
  await expect(page.locator(".memo-sheet")).toHaveCount(0);
  // 마지막 장면의 오른쪽 아래 단추는 ‘수업 끝내기’(누르면 확인 줄)예요
  await expect(page.locator('.pv-bar [data-act="end-ask"]')).toContainText("수업 끝내기");
  expect(errors).toEqual([]);
});

test("시간: 계획 시간이 없는 수업은 시계만, 계획을 넘기면 시간 막대는 끝에 멈추고 시계는 정확히 계속 세요(주황)", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.clock.install({ time: new Date("2026-11-09T09:00:00") });
  // 계획 시간이 없는 수업
  await seed(page, makeDeck(6, { min: 0 }));
  await start(page);
  // 가짜 시계는 건너뛴 시간에 실제로 흐른 몇 초가 더해져요. 그래서 ‘몇 초 범위 안’으로 봐요(시험 컴퓨터가 바쁘면 몇 초 늦게 읽어요)
  const t = head(page).locator(".prog-t"), sec = async () => (await t.locator(".js-elapsed").innerText()).split(":").reduce((a, x) => a * 60 + Number(x), 0);
  const near = async (want) => { await expect.poll(sec).toBeGreaterThanOrEqual(want); expect(await sec()).toBeLessThanOrEqual(want + 15); };
  await page.clock.fastForward(125000);
  await near(125);
  await expect(t).toContainText("경과");
  await expect(t).not.toContainText("계획");
  await expect(head(page).locator(".tbar")).toHaveCount(0);
  await expect(t).not.toHaveClass(/over/);
  await expect(head(page).locator(".seg.over")).toHaveCount(0);
  await expect(head(page).locator(".pv-clock")).toContainText("이 장면");
  // 계획이 없으면 장면마다 ‘몇 분’도 없어요(짐작한 3분을 보이지 않아요)
  await expect(head(page).locator(".pv-clock")).not.toContainText("분");
  await expect(page.locator(".next-line")).not.toContainText("분");
  await expect(head(page).locator(".late")).toHaveCount(0);
  // 계획 4분(장면 2개 × 2분)짜리 수업: 3분에는 3/4, 5분 10초에는 막대가 끝 · 시계는 5:10 · 주황
  await seed(page, makeDeck(2, { min: 2 }));
  await start(page);
  await page.clock.fastForward(180000);
  await near(180);
  await expect(t).toContainText("경과 · 계획 4분");
  await expect(t).not.toHaveClass(/over/);
  // 시간 막대 = 수업 시계 ÷ 계획(장면 수와 상관없이): 3분이면 3/4쯤
  const fill = head(page).locator(".tbar .js-tfill"), width = async () => parseFloat(await fill.evaluate((e) => e.style.width));
  await expect.poll(async () => Math.abs((await width()) - (await sec()) / 240 * 100)).toBeLessThanOrEqual(1);
  expect(await width()).toBeGreaterThanOrEqual(75);
  expect(await width()).toBeLessThan(85);
  // 지금 장면(계획 2분)은 넘겨서 주황
  await expect(head(page).locator(".seg.now")).toHaveClass(/over/);
  await page.keyboard.press("PageDown");
  await page.clock.fastForward(130000);
  await near(310);
  await expect(t).toContainText("경과 · 계획 4분");
  await expect(t).toHaveClass(/over/);
  await expect(head(page).locator(".tbar")).toHaveClass(/over/);
  await expect.poll(width).toBe(100);
  // 시계는 기록과 같은 수업 시계예요: 계획을 넘긴 뒤에도 지난 만큼 정확히 계속 세요(막대는 끝에 머물러요)
  const was = await sec();
  await page.clock.fastForward(60000);
  await expect.poll(sec).toBeGreaterThanOrEqual(was + 60);
  expect(await sec()).toBeLessThanOrEqual(was + 75);
  expect(await width()).toBe(100);
  expect(errors).toEqual([]);
});

test("도입 · 전개 · 정리: 예시 수업과 AI가 정리한 수업은 묶음으로, AI 분석이 아닌 PDF · PPTX(순서로 짐작한 단계)는 묶음 없이 장면만", async ({ page }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "수업 자료별로 한 번씩 봐요");
  test.setTimeout(90000);
  const errors = watch(page, []);
  const groups = () => head(page).locator(".tl.by-scene .ph").evaluateAll((els) => els.map((e) => (e.getAttribute("title") || "") + "#" + e.children.length));
  // 예시 수업(8장면): 도입 2 · 전개 4 · 정리 2
  await page.goto("/");
  await toFlow(page);
  // 수업 준비의 ‘휴대폰 미리보기’도 실제 휴대폰과 같은 번호 · 얇은 막대(같은 묶음)예요
  await page.locator('[data-act="scene-sel"]').nth(2).click();
  await page.locator('[data-act="phone-pv"]').click();
  await expect(page.locator(".d-phone .rm-top .rm-n")).toHaveText("3 / 8");
  await expect(page.locator(".d-phone .tl.by-scene .seg")).toHaveCount(8);
  expect(await page.locator(".d-phone .tl.by-scene .seg").evaluateAll((els) => els.map((e) => e.classList.contains("now") ? "n" : e.classList.contains("done") ? "d" : "-").join(""))).toBe("ddn-----");
  await expect(page.locator(".d-phone .tl.by-scene .ph")).toHaveCount(3);
  await page.locator('[data-act="phone-pv"]').click();
  await start(page);
  expect(await groups()).toEqual(["도입 · 2장면#2", "전개 · 4장면#4", "정리 · 2장면#2"]);
  // 묶음 사이 틈이 장면 사이 틈보다 넓어요
  const gaps = await head(page).locator(".tl.by-scene").evaluate((tl) => {
    const r = [...tl.querySelectorAll(".seg")].map((e) => e.getBoundingClientRect());
    return r.slice(1).map((x, i) => Math.round(x.left - r[i].right));
  });
  expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) + 3);
  // AI 분석이 아닌 PPTX 12장면(순서로 짐작한 단계): 묶음 없이
  await seed(page, makeDeck(12, { deck: { kind: "pptx", prep: "basic" } }));
  await start(page);
  expect(await groups()).toEqual(["#12"]);
  await expect(count(page)).toHaveText("01 / 12 장면");
  // 같은 파일이라도 교사가 단계를 직접 고쳤으면(짐작과 다름) 묶음으로
  await seed(page, makeDeck(12, { deck: { kind: "pptx", prep: "basic" }, stages: (i) => i < 3 ? "도입" : i < 10 ? "전개" : "정리" }));
  await start(page);
  expect(await groups()).toEqual(["도입 · 3장면#3", "전개 · 7장면#7", "정리 · 2장면#2"]);
  // AI가 정리한 PDF: 묶음으로
  await seed(page, makeDeck(12, { deck: { kind: "pdf", prep: "ai" } }));
  await start(page);
  expect(await groups()).toEqual(["도입 · 2장면#2", "전개 · 8장면#8", "정리 · 2장면#2"]);
  // 단계가 하나뿐이면 묶지 않아요
  await seed(page, makeDeck(5, { stages: () => "전개" }));
  await start(page);
  expect(await groups()).toEqual(["#5"]);
  expect(errors).toEqual([]);
});

test("실제 PDF · PPTX 올리기: AI 없이 올린 수업도 장면 진행이 나오고, 수업 화면은 예전처럼 쪽 그림 그대로예요(진행 막대 없음)", async ({ page }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "올리기는 교탁 PC 크기에서 한 번 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  // 같은 PPTX에서 노트를 붙여도(‘PPTX에서 노트 붙이기’) 장면은 그대로 3개
  await page.locator("#pair-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("PPTX의 발표자 노트를 붙였어요")).toBeVisible();
  const stage = await start(page);
  watch(stage, errors);
  await expect(count(page)).toHaveText("1 / 3 장면");
  await expect(steps(page)).toHaveCount(3);
  await expect(head(page).locator(".tl.by-scene .ph")).toHaveCount(1);
  await expect(stage.locator(".stage .slide.img img")).toBeVisible();
  await page.keyboard.press("PageDown");
  await expect(count(page)).toHaveText("2 / 3 장면");
  await expect(stage.locator(".stage-bar .chip").first()).toHaveText(await curLabel(page).innerText());
  // 수업 화면에는 장면 진행 · 시간 · 핵심 발화가 없어요
  for (const sel of [".prog", ".tl", ".tbar", ".js-elapsed", ".say", ".prompter"]) await expect(stage.locator(sel)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("새로고침 뒤 이어서 하기: 장면 번호 · 지나온 칸 · 신호 점 · 수업 시계가 그대로 돌아와요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await start(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await page.keyboard.press("1");
  await expect(count(page)).toHaveText("4 / 8 장면");
  const before = await states(page);
  await page.waitForTimeout(1200);
  const clock = await head(page).locator(".js-elapsed").innerText();
  await page.reload();
  await page.getByRole("button", { name: "이어서 하기" }).click();
  await expect(count(page)).toHaveText("4 / 8 장면");
  expect(await states(page)).toBe(before);
  await expect(head(page).locator(".seg.sig-red")).toHaveCount(1);
  await expect(head(page).locator(".seg.now.sig-red")).toHaveCount(1);
  const toSec = (s) => s.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  expect(toSec(await head(page).locator(".js-elapsed").innerText())).toBeGreaterThanOrEqual(toSec(clock));
  await expect(curLabel(page)).toHaveText(LABELS[3]);
  expect(errors).toEqual([]);
});

test("모양: 장면 번호가 시간보다 크고, 밝게 · 어둡게 모두 글자 대비가 충분하고, 시간 막대는 장면 막대보다 얇아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 봐요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await start(page);
  await page.keyboard.press("PageDown");
  const size = (sel) => head(page).locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const numSize = await size(".prog-n b");
  expect(numSize).toBeGreaterThan(await size(".prog-t b"));
  expect(numSize).toBeGreaterThan(await size(".pv-clock b"));
  // 머리에서 가장 큰 숫자예요
  const biggest = await head(page).evaluate((h) => Math.max(...[...h.querySelectorAll("*")].filter((e) => e.offsetParent && /\d/.test(e.textContent) && !e.children.length).map((e) => parseFloat(getComputedStyle(e).fontSize))));
  expect(numSize).toBe(biggest);
  const thick = async (sel, pseudo) => head(page).locator(sel).first().evaluate((e, p) => parseFloat(getComputedStyle(e, p).height), pseudo);
  expect(await thick(".tbar")).toBeLessThan(await thick(".tl.by-scene .seg", "::before"));
  for (const toneName of ["어둡게", "밝게"]) {
    expect(await contrast(page, ".prog-n b"), toneName + ": 장면 번호 대비").toBeGreaterThanOrEqual(7);
    expect(await contrast(page, ".prog-n"), toneName + ": ‘/ 8 장면’ 대비").toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page, ".prog-t"), toneName + ": 경과 시간 대비").toBeGreaterThanOrEqual(4.5);
    // 지나온 칸 · 지금 칸 · 앞으로 칸이 서로 다른 색이에요
    const cols = await steps(page).evaluateAll((els) => els.slice(0, 3).map((e) => getComputedStyle(e, "::before").backgroundColor));
    expect(new Set(cols).size, toneName + ": 칸 색 " + cols.join(" · ")).toBe(3);
    await noScroll(page, toneName);
    // 밝게 · 어둡게는 ⋯ 안에 있어요(PR #25, 2026-11-16)
    await head(page).locator('[data-act="more"]').click();
    await head(page).locator('.more-menu [data-act="tone-toggle"]').click();
  }
  expect(errors).toEqual([]);
});

test("작은 화면: PC 1280×590(150%)과 휴대폰 360 · 390에서도 스크롤 없이, 휴대폰은 번호 · 얇은 막대만 더하고 엄지 단추는 그대로예요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  if (isPc(info)) {
    test.skip(info.project.name !== "pc-1536x864", "창 크기를 바꿔 한 번 봐요");
    await toFlow(page);
    await start(page);
    for (const [w, h] of [[1280, 590], [1366, 768], [1920, 945]]) {
      await page.setViewportSize({ width: w, height: h });
      await expect(count(page)).toBeInViewport();
      await expect(head(page).locator(".prog-t")).toBeInViewport();
      await noScroll(page, w + "×" + h);
      const hh = (await head(page).boundingBox()).height;
      expect(hh, w + "×" + h + ": 머리가 너무 높아요").toBeLessThanOrEqual(h <= 700 ? 64 : 80);
    }
    return;
  }
  // 모바일 리모컨(이 기기만일 때는 휴대폰 크기의 수업 미리보기가 리모컨 화면이에요)
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  const n = page.locator(".rm-top .rm-n");
  await expect(n).toHaveText("1 / 8");
  for (let i = 0; i < 4; i++) await page.locator('.thumb-nav [data-act="next"]').click();
  await expect(n).toHaveText("5 / 8");
  const bar = page.locator(".remote .tl.by-scene");
  await expect(bar.locator(".seg")).toHaveCount(8);
  expect(await bar.locator(".seg").evaluateAll((els) => els.map((e) => e.classList.contains("now") ? "n" : e.classList.contains("done") ? "d" : "-").join(""))).toBe("ddddn---");
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(4);
  // 번호가 시계보다 크고, 막대에는 누르는 칸이 없어요(넘기기는 아래 엄지 단추 · 목차로)
  const fs = (sel) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await fs(".rm-top .rm-n b")).toBeGreaterThan(await fs(".rm-top .clk"));
  await expect(bar.locator("[data-act]")).toHaveCount(0);
  const next = page.locator('.thumb-nav [data-act="next"]');
  expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(64);
  for (const sel of [".rm-top", ".prompter .say", ".thumb-nav .sigs", '.thumb-nav [data-act="next"]']) await expect(page.locator(sel).first()).toBeInViewport();
  expect(await contrast(page, ".rm-top .rm-n b")).toBeGreaterThanOrEqual(7);
  await noScroll(page, "휴대폰");
  expect(errors).toEqual([]);
});
