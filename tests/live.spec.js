// 실제 수업 조작 시험: 키보드·무선 프레젠터, 같은 PC에서 연 수업 화면 창, 신호등 기록과 수업 자료, 화면 배율, 0.6단계 기록.
// 여기서 보는 수업 화면은 교사 화면이 같은 브라우저에서 연 창이에요. 휴대폰 등 다른 기기와의 실시간 연결은 tests/realtime.spec.js(Firebase 에뮬레이터)에서 시험해요.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lesson, LABELS, isPc, fixture, watch, curLabel, nextBtn, localRecords, finishLesson, openLesson, copyLesson, toFlow } from "./helpers.js";

const L = lesson("ex-m3-fraction");
const red = L.pages[2]; // 똑같이 나누기: 다시 설명 자료가 둘 있어요
const chip = (stage) => stage.locator(".stage-bar .chip").first();
const navMain = (page) => page.locator(".pv-bar .nav-main");

test("무선 프레젠터·키보드: 다음·이전 키, 화면 가리기, 수업 중 F5는 새로고침하지 않고, 마지막 장면에서는 다음을 아무리 눌러도 끝나지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿) 키 시험이에요");
  const errors = watch(page, []);
  await page.clock.install({ time: new Date("2026-11-03T09:00:00") });
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  // 프레젠터가 보내는 키: PageDown·PageUp, 화살표, 스페이스·Enter, Backspace
  const steps = [["PageDown", 1], ["PageUp", 0], ["ArrowRight", 1], ["ArrowLeft", 0], ["ArrowDown", 1], ["ArrowUp", 0], [" ", 1], ["Enter", 2], ["Backspace", 1]];
  for (const [key, at] of steps) {
    await page.keyboard.press(key);
    await expect(curLabel(page), key + " 뒤 장면").toHaveText(LABELS[at]);
    await expect(chip(stage), key + " 뒤 수업 화면").toHaveText(LABELS[at]);
  }
  // 수업 화면 창에 초점이 있어도 같은 키로 넘어가요
  await stage.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await stage.keyboard.press("PageUp");
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  // 프레젠터의 화면 가리기 키(. 검게, , 하얗게)
  await page.keyboard.press(".");
  await expect(stage.locator(".blankout.black")).toBeVisible();
  await page.keyboard.press("PageDown"); // 가린 화면에서 다음은 먼저 화면을 다시 보여 줘요
  await expect(stage.locator(".blankout")).toHaveCount(0);
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  await page.keyboard.press(",");
  await expect(stage.locator(".blankout.white")).toBeVisible();
  await page.keyboard.press(",");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  // ‘슬라이드 쇼’ 단추가 보내는 F5: 수업 중에는 새로고침을 막아요(교사 화면, 수업 화면 창 모두)
  const guard = (w) => w.evaluate(() => { window.__still = true; window.__f5 = null; window.addEventListener("keydown", (e) => { if (e.key === "F5") window.__f5 = e.defaultPrevented; }); });
  await guard(page); await guard(stage);
  await page.keyboard.press("F5");
  await stage.keyboard.press("F5");
  expect(await page.evaluate(() => [window.__still, window.__f5])).toEqual([true, true]);
  expect(await stage.evaluate(() => [window.__still, window.__f5])).toEqual([true, true]);
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  // 마지막 장면: 다음 키·수업 화면 누르기를 여러 번 해도 끝나지 않고 ‘다음 장면이 없어요’만 보여요
  const last = LABELS[LABELS.length - 1];
  await page.keyboard.press("End");
  await expect(navMain(page)).toContainText("마지막 장면");
  for (const key of ["PageDown", "PageDown", "ArrowRight", " ", "Enter", "PageDown"]) await page.keyboard.press(key);
  await expect(navMain(page)).toContainText("다음 장면이 없어요");
  for (const key of ["PageDown", "ArrowRight", " "]) await stage.keyboard.press(key);
  await stage.mouse.click(1000, 300);
  await stage.mouse.click(1000, 300);
  await expect(page.locator(".memo-sheet")).toHaveCount(0);
  await expect(curLabel(page)).toHaveText(last);
  await expect(chip(stage)).toHaveText(last);
  await page.clock.fastForward(4000);
  await expect(navMain(page)).toContainText("마지막 장면");
  // 앞 장면에서 ‘다음’ 단추를 두 번 눌러도(겹친 클릭) 끝나지 않아요: 두 번째 누름은 위쪽 확인 줄만 열어요
  await page.keyboard.press("PageUp");
  await nextBtn(page).dblclick();
  await expect(curLabel(page)).toHaveText(last);
  const ask = page.locator(".end-confirm");
  await expect(ask).toBeVisible();
  await expect(page.locator(".memo-sheet")).toHaveCount(0);
  // 확인 줄은 ‘다음’ 자리와 멀리 떨어져 있어요(같은 자리를 또 눌러도 닿지 않아요)
  const a = await ask.boundingBox(), b = await navMain(page).boundingBox();
  expect(a.y + a.height).toBeLessThan(b.y - 100);
  // 확인 줄이 열려 있어도 다음 키로는 끝나지 않고, Esc나 ‘계속 수업’로 닫혀요
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".memo-sheet")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(ask).toHaveCount(0);
  await navMain(page).click();
  await page.locator('.end-confirm [data-act="end-no"]').click();
  await expect(ask).toHaveCount(0);
  await expect(page.locator(".memo-sheet")).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(0);
  // ‘수업 끝내기’ → 확인 줄의 ‘수업 끝내기’로만 끝나요
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  expect((await localRecords(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("수업 복구: 새로고침해도 장면·시간·신호등·질문 메모·띄운 자료·말한 발화가 돌아오고, 고친 수업 내용은 그대로, 기록은 한 번만 남아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.clock.install({ time: new Date("2026-11-03T09:00:00") });
  await page.goto("/");
  // 예시 원본은 읽기 전용이라(2026-11-11) 내 수업으로 복제해 고쳐요
  await copyLesson(page, L.id);
  // 준비에서 고친 발화(기존 수업 자료)
  await page.locator('.srow[data-v="' + red.id + '"]').click();
  const say = page.locator("#pg-" + red.id + "-say");
  await say.fill(red.say.concat(["조각의 크기를 겹쳐서 비교해 볼까요?"]).join("\n"));
  await say.blur();
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await nextBtn(page).click();
  await nextBtn(page).click();
  await page.clock.fastForward(130000);
  await page.locator(".sig.s-red").click();
  await page.getByRole("button", { name: "질문 메모" }).click();
  await page.locator("#q-in").fill("조각 수가 같으면 같은 분수인지 묻는 질문");
  await page.locator("#q-in").press("Enter");
  await page.locator(".pv .prompter .say").first().click();
  await page.keyboard.press("m");
  const first = page.locator(".pv-right .item").first();
  const title = (await first.locator(".item-title").innerText()).trim();
  await first.getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".stage .slide.pic img")).toBeVisible();
  const resumed = async () => {
    const offer = page.locator(".run-offer");
    await expect(offer).toContainText("끝나지 않은 수업이 있어요");
    await expect(offer).toContainText(L.title);
    await expect(offer).toContainText("3 / " + L.pages.length);
    await expect(offer).toContainText("신호등 1개");
    await expect(offer).toContainText("질문 메모 1개");
    const [again] = await Promise.all([page.waitForEvent("popup"), offer.getByRole("button", { name: "이어서 하기" }).click()]);
    watch(again, errors);
    await expect(curLabel(page)).toHaveText(red.label);
    await expect(page.locator(".pv .prompter")).toContainText("조각의 크기를 겹쳐서 비교해 볼까요?");
    await expect(page.locator(".sig.s-red")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "질문 메모 1" })).toBeVisible();
    await expect(page.locator(".pv .prompter .say").first()).toHaveClass(/done/);
    await expect(page.locator(".pv-screen .onair")).toHaveText("자료 보이는 중");
    await expect(again.locator(".stage .slide.pic img")).toBeVisible();
    // 수업 시간은 처음 시작한 때부터 이어서 세요
    const [m, s] = (await page.locator(".js-elapsed").first().innerText()).split(":").map(Number);
    expect(m * 60 + s).toBeGreaterThanOrEqual(130);
    return again;
  };
  // 새로고침(실수, 멈춤) → 이어서 하기
  await page.reload();
  let again = await resumed();
  expect((await localRecords(page)).length).toBe(0);
  // 한 번 더 끊겨도 같은 자리에서
  await page.clock.fastForward(30000);
  await page.reload();
  again = await resumed();
  // 슬라이드로 돌아가 끝까지: 기록은 하나
  await page.locator('.pv-bar [data-act="tv-close"]').click();
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  let recs = await localRecords(page);
  expect(recs.length).toBe(1);
  expect(recs[0].events.filter((e) => e.label === red.label).map((e) => e.type)).toEqual(["red"]);
  expect(recs[0].questions.map((q) => q.text)).toEqual(["조각 수가 같으면 같은 분수인지 묻는 질문"]);
  expect(recs[0].usedTitles).toContain(title);
  // 끝난 뒤 새로고침하면 묻지 않고, 기록도 그대로 하나
  await page.waitForTimeout(300);
  await page.reload();
  // 다시 열면 첫 화면 내 수업(머리 막대 없음)이고, 끝나지 않은 수업 알림은 없어요
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(page.locator(".run-offer")).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(1);
  // 기록을 쓰는 도중 끊긴 경우: 다시 열 때 같은 id로 한 번 더 써서, 늘어나지 않고 빠지지도 않아요
  const rec = recs[0];
  await page.evaluate((r) => localStorage.setItem("navi-run-done", JSON.stringify(r)), rec);
  await page.reload();
  await expect(page.getByRole("tab", { name: "수업 기록 1" })).toBeVisible();
  expect((await localRecords(page)).length).toBe(1);
  await page.evaluate((r) => new Promise((res) => { const q = indexedDB.open("navi-local", 1); q.onsuccess = () => { const t = q.result.transaction("records", "readwrite"); t.objectStore("records").delete(r.id); t.oncomplete = () => { q.result.close(); res(); }; }; }), rec);
  await page.evaluate((r) => localStorage.setItem("navi-run-done", JSON.stringify(r)), rec);
  await page.reload();
  await expect(page.getByRole("tab", { name: "수업 기록 1" })).toBeVisible();
  recs = await localRecords(page);
  expect(recs.map((x) => x.id)).toEqual([rec.id]);
  expect(await page.evaluate(() => localStorage.getItem("navi-run-done"))).toBeNull();
  expect(errors).toEqual([]);
});

