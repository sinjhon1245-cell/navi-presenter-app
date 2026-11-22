// 내 수업(2026-11-11, docs/MY-LESSONS.md): 내 수업 첫 화면 · 새 수업 · 장면 편집 · 여러 수업 · 예시 원본과 복제본 · 예전 데이터 옮기기.
// 로그인하지 않은 이 브라우저(IndexedDB)에서 봐요. 계정(Firebase)에 두는 것과 계정끼리 섞이지 않는지는 tests/library.spec.js(에뮬레이터)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DATA, lesson, isPc, fixture, watch, noSideScroll, curLabel, nextBtn, toFlow, openLesson, toExamples, copyCurrent, localRecords, finishLesson, noFileStore, rowAction, openMore } from "./helpers.js";

// 이 브라우저에 저장된 내 수업(IndexedDB navi-local의 lessons, kind mine)
const stored = (page) => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open("navi-local", 1);
  r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
  r.onsuccess = () => { const q = r.result.transaction("lessons", "readonly").objectStore("lessons").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}));
const mineRows = async (page) => (await stored(page)).filter((x) => x.kind === "mine");
const rows = (page) => page.locator(".mylib .mrow");
const scenes = (page) => page.locator(".srow .t");
const sceneIds = (page) => page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
async function newLesson(page, title) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  if (title) { await page.locator("#ls-title").fill(title); await page.locator("#ls-title").blur(); await expect(page.locator(".sbar-title b")).toHaveText(title); }
}
// 고친 뒤 저절로 저장될 때까지(400ms 뒤 저장)
const saved = (page, check) => expect.poll(async () => check(await mineRows(page)), { timeout: 5000 }).toBe(true);

// 2026-11-14: 내 수업에는 머리 막대가 없고, 시작하는 길은 새 수업 만들기 · PDF · PPTX로 시작하기 · 예시 수업 활용하기(휴대폰은 늘 보이는 ‘예시’ 메뉴)예요
test("내 수업 첫 화면: 처음 열면 내 수업(비어 있음)이고, 새 수업 만들기 · PDF · PPTX로 시작하기 · 예시 수업 활용하기가 있어요. 머리 막대는 없고 화면 크기마다 넘치지 않아요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "내 수업" })).toHaveAttribute("aria-selected", "true");
  const lib = page.locator(".mylib");
  await expect(lib).toContainText("아직 만든 수업이 없어요");
  await expect(lib.getByRole("button", { name: "새 수업 만들기" })).toBeVisible();
  await expect(lib.getByRole("button", { name: "PDF · PPTX로 시작하기" })).toBeVisible();
  await expect(page.locator(".sbar")).toHaveCount(0);
  // 추천 · 발견하기 같은 메뉴는 없어요. 예시 수업은 따로 둔 메뉴예요
  await expect(page.locator("#app")).not.toContainText("추천 수업");
  await expect(page.locator("#app")).not.toContainText("발견하기");
  await expect(lib.locator(".lcard")).toHaveCount(0);
  await noSideScroll(page, "내 수업(빈)");
  // PC는 내 수업 안의 ‘예시 수업 활용하기’로, 휴대폰은 늘 보이는 메뉴 ‘예시’로 가요(둘 다 같은 예시 수업 화면)
  if (isPc(info)) await lib.getByRole("button", { name: "예시 수업 활용하기" }).click();
  else { await expect(page.getByRole("tab", { name: "예시 수업" })).toBeInViewport({ ratio: 1 }); await page.getByRole("tab", { name: "예시 수업" }).click(); }
  await expect(page.getByRole("tab", { name: "예시 수업" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".lcard")).toHaveCount(DATA.lessons.length);
  await noSideScroll(page, "예시 수업");
  expect(errors).toEqual([]);
});

