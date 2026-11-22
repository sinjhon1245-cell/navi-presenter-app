// 내 수업 첫 화면(2026-11-14, docs/MY-LESSONS.md · 설계안 2판): 머리 막대 없음, 시작하는 세 길, 강한 단추 하나,
// 최근에 연 수업(navi-last)과 끝나지 않은 수업(navi-run)의 구분, 줄 전체로 열기 · ⋯ 메뉴, 지난 수업 이해도 글자,
// 파일 원본 · 수업 내용이 어디에 저장되는지, 휴대폰 다섯 칸 메뉴(320 · 360 · 390).
// 로그인하지 않은 이 브라우저(IndexedDB)에서 봐요. 계정 · 왼쪽 메뉴의 계정 자리 · 다른 기기는 tests/library.spec.js(에뮬레이터)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { isPc, fixture, watch, noSideScroll, toFlow, rowAction } from "./helpers.js";

const rows = (page) => page.locator(".mylib .mrow");
// 이 브라우저(로그인 안 함)의 내 수업 · 기록 · 끝나지 않은 수업을 넣고 다시 열어요
const scene = (i) => ({ id: "p" + i, n: i, stage: i === 1 ? "도입" : "전개", label: "장면 " + i, min: 4, layout: "question", eye: "", title: "장면 " + i, sub: "", notes: "", concepts: [], say: [], rec: [], want: "" });
const deckOf = (id, title, n) => ({ v: 5, kind: "mine", myId: id, key: "mine:" + id, title, grade: 4, subject: "수학", total: 40, pages: Array.from({ length: n }, (_, i) => scene(i + 1)), res: [] });
async function seed(page, { lessons = [], records = [], last = "", run = null }) {
  await page.goto("/lessons.js");
  await page.evaluate(([lessons, records, last, run]) => new Promise((res, rej) => {
    if (last) localStorage.setItem("navi-last", last);
    if (run) localStorage.setItem("navi-run", JSON.stringify(run));
    const r = indexedDB.open("navi-local", 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => {
      const t = r.result.transaction(["lessons", "records"], "readwrite");
      lessons.forEach((d, i) => t.objectStore("lessons").put({ id: d.myId, at: Date.now() - i * 3600e3, made: Date.now() - 864e5, kind: "mine", title: d.title, grade: d.grade, subject: d.subject, from: "", deck: d }));
      records.forEach((x) => t.objectStore("records").put(x));
      t.oncomplete = () => { r.result.close(); res(); };
      t.onerror = () => rej(t.error);
    };
    r.onerror = () => rej(r.error);
  }), [lessons, records, last, run]);
  await page.goto("/");
  await expect(page.locator(".mylib")).toBeVisible();
}
// 화면에 보이는 강한(보라 채움) 단추
const strong = (page) => page.locator("#app .main .btn.warm:visible");

test("머리 막대는 내 수업에만 없어요: 수업 준비 · 예시 수업 · 수업 기록 · 발표 설정에는 그대로예요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(page.locator(".sbar")).toHaveCount(0);
  await expect(page.locator(".mylib")).not.toContainText("계속 준비하기");
  await expect(page.getByRole("button", { name: "수업 시작" })).toHaveCount(0);
  for (const tab of ["수업 준비", "예시 수업", "수업 기록", "발표 설정"]) {
    await page.getByRole("tab", { name: new RegExp("^" + tab) }).click();
    await expect(page.locator(".sbar"), tab + "에는 머리 막대가 있어요").toBeVisible();
    await expect(page.locator(".sbar").getByRole("button", { name: "수업 시작" })).toBeVisible();
  }
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".sbar")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("강한 단추는 하나: 수업이 없으면 ‘새 수업 만들기’, 끝나지 않은 수업이 있으면 ‘이어서 하기’예요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await expect(strong(page)).toHaveCount(1);
  await expect(strong(page)).toHaveAccessibleName("새 수업 만들기");
  // 끝나지 않은 수업(이 브라우저의 navi-run): 맨 위 알림 하나, ‘이어서 하기’가 강한 단추, ‘새 수업 만들기’는 테두리 단추
  const d = deckOf("m-00000000000000c1", "분수의 덧셈", 9), t = Date.now() - 600e3;
  const S = { v: 5, started: true, ended: false, cur: "p5", t0: t, enteredAt: t, log: [], reactions: [], qs: [], used: [], tv: null, blank: null, tool: null, memoId: null };
  await seed(page, { lessons: [d], last: "mine:" + d.myId, run: { v: 1, at: t, lessonId: null, title: d.title, deck: d, S, said: {} } });
  await expect(page.locator(".run-offer")).toHaveCount(1);
  await expect(page.locator(".run-offer")).toContainText("끝나지 않은 수업이 있어요");
  await expect(strong(page)).toHaveCount(1);
  await expect(strong(page)).toHaveText("이어서 하기");
  await expect(page.locator('.mylib [data-act="my-new"]')).not.toHaveClass(/warm/);
  expect(errors).toEqual([]);
});