test("수업 복구: 창을 닫았다 다시 열어도 이어서·기록 저장하고 끝내기·버리기를 고를 수 있고, 처음부터 다시 시작·미리보기와 섞이지 않아요", async ({ context, page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  const offer = (p) => p.locator(".run-offer");
  // 다시 열면 첫 화면은 내 수업(머리 막대 없음): 끝나지 않은 수업은 그 맨 위 알림으로 물어요
  const reopen = async (p) => { await p.close({ runBeforeUnload: true }); const q = await context.newPage(); watch(q, errors); await q.goto("/"); await expect(q.locator(".mylib")).toBeVisible(); return q; };
  // 수업 미리보기는 기록도 복구도 하지 않아요
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await nextBtn(page).click();
  await page.reload();
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
  // 1) 창을 닫았다 새로 열기 → ‘지금까지 기록 저장하고 끝내기’
  await toFlow(page);
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await page.locator(".sig.s-yellow").click();
  page = await reopen(page);
  await expect(offer(page)).toContainText("2 / " + LABELS.length);
  await offer(page).getByRole("button", { name: "지금까지 기록 저장하고 끝내기" }).click();
  await expect(page.locator(".memo-sheet")).toBeVisible();
  let recs = await localRecords(page);
  expect(recs.length).toBe(1);
  expect(recs[0].scenes.find((x) => x.label === LABELS[1]).sig).toBe("yellow");
  page = await reopen(page);
  await expect(offer(page)).toHaveCount(0);
  // 2) ‘기록 없이 버리기’는 한 번 더 묻고, 버리면 끝난 기록은 그대로
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await page.locator(".sig.s-red").click();
  page = await reopen(page);
  await offer(page).getByRole("button", { name: "기록 없이 버리기" }).click();
  await expect(offer(page)).toContainText("이 수업을 기록 없이 버릴까요?");
  await offer(page).getByRole("button", { name: "취소" }).click();
  await expect(offer(page)).toContainText("끝나지 않은 수업이 있어요");
  await offer(page).getByRole("button", { name: "기록 없이 버리기" }).click();
  await offer(page).getByRole("button", { name: "버리기", exact: true }).click();
  await expect(offer(page)).toHaveCount(0);
  page = await reopen(page);
  await expect(offer(page)).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(1);
  // 3) 처음부터 다시 시작: 복구되는 것은 다시 시작한 수업이에요
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.getByRole("button", { name: "수업 시작" }).click();
  await nextBtn(page).click();
  await nextBtn(page).click();
  await page.locator(".sig.s-red").click();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "처음부터 다시 시작" }).click();
  await page.getByRole("button", { name: "기록 버리고 다시 시작" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await nextBtn(page).click();
  page = await reopen(page);
  await expect(offer(page)).toContainText("2 / " + LABELS.length);
  await expect(offer(page)).toContainText("신호등 0개");
  await offer(page).getByRole("button", { name: "이어서 하기" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  await expect(page.locator(".sig.on")).toHaveCount(0);
  // 지금까지 기록을 저장하고 다시 시작 → 끝내기: 기록이 겹치지 않아요
  await page.locator(".sig.s-green").click();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "처음부터 다시 시작" }).click();
  await page.getByRole("button", { name: "지금까지 기록 저장하고 다시 시작" }).click();
  page = await reopen(page);
  await offer(page).getByRole("button", { name: "이어서 하기" }).click();
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  recs = await localRecords(page);
  expect(recs.length).toBe(3);
  expect(new Set(recs.map((x) => x.id)).size).toBe(3);
  page = await reopen(page);
  await expect(offer(page)).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(3);
  expect(errors).toEqual([]);
});

test("같은 PC의 수업 화면 창: 교사 화면과 같은 장면, 신호는 수업 화면을 바꾸지 않고, 고른 자료만 떴다가 돌아오고, 창을 닫았다 다시 열면 지금 장면부터 이어져요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await openLesson(page, L.id);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(chip(stage)).toHaveText(L.pages[0].label);
  await nextBtn(page).click();
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(red.label);
  await expect(chip(stage)).toHaveText(red.label);
  // 신호등: 교사의 판단만 남고 수업 화면은 그대로
  const before = await stage.locator(".stage").innerHTML();
  await page.locator(".sig.s-red").click();
  await expect(page.locator(".pv-bar .dock-res")).toContainText("다시 설명 맞춤 2");
  expect(await stage.locator(".stage").innerHTML()).toBe(before);
  // 수업 자료: 교사가 고른 것만 수업 화면에
  await page.keyboard.press("m");
  const first = page.locator(".pv-right .item").first();
  const title = (await first.locator(".item-title").innerText()).trim();
  await first.getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".stage .slide.pic img")).toBeVisible();
  await expect(page.locator(".pv-screen .onair")).toHaveText("자료 보이는 중");
  await expect(navMain(page)).toHaveText("슬라이드로 돌아가기");
  // 자료가 떠 있을 때 다음 키는 먼저 슬라이드로 돌아가요(장면은 그대로)
  await page.keyboard.press("PageDown");
  await expect(stage.locator(".stage .slide.pic")).toHaveCount(0);
  await expect(curLabel(page)).toHaveText(red.label);
  await expect(chip(stage)).toHaveText(red.label);
  // 창의 X로 닫으면 교사 화면이 바로 알리고, 수업은 계속 넘길 수 있어요
  await stage.close({ runBeforeUnload: true });
  await expect(page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText(L.pages[3].label);
  // 다시 열면 첫 장면이 아니라 지금 장면부터, 그다음도 함께 넘어가요
  const [again] = await Promise.all([page.waitForEvent("popup"), page.locator(".pv-warn").getByRole("button", { name: "수업 화면 열기" }).click()]);
  watch(again, errors);
  await expect(chip(again)).toHaveText(L.pages[3].label);
  await expect(page.locator(".pv-warn")).toHaveCount(0);
  await nextBtn(page).click();
  await expect(chip(again)).toHaveText(L.pages[4].label);
  // 창이 아무 말 없이 사라져도(멈춤·강제 종료) 1초 안에 알려요
  await again.close();
  await expect(page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  // 끝내면 신호등 기록과 보여 준 자료가 기록에 남아요
  await page.keyboard.press("End");
  await finishLesson(page);
  const memo = page.locator(".memo-sheet");
  await expect(memo).toContainText(title);
  await expect(memo.locator(".tl.band .seg.sig-red")).toHaveCount(1);
  const rec = (await localRecords(page))[0];
  expect(rec.events.filter((e) => e.label === red.label).map((e) => e.type)).toEqual(["red"]);
  expect(rec.usedTitles).toContain(title);
  await page.getByRole("button", { name: "수업 기록 보기" }).click();
  await expect(page.locator('#records .hist[aria-label="내 수업 기록"] .rec.open')).toContainText(title);
  expect(errors).toEqual([]);
});