test("새 수업: 누르면 바로 고치는 화면, 제목 ‘새 수업’ · 빈 장면 1개 · 학년 교과는 비어 있고 도입 · 전개 · 정리를 만들지 않아요. 고친 것은 저절로 저장돼요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await newLesson(page);
  await expect(page.getByRole("tab", { name: "수업 준비" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sbar-title b")).toHaveText("새 수업");
  await expect(page.locator(".sbar-sub")).toContainText("내 수업");
  await expect(page.locator("#ls-title")).toHaveValue("새 수업");
  await expect(page.locator("#ls-grade")).toHaveValue("");
  await expect(page.locator("#ls-subject")).toHaveValue("");
  await expect(scenes(page)).toHaveText(["새 장면"]);
  await expect(page.locator(".slist .sgroup")).toHaveCount(1);
  await expect(page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  // 마지막 하나 남은 장면은 지울 수 없어요(빈 수업이 되지 않게)
  await expect(page.locator('[data-act="scene-del-ask"]')).toBeDisabled();
  await saved(page, (list) => list.length === 1 && list[0].title === "새 수업" && list[0].deck.pages.length === 1);
  // 제목 · 학년 · 교과(교과는 선택)
  await page.locator("#ls-title").fill("우리 반 물의 순환");
  await page.locator("#ls-title").blur();
  await page.locator("#ls-grade").selectOption("4");
  await saved(page, (list) => list[0].title === "우리 반 물의 순환" && list[0].deck.grade === 4 && list[0].deck.subject === "");
  // 새로고침: 내 수업에 있고, 지금 수업으로 다시 열려요
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("우리 반 물의 순환");
  await expect(rows(page)).toContainText("4학년");
  await expect(rows(page)).toContainText("1장면");
  // 다시 연 수업은 그 줄에 ‘최근에 연 수업’, 수업 준비에 그 수업이 열려 있어요
  await expect(rows(page)).toContainText("최근에 연 수업");
  await toFlow(page);
  await expect(page.locator(".sbar-title b")).toHaveText("우리 반 물의 순환");
  expect(errors).toEqual([]);
});

test("장면 편집: ‘+ 장면 추가’는 마지막 뒤, 위 · 아래로 순서를 바꾸고, 복제는 바로 아래(발화 · 메모 · 자료 그대로), 지우면 자료는 보관함, 새로고침해도 그대로", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await newLesson(page, "장면 편집 시험");
  const label = async (i, text) => {
    const id = (await sceneIds(page))[i];
    await page.locator('.srow[data-v="' + id + '"]').click();
    await page.locator("#pg-" + id + "-label").fill(text);
    await page.locator("#pg-" + id + "-label").blur();
    return id;
  };
  await label(0, "가");
  // 지금 고른 장면과 상관없이 늘 마지막 뒤에 붙어요
  await page.locator('.srow').first().click();
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  await label(1, "나");
  await page.locator('.srow').first().click();
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  await label(2, "다");
  await expect(scenes(page)).toHaveText(["가", "나", "다"]);
  // ‘나’에 발화 · 메모 · 자료
  const b = (await sceneIds(page))[1];
  await page.locator('.srow[data-v="' + b + '"]').click();
  await page.locator("#pg-" + b + "-say").fill("물은 어디로 갈까요?\n짝과 이야기해 봐요");
  await page.locator("#pg-" + b + "-say").blur();
  await page.locator("#pg-" + b + "-notes").fill("실험 전에 물어보기");
  await page.locator("#pg-" + b + "-notes").blur();
  await openMore(page);
  await page.getByRole("button", { name: "+ 자료" }).click();
  await page.locator("#d-title").fill("물의 순환 그림");
  await page.locator("#d-link").fill("https://example.com/cycle.png");
  await page.locator('[data-act="add-res"]').click();
  await expect(page.locator(".res-pane .res-row")).toHaveCount(1);
  // 위 · 아래
  await page.locator('[data-act="scene-up"]').click();
  await expect(scenes(page)).toHaveText(["나", "가", "다"]);
  await page.locator('[data-act="scene-down"]').click();
  await page.locator('[data-act="scene-down"]').click();
  await expect(scenes(page)).toHaveText(["가", "다", "나"]);
  // 복제: 바로 아래에, 같은 발화 · 메모 · 자료
  await page.locator('[data-act="scene-dup"]').click();
  await expect(scenes(page)).toHaveText(["가", "다", "나", "나 (복사)"]);
  const copy = (await sceneIds(page))[3];
  await expect(page.locator('.srow[data-v="' + copy + '"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#pg-" + copy + "-say")).toHaveValue("물은 어디로 갈까요?\n짝과 이야기해 봐요");
  await expect(page.locator("#pg-" + copy + "-notes")).toHaveValue("실험 전에 물어보기");
  await expect(page.locator(".res-pane .res-row")).toContainText("물의 순환 그림");
  // 복제본을 고쳐도 원래 장면은 그대로예요
  await page.locator("#pg-" + copy + "-say").fill("복제본만 고쳤어요");
  await page.locator("#pg-" + copy + "-say").blur();
  await page.locator('.srow[data-v="' + b + '"]').click();
  await expect(page.locator("#pg-" + b + "-say")).toHaveValue("물은 어디로 갈까요?\n짝과 이야기해 봐요");
  // 지우기: 확인 줄 뒤에, 그 장면의 자료는 보관함으로
  await page.locator('.srow[data-v="' + copy + '"]').click();
  await page.locator('[data-act="scene-del-ask"]').click();
  await page.locator('.pop[aria-label="장면 지우기"]').getByRole("button", { name: "지우기" }).click();
  await expect(scenes(page)).toHaveText(["가", "다", "나"]);
  await saved(page, (list) => list.length === 1 && list[0].deck.pages.map((p) => p.label).join() === "가,다,나" && list[0].deck.res.length === 2 && list[0].deck.res.filter((r) => !r.scene).length === 1);
  // 새로고침: 순서 · 발화 · 메모 · 자료 연결 그대로
  await page.reload();
  await toFlow(page);
  await expect(scenes(page)).toHaveText(["가", "다", "나"]);
  await page.locator('.srow[data-v="' + b + '"]').click();
  await expect(page.locator("#pg-" + b + "-notes")).toHaveValue("실험 전에 물어보기");
  await expect(page.locator(".res-pane .res-row")).toContainText("물의 순환 그림");
  // 수업 미리보기도 이 순서예요
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await expect(curLabel(page)).toHaveText("가");
  await nextBtn(page).click();
  await expect(curLabel(page)).toHaveText("다");
  expect(errors).toEqual([]);
});

// 2026-11-11 CI(PR #12): 고친 직후 0.4초 저절로 저장을 기다리는 동안 그 수업을 지우면, 지운 뒤 다른 수업으로 바꾸는 순간 기다리던 저장이 지운 수업을 다시 써서 되살아났어요
test("고친 바로 뒤 지우기: 저절로 저장을 기다리는 동안 그 수업을 지워도 다시 살아나지 않아요(지운 수업은 저장하지 않아요)", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await newLesson(page, "남길 수업");
  await newLesson(page, "지울 수업");
  // 이름을 고치고(저장은 0.4초 뒤) 그 0.4초 안에 내 수업 → 삭제 → 지우기를 눌러요(빠른 PC에서 실제로 난 순서를 그대로)
  await page.locator("#ls-title").fill("지울 수업 고침");
  await page.locator("#ls-title").blur();
  const quick = await page.evaluate(() => {
    const t0 = performance.now(), btn = (root, name) => [...root.querySelectorAll("button, [role=tab]")].find((b) => b.textContent.trim() === name);
    btn(document, "내 수업").click();
    // 지금 연 수업의 줄(목록의 이름은 저장이 끝나야 바뀌어서, 아직 ‘새 수업’이에요). 삭제는 그 줄의 ⋯ 메뉴 안에 있어요
    const row = () => document.querySelector(".mylib .mrow.on");
    row().querySelector('[data-act="my-menu"]').click();
    btn(row(), "삭제").click();
    btn(document.querySelector('.pop[aria-label="수업 지우기"]'), "지우기").click();
    return performance.now() - t0;
  });
  expect(quick, "0.4초 안에 눌러야 그 순서를 재현해요").toBeLessThan(400);
  await expect(rows(page)).toHaveCount(1);
  await page.waitForTimeout(1000);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("남길 수업");
  await saved(page, (list) => list.length === 1 && list[0].title === "남길 수업");
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator("#app")).not.toContainText("지울 수업");
  expect(errors).toEqual([]);
});

test("여러 수업: 3개를 만들고 새로고침해도 모두 있고 각각 열려요. 복제 · 지우기(확인 줄)는 그 수업만, 수업 기록은 지워지지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  test.setTimeout(90000);
  const errors = watch(page, []);
  await page.goto("/");
  for (const t of ["국어 1", "수학 2", "과학 3"]) {
    await newLesson(page, t);
    await page.getByRole("button", { name: "+ 장면 추가" }).click();
  }
  await saved(page, (list) => list.length === 3 && list.every((x) => x.deck.pages.length === 2));
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  // 새로 고친 것부터
  await expect(rows(page).locator(".m-text b")).toHaveText(["과학 3", "수학 2", "국어 1"]);
  for (const t of ["국어 1", "수학 2", "과학 3"]) {
    await rows(page).filter({ hasText: t }).locator(".m-open").click();
    await expect(page.locator(".sbar-title b")).toHaveText(t);
    await expect(scenes(page)).toHaveCount(2);
    await page.getByRole("tab", { name: "내 수업" }).click();
  }
  // ‘수학 2’로 수업을 한 번 해서 기록을 남겨요
  await rows(page).filter({ hasText: "수학 2" }).locator(".m-open").click();
  await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  await page.keyboard.press("End");
  await finishLesson(page);
  await expect(page.locator(".memo-sheet")).toContainText("수학 2");
  await page.getByRole("button", { name: "새 수업 준비" }).click();
  await page.getByRole("button", { name: "비우기" }).click();
  expect((await localRecords(page)).length).toBe(1);
  await page.getByRole("tab", { name: "내 수업" }).click();
  // 복제: 따로 된 수업이 하나 더
  await rowAction(rows(page).filter({ hasText: "국어 1" }), "복제");
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: "국어 1 (복사본)" })).toHaveCount(1);
  // 지우기: 확인 줄에서 취소하면 그대로, 지우면 그 수업만 사라지고 기록은 남아요
  const math = rows(page).filter({ hasText: "수학 2" });
  await rowAction(math, "삭제");
  const ask = page.locator('.confirm[aria-label="수업 지우기"]');
  await expect(ask).toContainText("수업 기록은 그대로 남아요");
  await ask.getByRole("button", { name: "취소" }).click();
  await expect(rows(page)).toHaveCount(4);
  await rowAction(math, "삭제");
  await ask.getByRole("button", { name: "지우기" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).filter({ hasText: "수학 2" })).toHaveCount(0);
  await saved(page, (list) => list.length === 3 && !list.some((x) => x.title === "수학 2"));
  expect((await localRecords(page)).length, "지운 수업의 기록은 그대로").toBe(1);
  await page.getByRole("tab", { name: /수업 기록/ }).click();
  await page.locator("#records").getByRole("button", { name: /^전체/ }).click();
  await expect(page.locator("#records")).toContainText("수학 2");
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("예시 원본은 읽기 전용이고, ‘수정해서 사용하기’로 만든 복제본은 따로 고쳐져요. 복제본을 고쳐도 원본 · 다른 복제본은 그대로예요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  const L = lesson("ex-m3-fraction"), first = L.pages[0], second = L.pages[1];
  await page.goto("/");
  await openLesson(page, L.id);
  // 원본: 고치는 단추가 없고, 글자 칸은 읽기만 돼요(쳐도 바뀌지 않아요)
  await expect(page.locator(".ex-ro")).toContainText("고칠 수 없어요");
  await expect(page.locator(".sbar .save")).toContainText("예시 원본");
  await expect(page.getByRole("button", { name: "+ 장면 추가" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ 자료" })).toHaveCount(0);
  for (const act of ["scene-up", "scene-down", "scene-dup", "scene-del-ask"]) await expect(page.locator('[data-act="' + act + '"]')).toHaveCount(0);
  await expect(page.locator("#pg-" + first.id + "-label")).toHaveAttribute("readonly", "");
  await page.locator("#pg-" + first.id + "-label").press("End");
  await page.keyboard.type("바뀌면 안 돼요");
  await page.locator("#pg-" + first.id + "-label").blur();
  await expect(page.locator('.srow[data-v="' + first.id + '"] .t')).toHaveText(first.label);
  // 복제본 1: 고쳐요
  await copyCurrent(page);
  await expect(page.locator(".lmeta")).toContainText("에서 복제");
  await expect(page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await page.locator('.srow[data-v="' + second.id + '"]').click();
  await page.locator("#pg-" + second.id + "-label").fill("피자 나누기");
  await page.locator("#pg-" + second.id + "-label").blur();
  await page.locator("#ls-title").fill("분수 · 우리 반");
  await page.locator("#ls-title").blur();
  await saved(page, (list) => list.length === 1 && list[0].deck.pages[1].label === "피자 나누기" && list[0].deck.from === L.id);
  // 원본은 그대로
  await openLesson(page, L.id);
  await expect(page.locator(".sbar-title b")).toHaveText(L.title);
  await expect(page.locator('.srow[data-v="' + second.id + '"] .t')).toHaveText(second.label);
  // 복제본 2: 원본에서 새로(복제본 1의 고친 내용은 없어요)
  await copyCurrent(page);
  await expect(page.locator('.srow[data-v="' + second.id + '"] .t')).toHaveText(second.label);
  await saved(page, (list) => list.length === 2);
  const list = await mineRows(page);
  expect(new Set(list.map((x) => x.id)).size).toBe(2);
  expect(list.map((x) => x.deck.pages[1].label).sort()).toEqual([second.label, "피자 나누기"].sort());
  // lessons.js의 예시 데이터는 하나도 바뀌지 않아요
  const now = await page.evaluate((id) => JSON.stringify(window.NAVI_DATA.lessons.find((x) => x.id === id)), L.id);
  expect(JSON.parse(now)).toEqual(JSON.parse(JSON.stringify(L)));
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "분수 · 우리 반" })).toContainText("예시에서 복제");
  expect(errors).toEqual([]);
});