test("최근에 연 수업과 끝나지 않은 수업은 따로 보여요: 최근은 줄의 글자 하나, 끝나지 않은 수업은 맨 위 알림 한 곳과 그 줄의 장면 위치", async ({ page }) => {
  const errors = watch(page, []);
  const a = deckOf("m-00000000000000a1", "국어 수업", 4), b = deckOf("m-00000000000000b1", "과학 수업", 6);
  // 처음: 아무것도 고르지 않았으면 둘 다 없어요
  await seed(page, { lessons: [a, b] });
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator(".mylib")).not.toContainText("최근에 연 수업");
  await expect(page.locator(".run-offer")).toHaveCount(0);
  // 과학 수업을 열었다가 돌아오면 그 줄에만 ‘최근에 연 수업’
  await rows(page).filter({ hasText: "과학 수업" }).locator(".m-open").click();
  await expect(page.locator(".flow3")).toBeVisible();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(page).filter({ hasText: "과학 수업" })).toContainText("최근에 연 수업");
  await expect(rows(page).filter({ hasText: "국어 수업" })).not.toContainText("최근에 연 수업");
  await expect(page.locator(".mylib")).not.toContainText("계속 준비하기");
  await expect(page.locator(".mylib")).not.toContainText("지금 수업");
  // 국어 수업으로 시작했다가 끝내지 않은 채(5분 전, 3 / 4 장면) 다시 열면: 알림 한 곳 + 그 줄에 ‘끝나지 않은 수업 · 3 / 4’
  const t = Date.now() - 300e3;
  const S = { v: 5, started: true, ended: false, cur: "p3", t0: t, enteredAt: t, log: [], reactions: [], qs: [], used: [], tv: null, blank: null, tool: null, memoId: null };
  await seed(page, { last: "mine:" + a.myId, run: { v: 1, at: t, lessonId: null, title: a.title, deck: a, S, said: {} } });
  await expect(page.locator(".run-offer")).toHaveCount(1);
  await expect(page.locator(".run-offer")).toContainText("‘국어 수업’ · 3 / 4");
  const row = rows(page).filter({ hasText: "국어 수업" });
  await expect(row).toContainText("끝나지 않은 수업 · 3 / 4");
  await expect(row).not.toContainText("최근에 연 수업");
  await expect(page.getByRole("button", { name: "이어서 하기" })).toHaveCount(1);
  // 이어서 하기 · 끝내기 · 버리기는 지금처럼 알림에서(버리기는 확인 줄)
  await page.locator(".run-offer").getByRole("button", { name: "기록 없이 버리기" }).click();
  await expect(page.locator(".run-offer")).toContainText("기록 없이 버릴까요?");
  await page.locator(".run-offer").getByRole("button", { name: "버리기" }).click();
  await expect(page.locator(".run-offer")).toHaveCount(0);
  await expect(row).not.toContainText("끝나지 않은 수업");
  expect(errors).toEqual([]);
});

