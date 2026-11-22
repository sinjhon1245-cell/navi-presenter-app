// 수업 화면 안정성 시험: 영상 · PDF가 다시 그리기 때문에 처음부터 다시 시작하지 않는지, 수업 미리보기가 수업 화면에 나가지 않는지,
// 한 화면 모드(교사 화면과 수업 화면을 따로 쓰지 않음)에서도 수업을 끝내고 기록을 남길 수 있는지 봐요.
// 유튜브 · PDF 주소는 시험 안에서 가짜 페이지로 돌려줘요(밖으로 나가는 요청이 없어요). 그 페이지가 몇 번 불렸는지 세요.
// 휴대폰과 함께 쓰는 경우(Firebase 동기화 · 연결 끊김)는 tests/realtime.spec.js에서 봐요.
import { test, expect } from "@playwright/test";
import { LABELS, isPc, watch, curLabel, toFlow, localRecords, VIDEO, PDF, fakeMedia, addMaterial, showOnStage, frameEl, mark, marked, born, played } from "./helpers.js";

async function startWithStage(page) {
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  return stage;
}
// 교사 화면 머리의 ‘도구’ 칸: 열려 있으면 그대로 둬요(한 번 더 누르면 닫혀요)
const tools = async (page) => { if (!(await page.locator(".tools-pop").count())) await page.locator('[data-act="tools"]').click(); return page.locator(".tools-pop"); };
const chip = (stage) => stage.locator(".stage-bar .chip").first();

