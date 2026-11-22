// 가져오기 하나로: PDF · PPTX · 둘을 함께(2026-11-14, docs/SLIDE-IMPORT.md). window.claude 없이(이 기기만) 시험해요.
// 시험 파일은 모두 직접 만든 시험용이에요(tests/fixtures/make-fixtures.js, 실제 수업 자료 아님).
// 지키는 것: 같은 자료인지 장 수와 장마다의 글자로 확인한 뒤에만 노트를 붙이고, 맞지 않으면 붙이지 않고 까닭을 말해요.
// 글자가 적어 알 수 없으면 교사에게 한 번 묻고, PPTX 하나만 올리면 원래 모양이 아니라고 계속 말해요.
import { test, expect } from "@playwright/test";
import { watch, fixture, isPc } from "./helpers.js";

const pick = (page, ...names) => page.locator("#pdf-in").setInputFiles(names.map(fixture));
const scenes = (page) => page.locator(".srow .t");
const notesOf = async (page, i) => {
  await page.locator(".srow").nth(i).click();
  return page.locator('textarea[data-k="notes"]').inputValue();
};
const allNotes = async (page) => { const out = []; const n = await page.locator(".srow").count(); for (let i = 0; i < n; i++) out.push(await notesOf(page, i)); return out; };
const myRows = async (page) => { await page.getByRole("tab", { name: "내 수업" }).click(); const n = await page.locator(".mylib .mrow").count(); await page.getByRole("tab", { name: "수업 준비" }).click(); return n; };
const NOTES = ["씨앗을 직접 보여 주며 시작해요.", "조건 세 가지를 칠판에 적어요.", ""];

test.beforeEach(async ({}, info) => test.skip(!isPc(info) || info.project.name === "tablet-768x1024", "수업 자료 가져오기는 교사 PC에서 해요"));

test("PDF와 PPTX를 함께 고르면 수업 하나가 돼요: 수업 화면은 PDF 그대로, 장마다 PPTX 노트. 고치지 않고 바로 시작할 수 있어요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "lesson.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".note").filter({ hasText: "PPTX의 발표자 노트를 장마다 붙였어요(노트가 있는 장 2개)" })).toContainText("장 수와 글자가 맞는지 확인했어요");
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  await expect(page.locator(".sbar-sub")).toContainText("내 수업 · PDF 파일에서");
  // 장면 이름은 PPTX의 제목, 장면은 PDF 쪽 그림
  await expect(scenes(page)).toHaveText(["식물의 한살이", "씨앗은 어떻게 싹이 틀까요?", "오늘 배운 것 정리"]);
  await expect(page.locator(".sp-slide .slide.img img")).toBeVisible();
  expect(await allNotes(page)).toEqual(NOTES);
  expect(await myRows(page)).toBe(1);
  // 아무것도 고치지 않고 수업 시작: 학생에게는 PDF 그대로, 교사 화면에는 노트
  await page.locator(".srow").first().click();
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(stage.locator(".stage .slide.img img")).toBeVisible();
  await expect(page.locator(".pv").getByText("씨앗을 직접 보여 주며 시작해요.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("장 수가 다른 PPTX: 노트를 붙이지 않고 PDF로만 만들고, 몇 장씩인지 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "other.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요. PDF는 3장, PPTX는 4장이라 같은 자료가 아니에요.");
  await expect(page.locator(".note").filter({ hasText: "발표자 노트를 장마다 붙였어요" })).toHaveCount(0);
  expect(await allNotes(page)).toEqual(["", "", ""]);
  // 장면 이름은 PPTX가 아니라 PDF 글자에서
  await expect(scenes(page).first()).not.toHaveText("분수의 덧셈");
  expect(errors).toEqual([]);
});

test("장 수는 같지만 순서가 다른 PPTX: 순서대로 붙이면 다른 장에 붙으니 붙이지 않고, 어느 장이 어디 있는지 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "swapped.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요. 장 순서가 서로 달라요(PDF 1장의 글자가 PPTX 2장에 있어요). 순서대로 붙이면 다른 장에 붙어요.");
  expect(await allNotes(page)).toEqual(["", "", ""]);
  expect(errors).toEqual([]);
});