// 전체 시험이 붐빌 때 한 번 실패한 순서(2026-11-15): Esc로 ⋯ 메뉴를 닫아 초점이 ⋯로 돌아온 바로 뒤에 저장이 끝나 화면이 다시 그려지면
// id 없는 ⋯ 단추의 초점이 페이지로 빠졌어요. 시계를 멈춰 그 순서를 그대로 만들어요(기다리는 시간을 늘리지 않아요)
test("⋯ 메뉴: Esc로 닫은 바로 뒤에 저장이 끝나 화면이 다시 그려져도 초점은 ⋯에 남아요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.clock.install();
  const a = deckOf("m-00000000000000a3", "사회 수업", 3), b = deckOf("m-00000000000000b3", "음악 수업", 2);
  await seed(page, { lessons: [a, b] });
  await rows(page).filter({ hasText: "음악 수업" }).locator(".m-sub").click();
  await expect(page.locator(".sbar-title b")).toHaveText("음악 수업");
  // 고친 뒤 0.4초에 가는 저장을 멈춰 둬요
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await page.locator("#ls-title").fill("음악 수업 고침");
  await page.keyboard.press("Tab");
  await page.getByRole("tab", { name: "내 수업" }).click();
  const row = rows(page).filter({ hasText: "사회 수업" }), more = row.locator('[data-act="my-menu"]');
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(row.locator(".m-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row.locator(".m-menu")).toHaveCount(0);
  await expect(more).toBeFocused();
  // 이제 저장이 가고, 끝나면 화면이 다시 그려져요
  await page.clock.runFor(1000);
  await expect.poll(() => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("navi-local");
    r.onsuccess = () => { const g = r.result.transaction("lessons").objectStore("lessons").get("m-00000000000000b3"); g.onsuccess = () => { res(g.result && g.result.title); r.result.close(); }; };
  }))).toBe("음악 수업 고침");
  await expect(rows(page).filter({ hasText: "음악 수업 고침" })).toHaveCount(1);
  await expect(more).toBeFocused();
  // 메뉴는 그대로 키보드로 열려요(초점이 ⋯에 있으니 Enter 한 번)
  await page.keyboard.press("Enter");
  await expect(row.locator(".m-menu button")).toHaveText(["열기", "복제", "삭제"]);
  expect(errors).toEqual([]);
});

// 글을 고친 뒤 바로 누른 단추(2026-11-15): 고친 칸에서 초점이 빠질 때(다음 클릭을 누르는 순간) 화면을 다시 그려, 누르던 단추가 새 단추로
// 바뀌어 클릭이 사라졌어요. 노트를 고치고 ‘수업 시작’을 두 번 눌러야 했어요. 이제 한 번에 되고, 고친 글은 그대로 저장돼요
test("글을 고친 뒤 누른 단추는 한 번에 돼요: 노트 → 수업 시작, 수업 이름 → 내 수업, 발화 → 다른 장면", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  const a = deckOf("m-00000000000000a4", "과학 수업", 3);
  await seed(page, { lessons: [a] });
  await rows(page).first().locator(".m-sub").click();
  await expect(page.locator(".srow")).toHaveCount(3);
  // 발화를 고치고 셋째 장면을 한 번 누르면 셋째 장면으로
  await page.locator(".srow").first().click();
  await page.locator('textarea[data-k="say"]').fill("오늘은 무엇을 알아볼까요?");
  await page.locator(".srow").nth(2).click();
  await expect(page.locator(".srow").nth(2)).toHaveAttribute("aria-current", "true");
  await page.locator(".srow").first().click();
  await expect(page.locator('textarea[data-k="say"]')).toHaveValue("오늘은 무엇을 알아볼까요?");
  // 수업 이름을 고치고 ‘내 수업’ 탭을 한 번 누르면 내 수업으로, 이름은 고친 대로
  await page.locator("#ls-title").fill("과학 수업 고침");
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".mylib")).toBeVisible();
  await expect(rows(page).first()).toContainText("과학 수업 고침");
  // 노트를 고치고 ‘수업 시작’을 한 번 누르면 수업이 시작되고 교사 화면에 그 노트
  await rows(page).first().locator(".m-sub").click();
  await page.locator(".srow").first().click();
  await page.locator('textarea[data-k="notes"]').fill("처음 노트를 고쳤어요");
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(page.locator(".pv")).toBeVisible();
  await expect(page.locator(".pv")).toContainText("처음 노트를 고쳤어요");
  expect(errors).toEqual([]);
});