test("수업 화면 영상: 30초 넘게 재생하는 동안 신호등 · 타이머 · 자료 서랍 · 주기 다시 그리기가 있어도 처음부터 다시 시작하지 않고, 자료를 내리거나 장면을 넘기면 원래대로 바뀌어요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "30초 넘게 기다리는 시험이라 교탁 PC 크기에서 한 번만 봐요");
  test.setTimeout(120000);
  const errors = watch(page, []), hits = await fakeMedia(context);
  await page.goto("/");
  await addMaterial(page, "물이 끓는 영상", VIDEO);
  const stage = await startWithStage(page);
  watch(stage, errors);
  await showOnStage(page, "물이 끓는 영상");
  await expect(frameEl(stage)).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/navitest001/);
  await expect.poll(() => born(stage)).not.toBeNull();
  await mark(stage);
  const first = await born(stage), t0 = Date.now();
  expect(hits.length).toBe(1);
  // 학생 창은 수업을 맡은 PC가 연 창이라 ‘수업 끝내기’가 없어요(끝내기는 교사 화면에서)
  await expect(stage.locator('.stage-bar [data-act="end-ask"]')).toHaveCount(0);

  // 교사 화면만 바뀌는 조작: 자료 서랍 닫기 · 신호등
  await page.keyboard.press("m");
  await page.keyboard.press("1");
  await expect(page.locator('.sig.s-red[aria-pressed="true"]').first()).toBeVisible();
  // 수업 화면에 타이머가 더해져도 영상은 그대로, 타이머만 영상 위에 나와요
  await (await tools(page)).locator('[data-act="tool-timer"][data-v="60"]').click();
  await expect(stage.locator(".stage .slide.media .tool-timer")).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.locator('.sig.s-yellow[aria-pressed="true"]').first()).toBeVisible();
  // 30초가 넘을 때까지 기다려요. 그 사이 수업 중 20초마다 하는 다시 그리기가 지나가요(교사 화면 요소가 새로 바뀐 것으로 확인)
  await page.evaluate(() => { document.querySelector(".pv-head").__navi = "그대로"; });
  await page.waitForTimeout(Math.max(0, 31000 - (Date.now() - t0)));
  expect(await page.evaluate(() => (document.querySelector(".pv-head") || {}).__navi || ""), "30초 동안 교사 화면이 한 번도 다시 그려지지 않았어요").toBe("");
  // 타이머 끄기도 영상 위의 타이머만 사라져요
  await (await tools(page)).locator('[data-act="tool-close"]').click();
  await expect(stage.locator(".stage .tool-timer")).toHaveCount(0);

  expect(hits.length, "영상 페이지를 다시 불렀어요(처음부터 다시 시작)").toBe(1);
  expect(await marked(stage), "영상 칸이 새로 만들어졌어요").toBe("처음 것");
  expect(await born(stage), "영상 페이지가 새로 열렸어요").toBe(first);
  expect(await played(stage), "영상이 30초 넘게 이어서 재생되지 않았어요").toBeGreaterThanOrEqual(30);
  await expect(chip(stage)).toHaveText(LABELS[0]);

  // 정상 전환: 내리면 슬라이드로, 다시 띄우면 새로, 다음 키는 먼저 슬라이드로 돌아간 뒤 다음 장면으로
  await page.keyboard.press("m");
  await page.locator(".pv-right .item").filter({ hasText: "물이 끓는 영상" }).getByRole("button", { name: "내리기" }).click();
  await expect(frameEl(stage)).toHaveCount(0);
  await showOnStage(page, "물이 끓는 영상");
  await expect(frameEl(stage)).toHaveCount(1);
  expect(await marked(stage)).toBe("");
  expect(hits.length).toBe(2);
  await page.keyboard.press("PageDown");
  await expect(frameEl(stage)).toHaveCount(0);
  await expect(chip(stage)).toHaveText(LABELS[0]);
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(page)).toHaveText(LABELS[1]);
  // 화면 가리기는 예전처럼 수업 화면 전체를 가려요
  await page.keyboard.press(".");
  await expect(stage.locator(".blankout.black")).toBeVisible();
  await page.keyboard.press(".");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("수업 화면 PDF: 신호등 · 타이머 · 주기 다시 그리기에도 처음 쪽으로 돌아가지 않고, 장면을 넘기면 사라져요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 시험과 같은 방식이라 교탁 PC 크기에서 한 번만 봐요");
  test.setTimeout(90000);
  const errors = watch(page, []), hits = await fakeMedia(context);
  await page.goto("/");
  await addMaterial(page, "끓는 점 자료", PDF);
  const stage = await startWithStage(page);
  watch(stage, errors);
  await showOnStage(page, "끓는 점 자료");
  await expect(frameEl(stage)).toHaveAttribute("src", /navi-test\.pdf#view=FitH/);
  await expect.poll(() => born(stage)).not.toBeNull();
  await mark(stage);
  const first = await born(stage);
  await page.keyboard.press("m");
  await page.keyboard.press("3");
  await (await tools(page)).locator('[data-act="tool-pick"]').click();
  await expect(stage.locator(".stage .slide.media .tool-pick")).toBeVisible();
  await page.waitForTimeout(21000);
  expect(hits.length).toBe(1);
  expect(await marked(stage)).toBe("처음 것");
  expect(await born(stage)).toBe(first);
  // 다음 키: 번호 뽑기 닫기 → 슬라이드로 → 다음 장면
  await page.keyboard.press("PageDown");
  await expect(stage.locator(".stage .tool-pick")).toHaveCount(0);
  expect(await marked(stage)).toBe("처음 것");
  await page.keyboard.press("PageDown");
  await expect(frameEl(stage)).toHaveCount(0);
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

test("수업 미리보기(수업 전): 수업 화면을 열어 둔 채 여러 장면 · 자료 · 화면 가리기를 미리 봐도 수업 화면은 ‘수업 시작 전’ 그대로이고, 끝내면 실제 수업이 이어서 나와요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("tab", { name: "발표 설정" }).click();
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.locator('.set-layout [data-act="stage-open"]').first().click()]);
  watch(stage, errors);
  await expect(chip(stage)).toHaveText("수업 시작 전");
  const before = await stage.locator("#stage-root").innerHTML();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await expect(page.locator(".rh-pill")).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press("PageDown");
    await expect(curLabel(page)).toHaveText(LABELS[i]);
    await expect(chip(stage), "미리보기 장면이 수업 화면에 나갔어요").toHaveText("수업 시작 전");
  }
  // 미리보기에서 자료를 띄우고 화면을 가려도 수업 화면은 그대로예요
  await page.keyboard.press("m");
  await page.locator(".pv-right .item").filter({ has: page.getByRole("button", { name: "수업 화면에 띄우기" }) }).first().getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(page.locator(".pv-screen .onair")).toHaveText("자료 보이는 중");
  await page.keyboard.press(".");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  await page.keyboard.press(".");
  // 학생 창을 누르거나 학생 창에서 키를 눌러도 미리보기가 넘어가지 않아요
  await stage.locator(".stage").click();
  await stage.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText(LABELS[3]);
  expect(await stage.locator("#stage-root").innerHTML(), "미리보기 동안 수업 화면이 바뀌었어요").toBe(before);
  // 미리보기를 끝내면 수업 준비로, 수업 화면도 그대로
  await page.locator('.rh-pill [data-act="rehearse-end"]').click();
  await expect(page.locator(".sbar")).toBeVisible();
  expect(await stage.locator("#stage-root").innerHTML()).toBe(before);
  // 실제 수업은 수업 화면과 함께 넘어가요
  await page.getByRole("button", { name: "수업 시작" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  await expect(chip(stage)).toHaveText(LABELS[0]);
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

test("수업 미리보기(수업 중): 진행 중인 수업의 수업 화면은 미리보기 동안 지금 장면 그대로이고, 미리보기를 끝내면 그 수업으로 돌아와 이어서 넘기고, 기록에는 미리보기가 섞이지 않아요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  const stage = await startWithStage(page);
  watch(stage, errors);
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[2]);
  await page.keyboard.press("1");
  // 수업 준비로 나와 미리보기
  await page.locator('[data-act="more"]').click();
  await page.locator('.more-menu [data-act="roles"]').click();
  await expect(page.locator(".sbar")).toBeVisible();
  const before = await stage.locator("#stage-root").innerHTML();
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[0]);
  for (let i = 1; i <= 4; i++) await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText(LABELS[4]);
  await page.keyboard.press("3");
  await page.keyboard.press(".");
  await expect(stage.locator(".blankout")).toHaveCount(0);
  await page.keyboard.press(".");
  // 진행 중인 수업의 학생 창을 눌러도 미리보기도, 수업도 넘어가지 않아요
  await stage.locator(".stage").click();
  await stage.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText(LABELS[4]);
  await expect(chip(stage)).toHaveText(LABELS[2]);
  expect(await stage.locator("#stage-root").innerHTML(), "미리보기 동안 진행 중인 수업의 수업 화면이 바뀌었어요").toBe(before);
  // 미리보기를 끝내고 진행 중인 수업으로: 그 장면부터 함께 넘어가요
  await page.locator('.rh-pill [data-act="rehearse-end"]').click();
  await page.getByRole("button", { name: "진행 중인 수업으로" }).click();
  await expect(curLabel(page)).toHaveText(LABELS[2]);
  await page.keyboard.press("PageDown");
  await expect(chip(stage)).toHaveText(LABELS[3]);
  await expect(curLabel(page)).toHaveText(LABELS[3]);
  // 끝내면 기록은 1건, 미리보기에서 누른 신호(초록)와 장면은 없어요
  await page.keyboard.press("End");
  await page.locator('[data-act="end-ask"]').first().click();
  await page.locator('.end-confirm [data-act="end"]').click();
  await expect(stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  const rec = (await localRecords(page))[0];
  expect(rec.events.map((e) => e.label + ":" + e.type)).toEqual([LABELS[2] + ":red"]);
  expect(errors).toEqual([]);
});

