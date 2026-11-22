// 이 브라우저에 파일 저장(2026-11-11, docs/LOCAL-FILES.md): 올린 PDF · PPTX · 그림은 IndexedDB(navi-files)에 원본 그대로,
// 수업에는 파일 id만 남아요. 브라우저를 껐다 켜도(같은 사용자 데이터 폴더로 다시 실행) 파일 id로 다시 읽어 보여 줘요.
// 로그인하지 않은 이 브라우저에서 봐요. 교사 A · B의 파일이 섞이지 않는지, 휴대폰에는 없다고 말하는지는 tests/library.spec.js(에뮬레이터)
import { test, expect, chromium } from "@playwright/test";
import { statSync } from "node:fs";
import { isPc, fixture, watch, rowAction, openMore } from "./helpers.js";

test.describe.configure({ timeout: 120000 });
const PCVIEW = { width: 1536, height: 864 };
const rows = (page) => page.locator(".mylib .mrow");
const scenes = (page) => page.locator(".srow .t");

// 브라우저 하나를 사용자 데이터 폴더와 함께 열어요. 닫고 같은 폴더로 다시 열면 ‘브라우저를 껐다 켠 것’과 같아요
async function launch(dir, baseURL, errors) {
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, viewport: PCVIEW });
  const page = ctx.pages()[0] || await ctx.newPage();
  watch(page, errors);
  return { ctx, page };
}
// 이 브라우저의 저장소를 있는 그대로 읽어요: 내 수업(navi-local lessons) · 파일(navi-files files · pages)
const readStore = (page, name, store) => page.evaluate(([name, store]) => new Promise((res, rej) => {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => (name.indexOf("navi-files") === 0 ? ["files", "pages"] : ["records", "lessons"]).forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
  r.onsuccess = () => { const q = r.result.transaction(store, "readonly").objectStore(store).getAll(); q.onsuccess = () => { res(q.result.map((x) => Object.assign({}, x, { blob: x.blob ? { size: x.blob.size, type: x.blob.type } : null }))); r.result.close(); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}), [name, store]);
const mine = async (page) => (await readStore(page, "navi-local", "lessons")).filter((x) => x.kind === "mine");
const files = (page) => readStore(page, "navi-files", "files");
const pagePics = (page) => readStore(page, "navi-files", "pages");
// 그림이 실제로 그려졌는지(주소가 blob: 이고 그림 크기가 있어요)
const drawn = (img) => expect.poll(() => img.evaluate((i) => (i.src.indexOf("blob:") === 0 && i.complete ? i.naturalWidth : 0)).catch(() => 0), { timeout: 15000 }).toBeGreaterThan(0);
async function newLesson(page, title) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  if (title) { await page.locator("#ls-title").fill(title); await page.locator("#ls-title").blur(); await expect(page.locator(".sbar-title b")).toHaveText(title); }
}
async function openMine(page, title) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await rows(page).filter({ hasText: title }).first().locator(".m-open").click();
  await expect(page.locator(".sbar-title b")).toHaveText(title);
}
const filesCard = (page) => page.locator(".scard").filter({ has: page.getByRole("heading", { name: "이 브라우저의 파일" }) });
// 파일 창을 거치지 않고, 페이지 안에서 만든 파일을 고른 것처럼 넣어요(100MB가 넘는 파일을 시험 도구로 옮기지 않으려고)
const pickMade = (page, id, mb, name, type) => page.evaluate(([id, mb, name, type]) => {
  const f = new File([new Uint8Array(mb * 1024 * 1024)], name, { type });
  const dt = new DataTransfer(); dt.items.add(f);
  const el = document.getElementById(id); el.files = dt.files; el.dispatchEvent(new Event("change"));
}, [id, mb, name, type]);