test("한 장만 고친 PPTX(PDF로 저장한 뒤 고친 것처럼): 어느 장이 다른지 말하고 교사에게 묻고, 고른 대로만 해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "edited.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  const ask = page.locator(".notes-ask");
  await expect(ask).toContainText("PDF와 PPTX의 장 수(3장)는 같지만, 2장의 글자가 달라요. PDF로 저장한 뒤 고쳤을 수도, 다른 수업일 수도 있어요. 아래 장을 비교해 보고 같은 수업일 때만 노트를 붙여 주세요.");
  // 다른 장(2장)과 맞는 장(1장)을 나란히: PDF 그림 ↔ PPTX 제목 · 노트
  await expect(ask.locator(".pc-row")).toHaveCount(2);
  await expect(ask.locator(".pc-row.off")).toContainText("PPTX 2장 · 싹이 트는 조건 실험 계획");
  expect(await allNotes(page)).toEqual(["", "", ""]);
  await ask.getByRole("button", { name: "노트 붙이기" }).click();
  expect(await allNotes(page)).toEqual(["씨앗을 직접 보여 주며 시작해요.", "실험 계획을 모둠별로 세워요.", ""]);
  expect(errors).toEqual([]);
});

test("숨긴 장이 있는 PPTX: PDF에 없는 숨긴 장은 빼고 맞춰서, 노트가 한 장씩 밀리지 않아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "hidden.pptx", "lesson.pdf");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  expect(await allNotes(page)).toEqual(NOTES);
  await expect(page.locator("body")).not.toContainText("숨긴 장의 노트");
  expect(errors).toEqual([]);
});

test("글자가 없는 자료: 같은 자료인지 알 수 없어 교사에게 한 번 묻고, 고른 대로만 해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "shapes.pdf", "shapes.pptx");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  const ask = page.locator(".notes-ask");
  await expect(ask).toContainText("PDF와 PPTX의 장 수(3장)는 같지만, 글자가 적어 같은 자료인지 확인하지 못했어요. 파일 이름은 같아요. 아래 장을 비교해 보고 같은 수업일 때만 노트를 붙여 주세요.");
  // D 그림 중심 자료: 처음 · 가운데 · 마지막 장을 PDF 그림과 PPTX 노트로 나란히 보여 줘요(교사가 보고 고르게)
  await expect(ask.locator(".pc-row")).toHaveCount(3);
  await expect(ask.locator(".pc-row img")).toHaveCount(3);
  await expect(ask.locator(".pc-row").first()).toContainText("노트 · 노란 원부터 가리켜요.");
  // 묻는 동안에는 붙이지 않아요
  expect(await allNotes(page)).toEqual(["", "", ""]);
  await ask.getByRole("button", { name: "붙이지 않기" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByText("노트를 붙이지 않았어요. 노트 없이 PDF로 수업해요.")).toBeVisible();
  expect(await allNotes(page)).toEqual(["", "", ""]);
  // 다시 함께 올리고 이번에는 붙여요
  await pick(page, "shapes.pdf", "shapes.pptx");
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  await page.locator(".notes-ask").getByRole("button", { name: "노트 붙이기" }).click();
  await expect(page.getByText("PDF 장마다 PPTX의 발표자 노트를 붙였어요. 노트가 있는 장 3개.")).toBeVisible();
  expect(await allNotes(page)).toEqual(["노란 원부터 가리켜요.", "초록 원과 빨간 네모를 비교해요.", "보라 원으로 마무리해요."]);
  expect(errors).toEqual([]);
});

