// 실제 수업 한 번을 처음부터 끝까지(2026-11-12, PR #15, docs/STABILITY.md 4): 교사가 하는 순서 그대로, 기능을 따로따로가 아니라 이어서 봐요.
// 교사 PC(사용자 데이터 폴더가 남는 브라우저) · 수업 화면(PC가 연 창) · 휴대폰 2대(같은 계정 QR · PIN). Firebase 에뮬레이터(가짜 프로젝트)와
// 가짜 YouTube 플레이어로만 해요(밖으로 나가는 요청 없음). 실제 기기 · 실제 학교망 확인은 docs/STABILITY.md의 실기기 체크리스트
import { test, expect } from "@playwright/test";
import { watch, curLabel, nextBtn, finishLesson, fixture, V, fakeYouTube, pstate, frame, chip, idbRecords, toFlow, openMore } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, stageLabel, uidAfterSignIn, lastingDevice } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 420000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const ADMIN = { Authorization: "Bearer owner" };
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
const list = async (p) => { const r = await fetch(docUrl(p) + "?pageSize=100", { headers: ADMIN }); const j = r.ok ? await r.json() : {}; return j.documents || []; };
const val = (d, k) => { const v = d && d.fields && d.fields[k]; return v ? Object.values(v)[0] : undefined; };
const drawn = (img) => expect.poll(() => img.evaluate((i) => (i.src.indexOf("blob:") === 0 && i.complete ? i.naturalWidth : 0)).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(0);
const NAMES = ["도입", "영상 보기", "실험", "정리"];
// PIN 휴대폰: 교사 PC가 ‘휴대폰 연결’을 열고, 휴대폰이 QR로 요청하고, PC가 허용(tests/control.spec.js와 같은 순서)
async function pinPhone(browser, errors, pc) {
  // ‘휴대폰 연결’은 수업 준비 화면의 머리 막대에 있어요(내 수업에는 머리 막대가 없어요)
  await toFlow(pc.page);
  await pc.page.locator('.sbar [data-act="conn"]').click();
  await expect(pc.page.locator(".conn-pop .pair-state")).toContainText("연결 기다리는 중");
  await expect.poll(() => pc.page.evaluate(() => window.__qrText || "")).toContain("#remote-");
  const url = await pc.page.evaluate(() => window.__qrText);
  const ph = await device(browser, PHONE, errors);
  await ph.page.goto(url);
  await ph.page.getByRole("button", { name: /PIN 4자리로 연결/ }).click();
  await expect(pc.page.locator(".conn-pop .ask-row")).toHaveCount(1);
  await Promise.all([ph.page.waitForEvent("load"), pc.page.locator('.conn-pop .ask-row [data-act="pair-allow"]').click()]);
  await pc.page.locator('.conn-pop [data-act="conn"]').click();
  return ph;
}

test("실제 수업 한 번: 로그인 → 내 수업 · 장면 편집 → PDF · PPTX · 그림 · 영상 → 브라우저 다시 열기 → 수업 화면 → QR · PIN 휴대폰 → 수업 · 영상 두 단계 · 신호 · 자료 → 끊김과 다시 잇기 → 끝내기 · 기록 → 기록 찾기 · 고치기 · 휴지통 · 되살리기", async ({ browser }, info) => {
  const errors = [], who = email("e2e"), dir = info.outputPath("pc-profile");
  let pc = await lastingDevice(dir, PC, errors);
  const pins = pc.pins;
  await fakeYouTube(pc.ctx);
  let uid = "", ids = [];

  await test.step("1 구글 계정 로그인(이 브라우저에서 로그인 유지)", async () => {
    await pc.page.goto("/");
    await signIn(pc.page, who);
    await pcLinked(pc.page);
    uid = await uidAfterSignIn(pc.page);
  });

  await test.step("2 · 3 내 수업 만들기, 장면 추가 · 이름 · 이동 · 복제 · 지우기", async () => {
    await pc.page.getByRole("tab", { name: "내 수업" }).click();
    await pc.page.getByRole("button", { name: "새 수업 만들기" }).click();
    await pc.page.locator("#ls-title").fill("물의 순환 · 우리 반");
    await pc.page.locator("#ls-title").blur();
    for (let i = 0; i < 3; i++) await pc.page.getByRole("button", { name: "+ 장면 추가" }).click();
    ids = await pc.page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
    // 이름: 정리 · 도입 · 영상 보기 · 실험 순으로 만든 뒤 ‘정리’를 맨 아래로(아래로 3번)
    const first = ["정리", "도입", "영상 보기", "실험"];
    for (let i = 0; i < 4; i++) {
      await pc.page.locator('.srow[data-v="' + ids[i] + '"]').click();
      await pc.page.locator("#pg-" + ids[i] + "-label").fill(first[i]);
      await pc.page.locator("#pg-" + ids[i] + "-label").blur();
    }
    await pc.page.locator('.srow[data-v="' + ids[0] + '"]').click();
    for (let i = 0; i < 3; i++) await pc.page.locator('[data-act="scene-down"][data-v="' + ids[0] + '"]').click();
    await expect(pc.page.locator(".srow .t")).toHaveText(NAMES);
    // 복제 → 지우기(확인 줄)
    await pc.page.locator('.srow').filter({ hasText: "실험" }).click();
    await pc.page.getByRole("button", { name: "복제" }).click();
    await expect(pc.page.locator(".srow")).toHaveCount(5);
    const dup = await pc.page.locator(".srow.on").getAttribute("data-v");
    await pc.page.locator('[data-act="scene-del-ask"][data-v="' + dup + '"]').click();
    await pc.page.locator('[data-act="scene-del"][data-v="' + dup + '"]').click();
    await expect(pc.page.locator(".srow .t")).toHaveText(NAMES);
    ids = await pc.page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
  });

  await test.step("4 영상 장면 · PDF 장면 더하기 · 그림 · PPTX 자료", async () => {
    await pc.page.locator('.srow[data-v="' + ids[1] + '"]').click();
    await openMore(pc.page);
    await pc.page.locator("#pg-" + ids[1] + "-video").fill(V.ok);
    await pc.page.locator("#pg-" + ids[1] + "-video").blur();
    await expect(pc.page.locator(".sp-slide .slide.vid")).toBeVisible();
    await pc.page.locator("#pdf-add").setInputFiles(fixture("lesson.pdf"));
    await expect(pc.page.getByText("3장을 장면으로 더했어요")).toBeVisible({ timeout: 30000 });
    await expect(pc.page.locator(".srow")).toHaveCount(7);
    await pc.page.locator('.srow[data-v="' + ids[0] + '"]').click();
    await openMore(pc.page);
    await pc.page.getByRole("button", { name: "+ 자료" }).click();
    await pc.page.locator("#res-file").setInputFiles(fixture("picture.png"));
    await expect(pc.page.locator(".res-pane .res-row")).toContainText("picture");
    await pc.page.locator('.srow[data-v="' + ids[2] + '"]').click();
    await openMore(pc.page);
    if (!(await pc.page.locator(".add-form").count())) await pc.page.getByRole("button", { name: "+ 자료" }).click();
    await pc.page.locator("#res-file").setInputFiles(fixture("lesson.pptx"));
    // PPTX를 처음 읽을 때 JSZip을 CDN에서 받아요(PDF처럼 30초까지 기다려요, tests/files.spec.js와 같음)
    await expect(pc.page.locator(".res-pane .res-row")).toContainText("PPTX의 글자", { timeout: 30000 });
    // 계정의 내 수업에도 저장돼요(장면 7개 · 영상 링크 · 파일 id만)
    await expect.poll(async () => { const d = (await list("teachers/" + uid + "/decks"))[0]; return d ? (((d.fields.pages || {}).arrayValue || {}).values || []).length : 0; }, { timeout: 20000 }).toBe(7);
    // 교사처럼 ‘계정에 저장’을 본 뒤에 닫아요. 그 전(저장하는 중)에는 ‘계정에 저장’이라고 하지 않아요(docs/STABILITY.md 2-1)
    await expect(pc.page.locator(".sbar .save")).toHaveText("계정에 저장");
    const res = await list("teachers/" + uid + "/decks").then((l) => (((l[0] || { fields: {} }).fields.res || {}).arrayValue || {}).values || []);
    expect(res.map((v) => v.mapValue.fields.title.stringValue).sort(), "‘계정에 저장’이면 자료 둘 다 계정에 있어요").toEqual(["lesson", "picture"]);
  });

  await test.step("5 브라우저를 껐다 켜도: 로그인 · 수업 · 파일 그대로", async () => {
    await pc.ctx.close();
    pc = await lastingDevice(dir, PC, errors, pins);
    await fakeYouTube(pc.ctx);
    await pc.page.goto("/");
    await pcLinked(pc.page);
    await pc.page.getByRole("tab", { name: "내 수업" }).click();
    await pc.page.locator(".mylib .mrow").filter({ hasText: "물의 순환" }).locator(".m-open").click();
    await expect(pc.page.locator(".srow")).toHaveCount(7);
    await pc.page.locator(".srow").nth(4).click();
    await drawn(pc.page.locator(".sp-slide .slide.img img"));
    await pc.page.locator('.srow[data-v="' + ids[0] + '"]').click();
    await expect(pc.page.locator(".res-pane .res-row")).toContainText("picture");
    await expect(pc.page.locator(".res-pane .file-gone")).toHaveCount(0);
  });

  let stage, ph, pin;
  await test.step("6 · 7 수업 화면 열기, QR(같은 계정) · PIN 휴대폰 연결", async () => {
    await pc.page.getByRole("tab", { name: "발표 설정" }).click();
    [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.locator('.set-layout [data-act="stage-open"]').first().click()]);
    watch(stage, errors);
    await pc.page.getByRole("tab", { name: "수업 준비" }).click();
    const url = await qrUrl(pc.page);
    ph = await phoneJoins(browser, errors, url, who);
    await expect(ph.page.locator(".checks")).toBeVisible();
    pin = await pinPhone(browser, errors, pc);
    await expect(pin.page.locator(".checks")).toContainText("켜져 있어요");
  });

  await test.step("8 수업 시작 · 장면 이동(휴대폰)", async () => {
    await pc.page.getByRole("button", { name: "수업 시작" }).click();
    await expect(curLabel(pc.page)).toHaveText("도입");
    await expect(curLabel(ph.page)).toHaveText("도입");
    await expect(curLabel(pin.page)).toHaveText("도입");
    await expect(stageLabel(stage)).toHaveText("도입");
    // 그림 자료를 수업 화면에 띄웠다가 다음 키로 내려요
    await pc.page.keyboard.press("m");
    await pc.page.locator(".pv-right .item").filter({ hasText: "picture" }).getByRole("button", { name: "수업 화면에 띄우기" }).click();
    await drawn(stage.locator(".stage .slide.media img"));
    await pc.page.keyboard.press("m");
    await pc.page.keyboard.press("PageDown");
    await expect(stage.locator(".stage .slide.media img")).toHaveCount(0);
    await nextBtn(ph.page).click();
    await expect(curLabel(pc.page)).toHaveText("영상 보기");
    await expect(stageLabel(stage)).toHaveText("영상 보기");
  });

  await test.step("9 영상 장면: 첫 ‘다음’(같은 계정 휴대폰)은 재생, 둘째 ‘다음’(PIN 휴대폰)은 다음 장면", async () => {
    await expect(frame(stage)).toHaveCount(1);
    await expect(pc.page.locator('[data-act="vid-play"]')).toBeEnabled({ timeout: 15000 });
    expect(await pstate(stage)).toBe(-1);
    await expect(ph.page.locator(".thumb-nav .nav-main")).toContainText("영상 재생");
    await nextBtn(ph.page).click();
    await expect.poll(() => pstate(stage)).toBe(1);
    await expect(curLabel(pc.page)).toHaveText("영상 보기");
    await expect(pin.page.locator(".thumb-nav .nav-main")).toContainText("실험", { timeout: 15000 });
    await nextBtn(pin.page).click();
    await expect(stageLabel(stage)).toHaveText("실험");
    await expect(curLabel(ph.page)).toHaveText("실험");
    await expect(pc.page.locator(".undo-move")).toBeVisible();
  });

  await test.step("10 학급 이해도(휴대폰 빨강 → PC 초록) · PPTX 자료 띄우기", async () => {
    await ph.page.locator(".thumb-nav .sig.s-red").click();
    await expect(pc.page.locator('.sig.s-red[aria-pressed="true"]').first()).toBeVisible();
    await pc.page.keyboard.press("3");
    await expect(ph.page.locator(".thumb-nav .sig.s-green")).toHaveAttribute("aria-pressed", "true");
    await pc.page.keyboard.press("m");
    await pc.page.locator(".pv-right .item").filter({ hasText: "PowerPoint로 열기" }).getByRole("button", { name: "수업 화면에 띄우기" }).click();
    await expect(stage.locator(".stage .pptx-card")).toContainText("글자만");
    await pc.page.keyboard.press("m");
    await pc.page.keyboard.press("PageDown");
    await expect(stage.locator(".stage .pptx-card")).toHaveCount(0);
  });

  await test.step("11 교사 PC 끊김과 다시 잇기: 끊긴 동안 PC에서 넘기고, 이어지면 휴대폰까지 같은 장면", async () => {
    await pc.ctx.setOffline(true);
    await expect(pc.page.locator(".chip.warn")).toContainText("연결 끊김", { timeout: 15000 });
    await nextBtn(pc.page).click();
    await expect(curLabel(pc.page)).toHaveText("정리");
    await expect(stageLabel(stage)).toHaveText("정리");
    await pc.page.waitForTimeout(2000);
    await pc.ctx.setOffline(false);
    await expect(curLabel(ph.page)).toHaveText("정리", { timeout: 20000 });
    await expect(curLabel(pin.page)).toHaveText("정리", { timeout: 20000 });
  });

  await test.step("12 수업 끝내기 · 기록(계정에 한 건)", async () => {
    await pc.page.keyboard.press("End");
    await finishLesson(pc.page);
    await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 20000 });
    const recs = await list("teachers/" + uid + "/records");
    expect(recs.length).toBe(1);
    const sc = (((recs[0].fields.scenes || {}).arrayValue || {}).values || []).map((x) => [val({ fields: x.mapValue.fields }, "label"), val({ fields: x.mapValue.fields }, "sig")]);
    expect(sc.find((x) => x[0] === "실험")[1]).toBe("green");
    expect((await idbRecords(pc.page, "navi-local-" + uid)).length).toBe(1);
  });

  await test.step("13 지난 기록: 찾기 · 메모 고치기 · 휴지통 · 되살리기", async () => {
    await pc.page.getByRole("button", { name: "수업 기록 보기" }).click();
    await pc.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
    await pc.page.locator("#rec-q").fill("물의 순환");
    const rec = pc.page.locator('#records .hist[aria-label="내 수업 기록"] .rec');
    await expect(rec).toHaveCount(1);
    // ‘수업 기록 보기’는 방금 끝낸 기록을 펼친 채로 열어요
    await expect(rec).toHaveClass(/open/);
    await expect(rec.locator(".scene-rec li")).toHaveCount(7);
    await rec.locator("textarea[data-rec]").fill("영상 장면에서 질문이 많았어요");
    await rec.locator("textarea[data-rec]").blur();
    await expect.poll(async () => val((await list("teachers/" + uid + "/records"))[0], "text"), { timeout: 15000 }).toBe("영상 장면에서 질문이 많았어요");
    await rec.getByRole("button", { name: "휴지통으로" }).click();
    await rec.page().locator('.pop[aria-label="기록 지우기"]').getByRole("button", { name: "휴지통으로" }).click();
    await expect(rec).toHaveCount(0);
    await pc.page.locator('#records [data-act="rec-filter"][data-v="trash"]').click();
    const t = pc.page.locator('#records .hist[aria-label="휴지통"] .rec');
    await expect(t).toHaveCount(1);
    await t.locator(".rec-head").click();
    await t.getByRole("button", { name: "되살리기" }).click();
    await expect.poll(async () => val((await list("teachers/" + uid + "/records"))[0], "trashedAt"), { timeout: 15000 }).toBe(null);
    expect((await list("teachers/" + uid + "/records")).length).toBe(1);
  });

  await test.step("다른 PC(같은 계정): 수업 · 기록은 보이고, 이 PC에 없는 파일은 그대로 말해요", async () => {
    const b = await device(browser, PC, errors);
    await b.page.goto("/");
    await signIn(b.page, who);
    await pcLinked(b.page);
    await b.page.getByRole("tab", { name: /^수업 기록/ }).click();
    await b.page.locator("#records").getByRole("button", { name: /^전체/ }).click();
    await expect(b.page.locator('#records .hist[aria-label="내 수업 기록"] .rec')).toHaveCount(1);
    await b.page.getByRole("tab", { name: "내 수업" }).click();
    await b.page.locator(".mylib .mrow").filter({ hasText: "물의 순환" }).locator(".m-open").click();
    await b.page.locator(".srow").nth(4).click();
    await expect(b.page.locator(".sp-slide .slide.img.miss")).toContainText("이 브라우저에 파일이 없어요");
    await expect(b.page.locator(".file-need")).toContainText("파일 다시 넣기");
  });
  expect(real(errors)).toEqual([]);
});
