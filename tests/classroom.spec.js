// 0.5단계 확인: 교실에서 막히던 곳 (docs/REVIEW-0.5.md). window.claude 없이(이 기기만) 시험해요.
// 0.6단계에서 화면 이름(교사 화면 · 수업 화면 · 모바일 리모컨 · 수업 자료 · 수업 미리보기)과 배치가 바뀌어, 찾는 방법만 맞췄어요.
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { LABELS, isPc, fixture, watch, scroll, noSideScroll, curLabel, nextBtn, slideFits, toFlow, finishLesson, copyCurrent, openMore } from "./helpers.js";

const JSQR = createRequire(import.meta.url).resolve("jsqr/dist/jsQR.js");
const QRJS = /qrcodejs/;
const PDFJS = /\/pdf\.js\//;

test("준비 화면: 연결·저장·TV·AI 상태를 실제대로 보여 줘요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const ready = page.locator(".ready");
  // 수업 화면은 선택이라 준비 화면에서 바로 여는 단추로 보여요(2026-11-13, docs/CLASS-SCREEN.md)
  await expect(ready).toContainText("수업 화면 열기");
  await expect(ready).toContainText("없어도 시작할 수 있어요");
  await expect(ready).toContainText("모바일 리모컨 연결 전");
  // 예시 원본은 고치지 않아서 저장할 것이 없다고 그대로 말해요(2026-11-11). 내 수업으로 복제하면 이 브라우저에 저장돼요
  await expect(page.locator(".sbar .save")).toContainText("예시 원본");
  await copyCurrent(page);
  await expect(page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await expect(page.locator("body")).not.toContainText("모니터 2에 슬라이드");
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(page.locator(".scard").filter({ has: page.getByRole("heading", { name: "모바일 리모컨" }) })).toContainText("아직 교사 화면과 함께 넘어가지 않아요");
  await expect(page.getByRole("checkbox", { name: /AI에게 묻기/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "모바일 리모컨으로" })).toHaveCount(0);
  await page.getByRole("tab", { name: "수업 기록" }).click();
  await expect(page.locator("#records")).toContainText("이 브라우저에만");
  await noSideScroll(page, "준비 화면");
  expect(errors).toEqual([]);
});

test("따로 연 수업 화면·교사 화면 주소는 기다리게 하지 않고 이유와 돌아갈 길을 보여 줘요", async ({ page }) => {
  const errors = watch(page, []);
  await page.goto("/#stage");
  await expect(page.locator(".stage-msg")).toContainText("이 창은 교사 화면과 연결되지 않아요");
  await page.getByRole("button", { name: "수업 준비로" }).click();
  // 준비 화면(처음 화면 내 수업 · 옆 메뉴)으로 돌아와요
  await expect(page.locator(".shell .side")).toBeVisible();
  await expect(page.locator(".mylib")).toBeVisible();
  await page.goto("/#presenter");
  await page.reload();
  await expect(page.locator(".panel")).toContainText("아직 다른 기기와 연결되지 않아요");
  expect(errors).toEqual([]);
});

test("QR: 실제로 읽히는 그림이 생기고, 그 주소로 열면 '연결 전'이라고 솔직하게 말해요", async ({ page, browser, baseURL }, info) => {
  test.skip(!isPc(info), "QR은 교사 화면에서 띄워요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.getByRole("button", { name: /^QR/ }).click();
  await expect(page.locator("#qr canvas")).toHaveCount(1, { timeout: 15000 });
  // 휴대폰 카메라처럼 화면의 흰 여백(16px)까지 넣어 읽어 봐요
  await page.addScriptTag({ path: JSQR });
  const text = await page.evaluate(() => {
    const c = document.querySelector("#qr canvas"), m = 16, big = document.createElement("canvas");
    big.width = c.width + m * 2; big.height = c.height + m * 2;
    const g = big.getContext("2d"); g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, big.width, big.height); g.drawImage(c, m, m);
    const r = window.jsQR(g.getImageData(0, 0, big.width, big.height).data, big.width, big.height);
    return r ? r.data : null;
  });
  expect(text, "QR을 읽지 못했어요").toMatch(new RegExp("^" + baseURL + "/#remote-\\d{4}$"));
  await expect(page.locator(".scard").filter({ has: page.getByRole("heading", { name: "모바일 리모컨" }) })).toContainText(text);
  // 그 주소를 휴대폰으로 열면: 연결된 척하지 않고, 되는 것(수업 미리보기)만 권해요
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: process.env.STORAGE_STATE || undefined });
  const p = await phone.newPage();
  watch(p, errors);
  await p.goto(text);
  await expect(p.locator("body")).toContainText("아직 교사 화면과 연결되지 않아요");
  await expect(p.locator("body")).not.toContainText("기기 연결됨");
  await expect(p.locator("#pin-in")).toHaveCount(0);
  await p.getByRole("button", { name: "이 휴대폰에서 수업 미리보기" }).tap();
  await expect(curLabel(p)).toHaveText(LABELS[0]);
  await phone.close();
  expect(errors).toEqual([]);
});