test("PDF: 올리면 내 수업이 되고 원본 · 쪽 그림은 이 브라우저에 저장돼요. 브라우저를 껐다 켜도 그대로 열리고, 수업 화면도 같은 그림이에요", async ({ baseURL }, info) => {
  test.skip(!isPc(info) || info.project.name !== "pc-1536x864", "브라우저를 다시 실행하는 시험이라 교탁 PC 크기 하나에서만 해요");
  const errors = [], dir = info.outputPath("profile");
  let b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await b.page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(b.page.getByText("3장을 올렸어요. 파일은 이 브라우저에 저장했어요.")).toBeVisible({ timeout: 30000 });
  await expect(b.page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await expect(b.page.locator(".sbar-sub")).toContainText("내 수업 · PDF 파일에서");
  await drawn(b.page.locator(".sp-slide .slide.img img"));
  // 저장된 것: 원본 1개 · 쪽 그림 3장, 내 수업에는 파일 id와 쪽 번호만(blob 주소는 없어요)
  await expect.poll(async () => (await mine(b.page)).length).toBe(1);
  const [row] = await mine(b.page), [f] = await files(b.page);
  expect(f.id).toMatch(/^f-[0-9a-f]{32}$/);
  expect(f.blob.size).toBe(statSync(fixture("lesson.pdf")).size);
  expect((await pagePics(b.page)).map((x) => x.id).sort()).toEqual([f.id + ":1", f.id + ":2", f.id + ":3"]);
  expect(row.deck.file).toEqual({ fid: f.id, kind: "pdf", name: "lesson" });
  expect(row.deck.pages.map((p) => [p.fid, p.pg, p.url])).toEqual([[f.id, 1, ""], [f.id, 2, ""], [f.id, 3, ""]]);
  expect(JSON.stringify(row)).not.toContain("blob:");
  await b.ctx.close();
  // 브라우저를 다시 실행: 같은 수업, 같은 그림
  b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await openMine(b.page, "lesson");
  await expect(scenes(b.page)).toHaveCount(3);
  await drawn(b.page.locator(".sp-slide .slide.img img"));
  await b.page.locator(".srow").nth(2).click();
  await drawn(b.page.locator(".sp-slide .slide.img img"));
  await b.page.locator(".srow").first().click();
  const [stage] = await Promise.all([b.page.waitForEvent("popup"), b.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  const onStage = stage.locator(".stage .slide.img img");
  await drawn(onStage);
  // 교사 화면과 수업 화면이 같은 그림(같은 파일에서 만든 같은 주소 · 같은 크기)이에요
  const mine1 = b.page.locator(".slide.img img").first();
  await drawn(mine1);
  const look = (img) => img.evaluate((i) => [i.src, i.naturalWidth, i.naturalHeight]);
  expect(await look(onStage)).toEqual(await look(mine1));
  // 다음 장면도 저장된 쪽 그림이에요
  const first = (await look(onStage))[0];
  await b.page.locator('[data-act="next"]').first().click();
  await expect.poll(async () => (await look(onStage))[0]).not.toBe(first);
  await drawn(onStage);
  await b.ctx.close();
  expect(errors).toEqual([]);
});

test("PPTX: 올리면 글자 · 발표자 노트로 내 수업이 되고, 가져오지 않는 것(그림 · 도형 · 글꼴 · 배치)과 학생에게 글자 화면으로 보인다는 것을 그대로 말해요. 다시 실행해도 남아요", async ({ baseURL }, info) => {
  test.skip(!isPc(info) || info.project.name !== "pc-1536x864", "브라우저를 다시 실행하는 시험이라 교탁 PC 크기 하나에서만 해요");
  const errors = [], dir = info.outputPath("profile");
  let b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await b.page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(b.page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  // 2026-11-16: 늘 보이는 한 줄은 짧게(원래 디자인이 아니고 학생에게는 글자 화면), 가져오지 않는 것의 목록은 상태 영역의 ‘이 방식의 한계’에
  await expect(b.page.locator(".words-only")).toContainText("글자 화면 · 원본 디자인 아님");
  await expect(b.page.locator(".pst-limit")).toContainText("그림 · 도형 · 표 · 차트 · 글꼴 · 배치는 학생에게 보이지 않고");
  // 올린 직후 안내만이 아니라, 이 수업을 여는 동안 늘 말해요(2026-11-14)
  await expect(b.page.locator(".words-only")).toContainText("글자 화면 · 원본 디자인 아님");
  await expect(b.page.locator(".sbar-sub")).toContainText("PPTX 파일에서");
  await expect.poll(async () => (await mine(b.page)).length).toBe(1);
  const [f] = await files(b.page);
  expect(f.name).toBe("lesson.pptx");
  expect(f.blob.size).toBe(statSync(fixture("lesson.pptx")).size);
  await b.ctx.close();
  b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await openMine(b.page, "lesson");
  await expect(scenes(b.page)).toHaveText(["식물의 한살이", "씨앗은 어떻게 싹이 틀까요?", "오늘 배운 것 정리"]);
  await expect(b.page.locator('textarea[data-k="notes"]')).toHaveValue("씨앗을 직접 보여 주며 시작해요.");
  await expect(b.page.locator(".words-only")).toBeVisible();
  // 발표 설정: 파일 하나, 이 수업이 써요
  await b.page.getByRole("tab", { name: "발표 설정" }).click();
  const card = filesCard(b.page);
  await expect(card).toContainText("파일 1개");
  await expect(card.locator(".frow")).toContainText("lesson.pptx");
  await expect(card.locator(".frow")).toContainText("쓰는 수업 lesson");
  await expect(card.getByRole("button", { name: "지우기" })).toBeDisabled();
  await b.ctx.close();
  expect(errors).toEqual([]);
});

test("수업 자료로 첨부: 그림 · PDF · PPTX를 장면에 넣으면 이 브라우저에 저장되고, 다시 실행해도 열리고 수업 화면에 띄워져요(PPTX는 글자만)", async ({ baseURL }, info) => {
  test.skip(!isPc(info) || info.project.name !== "pc-1536x864", "브라우저를 다시 실행하는 시험이라 교탁 PC 크기 하나에서만 해요");
  const errors = [], dir = info.outputPath("profile");
  let b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await newLesson(b.page, "자료 수업");
  const add = async (name) => {
    await openMore(b.page);
    if (!(await b.page.locator(".add-form").count())) await b.page.getByRole("button", { name: "+ 자료" }).click();
    await b.page.locator("#res-file").setInputFiles(fixture(name));
  };
  await add("picture.png");
  await expect(b.page.locator(".res-pane")).toContainText("picture");
  await add("lesson.pdf");
  await expect(b.page.locator(".res-pane")).toContainText("lesson");
  await add("lesson.pptx");
  const list = b.page.locator(".res-pane .res-row");
  await expect(list).toHaveCount(3);
  await expect(list.filter({ hasText: "PPTX의 글자" })).toHaveCount(1);
  await expect(b.page.locator(".res-pane .file-gone")).toHaveCount(0);
  // 저장된 내 수업: 자료 3개 모두 파일 id만(주소는 비어 있어요). PPTX는 읽은 장 제목도 함께
  await expect.poll(async () => { const [r] = await mine(b.page); return r ? r.deck.res.map((x) => x.mt + ":" + /^f-/.test(x.fid) + ":" + (x.link || "")).join() : ""; }, { timeout: 5000 })
    .toBe("image:true:,pdf:true:,pptx:true:");
  expect((await files(b.page)).length).toBe(3);
  await b.ctx.close();
  b = await launch(dir, baseURL, errors);
  await b.page.goto("/");
  await openMine(b.page, "자료 수업");
  await expect(b.page.locator(".res-pane .res-row")).toHaveCount(3);
  await expect(b.page.locator(".res-pane .file-gone")).toHaveCount(0);
  await expect(b.page.locator(".file-need")).toHaveCount(0);
  const [stage] = await Promise.all([b.page.waitForEvent("popup"), b.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await b.page.keyboard.press("m");
  const item = (t) => b.page.locator(".pv-right .item").filter({ hasText: t });
  await expect(item("picture")).toContainText("수업 화면: 그림");
  await expect(item("picture").getByRole("link", { name: "열기" })).toHaveAttribute("href", /^blob:/);
  await expect(item("PowerPoint로 열기").getByRole("link", { name: "PowerPoint로 열기" })).toHaveAttribute("download", "lesson.pptx");
  await item("picture").getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await drawn(stage.locator(".stage .slide.media img"));
  await expect(item("PowerPoint로 열기")).toContainText("PPTX의 글자");
  await item("PowerPoint로 열기").getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".stage .pptx-card")).toContainText("PPTX · 3장 · 글자만");
  await expect(stage.locator(".stage .pptx-card")).toContainText("식물의 한살이");
  await b.ctx.close();
  expect(errors).toEqual([]);
});

test("같은 파일 · 여러 수업: 같은 PDF는 한 번만 저장하고, 복제한 수업도 같은 파일을 써요. 쓰는 수업이 있으면 지우지 못하고, 다 지운 뒤에만 확인하고 지워요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("파일은 이 브라우저에 저장했어요")).toBeVisible({ timeout: 30000 });
  await page.locator("#ls-title").fill("첫 번째");
  await page.locator("#ls-title").blur();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.locator(".sbar-title b")).toHaveText("lesson", { timeout: 30000 });
  await expect.poll(async () => (await mine(page)).map((x) => x.title).sort().join()).toBe("lesson,첫 번째");
  expect((await files(page)).length, "같은 파일은 한 번만").toBe(1);
  expect((await pagePics(page)).length).toBe(3);
  // 복제한 수업도 같은 파일 id를 그대로 써요
  await page.getByRole("tab", { name: "내 수업" }).click();
  await rowAction(rows(page).filter({ hasText: "첫 번째" }), "복제");
  await openMine(page, "첫 번째 (복사본)");
  await drawn(page.locator(".sp-slide .slide.img img"));
  const fids = [...new Set((await mine(page)).flatMap((x) => x.deck.pages.map((p) => p.fid)))];
  expect(fids).toHaveLength(1);
  // 발표 설정 → 이 브라우저의 파일: 쓰는 수업 3개라 지울 수 없어요
  await page.getByRole("tab", { name: "발표 설정" }).click();
  const card = filesCard(page);
  await expect(card).toContainText("파일 1개");
  await expect(card.locator(".frow")).toContainText("첫 번째");
  await expect(card.getByRole("button", { name: "지우기" })).toBeDisabled();
  // 수업을 하나 지워도 다른 수업이 쓰는 동안은 그대로예요
  for (const t of ["첫 번째", "첫 번째 (복사본)", "lesson"]) {
    await page.getByRole("tab", { name: "내 수업" }).click();
    await rowAction(rows(page).filter({ has: page.locator(".m-text b").getByText(t, { exact: true }) }), "삭제");
    await page.locator('.pop[aria-label="수업 지우기"]').getByRole("button", { name: "지우기" }).click();
    await page.getByRole("tab", { name: "발표 설정" }).click();
    if (t !== "lesson") await expect(card.getByRole("button", { name: "지우기" })).toBeDisabled();
    expect((await files(page)).length).toBe(1);
  }
  await expect(card.locator(".frow")).toContainText("쓰는 수업 없음");
  await card.getByRole("button", { name: "지우기" }).click();
  await expect(card.page().locator('.pop[aria-label="파일 지우기"]')).toContainText("되돌릴 수 없어요");
  await card.page().locator('.pop[aria-label="파일 지우기"]').getByRole("button", { name: "지우기" }).click();
  await expect(card).toContainText("파일을 지웠어요");
  await expect(card).toContainText("저장한 파일이 없어요");
  expect((await files(page)).length).toBe(0);
  expect((await pagePics(page)).length).toBe(0);
  expect(errors).toEqual([]);
});

test("파일을 고르는 동안 저절로 저장: 수업 이름을 고친 바로 뒤 ‘PDF · PPTX에서 장면 더하기’로 고른 장면도, 고친 이름도 함께 남아요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await newLesson(page, "");
  await page.locator("#ls-title").fill("붙인 수업");
  await page.locator("#ls-title").blur();
  // 저절로 저장(0.4초 뒤)이 아직 기다리는 동안 파일을 골라요
  await page.locator("#pdf-add").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 장면으로 더했어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".srow")).toHaveCount(4);
  await expect.poll(async () => { const [r] = await mine(page); return r ? r.title + ":" + r.deck.pages.length + ":" + r.deck.pages.filter((p) => p.fid && p.pg).length : ""; }, { timeout: 5000 }).toBe("붙인 수업:4:3");
  await page.reload();
  await openMine(page, "붙인 수업");
  await expect(page.locator(".srow")).toHaveCount(4);
  await page.locator(".srow").nth(1).click();
  await drawn(page.locator(".sp-slide .slide.img img"));
  // 장면이 아닌 수업 자료가 더 늘지 않았어요
  expect((await mine(page))[0].deck.res.length).toBe(0);
  expect(errors).toEqual([]);
});