test("PPTX 하나만: 표 · 묶은 도형 안의 글자도 읽고(쪽 번호는 빼요), 글자만 가져온 수업이라고 계속 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "table.pptx");
  await expect(page.getByText("2장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  // 올린 직후의 안내는 몇 장 · 노트만. 글자 화면이라는 것과 원래 모양으로 하는 길은 늘 보이는 줄 하나가 말해요(같은 말을 두 번 하지 않아요, 2026-11-15)
  const said = page.locator(".note").filter({ hasText: "2장을 가져왔어요" });
  await expect(said).toContainText("발표자 노트는 1장에 있어요.");
  await expect(said).not.toContainText("PDF로 저장");
  // PDF도 장마다의 그림이라 애니메이션은 오지 않는다고 말해요(원래 모양을 다 지킨다고 하지 않아요)
  // 2026-11-16: 원래 모양으로 가는 길은 그 줄의 ‘PDF 넣기’, 애니메이션 · 전환 · 동영상 · 소리가 재생되지 않는 것은 ‘이 방식의 한계’에
  await expect(page.locator(".words-only")).toContainText("원래 모양으로");
  await expect(page.locator(".words-only").getByText("PDF 넣기")).toBeVisible();
  await expect(page.locator(".pst-limit")).toContainText("애니메이션 · 전환 · 동영상 · 소리도 재생되지 않아요");
  // 표의 줄마다 칸을 이어 한 줄로(예전에는 표 글자를 읽지 못했어요)
  const slide = page.locator(".sp-slide .slide");
  await expect(slide).toContainText("상태 변화 · 예 · 열");
  await expect(slide).toContainText("증발 · 빨래가 마름 · 흡수");
  await expect(slide).toContainText("응결 · 컵 바깥 물방울 · 방출");
  await expect(slide.locator(".s-list li")).toHaveCount(3);
  await page.locator(".srow").nth(1).click();
  await expect(page.locator(".sp-slide .slide .s-list li")).toHaveText(["증발", "응결", "강수"]);
  // 수업 준비에 머무는 동안 늘 보이는 안내(올린 직후 한 번만이 아니에요)
  const words = page.locator(".words-only");
  // 늘 보이는 줄 하나가 가져오지 않는 것과 학생이 보는 화면을 말해요(올린 안내에서 옮겨 와 한 곳에서만, 2026-11-15)
  await expect(words).toContainText("글자 화면 · 원본 디자인 아님");
  await expect(page.locator(".pst .pchip").first()).toHaveText("글자 화면 · 원본 디자인 아님");
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".mylib .mrow").filter({ hasText: "table" })).toContainText("PPTX 글자만");
  await page.locator(".mylib .mrow").filter({ hasText: "table" }).locator(".m-open").click();
  await expect(words).toBeVisible();
  await expect(words.getByText("PDF 넣기")).toBeVisible();
  expect(errors).toEqual([]);
});