// 휴대폰 ↔ 교사 PC 실시간 동기화는 1단계-1에서 실제 시험이 됐어요: tests/realtime.spec.js (Firebase 에뮬레이터, npm run test:emu)

test("외부 도구를 못 받아도 원인을 알려 주고, 다시 하면 돼요 (QR · PDF)", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 확인해요");
  const errors = watch(page, []);
  await page.route(QRJS, (r) => r.abort());
  await page.route(PDFJS, (r) => r.abort());
  await page.goto("/");
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.getByRole("button", { name: /^QR/ }).click();
  await expect(page.locator("#qr")).toContainText("QR을 그리지 못했어요");
  await page.unroute(QRJS);
  await page.getByRole("button", { name: "숨기기" }).click();
  await page.getByRole("button", { name: /^QR/ }).click();
  await expect(page.locator("#qr canvas")).toHaveCount(1, { timeout: 15000 });
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("PDF 읽기 도구를 불러오지 못했어요")).toBeVisible();
  await page.unroute(PDFJS);
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test("PDF를 올리면 장 모양 그대로 장면이 되고, ‘PPTX에서 노트 붙이기’로 같은 PPTX를 넣으면 노트가 붙어요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".srow")).toHaveCount(3);
  await expect(page.locator(".sbar-sub")).toContainText("기본 정리 · AI 분석 아님");
  // 올린 파일은 내 수업이 되고, 파일은 이 브라우저에 저장해요(2026-11-11, docs/LOCAL-FILES.md)
  await expect(page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await expect(page.locator(".sbar-sub")).toContainText("내 수업 · PDF 파일에서");
  const ready = page.locator(".ready");
  // 핵심 발화 · 노트는 선택이라, 비어 있다고 경고하지 않아요(2026-11-14, docs/SLIDE-PREP.md. 예전에는 ‘발화 빈 장면 2개’를 주황으로 띄웠어요)
  await expect(ready).not.toContainText("발화");
  await expect(page.locator(".rd.warn")).toHaveCount(0);
  await expect(page.locator(".srow .nosay")).toHaveCount(0);
  await expect(page.locator(".analysis")).toContainText("AI 분석 아님");
  // 4:3 PDF는 4:3 그대로 보여요
  const box = await page.locator(".sp-slide .slide.img").boundingBox();
  expect(box.width / box.height).toBeCloseTo(4 / 3, 1);
  // 같은 자료인지 장 수와 글자로 확인한 뒤에 붙여요(2026-11-14, docs/SLIDE-IMPORT.md). ‘PDF · PPTX로 시작하기’로 고르면 새 수업이 돼요
  await page.locator("#pair-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("PPTX의 발표자 노트를 붙였어요")).toBeVisible();
  await expect(page.locator('textarea[data-k="notes"]')).toHaveValue("씨앗을 직접 보여 주며 시작해요.");
  // 노트와 발화는 접지 않고 늘 보여요(교사 PC에서는 슬라이드 옆, 세로 태블릿에서는 슬라이드 아래). 발화를 적어도 경고가 생기거나 사라지는 것이 없어요
  const say = page.locator('textarea[data-k="say"]'), notes = page.locator('textarea[data-k="notes"]');
  if (page.viewportSize().width >= 900) { await expect(say).toBeInViewport(); await expect(notes).toBeInViewport(); }
  // 올린 뒤 저장 · 쪽 그림이 끝나며 화면이 다시 그려지는 순간이면 칸이 바뀌어 스크롤이 실패해요(main에서도 25번 중 1번).
  // 다시 그려진 칸으로 다시 스크롤해요(확인 기준은 그대로)
  else { await expect(async () => { await say.scrollIntoViewIfNeeded(); }).toPass(); await expect(say).toBeVisible(); await expect(notes).toBeVisible(); }
  await say.fill("오늘은 식물이 자라는 순서를 알아볼 거예요.");
  await say.blur();
  await expect(page.locator(".rd.warn")).toHaveCount(0);
  // 수업 화면에서도 4:3이 잘리지 않아요
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  for (const [w, h] of [[1920, 1080], [1024, 768]]) {
    await stage.setViewportSize({ width: w, height: h });
    const f = await slideFits(stage);
    expect(f.ok, w + "×" + h + " 슬라이드가 잘려요 " + JSON.stringify(f)).toBe(true);
    expect(f.ratio).toBeCloseTo(4 / 3, 1);
  }
  expect(errors).toEqual([]);
});

test("PPTX만 올려도 글자와 노트로 장면이 생겨요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("3장을 가져왔어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".srow .t")).toHaveText(["식물의 한살이", "씨앗은 어떻게 싹이 틀까요?", "오늘 배운 것 정리"]);
  await expect(page.locator('textarea[data-k="notes"]')).toHaveValue("씨앗을 직접 보여 주며 시작해요.");
  expect(errors).toEqual([]);
});