test("100MB보다 큰 파일은 저장하지 않고 그대로 말해요(수업 · 자료 · 파일이 생기지 않아요)", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await pickMade(page, "pdf-in", 101, "큰 파일.pdf", "application/pdf");
  await expect(page.getByText("파일이 100MB보다 커요")).toBeVisible();
  await newLesson(page, "자료");
  await openMore(page);
  await page.getByRole("button", { name: "+ 자료" }).click();
  await pickMade(page, "res-file", 101, "큰 그림.png", "image/png");
  await expect(page.getByText("파일이 100MB보다 커요")).toBeVisible();
  await expect.poll(async () => (await mine(page)).map((x) => x.title + ":" + x.deck.res.length).join()).toBe("자료:0");
  expect((await files(page)).length).toBe(0);
  expect(errors).toEqual([]);
});

test("저장 공간 부족: 브라우저가 남은 공간이 모자라다고 하거나 저장이 거절되면, 내 수업을 만들지 않고 정리할 곳을 알려 줘요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  // 1) 남은 공간이 1MB보다 적다고 해요
  await page.addInitScript(() => {
    if (sessionStorage.getItem("t-quota") === "put") {
      // 2) 공간은 있다고 하지만 실제 저장이 거절돼요(QuotaExceededError)
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        if (this.name === "files" && this.transaction.db.name.indexOf("navi-files") === 0) throw new DOMException("가득 참", "QuotaExceededError");
        return put.apply(this, arguments);
      };
    } else navigator.storage.estimate = () => Promise.resolve({ quota: 4000000, usage: 3900000 });
  });
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("이 브라우저의 저장 공간이 모자라요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".warn-note").filter({ hasText: "저장 공간이 모자라요" })).toContainText("이 브라우저의 파일");
  expect((await mine(page)).length).toBe(0);
  expect((await files(page)).length).toBe(0);
  await page.evaluate(() => sessionStorage.setItem("t-quota", "put"));
  await page.reload();
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("이 브라우저의 저장 공간이 모자라요")).toBeVisible({ timeout: 30000 });
  expect((await mine(page)).length).toBe(0);
  expect((await files(page)).length).toBe(0);
  expect(errors).toEqual([]);
});