test("길고 여러 줄인 발표자 노트: 줄바꿈을 지키고 400자에서 자르지 않아요. 고쳐도 잘리지 않아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "longnotes.pptx");
  await expect(page.getByText("1장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  const notes = page.locator('textarea[data-k="notes"]');
  const v = await notes.inputValue();
  expect(v.split("\n")).toHaveLength(5);
  expect(v.length).toBeGreaterThan(400);
  expect(v).toMatch(/^1\. 도입\(3분\)/);
  expect(v).toMatch(/칠판 구석에 적어 둬요\.$/);
  // 교사가 한 줄 더 써도 앞의 노트가 잘리지 않아요
  await notes.fill(v + "\n6. 질문 받기");
  await notes.blur();
  await expect(notes).toHaveValue(v + "\n6. 질문 받기");
  expect(errors).toEqual([]);
});

test("올린 PDF 수업에 ‘PPTX에서 노트 붙이기’: 다른 자료면 그대로 두고, 같은 자료면 붙여요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".add-notes")).toHaveText("+ PPTX에서 노트 붙이기");
  await page.locator("#pair-in").setInputFiles(fixture("other.pptx"));
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요. PDF는 3장, PPTX는 4장이라 같은 자료가 아니에요. 이 수업은 그대로예요.");
  expect(await allNotes(page)).toEqual(["", "", ""]);
  await page.locator("#pair-in").setInputFiles(fixture("swapped.pptx"));
  await expect(page.locator(".pair-warn")).toContainText("장 순서가 서로 달라요");
  expect(await allNotes(page)).toEqual(["", "", ""]);
  await page.locator("#pair-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("PDF 장마다 PPTX의 발표자 노트를 붙였어요. 노트가 있는 장 2개.")).toBeVisible();
  expect(await allNotes(page)).toEqual(NOTES);
  // 새 수업이 생기지 않아요(지금 수업에 붙여요)
  expect(await myRows(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("PPTX로 만든 수업에 ‘PDF 넣기’: 맞는 PDF면 원래 모양으로 바뀌고 교사가 적은 것은 그대로, 알 수 없으면 묻고 그대로 둬요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pptx");
  await expect(page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  // 교사가 적은 발화
  await page.locator(".srow").nth(1).click();
  await page.locator('textarea[data-k="say"]').fill("싹이 트려면 무엇이 필요할까요?");
  await page.locator('textarea[data-k="say"]').blur();
  // 글자가 없는 PDF: 장 수는 같지만 알 수 없어 묻고, ‘넣지 않기’면 그대로
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pdf"));
  await expect(page.locator(".notes-ask")).toContainText("PDF와 이 수업의 장 수(3장)는 같지만, 글자가 적어 같은 자료인지 확인하지 못했어요. 아래 장을 비교해 보고 같은 수업일 때만 원래 모양을 넣어 주세요.");
  // 아직 수업에 없는 PDF의 장은 작게 그려 이 수업의 장면과 나란히
  await expect(page.locator(".notes-ask .pc-row img")).toHaveCount(3);
  await expect(page.locator(".notes-ask .pc-row").first()).toContainText("이 수업 1장 · 식물의 한살이");
  await page.locator(".notes-ask").getByRole("button", { name: "넣지 않기" }).click();
  await expect(page.getByText("PDF를 넣지 않았어요. 이 수업은 그대로예요.")).toBeVisible();
  await expect(page.locator(".words-only")).toBeVisible();
  // 같은 자료의 PDF
  await page.locator("#pair-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("원래 모양(PDF 3장)을 넣었어요. 장면 이름 · 노트 · 발화 · 자료는 그대로예요.")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".words-only")).toHaveCount(0);
  await expect(page.locator(".sp-slide .slide.img img")).toBeVisible();
  await expect(page.locator(".sbar-sub")).toContainText("PDF 파일에서");
  await expect(scenes(page)).toHaveText(["식물의 한살이", "씨앗은 어떻게 싹이 틀까요?", "오늘 배운 것 정리"]);
  expect(await allNotes(page)).toEqual(NOTES);
  await page.locator(".srow").nth(1).click();
  await expect(page.locator('textarea[data-k="say"]')).toHaveValue("싹이 트려면 무엇이 필요할까요?");
  expect(await myRows(page)).toBe(1);
  expect(errors).toEqual([]);
});

// ---------- 같은 학교 서식(장마다 같은 머리글 · 바닥글)의 자료(2026-11-15, PR #18 HIGH) ----------
// 서식 글자가 장 글자의 대부분이라, 예전에는 서로 다른 수업도 ‘같은 자료’로 보고 노트와 장면 이름을 붙였어요
const TX_TITLES = ["물의 세 가지 상태", "증발", "끓음", "응결", "물의 순환", "정리"];
const TX_NOTES = TX_TITLES.map((t, i) => "물 수업 " + (i + 1) + "장 노트");
const labelsNow = (page) => page.locator(".srow .t").allInnerTexts();

test("B 같은 서식 · 같은 장 수 · 다른 수업: 노트도 장면 이름도 붙이지 않고, 같은 서식이지만 내용이 다르다고 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "template-x.pdf", "template-y.pptx");
  await expect(page.getByText("6장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".note").filter({ hasText: "발표자 노트를 장마다 붙였어요" })).toHaveCount(0);
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요.");
  await expect(page.locator(".pair-warn")).toContainText("같은 머리글 · 바닥글을 쓰지만 장마다의 내용이 달라");
  expect(await allNotes(page)).toEqual(["", "", "", "", "", ""]);
  // 장면 이름도 PPTX(자석 수업)에서 가져오지 않아요. PDF 글자에서 만들되, 모든 장에 있는 서식(학교 머리글)은 빼서 장마다 다른 이름이에요
  const labels = await labelsNow(page);
  expect(labels.some((l) => /자석|N극|나침반/.test(l))).toBe(false);
  expect(labels.some((l) => /햇살초등학교/.test(l))).toBe(false);
  expect(new Set(labels).size).toBe(6);
  expect(labels[0]).toBe("물의 세 가지 상태");
  expect(errors).toEqual([]);
});

test("A 같은 서식의 같은 수업: 서식 글자를 빼고도 장마다 내용이 맞아 묻지 않고 바로 붙여요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "template-x.pdf", "template-x.pptx");
  await expect(page.getByText("6장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".note").filter({ hasText: "PPTX의 발표자 노트를 장마다 붙였어요(노트가 있는 장 6개)" })).toContainText("두 파일의 장 수와 장마다의 내용(같은 머리글 · 바닥글은 빼고)이 맞는지 확인했어요.");
  await expect(page.locator(".notes-ask")).toHaveCount(0);
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  expect(await labelsNow(page)).toEqual(TX_TITLES);
  expect(await allNotes(page)).toEqual(TX_NOTES);
  expect(errors).toEqual([]);
});

test("E 같은 수업인데 파일 이름이 다르고 한 장의 글자를 고친 PPTX: 묻지 않고 붙이고, 다른 장만 알려 줘요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "template-x.pdf", "물의 상태 변화(수정본).pptx");
  await expect(page.getByText("6장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".note").filter({ hasText: "PPTX의 발표자 노트를 장마다 붙였어요" })).toContainText("3장은 글자가 조금 달라요. 그 장의 노트를 확인해 주세요.");
  await expect(page.locator(".notes-ask")).toHaveCount(0);
  expect(await allNotes(page)).toEqual(TX_NOTES);
  expect(errors).toEqual([]);
});

test("F 맞지 않거나 교사가 붙이지 않기를 골라도 PDF 수업은 그대로이고, 새로고침 뒤에도 저장된 그대로예요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "template-x.pdf");
  await expect(page.getByText("6장을 올렸어요")).toBeVisible({ timeout: 30000 });
  const before = await labelsNow(page);
  await expect(page.locator(".sbar .save")).toHaveText("이 브라우저에 저장");
  // 같은 서식 · 다른 수업(B)을 이 수업에 붙이려 하면: 붙이지 않고 그대로
  await page.locator("#pair-in").setInputFiles(fixture("template-y.pptx"));
  await expect(page.locator(".pair-warn")).toContainText("노트를 붙이지 않았어요. 두 파일은 같은 머리글 · 바닥글을 쓰지만 장마다의 내용이 달라요");
  await expect(page.locator(".pair-warn")).toContainText("이 수업은 그대로예요.");
  expect(await labelsNow(page)).toEqual(before);
  expect(await allNotes(page)).toEqual(["", "", "", "", "", ""]);
  // 장 수가 다른 자료(C)도 그대로
  await page.locator("#pair-in").setInputFiles(fixture("other.pptx"));
  await expect(page.locator(".pair-warn")).toContainText("PDF는 6장, PPTX는 4장이라 같은 자료가 아니에요.");
  // 새로고침해도: 수업은 하나, 장면 이름 · 노트 · 그림이 처음 그대로
  await page.reload();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".mylib .mrow")).toHaveCount(1);
  await page.locator(".mylib .mrow .m-open").first().click();
  expect(await labelsNow(page)).toEqual(before);
  expect(await allNotes(page)).toEqual(["", "", "", "", "", ""]);
  await expect(page.locator(".sp-slide .slide.img img")).toBeVisible();
  expect(errors).toEqual([]);
});

test("F 물음에서 ‘붙이지 않기’를 고른 PDF 수업도 새로고침 뒤 그대로예요(일부만 붙은 채 남지 않아요)", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "shapes.pdf");
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  const before = await labelsNow(page);
  await page.locator("#pair-in").setInputFiles(fixture("shapes.pptx"));
  await expect(page.locator(".notes-ask")).toBeVisible({ timeout: 30000 });
  await page.locator(".notes-ask").getByRole("button", { name: "붙이지 않기" }).click();
  await expect(page.locator(".sbar .save")).toHaveText("이 브라우저에 저장");
  await page.reload();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator(".mylib .mrow .m-open").first().click();
  expect(await labelsNow(page)).toEqual(before);
  expect(await allNotes(page)).toEqual(["", "", ""]);
  expect(errors).toEqual([]);
});

test("함께 고를 수 없는 묶음(PDF 둘)은 받지 않고 어떻게 하면 되는지 말해요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, "lesson.pdf", "shapes.pdf");
  await expect(page.locator(".warn-note")).toContainText("함께 고를 수 있는 것은 같은 자료의 PDF 하나와 PPTX 하나예요.");
  await expect(page.locator(".mylib .mrow")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ---------- 교사 자료처럼 서식이 되풀이되는 자료의 장면 이름(2026-11-15, docs/SLIDE-IMPORT.md 6) ----------
// 실제 교사 PPTX(28장)에서 활동 이름을 여러 장의 제목으로 되풀이해 11장의 이름이 같았어요. 같은 모양으로 직접 만든 18장:
// 내용 장마다 같은 학습 목표 머리글, 쪽 번호 글상자, 구분 장, 본문 없이 제목만 있는 장(10), 글자 없는 장(18)
const CLASS_DECK = "우리 고장 문제 찾기";
const CLASS_NAMES = ["우리 고장의 문제를 찾아요", "도입 · 사진 속 장소는 어디일까요?", "도입 · 불편했던 경험 떠올리기", "도입 · 오늘 할 일 알아보기", "학습 목표", "활동 1",
  "활동1 · 역할 나누기", "활동1 · 지도에 붙임 쪽지 붙이기", "활동1 · 가장 급한 문제 고르기", "활동1 (4/5)", "활동1 · 모둠별로 발표하기", "활동 2",
  "활동2 · 누가 도울 수 있을까요?", "활동2 · 해결 방법 문장 카드 쓰기", "활동2 · 카드 나누어 읽기", "정리 · 오늘 찾은 문제 한 가지", "정리 · 다음 시간 예고", "글자 없는 장"];
// 노트는 장 순서 그대로(1장 표지, 6 · 12장 구분 장은 노트 없음)
const classNotesInOrder = (notes) => notes.every((t, i) => (i === 0 ? t.startsWith("표지") : [5, 11].includes(i) ? t === "" : t.startsWith(i + 1 + "장")));

test("교사 자료 같은 PPTX만: 같은 제목이 되풀이돼도 장면 이름이 겹치지 않고, 머리글 · 쪽 번호는 이름이 되지 않고, 노트 순서는 그대로예요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, CLASS_DECK + ".pptx");
  await expect(page.getByText("18장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  const names = await labelsNow(page);
  expect(names).toEqual(CLASS_NAMES);
  expect(new Set(names).size).toBe(18);
  expect(names.some((l) => l.includes("우리 고장의 문제를 찾고 해결 방법을"))).toBe(false);
  expect(names.some((l) => /^\d+(쪽)?$/.test(l))).toBe(false);
  expect(classNotesInOrder(await allNotes(page))).toBe(true);
  // 글자 화면에 쪽 번호 글상자("9")가 줄로 나오지 않아요. 슬라이드의 다른 글은 그대로
  await page.locator(".srow").nth(8).click();
  const slide = page.locator(".sp-slide .slide");
  await expect(slide).toContainText("가장 급한 문제 고르기");
  expect(await slide.locator(".s-list li").allInnerTexts()).not.toContain("9");
  await expect(slide).toContainText("모둠 활동 · 10분");
  expect(errors).toEqual([]);
});

test("교사 자료 같은 PDF + PPTX: 묻지 않고 붙이고, 장면 이름은 PPTX 글에서 겹치지 않게, 노트는 장 순서 그대로예요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, CLASS_DECK + ".pdf", CLASS_DECK + ".pptx");
  await expect(page.getByText("18장을 올렸어요")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note").filter({ hasText: "PPTX의 발표자 노트를 장마다 붙였어요(노트가 있는 장 16개)" })).toBeVisible();
  await expect(page.locator(".pair-warn")).toHaveCount(0);
  await expect(page.locator(".notes-ask")).toHaveCount(0);
  expect(await labelsNow(page)).toEqual(CLASS_NAMES);
  expect(classNotesInOrder(await allNotes(page))).toBe(true);
  expect(errors).toEqual([]);
});

test("교사 자료 같은 PDF만: PDF 쪽의 줄에서 이름을 지어 머리글 · 쪽 번호가 빠지고 겹치지 않아요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await pick(page, CLASS_DECK + ".pdf");
  await expect(page.getByText("18장을 올렸어요")).toBeVisible({ timeout: 60000 });
  expect(await labelsNow(page)).toEqual(CLASS_NAMES);
  expect(errors).toEqual([]);
});

test("이미 저장된 수업의 장면 이름은 바꾸지 않아요(예전 방식으로 겹친 이름도 그대로)", async ({ page }) => {
  const errors = watch(page, []);
  const id = "m-00000000000000c1", old = ["표지", "활동1. 문제 찾기", "활동1. 문제 찾기", "활동1. 문제 찾기"];
  const deck = { v: 5, kind: "mine", myId: id, key: "mine:" + id, title: "예전에 가져온 수업", grade: 4, subject: "사회", total: 40, res: [],
    pages: old.map((l, i) => ({ id: "p" + (i + 1), n: i + 1, stage: "전개", label: l, min: 4, layout: "question", eye: "", title: l, sub: "", notes: i + 1 + "장 노트", concepts: [], say: [], rec: [], want: "" })) };
  await page.goto("/lessons.js");
  await page.evaluate((d) => new Promise((res, rej) => {
    const r = indexedDB.open("navi-local", 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => { const t = r.result.transaction("lessons", "readwrite"); t.objectStore("lessons").put({ id: d.myId, at: Date.now(), made: Date.now(), kind: "mine", title: d.title, grade: 4, subject: "사회", from: "", deck: d }); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }), deck);
  await page.goto("/");
  await page.locator(".mylib .mrow .m-open").first().click();
  expect(await labelsNow(page)).toEqual(old);
  expect(await allNotes(page)).toEqual(["1장 노트", "2장 노트", "3장 노트", "4장 노트"]);
  await page.reload();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator(".mylib .mrow .m-open").first().click();
  expect(await labelsNow(page)).toEqual(old);
  expect(errors).toEqual([]);
});