test("TV: 1280×720 · 1920×1080에서 잘리지 않고, 띄운 그림은 수업 화면 가득, 다음 키 한 번에 슬라이드로 돌아와요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 화면은 교사 화면(PC)에서 열어요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await copyCurrent(page);
  // 1장(표지) 수업 자료에 그림 파일을 넣어 둬요
  await page.locator(".srow").first().click();
  await openMore(page);
  await page.getByRole("button", { name: "+ 자료" }).click();
  await page.locator("#res-file").setInputFiles(fixture("picture.png"));
  await expect(page.locator(".res-row")).toContainText("picture");
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 768]]) {
    await stage.setViewportSize({ width: w, height: h });
    const f = await slideFits(stage);
    expect(f.ok, w + "×" + h + " 슬라이드가 잘려요 " + JSON.stringify(f)).toBe(true);
    expect(f.ratio).toBeCloseTo(16 / 9, 1);
  }
  await stage.setViewportSize({ width: 1280, height: 720 });
  // 교사 화면의 수업 자료는 필요할 때 M 키(또는 수업 자료 단추)로 열어요. 수업 화면에 무엇이 보일지 미리 알려 주고, 수업 화면에는 그림만 가득
  await page.keyboard.press("m");
  const pic = page.locator(".pv-right .item").filter({ hasText: "picture" });
  await expect(pic).toContainText("수업 화면: 그림");
  await pic.getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".stage .slide.media img")).toBeVisible();
  const mb = await stage.locator(".stage .slide.media").boundingBox();
  expect(mb.width).toBeGreaterThan(1270);
  expect(mb.height).toBeGreaterThan(710);
  await expect(page.locator('.pv-bar [data-act="tv-close"]')).toHaveText("슬라이드로 돌아가기");
  // 다음 키 한 번: 자료를 닫고 같은 장면의 슬라이드로
  await page.keyboard.press("ArrowRight");
  await expect(stage.locator(".stage .slide.media")).toHaveCount(0);
  await expect(stage.locator(".stage-bar .chip").first()).toHaveText(LABELS[0]);
  // 내용이 없는 자료는 제목만, 수업 화면에 교사용 문장 없이
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  // 장면이 바뀌면 자료 서랍은 닫혀요. 다시 열어요
  await expect(page.locator(".pv-right .drawer")).toHaveCount(0);
  await page.locator('.pv-bar [data-act="drawer"]').click();
  const plain = page.locator(".pv-right .item").filter({ hasText: "몸으로 표현하는 입자 놀이" });
  await expect(plain).toContainText("수업 화면: 제목만");
  await plain.getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(stage.locator(".overlay")).toContainText("몸으로 표현하는 입자 놀이");
  await expect(stage.locator(".stage")).not.toContainText("연결하면");
  await page.getByRole("button", { name: "슬라이드로 돌아가기" }).click();
  await expect(stage.locator(".overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("팝업이 막히면 교사 화면에 바로 안내하고, 준비 화면에도 표시해요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 화면은 교사 화면(PC)에서 열어요");
  const errors = watch(page, []);
  await page.addInitScript(() => { window.open = () => null; });
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 시작" }).click();
  const warn = page.locator(".pv-warn");
  await expect(warn).toContainText("팝업 차단");
  await expect(warn.getByRole("button", { name: "수업 화면 열기" })).toBeVisible();
  expect((await scroll(page)).down, "안내 줄 때문에 세로 스크롤이 생겨요").toBe(false);
  await page.getByRole("button", { name: "더보기" }).click();
  await page.locator(".more-menu").getByRole("button", { name: "수업 준비로" }).click();
  await expect(page.locator(".ready")).toContainText("팝업이 막혔어요");
  expect(errors).toEqual([]);
});