// 파일을 저장할 수 있는 브라우저에서는 올린 파일이 내 수업으로 저장돼서 잃을 것이 없어요(tests/files.spec.js).
// 파일을 저장할 수 없는 브라우저(사생활 보호 창 등)에서는 예전처럼 이 창에서만 쓰고, 바꾸기 전에 먼저 물어요
test("바꾸기 전에 확인: 파일을 저장할 수 없는 브라우저에서 올린 파일 수업이 열려 있으면 내 수업을 열거나 새로 만들 때 먼저 묻고, 취소하면 그대로예요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await noFileStore(page);
  await page.goto("/");
  await newLesson(page, "내 수업 하나");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("이 브라우저에는 파일을 저장할 수 없어요")).toBeVisible();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await rows(page).filter({ hasText: "내 수업 하나" }).locator(".m-open").click();
  const ask = page.locator('.pop[aria-label="바꾸기 전에 확인"]');
  await expect(ask).toContainText("다시 올려야 해요");
  await ask.getByRole("button", { name: "취소" }).click();
  // 취소하면 지금 수업은 그대로 올린 파일 수업이에요(수업 준비의 머리 막대에서 확인하고 내 수업으로 돌아와요)
  await toFlow(page);
  await expect(page.locator(".sbar-sub")).toContainText("내 파일");
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "그래도 바꾸기" }).click();
  await expect(page.locator(".sbar-title b")).toHaveText("새 수업");
  await expect(page.locator(".flow3")).toBeVisible();
  expect(errors).toEqual([]);
});