test("파일이 없는 수업: 브라우저 데이터를 지웠거나 다른 곳에서 만든 수업은 장면에 ‘파일이 없어요’라고 말하고, 같은 파일을 다시 넣으면 돌아와요(다른 파일은 받지 않아요)", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("파일은 이 브라우저에 저장했어요")).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await mine(page)).length).toBe(1);
  // 앱을 닫고(같은 주소의 다른 파일로 가서) 파일 저장소만 지워요. 내 수업(글자)은 그대로예요
  await page.goto("/lessons.js");
  expect(await page.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase("navi-files"); r.onsuccess = () => res("ok"); r.onerror = () => res("err"); r.onblocked = () => res("blocked"); }))).toBe("ok");
  await page.goto("/");
  await openMine(page, "lesson");
  await expect(page.locator(".sp-slide .slide.img.miss")).toContainText("이 브라우저에 파일이 없어요");
  const need = page.locator(".file-need");
  await expect(need).toContainText("파일 1개가 이 브라우저에 없어요");
  // 다른 파일은 받지 않아요
  await page.locator("#file-again").setInputFiles(fixture("picture.png"));
  await expect(page.getByText("이 수업이 쓰던 파일과 내용이 달라요")).toBeVisible();
  await page.locator("#file-again").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("파일을 다시 넣었어요")).toBeVisible({ timeout: 30000 });
  await drawn(page.locator(".sp-slide .slide.img img"));
  await expect(need).toHaveCount(0);
  expect((await pagePics(page)).length).toBe(3);
  expect(errors).toEqual([]);
});