test("휴대폰: 핵심 발화가 먼저 보이고, 신호등·수업 자료·수업 화면 띄우기·목차를 엄지로 해요", async ({ page }, info) => {
  test.skip(isPc(info), "휴대폰 화면 시험이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).tap();
  const nav = page.locator(".thumb-nav");
  const vh = page.viewportSize().height;
  // 엄지 줄은 화면 안에 다 보이고, 첫 핵심 발화는 화면 위쪽 절반 안에
  const nb = await nav.boundingBox();
  expect(nb.y + nb.height).toBeLessThanOrEqual(vh + 1);
  expect((await page.locator(".prompter .say").first().boundingBox()).y).toBeLessThan(vh / 2);
  // 맨 아래까지 내려도 내용이 엄지 줄에 가리지 않아요
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  const tvBox = await page.locator(".rm-tv").boundingBox();
  expect(tvBox.y + tvBox.height).toBeLessThanOrEqual((await nav.boundingBox()).y + 1);
  await nextBtn(page).tap();
  await nextBtn(page).tap();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  // 신호등은 핵심 발화 바로 아래에서 한 번에
  await page.locator(".sig.s-red").tap();
  await expect(page.locator(".sig.s-red")).toHaveClass(/on/);
  // 수업 자료: 스크롤 없이 엄지 줄에서 열어요. 빨강이면 다시 설명 자료가 위로 와요
  await page.locator('.thumb-nav [data-act="sheet"]').tap();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("타이머");
  await expect(sheet.locator(".drawer-hint")).toContainText("다시 설명");
  await expect(sheet.locator(".item").first().locator(".kind-tag")).toHaveText("다시 설명");
  // 수업 화면에 띄우면 판이 닫히고, 큰 버튼이 '슬라이드로 돌아가기'가 돼요
  await sheet.getByRole("button", { name: "수업 화면에 띄우기" }).first().tap();
  await expect(sheet).toHaveCount(0);
  const back = page.locator('.thumb-nav [data-act="tv-close"]');
  await expect(back).toHaveText("슬라이드로 돌아가기");
  await back.tap();
  await expect(nextBtn(page)).toBeVisible();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  // 판 닫기
  await page.locator('.thumb-nav [data-act="sheet"]').tap();
  await page.locator(".sheet").getByRole("button", { name: "닫기" }).tap();
  await expect(page.locator(".sheet")).toHaveCount(0);
  // 목차로 건너뛰기
  await page.locator('.thumb-nav [data-act="toc"]').tap();
  await page.locator(".toc").getByRole("button", { name: /관찰 실험/ }).tap();
  await expect(curLabel(page)).toHaveText(LABELS[4]);
  await noSideScroll(page, "휴대폰 화면");
  expect(errors).toEqual([]);
});

test("키보드: → ↓ 스페이스 PageDown 다음, ← PageUp 이전, B 가리기, 1 신호등", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(PC) 키보드·무선 리모컨 시험이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  for (const [key, i] of [["ArrowRight", 1], ["ArrowDown", 2], ["Space", 3], ["PageDown", 4], ["ArrowLeft", 3], ["PageUp", 2]]) {
    await page.keyboard.press(key);
    await expect(curLabel(page), key).toHaveText(LABELS[i]);
  }
  await page.keyboard.press("b");
  await expect(page.locator(".pv-bar .nav-main")).toHaveText("화면 다시 보이기");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pv-bar .nav-main")).toContainText("다음");
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await page.keyboard.press("1");
  // 자료 단추가 맞는 자료 수를 알려 주고, M 키로 서랍을 열면 맞는 자료가 위에 있어요
  await expect(page.locator(".pv-bar .dock-res")).toContainText("다시 설명 맞춤");
  await page.keyboard.press("m");
  await expect(page.locator(".pv-right .drawer-hint")).toContainText("다시 설명");
  await page.keyboard.press("m");
  await expect(page.locator(".pv-right .drawer")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("긴 장면 이름과 긴 핵심 발화도 화면 밖으로 밀리거나 잘리지 않아요", async ({ page }, info) => {
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await copyCurrent(page);
  await page.locator(".srow").first().click();
  const label = "아주아주 긴 장면 이름이 들어가도 괜찮을까요 정말로";
  const lines = [
    "물이 끓을 때 바닥에서 생기는 거품은 무엇일지 짝과 함께 이야기해 보고, 그렇게 생각한 까닭도 한 문장으로 말해 볼까요?",
    "주전자 뚜껑이 들썩이는 것을 본 적이 있는 친구는 그때 무엇을 보았는지, 소리는 어땠는지 떠올려서 이야기해 볼까요?",
    "거품이 물 위로 올라와 터지면 그 안에 있던 것은 어디로 가는지, 눈에 보이는지 보이지 않는지 함께 생각해 봐요.",
    "오늘 배운 낱말 증발과 끓음을 넣어서, 우리 생활에서 본 장면을 한 문장으로 공책에 써 볼까요?"
  ];
  await page.locator("#pg-s1-label").fill(label);
  await page.locator("#pg-s1-label").blur();
  await page.locator("#pg-s1-say").fill(lines.join("\n"));
  await page.locator("#pg-s1-say").blur();
  await page.locator("#pg-s1-title").fill("물이 끓을 때 어떤 변화가 생기는지 관찰하고, 증발과 끓음의 다른 점을 우리 생활 속 예로 설명해 볼까요?");
  await page.locator("#pg-s1-title").blur();
  await noSideScroll(page, "준비 화면");
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await expect(curLabel(page)).toHaveText(label.slice(0, 24));
  await noSideScroll(page, "수업 미리보기");
  const last = page.locator(".prompter .say").last();
  if (isPc(info)) {
    expect((await scroll(page)).down, "교사 화면에 세로 스크롤이 생겨요").toBe(false);
    // 프롬프터는 잘라 버리지 않고 안에서 스크롤해요
    const p = await page.locator(".pv .prompter").evaluate((el) => ({ over: el.scrollHeight > el.clientHeight + 1, y: getComputedStyle(el).overflowY }));
    if (p.over) expect(p.y).toMatch(/auto|scroll/);
    // 제목이 긴 슬라이드는 글자를 줄여 그려요
    await expect(page.locator(".pv-screen .slide")).toHaveClass(/long/);
  }
  // 고친 내용의 저장(0.4초 뒤)이 끝나면 화면을 다시 그려요. 그 순간 잡은 줄이 바뀌면 새 줄로 다시 해요(검사는 그대로)
  await expect(async () => {
    await last.scrollIntoViewIfNeeded({ timeout: 2000 });
    await expect(last).toBeInViewport({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(last).toHaveText(lines[3]);
  expect(errors).toEqual([]);
});

test("준비부터 수업 끝까지: 기록이 수업 기록에 남고, 글로 복사돼요", async ({ page, context }, info) => {
  test.skip(!isPc(info), "교사 화면(PC)에서 수업해요");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await nextBtn(page).click();
  await page.keyboard.press("1");
  for (let i = 2; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  const memo = page.locator(".memo-sheet");
  await expect(memo).toContainText("‘도입 발문’에서 다시 설명이 필요했어요");
  await expect(memo).toContainText("이 브라우저에 저장했어요");
  await memo.getByRole("button", { name: "글로 복사" }).click();
  await expect(memo.getByRole("button", { name: "복사했어요" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("다시 설명이 필요했어요");
  await memo.getByRole("button", { name: "수업 기록 보기" }).click();
  await expect(page.getByRole("tab", { name: "수업 기록 1" })).toBeVisible();
  await expect(page.locator('#records .hist[aria-label="내 수업 기록"] .rec')).toHaveCount(1);
  await expect(page.locator("#records")).toContainText("이 브라우저에만");
  expect(errors).toEqual([]);
});