test("줄 전체로 열고, 복제 · 삭제는 ⋯ 메뉴에 있어요(키보드 · Esc · 밖을 누르면 닫혀요). 삭제는 확인 줄을 거쳐요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  const a = deckOf("m-00000000000000a2", "사회 수업", 3), b = deckOf("m-00000000000000b2", "음악 수업", 2);
  await seed(page, { lessons: [a, b] });
  // 줄의 어디를 눌러도(제목이 아닌 둘째 줄이어도) 그 수업이 열려요
  await rows(page).filter({ hasText: "음악 수업" }).locator(".m-sub").click();
  await expect(page.locator(".sbar-title b")).toHaveText("음악 수업");
  await page.getByRole("tab", { name: "내 수업" }).click();
  // 줄마다 복제 · 삭제 단추가 늘어서 있지 않아요
  await expect(page.locator(".mylib").getByRole("button", { name: "복제" })).toHaveCount(0);
  await expect(page.locator(".mylib").getByRole("button", { name: "삭제" })).toHaveCount(0);
  const row = rows(page).filter({ hasText: "사회 수업" }), more = row.locator('[data-act="my-menu"]');
  await expect(more).toHaveAttribute("aria-label", "‘사회 수업’ 메뉴");
  // 키보드: ⋯에 초점 → Enter로 열고, Esc로 닫으면 초점이 ⋯로 돌아와요
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(row.locator(".m-menu")).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator(".m-menu button")).toHaveText(["열기", "복제", "삭제"]);
  await page.keyboard.press("Escape");
  await expect(row.locator(".m-menu")).toHaveCount(0);
  await expect(row.locator('[data-act="my-menu"]')).toBeFocused();
  // 밖을 누르면 닫혀요
  await row.locator('[data-act="my-menu"]').click();
  await page.locator(".my-head h2").click();
  await expect(page.locator(".m-menu")).toHaveCount(0);
  // 복제 → 한 줄 더, 삭제 → 확인 줄 → 그 수업만
  await rowAction(row, "복제");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).filter({ hasText: "사회 수업 (복사본)" })).toHaveCount(1);
  await rowAction(rows(page).filter({ hasText: "사회 수업 (복사본)" }), "삭제");
  const ask = page.locator('.pop[aria-label="수업 지우기"]');
  await expect(ask).toContainText("수업 기록은 그대로 남아요");
  await ask.getByRole("button", { name: "지우기" }).click();
  await expect(rows(page)).toHaveCount(2);
  // 메뉴의 ‘열기’도 같은 수업을 열어요
  await rowAction(rows(page).filter({ hasText: "사회 수업" }), "열기");
  await expect(page.locator(".sbar-title b")).toHaveText("사회 수업");
  expect(errors).toEqual([]);
});

test("줄의 정보: 제목 다음 줄에 학년 교과 · 장면 수 (PC는 시간 · 고친 날), 지난 수업 이해도는 색과 글자로 함께", async ({ page }, info) => {
  const errors = watch(page, []);
  const a = deckOf("m-00000000000000a3", "분수의 덧셈과 뺄셈", 5);
  const end = Date.now() - 2 * 864e5;
  const rec = { id: "local-" + (end - 2400e3), v: 3, key: a.key, title: a.title, grade: 4, subject: "수학", cls: "", startAt: end - 2400e3, endAt: end, at: end, totalSec: 1200, plannedMin: 20,
    scenes: a.pages.map((p, i) => ({ id: p.id, label: p.label, min: 4, sec: 240, sig: ["green", "red", "yellow", "yellow", ""][i] })), sig: { red: 1, yellow: 2, green: 1 },
    questions: [], again: [], text: "", used: [], usedTitles: [], events: [], trashedAt: null, editedAt: null, src: "pc" };
  await seed(page, { lessons: [a], records: [rec] });
  const row = rows(page).first();
  await expect(row.locator(".m-text b")).toHaveText("분수의 덧셈과 뺄셈");
  await expect(row.locator(".m-sub")).toContainText("4학년 수학");
  await expect(row.locator(".m-sub")).toContainText("5장면");
  const sig = row.locator(".m-sig");
  await expect(sig).toContainText("다시 설명 1");
  await expect(sig).toContainText("더 확인 2");
  await expect(sig).toContainText("잘 이해 1");
  // 색 점은 신호등 색 그대로(빨강 · 노랑 · 초록)
  const dots = await sig.locator("i").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(dots).toEqual(["rgb(204, 61, 61)", "rgb(201, 138, 0)", "rgb(31, 127, 74)"]);
  await expect(row).toContainText("지난 수업");
  // 휴대폰은 시간 · 고친 날을 줄이고, 줄 높이는 PC 62px · 휴대폰 60px보다 낮지 않아요
  const h = await row.locator(".m-open").evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(isPc(info) ? 62 : 60);
  await expect(row.locator(".m-sub .pc").first()).toBeVisible({ visible: isPc(info) });
  await noSideScroll(page, "내 수업(기록 있음)");
  expect(errors).toEqual([]);
});