// 자료는 고를 때의 장면에(2026-11-13, docs/STABILITY.md 2-2): PPTX를 읽고 파일을 저장하는 데 몇 초 걸려요. 그 사이 다른 장면을 눌러도
// 고를 때 보고 있던 장면에 들어가야 해요(예전에는 읽기가 끝난 때의 장면에 들어갔어요)
test("자료는 고를 때의 장면에: PPTX를 읽는 동안 다른 장면을 눌러도 처음 장면에 들어가요", async ({ page }, info) => {
  test.skip(!isPc(info) || info.project.name !== "pc-1536x864", "파일 첨부는 교탁 PC 크기 하나에서 봐요");
  const errors = watch(page, []);
  // PPTX를 읽는 도구(JSZip)를 2.5초 늦게 받아요: 그 사이에 다른 장면을 눌러요
  await page.route(/jszip/, async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue(); });
  await page.goto("/");
  await newLesson(page, "자료 장면");
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  const ids = await page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
  expect(ids.length).toBe(2);
  await page.locator('.srow[data-v="' + ids[0] + '"]').click();
  await openMore(page);
  await page.getByRole("button", { name: "+ 자료" }).click();
  await page.locator("#res-file").setInputFiles(fixture("lesson.pptx"));
  await page.locator('.srow[data-v="' + ids[1] + '"]').click();
  // 읽기가 끝나 파일이 이 브라우저에 저장될 때까지(둘째 장면을 보고 있는 채로)
  await expect.poll(async () => (await readStore(page, "navi-files", "files")).length, { timeout: 30000 }).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator(".res-pane .res-row")).toHaveCount(0);
  await page.locator('.srow[data-v="' + ids[0] + '"]').click();
  await expect(page.locator(".res-pane .res-row")).toContainText("PPTX의 글자");
  expect(errors).toEqual([]);
});