test("예전에 고친 예시(0.6 · 0.7 데이터): 지우지 않고 ‘내 수업’에 ‘예전에 고친 예시’로 보이고, 열면 내 수업으로 옮겨요(원래 줄은 표시만 하고 남겨요)", async ({ page }, info) => {
  test.skip(!isPc(info), "저장소 시험은 PC에서 봐요");
  const errors = watch(page, []);
  const saved06 = JSON.parse(readFileSync(fixture("navi-local-v06.json"), "utf8"));
  await page.goto("/lessons.js");
  await page.evaluate((data) => new Promise((res, rej) => {
    const r = indexedDB.open("navi-local", 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => { const t = r.result.transaction(["lessons"], "readwrite"); data.lessons.forEach((x) => t.objectStore("lessons").put(x)); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }), saved06);
  const old = saved06.lessons.find((x) => x.edited && x.deck);
  await page.goto("/");
  // 예시 원본은 처음 그대로 열려요(고친 내용이 예시를 덮지 않아요)
  const ex = lesson(old.id);
  await openLesson(page, old.id);
  await expect(page.locator(".srow .t").first()).toHaveText(ex.pages[0].label);
  await page.getByRole("tab", { name: "내 수업" }).click();
  const row = rows(page).filter({ hasText: "예전에 고친 예시" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("열면 내 수업으로 옮겨요");
  await row.locator(".m-open").click();
  await expect(page.locator(".slist")).toContainText(old.deck.pages[0].label);
  await expect(page.locator(".sbar-sub")).toContainText("내 수업");
  // 옮긴 뒤: 내 수업에 하나, 예전 줄은 지우지 않고 옮겨 간 곳만 적어 둬요
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("예시에서 복제");
  await expect.poll(async () => { const all = await stored(page); const o = all.find((x) => x.id === old.id); return !!(o && o.deck && o.movedTo && all.some((x) => x.id === o.movedTo && x.kind === "mine")); }).toBe(true);
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "예전에 고친 예시" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("고치던 칸이 있을 때 화면이 다시 그려져도(저장 · 서버 소식이 끝나는 순간) 오류 없이 고친 글자가 들어가요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await newLesson(page);
  // 수업 이름을 고치는 중(아직 칸을 떠나지 않음)에 다른 일로 화면이 다시 그려지면, 브라우저가 그 칸의 ‘바뀜’을 다시 그리는 도중에 알려요
  // (글자는 실제로 쳐서 넣고, 칸을 떠나지 않은 채 다른 단추를 스크립트로 눌러 다시 그리게 해요)
  await page.locator("#ls-title").fill("그리는 중에 바뀐 제목");
  await page.evaluate(() => document.querySelector('[data-act="scene-add-end"]').click());
  await expect(scenes(page)).toHaveCount(2);
  await expect(page.locator(".sbar-title b")).toHaveText("그리는 중에 바뀐 제목");
  await saved(page, (list) => list.length === 1 && list[0].title === "그리는 중에 바뀐 제목" && list[0].deck.pages.length === 2);
  expect(errors).toEqual([]);
});

test("파일 창이 열린 동안 화면이 다시 그려져도 고른 파일이 사라지지 않아요(파일 고르기 칸은 다시 그리는 곳 밖에 하나)", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  const picker = page.locator("#pdf-in");
  await expect(picker).toHaveCount(1);
  const before = await picker.elementHandle();
  // 다시 그리기(내 수업 → 예시 수업 → 내 수업) 뒤에도 같은 칸이에요
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await page.getByRole("tab", { name: "내 수업" }).click();
  expect(await before.evaluate((el) => el.isConnected && !document.getElementById("app").contains(el))).toBe(true);
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  // 같은 파일을 한 번 더 골라도 다시 읽어요
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});