test("파일: ‘PDF · PPTX로 시작하기’가 파일 창을 열고, 원본과 수업 내용이 어디에 저장되는지 한 줄로 말해요. 내 수업 화면에 끌어다 놓아도 돼요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await expect(page.locator(".mylib .my-help")).toContainText("PDF · PPTX 원본과 수업 모두 이 브라우저에 저장돼요");
  await expect(page.locator(".mylib .my-where")).toContainText("이 브라우저에 저장돼요");
  // 끌어다 놓기: 내 수업 화면 어디(여기서는 저장 위치 줄)에 놓아도 PPTX를 읽어 내 수업이 돼요
  const bytes = Array.from(readFileSync(fixture("lesson.pptx")));
  await page.evaluate((bytes) => {
    const f = new File([new Uint8Array(bytes)], "끌어 놓은.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const dt = new DataTransfer(); dt.items.add(f);
    const el = document.querySelector(".mylib .my-where");
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await expect(page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  await page.getByRole("tab", { name: "내 수업" }).click();
  // PPTX 하나로 만든 수업은 원래 모양이 아니라 글자만이라고 말해요(2026-11-14)
  await expect(rows(page).filter({ hasText: "끌어 놓은" })).toContainText("PPTX 글자만");
  // ‘PDF · PPTX로 시작하기’는 파일 창을 열어요(빈 새 수업이 열린 상태에서 PDF를 고르면 새 내 수업)
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await page.getByRole("tab", { name: "내 수업" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "PDF · PPTX로 시작하기" }).click()]);
  await chooser.setFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".sbar-sub")).toContainText("내 수업 · PDF 파일에서");
  // 내 수업 목록: 파일에서 만든 수업이라고 말해요(원본은 이 브라우저에 있어요)
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(page).filter({ hasText: "lesson" })).toContainText("PDF에서");
  expect(errors).toEqual([]);
});

test("휴대폰 320 · 360 · 390: 메뉴 다섯 칸이 잘리지 않고 다 보이고, 누르는 곳은 44px 이상이에요. 내 수업의 첫 줄이 첫 화면에 보여요", async ({ page }, info) => {
  test.skip(isPc(info), "휴대폰 시험이에요");
  const errors = watch(page, []);
  const list = Array.from({ length: 6 }, (_, i) => deckOf("m-0000000000000" + (100 + i), "수업 " + (i + 1), 3));
  await seed(page, { lessons: list });
  for (const [w, h] of [[390, 844], [360, 800], [320, 640]]) {
    await page.setViewportSize({ width: w, height: h });
    // 글자 잘림: 보이는 짧은 이름의 글자 상자가 칸 밖으로 나가는지
    const tabs = await page.locator(".side .nav-item").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(), t = e.querySelector(".lbl"), r = t && t.getBoundingClientRect();
      return { name: e.getAttribute("aria-label"), w: b.width, h: b.height, inView: b.left >= -0.5 && b.right <= innerWidth + 0.5, cut: !r || !r.width || r.left < b.left - 0.5 || r.right > b.right + 0.5 }; }));
    expect(tabs.map((t) => t.name.replace(/ \d+$/, "")), w + ": 메뉴 다섯 칸").toEqual(["내 수업", "예시 수업", "수업 준비", "수업 기록", "발표 설정"]);
    for (const t of tabs) {
      expect(t.inView, w + " " + t.name + " 화면 안").toBe(true);
      expect(t.cut, w + " " + t.name + " 글자 잘림").toBe(false);
      expect(t.h, w + " " + t.name + " 높이").toBeGreaterThanOrEqual(44);
      expect(t.w, w + " " + t.name + " 너비").toBeGreaterThanOrEqual(44);
    }
    // 내 수업의 단추 · ⋯ · 줄도 44px 이상
    const small = await page.locator(".mylib .my-acts .btn:visible, .mylib .m-more, .mylib .m-open").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((b) => b.height < 44 || b.width < 44).length);
    expect(small, w + ": 44px보다 작은 누르는 곳").toBe(0);
    const first = await rows(page).first().evaluate((e) => e.getBoundingClientRect().bottom);
    expect(first, w + ": 첫 줄이 첫 화면에").toBeLessThanOrEqual(h);
    await noSideScroll(page, "내 수업 " + w);
  }
  // 짧은 이름 칸을 눌러도 그 화면으로 가요
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await expect(page.locator(".lcard").first()).toBeVisible();
  expect(errors).toEqual([]);
});