test("한 화면 모드: 마지막 장면이 아니어도 수업 화면 막대의 ‘수업 끝내기’ → 확인 줄로 끝내고, 기록은 한 번만 남고, 수업 준비로 돌아와 다시 시작할 수 있어요", async ({ page }, info) => {
  test.skip(!isPc(info), "교사 화면(노트북·PC·태블릿)에서 하는 흐름이에요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.locator("#pv").uncheck();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  let popups = 0;
  page.on("popup", () => popups++);
  await page.getByRole("button", { name: "수업 시작" }).click();
  const bar = page.locator(".stage-bar"), ask = page.locator(".end-confirm"), endBtn = bar.locator('[data-act="end-ask"]');
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[0]);
  await page.keyboard.press("PageDown");
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[1]);
  await expect(endBtn, "한 화면 모드에 ‘수업 끝내기’가 없어요").toBeVisible();
  await expect(endBtn).toHaveText("수업 끝내기");
  // 확인 줄: ‘계속 수업’ · Esc로 닫으면 수업은 그대로
  await endBtn.click();
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("수업을 끝낼까요?");
  await ask.getByRole("button", { name: "계속 수업" }).click();
  await expect(ask).toHaveCount(0);
  await endBtn.click();
  await page.keyboard.press("Escape");
  await expect(ask).toHaveCount(0);
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[1]);
  // 확인 줄을 띄운 채 마우스를 놓아 두어도 막대와 확인 줄은 사라지지 않아요
  await endBtn.click();
  await page.waitForTimeout(3200);
  expect(await bar.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  await expect(ask).toBeVisible();
  // 확인 줄 글자를 눌러도 장면이 넘어가지 않아요
  await ask.locator("b").click();
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[1]);
  await ask.getByRole("button", { name: "계속 수업" }).click();
  // 마지막 장면에서 다음 키는 여전히 끝내지 않아요
  await page.keyboard.press("End");
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[LABELS.length - 1]);
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect(page.locator(".stage-msg")).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(0);
  // 끝내기 → 학생에게는 ‘수업 끝’, 기록 1건
  await endBtn.click();
  await ask.getByRole("button", { name: "수업 종료" }).click();
  await expect(page.locator(".stage-msg")).toContainText("수업 끝");
  await expect(endBtn).toHaveCount(0);
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  const first = (await localRecords(page))[0];
  expect(first.scenes.length).toBe(LABELS.length);
  // 수업 준비로 돌아와요. 기록은 그대로 1건
  await bar.getByRole("button", { name: "수업 준비로" }).click();
  await expect(page.locator(".sbar")).toBeVisible();
  await expect(page.locator('.side-nav [data-v="records"] .n')).toHaveText("1");
  expect((await localRecords(page)).length).toBe(1);
  // 다시 시작해 끝내면 새 기록이 따로 하나 더(같은 기록이 겹치지 않아요)
  await page.getByRole("button", { name: "수업 시작" }).click();
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[0]);
  await endBtn.click();
  await ask.getByRole("button", { name: "수업 종료" }).click();
  await expect(page.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(page)).length).toBe(2);
  const ids = (await localRecords(page)).map((r) => r.id);
  expect(new Set(ids).size).toBe(2);
  expect(ids).toContain(first.id);
  expect(popups, "한 화면 모드인데 수업 화면 창이 따로 열렸어요").toBe(0);
  expect(errors).toEqual([]);
});