test("화면 배율 100%·125%·150%: 실제 PC의 브라우저 안쪽 크기에서 수업 준비·교사 화면이 한 화면이고, 핵심 발화는 작아지지 않아요", async ({ browser }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "창 크기를 직접 바꿔 한 번만 확인해요");
  // 1920×1080 화면에서 작업 표시줄·주소창을 뺀 브라우저 안쪽 크기
  const SCALES = [["100%", 1920, 945, 1], ["125%", 1536, 730, 1.25], ["150%", 1280, 590, 1.5]];
  for (const [name, width, height, dpr] of SCALES) {
    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    const errors = watch(page, []);
    const pageScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    const inView = (sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; });
    await page.goto("/");
    await openLesson(page, L.id);
    expect(await pageScroll(), name + " 수업 준비").toBe(0);
    await page.getByRole("button", { name: "수업 미리보기" }).click();
    for (let i = 0; i < L.pages.length; i++) {
      for (const drawer of [false, true]) {
        if (drawer) await page.keyboard.press("m");
        const where = name + " " + (i + 1) + "번째 장면" + (drawer ? " · 자료 서랍" : "");
        expect(await pageScroll(), where + " 화면 스크롤").toBe(0);
        for (const sel of [".pv .prompter .say", '.pv-bar [data-act="prev"]', '.pv-bar [data-act="next"], .pv-bar [data-act="end-ask"]', ".pv-bar .sig", ".pv-screen .slide"]) expect(await inView(sel), where + " " + sel).toBe(true);
        expect(await page.locator(".pv .prompter .say").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), where + " 핵심 발화 크기").toBeGreaterThanOrEqual(24);
        if (drawer) await page.keyboard.press("m");
      }
      if (i < L.pages.length - 1) await nextBtn(page).click();
    }
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test("0.6단계 기록 유지: 0.6이 이 브라우저에 저장한 수업 기록과 고친 수업이 0.7에서도 그대로 보여요", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("pc"), "저장소 시험은 PC에서 한 번씩 봐요");
  const errors = watch(page, []);
  const saved = JSON.parse(readFileSync(fixture("navi-local-v06.json"), "utf8"));
  // 같은 주소의 다른 파일을 먼저 열어, 0.6이 쓴 값을 그대로 넣어 둬요
  await page.goto("/lessons.js");
  await page.evaluate((data) => new Promise((res, rej) => {
    const r = indexedDB.open("navi-local", 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => {
      const t = r.result.transaction(["records", "lessons"], "readwrite");
      data.records.forEach((x) => t.objectStore("records").put(x));
      data.lessons.forEach((x) => t.objectStore("lessons").put(x));
      t.oncomplete = () => { r.result.close(); res(); };
      t.onerror = () => rej(t.error);
    };
    r.onerror = () => rej(r.error);
  }), saved);
  await page.goto("/");
  await page.getByRole("tab", { name: "수업 기록 1" }).click();
  const mine = page.locator('#records .hist[aria-label="내 수업 기록"] .rec');
  await expect(mine).toHaveCount(1);
  await mine.locator(".rec-head").click();
  await expect(mine.locator("textarea")).toHaveValue("0.6에서 남긴 교사 메모");
  await expect(mine.locator(".again-list")).toContainText("도입 발문");
  await expect(mine).toContainText("수증기가 눈에 보이는지 묻는 질문");
  await expect(mine.locator(".tl.band .seg")).toHaveCount(saved.records[0].scenes.length);
  await expect(mine.locator(".tl.band .seg.sig-red")).toHaveCount(1);
  // 0.6에서 고친 장면 이름도 그대로: 예시 원본은 읽기 전용이 되어(2026-11-11) 고친 수업은 ‘내 수업’에 ‘예전에 고친 예시’로 남고, 열면 내 수업으로 옮겨요
  await page.getByRole("tab", { name: "내 수업" }).click();
  const old = page.locator(".mrow").filter({ hasText: "예전에 고친 예시" });
  await expect(old).toHaveCount(1);
  await old.locator(".m-open").click();
  await expect(page.locator(".slist")).toContainText("0.6에서 고친 표지");
  await expect(page.locator(".sbar-sub")).toContainText("내 수업");
  await expect(page.locator(".mrow").filter({ hasText: "예전에 고친 예시" })).toHaveCount(0);
  // 0.7에서 수업을 한 번 더 하면 기록이 하나 더 쌓이고, 0.6 기록은 그대로예요
  await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toBeVisible();
  const ids = (await localRecords(page)).map((x) => x.id);
  expect(ids).toHaveLength(2);
  expect(ids).toContain(saved.records[0].id);
  expect(errors).toEqual([]);
});
