// 가져온 자료로 수업 한 번(2026-11-14, docs/SLIDE-IMPORT.md · docs/SLIDE-PREP.md): 교사가 하는 순서 그대로 이어서 봐요.
// 올리기(PDF + PPTX 함께) → 슬라이드 확인 → 수업 화면 열기 → 휴대폰 연결(같은 계정 QR) → 수업 시작 → 장면 넘기기(PC · 휴대폰) → 끝내기 · 기록.
// Firebase 에뮬레이터(가짜 프로젝트 demo-navi)만 써요. 시험 파일은 직접 만든 시험용(tests/fixtures, 실제 수업 자료 아님)
import { test, expect } from "@playwright/test";
import { watch, curLabel, nextBtn, finishLesson, fixture } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, stageLabel, uidAfterSignIn } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 300000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const ADMIN = { Authorization: "Bearer owner" };
const list = async (p) => { const r = await fetch("http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p + "?pageSize=100", { headers: ADMIN }); const j = r.ok ? await r.json() : {}; return j.documents || []; };
const drawn = (img) => expect.poll(() => img.evaluate((i) => (i.src.indexOf("blob:") === 0 && i.complete ? i.naturalWidth : 0)).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(0);
const NAMES = ["식물의 한살이", "씨앗은 어떻게 싹이 틀까요?", "오늘 배운 것 정리"];
const NOTE1 = "씨앗을 직접 보여 주며 시작해요.", NOTE2 = "조건 세 가지를 칠판에 적어요.";

test("가져온 자료로 수업 한 번: PDF + PPTX 올리기 → 고치지 않고 수업 화면 · 휴대폰 → 시작 · 넘기기 → 끝내기 · 기록", async ({ browser }) => {
  const errors = [], who = email("slides-e2e");
  const pc = await device(browser, PC, errors);
  let uid = "", clicks = 0;

  await test.step("1 로그인", async () => {
    await pc.page.goto("/");
    await signIn(pc.page, who);
    await pcLinked(pc.page);
    uid = await uidAfterSignIn(pc.page);
  });

  await test.step("2 내 수업에서 PDF와 PPTX를 한 번에 골라 올리기: 수업 하나, 장마다 노트, 계정에 저장", async () => {
    await pc.page.getByRole("tab", { name: "내 수업" }).click();
    const [chooser] = await Promise.all([pc.page.waitForEvent("filechooser"), pc.page.getByRole("button", { name: "PDF · PPTX로 시작하기" }).click()]); clicks++;
    await chooser.setFiles([fixture("lesson.pdf"), fixture("lesson.pptx")]);
    await expect(pc.page.getByText("3장을 올렸어요")).toBeVisible({ timeout: 30000 });
    await expect(pc.page.locator(".note").filter({ hasText: "PPTX의 발표자 노트를 장마다 붙였어요" })).toBeVisible();
    await expect(pc.page.locator(".srow .t")).toHaveText(NAMES);
    // 계정의 내 수업(장면 글자 · 노트 · 파일 id만, 쪽 그림 파일은 이 브라우저에)
    await expect(pc.page.locator(".sbar .save")).toHaveText("계정에 저장", { timeout: 20000 });
    const decks = await list("teachers/" + uid + "/decks");
    expect(decks.length).toBe(1);
    const pages = ((decks[0].fields.pages || {}).arrayValue || {}).values || [];
    expect(pages.map((v) => (v.mapValue.fields.notes || {}).stringValue || "")).toEqual([NOTE1, NOTE2, ""]);
    expect(pages.every((v) => /^f-/.test((v.mapValue.fields.fid || {}).stringValue || ""))).toBe(true);
  });

  await test.step("3 슬라이드 확인: 원래 모양(PDF 쪽 그림), 옆에 노트", async () => {
    await drawn(pc.page.locator(".sp-slide .slide.img img"));
    await expect(pc.page.locator('textarea[data-k="notes"]')).toHaveValue(NOTE1);
    await expect(pc.page.locator(".rd.warn")).toHaveCount(0);
  });

  let stage, ph;
  await test.step("4 수업 화면 열기(준비 화면의 ‘수업 화면 열기’) · 같은 계정 휴대폰 연결(QR)", async () => {
    [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.locator('.ready [data-act="stage-open"]').click()]); clicks++;
    watch(stage, errors);
    const url = await qrUrl(pc.page);
    ph = await phoneJoins(browser, errors, url, who);
    await expect(ph.page.locator(".checks")).toBeVisible();
  });

  await test.step("5 수업 시작: 학생은 PDF 그대로, 교사 PC · 휴대폰은 노트를 크게", async () => {
    await pc.page.getByRole("button", { name: "수업 시작" }).click(); clicks++;
    await expect(curLabel(pc.page)).toHaveText(NAMES[0]);
    await expect(curLabel(ph.page)).toHaveText(NAMES[0]);
    await expect(stageLabel(stage)).toHaveText(NAMES[0]);
    await drawn(stage.locator(".stage .slide.img img"));
    await expect(pc.page.locator(".pv .note-lead")).toContainText(NOTE1);
    await expect(ph.page.locator(".note-lead")).toContainText(NOTE1);
    // 수업 화면에는 노트 · 발화가 없어요
    await expect(stage.locator("body")).not.toContainText(NOTE1);
  });

  await test.step("6 장면 넘기기: 휴대폰 → 셋 다 둘째 장면, PC → 셋째 장면", async () => {
    await nextBtn(ph.page).click();
    await expect(curLabel(pc.page)).toHaveText(NAMES[1]);
    await expect(stageLabel(stage)).toHaveText(NAMES[1]);
    await expect(curLabel(ph.page)).toHaveText(NAMES[1]);
    await drawn(stage.locator(".stage .slide.img img"));
    // 둘째 장면은 물음표 제목이 핵심 발화(기본 정리), 노트는 아래에
    await expect(ph.page.locator(".say-list")).toContainText(NAMES[1]);
    await expect(pc.page.locator(".pv .pr-foot .notes")).toContainText(NOTE2);
    await pc.page.keyboard.press("PageDown");
    await expect(curLabel(ph.page)).toHaveText(NAMES[2]);
    await expect(stageLabel(stage)).toHaveText(NAMES[2]);
    // 셋째 장면은 노트도 발화도 없어요: 비었다고 경고하지 않고 짧게만 말해요
    await expect(pc.page.locator(".pv")).toContainText("이 장면에 적어 둔 노트 · 발화가 없어요.");
  });

  await test.step("7 끝내기 · 기록(계정에 한 건, 장면 3개)", async () => {
    await finishLesson(pc.page); clicks += 2;
    await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 20000 });
    const recs = await list("teachers/" + uid + "/records");
    expect(recs.length).toBe(1);
    const sc = (((recs[0].fields.scenes || {}).arrayValue || {}).values || []).map((x) => (x.mapValue.fields.label || {}).stringValue);
    expect(sc).toEqual(NAMES);
    // 휴대폰도 끝난 수업의 흐름(장면마다 걸린 시간)을 보여 줘요
    await expect(ph.page.locator("body")).toContainText("수업 흐름", { timeout: 15000 });
    for (const n of NAMES) await expect(ph.page.locator("body")).toContainText(n);
  });

  // 올리기부터 시작까지 교사가 누른 것: 파일 고르기 · 수업 화면 열기 · 수업 시작(+ 파일 창에서 두 파일 고르기)
  expect(clicks).toBe(5);
  expect(real(errors)).toEqual([]);
});