test("한 화면 모드 막대: 프로젝터 · TV(1024×768 · 1280×720 · 1920×1080)와 작은 창(390 · 360)에서도 ‘수업 끝내기’와 확인 줄이 화면 안에 다 보여요", async ({ page }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "창 크기를 직접 바꿔 한 번만 확인해요");
  const errors = watch(page, []);
  await page.goto("/");
  await toFlow(page);
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await page.locator("#pv").uncheck();
  await page.getByRole("tab", { name: "수업 준비" }).click();
  await page.getByRole("button", { name: "수업 시작" }).click();
  const bar = page.locator(".stage-bar"), ask = page.locator(".end-confirm");
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[0]);
  const inside = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0, h: Math.round(r.height), w: Math.round(r.width), vw: innerWidth }; });
  for (const [w, h] of [[1024, 768], [1280, 720], [1920, 1080], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.mouse.move(w / 2, h / 2);
    const endBtn = bar.locator('[data-act="end-ask"]');
    await expect(endBtn).toBeVisible();
    expect((await inside(endBtn)).ok, w + "×" + h + ": ‘수업 끝내기’가 화면 밖이에요").toBe(true);
    expect((await inside(bar)).ok, w + "×" + h + ": 막대가 화면 밖이에요").toBe(true);
    if (w >= 1024) expect((await inside(bar)).h, w + "×" + h + ": 막대가 두 줄이 됐어요").toBeLessThan(60);
    await endBtn.click();
    await expect(ask).toBeVisible();
    for (const b of [ask, ask.getByRole("button", { name: "수업 종료" }), ask.getByRole("button", { name: "계속 수업" })]) expect((await inside(b)).ok, w + "×" + h + ": 확인 줄이 화면 밖이에요").toBe(true);
    // 확인 줄은 막대 맨 위 줄에 있고, 막대의 단추(‘수업 끝내기’)를 가리지 않아요
    const [a, c] = [await ask.boundingBox(), await endBtn.boundingBox()];
    expect(a.y + a.height <= c.y + 1, w + "×" + h + ": 확인 줄이 막대의 단추를 가려요").toBe(true);
    expect((await page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1)), w + "×" + h + ": 가로 스크롤").toBe(false);
    await ask.getByRole("button", { name: "계속 수업" }).click();
  }
  expect(errors).toEqual([]);
});
