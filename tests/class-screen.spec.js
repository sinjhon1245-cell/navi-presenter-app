// 수업 화면은 선택(2026-11-13, docs/CLASS-SCREEN.md): 모바일 리모컨에서 수업 화면 없이 시작하고, 수업 중 언제든 열고 닫아도
// 지금 장면으로 맞춰요. 휴대폰 요청으로는 교사 PC에 새 창을 열지 않아요(팝업 차단을 피하려 하지 않아요). Firebase 에뮬레이터 · 가짜 계정
import { test, expect } from "@playwright/test";
import { LABELS, watch, curLabel, nextBtn, finishLesson, localRecords, chip, toFlow } from "./helpers.js";
import { PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, uidAfterSignIn, PC } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const startBtn = (page) => page.locator('[data-act="m-start-ask"]');
const confirmBox = (page) => page.locator(".start-confirm");
// 교사 PC: 로그인만 하고, 이 PC가 연 새 창(수업 화면)을 세어요
async function teacher(browser, errors) {
  const who = email("teacher");
  const pc = await device(browser, PC, errors);
  pc.popups = [];
  pc.page.on("popup", (p) => { pc.popups.push(p); watch(p, errors); });
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  pc.who = who;
  return pc;
}
const phoneLabel = (ph) => ph.page.locator(".rm-tv .t small");
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

test("모바일 리모컨에서 수업 화면 없이 시작: PC는 새 창을 열지 않고 교사 화면만 수업으로, 수업 중 처음 열면 지금 장면 · 닫았다 다시 열어도 지금 장면, 기록은 하나", async ({ browser }) => {
  const errors = [];
  const pc = await teacher(browser, errors);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), pc.who);
  // 수업 화면이 없어도 ‘준비 완료’이고 누를 수 있어요. 확인 줄은 수업 화면 없이 시작한다고 그대로 말해요
  await expect(ph.page.locator(".ph-top .chip")).toContainText("준비 완료");
  await expect(ph.page.locator(".checks")).toContainText("열려 있지 않아요 · 없어도 시작할 수 있어요");
  await startBtn(ph.page).click();
  await expect(confirmBox(ph.page)).toContainText("교사 화면과 이 리모컨에서 시작할까요?");
  await expect(confirmBox(ph.page)).toContainText("수업 화면은 열려 있지 않아요");
  // 확인 줄이 같은 말을 하니 위의 안내는 숨겨요
  await expect(ph.page.locator(".stage-how")).toHaveCount(0);
  await ph.page.locator('[data-act="m-start"]').click();
  // 교사 화면 · 휴대폰이 첫 장면으로. PC에는 새 창이 생기지 않아요(휴대폰 요청이라서)
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await pc.page.waitForTimeout(1500);
  expect(pc.popups.length, "휴대폰 요청으로 PC에 새 창이 열렸어요").toBe(0);
  // 교사 화면은 경고가 아니라 ‘열려 있지 않아요’ 안내(팝업이 막혔다고 하지 않아요), 휴대폰도 수업 화면 상태를 알아요
  const note = pc.page.locator(".pv-warn");
  await expect(note).toHaveClass(/calm/);
  await expect(note).toContainText("수업 화면이 열려 있지 않아요");
  await expect(note).not.toContainText("팝업");
  await expect(phoneLabel(ph)).toContainText("수업 화면 · 열려 있지 않아요");
  // 수업은 그대로 진행돼요
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  // 수업 도중 처음으로 수업 화면을 열면(교사가 PC에서 누름) 첫 장면이 아니라 지금 장면부터
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), note.getByRole("button", { name: "수업 화면 열기" }).click()]);
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await expect(note).toHaveCount(0);
  await expect(phoneLabel(ph)).not.toContainText("열려 있지 않아요");
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText(LABELS[2]);
  // 수업 중 닫으면 안내가 돌아오고 휴대폰도 알아요. 닫힌 동안 넘긴 장면은 다시 열 때 그 장면으로
  await stage.close({ runBeforeUnload: true });
  await expect(note).toContainText("수업 화면이 열려 있지 않아요");
  await expect(phoneLabel(ph)).toContainText("열려 있지 않아요");
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[3]);
  const [again] = await Promise.all([pc.page.waitForEvent("popup"), note.getByRole("button", { name: "수업 화면 열기" }).click()]);
  await expect(chip(again)).toHaveText(LABELS[3]);
  // 끝내기 · 기록은 예전 그대로(휴대폰에서 끝내도 PC가 한 번만 기록). 휴대폰의 ‘수업 끝내기’는 마지막 장면에 있어요
  for (let i = 4; i < LABELS.length; i++) {
    await nextBtn(ph.page).click();
    await expect(chip(again)).toHaveText(LABELS[i]);
  }
  await finishLesson(ph.page);
  await expect(again.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("수업 화면 없이 휴대폰 시작 요청: 교사 PC가 끊겨 있으면 ‘응답하지 않아요’, 다시 이어져도 늦게 시작하지 않고, 연속 탭 · PC와 동시에 눌러도 수업은 하나예요", async ({ browser }) => {
  const errors = [];
  const pc = await teacher(browser, errors);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), pc.who);
  await expect(startBtn(ph.page)).toBeEnabled();
  // 교사 PC의 인터넷이 끊겨요: 요청은 답을 못 받고, 휴대폰이 그 뜻을 말해요
  await pc.ctx.setOffline(true);
  await startBtn(ph.page).click();
  await ph.page.locator('[data-act="m-start"]').click();
  await expect(ph.page.locator(".warn-note")).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  await pc.ctx.setOffline(false);
  await pcLinked(pc.page);
  await pc.page.waitForTimeout(3000);
  await expect(curLabel(pc.page)).toHaveCount(0);
  await expect(curLabel(ph.page)).toHaveCount(0);
  // 다시 ‘준비 완료’가 되면: 휴대폰은 확인을 두 번 빠르게, 교사는 같은 때 PC의 ‘수업 시작’을 눌러요
  await expect(ph.page.locator(".ph-top .chip")).toContainText("준비 완료", { timeout: 45000 });
  await startBtn(ph.page).click();
  const go = ph.page.locator('[data-act="m-start"]');
  await Promise.all([go.click(), go.click({ timeout: 1500 }).catch(() => {}), pc.page.getByRole("button", { name: "수업 시작" }).click({ timeout: 1500 }).catch(() => {})]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  // 수업은 하나: 넘기면 한 장면씩, 끝내면 기록 하나
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(1500);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await pc.page.keyboard.press("End");
  await finishLesson(pc.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await pc.page.waitForTimeout(1500);
  expect((await localRecords(pc.page)).length, "수업이 두 번 시작돼 기록이 둘이 됐어요").toBe(1);
  expect(real(errors)).toEqual([]);
});

test("PIN 휴대폰도 수업 화면 없이 시작해요: PC는 새 창을 열지 않고, 교사 화면 · 휴대폰이 같은 장면이에요", async ({ browser }) => {
  const errors = [];
  const pc = await teacher(browser, errors);
  const ph = await pinPhone(browser, errors, pc);
  await expect(ph.page.locator(".checks")).toContainText("열려 있지 않아요 · 없어도 시작할 수 있어요");
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await startBtn(ph.page).click();
  await ph.page.locator('[data-act="m-start"]').click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  expect(pc.popups.length, "PIN 휴대폰 요청으로 PC에 새 창이 열렸어요").toBe(0);
  expect(real(errors)).toEqual([]);
});

// 교사의 실제 흐름 하나로(2026-11-13 요청 1–6): 준비 화면의 ‘수업 화면 열기’ → 수업 화면 대기 → 모바일 ‘수업 시작’ → 교사 화면 · 수업 화면이 함께 첫 장면.
// 그 사이 창은 하나뿐이고, 수업 중 닫았다 처음처럼 다시 열어도 지금 장면, 화면 어디에도 예전 이름(학생 화면 · 휴대폰 리모컨)이 없어요
test("교사의 실제 흐름: 준비 화면에서 ‘수업 화면 열기’ → 대기 화면 → 모바일 ‘수업 시작’ → 교사 화면 · 수업 화면이 함께 첫 장면, 창은 하나, 수업 중 다시 열면 지금 장면, 이름은 ‘수업 화면’", async ({ browser }) => {
  const errors = [], OLD = /학생 화면|휴대폰 리모컨/;
  const words = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const pc = await teacher(browser, errors);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), pc.who);
  expect(await words(pc.page)).not.toMatch(OLD);
  expect(await words(ph.page)).not.toMatch(OLD);
  // 1) 수업 준비 화면의 ‘수업 화면 열기’ → 별도 창 하나, ‘수업 시작 전’ 대기
  const row = pc.page.locator(".ready .rd").filter({ hasText: "수업 화면" });
  await expect(row).toContainText("수업 화면 열기");
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), row.click()]);
  await expect(chip(stage)).toHaveText("수업 시작 전");
  expect(await stage.title()).toBe("수업 내비 · 수업 화면");
  expect(await words(stage)).not.toMatch(OLD);
  await expect(row).toContainText("수업 화면 열림");
  // 휴대폰도 수업 화면이 열린 것을 알아요(교사 PC가 알려 줌)
  await expect(ph.page.locator(".checks")).toContainText("열려 있어요");
  await expect(ph.page.locator(".stage-how")).toHaveCount(0);
  // 3) 다시 눌러도 새 창이 생기지 않고, 그 창을 다시 그리지 않아요
  await stage.evaluate(() => { document.body.dataset.keep = "1"; });
  await row.click();
  await pc.page.waitForTimeout(800);
  expect(pc.popups.length, "수업 화면이 하나 더 열렸어요").toBe(1);
  expect(await stage.evaluate(() => document.body.dataset.keep || "")).toBe("1");
  // 2) 모바일 ‘수업 시작’ → 확인 → 교사 화면과 수업 화면이 함께 첫 장면(같은 창 그대로)
  await expect(ph.page.locator(".ph-top .chip")).toContainText("준비 완료");
  await ph.page.locator('[data-act="m-start-ask"]').click();
  await expect(confirmBox(ph.page)).toContainText("교사 화면 · 수업 화면 · 이 리모컨에서 함께 시작할까요?");
  expect(await words(ph.page)).not.toMatch(OLD);
  const t0 = Date.now();
  await ph.page.locator('[data-act="m-start"]').click();
  const seen = {};
  await Promise.all([
    expect(curLabel(pc.page)).toHaveText(LABELS[0], { timeout: 10000 }).then(() => { seen.pc = Date.now() - t0; }),
    expect(chip(stage)).toHaveText(LABELS[0], { timeout: 10000 }).then(() => { seen.stage = Date.now() - t0; }),
    expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 10000 }).then(() => { seen.phone = Date.now() - t0; })
  ]);
  console.log("함께 시작(ms): " + JSON.stringify(seen));
  expect(Math.abs(seen.pc - seen.stage), "교사 화면과 수업 화면이 따로 바뀌었어요").toBeLessThan(1500);
  expect(pc.popups.length, "시작하면서 수업 화면이 하나 더 열렸어요").toBe(1);
  expect(await stage.evaluate(() => document.body.dataset.keep || ""), "시작하면서 수업 화면을 처음부터 다시 그렸어요").toBe("1");
  expect(await words(pc.page)).not.toMatch(OLD);
  expect(await words(stage)).not.toMatch(OLD);
  expect(await words(ph.page)).not.toMatch(OLD);
  // 진행 중 ‘수업 화면 켜짐’을 눌러도 같은 창
  await pc.page.locator('.pv-head [data-act="stage-open"]').click();
  await pc.page.waitForTimeout(500);
  expect(pc.popups.length).toBe(1);
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  // 5) 수업 도중 창을 닫고(교사가 실수로) 휴대폰으로 두 장면 넘긴 뒤 다시 열면, 첫 장면이 아니라 지금 장면
  await stage.close({ runBeforeUnload: true });
  await expect(pc.page.locator(".pv-warn")).toContainText("수업 화면이 열려 있지 않아요");
  await expect(ph.page.locator(".rm-tv .t small")).toContainText("열려 있지 않아요");
  await nextBtn(ph.page).click();
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[3]);
  const [again] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.locator(".pv-warn").getByRole("button", { name: "수업 화면 열기" }).click()]);
  await expect(chip(again)).toHaveText(LABELS[3]);
  await expect(ph.page.locator(".rm-tv .t small")).not.toContainText("열려 있지 않아요");
  expect(await words(again)).not.toMatch(OLD);
  expect(real(errors)).toEqual([]);
});

// ---------- 교사 PC 새로고침과 수업 화면 창(2026-11-19, PR #26, docs/STAGE-KEEP.md) · 로그인한 교사 ----------
// 창은 그대로 두고 이어서 하기 전에는 마지막 장면(교사 PC가 다시 그리기 전), 휴대폰은 그동안 ‘수업 화면 · 열려 있지 않아요’.
// 이어서 하기 → 새 창 없이 그 창이 지금 장면(휴대폰이 그사이 넘긴 것까지). 공용 PC 로그아웃은 그 창을 바로 닫고,
// 앱의 로그아웃을 거치지 않고 다른 계정(로그인 안 함)이 된 새로고침에서도 그 창을 넘겨받지 않고 닫아요
test("로그인한 교사 PC: 수업 화면을 연 채 새로고침해도 그 창 그대로, 이어서 하기 뒤 휴대폰이 넘긴 장면까지 그 창에. 로그아웃하면 그 창도 바로 닫혀요", async ({ browser }) => {
  const errors = [];
  const pc = await teacher(browser, errors);
  const ph = await phoneJoins(browser, errors, await qrUrl(pc.page), pc.who);
  await toFlow(pc.page);
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  await expect.poll(() => pc.popups.length).toBe(1);
  const stage = pc.popups[0];
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await nextBtn(pc.page).click();
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(600);
  await pc.page.reload();
  const offer = pc.page.locator(".run-offer");
  await expect(offer).toContainText("끝나지 않은 수업이 있어요", { timeout: 30000 });
  await expect(offer).toContainText("수업 화면(TV)은 열린 그대로예요");
  expect(stage.isClosed()).toBe(false);
  await expect(stage.locator(".stage-wait")).toHaveText("교사 화면과 다시 연결하는 중이에요");
  await expect(chip(stage)).toHaveText(LABELS[1]);
  // 그사이 휴대폰이 넘겨요: 휴대폰은 수업 화면이 아직 이어지지 않았다고 말하고, 그 창은 마지막 장면 그대로
  await expect(phoneLabel(ph)).toContainText("열려 있지 않아요");
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await expect(offer).toContainText("3 / " + LABELS.length);
  await expect(chip(stage)).toHaveText(LABELS[1]);
  await offer.getByRole("button", { name: "이어서 하기" }).click();
  await expect(chip(stage)).toHaveText(LABELS[2]);
  await expect(stage.locator(".stage-wait")).toHaveCount(0);
  await expect(phoneLabel(ph)).not.toContainText("열려 있지 않아요");
  expect(pc.popups.length, "새 창을 열지 않아요").toBe(1);
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText(LABELS[3]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[3]);
  // 끝내고 로그아웃(공용 PC): 기록은 하나, 그 창은 바로 닫혀요
  await pc.page.keyboard.press("End");
  await finishLesson(pc.page);
  await expect(chip(stage)).toHaveText("수업 끝");
  expect((await localRecords(pc.page)).length).toBe(1);
  const closed = stage.waitForEvent("close", { timeout: 5000 });
  await Promise.all([pc.page.waitForEvent("load"), pc.page.locator(".logout-hint").getByRole("button", { name: "로그아웃" }).click()]);
  await closed;
  await expect(pc.page.getByRole("button", { name: /구글로 로그인/ }).first()).toBeVisible({ timeout: 20000 });
  await pc.page.waitForTimeout(1500);
  expect(pc.popups.length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("앱의 로그아웃을 거치지 않고 로그인이 풀린 새로고침(다른 계정 · 로그인 안 함)은 남은 수업 화면 창을 넘겨받지 않고 닫아요", async ({ browser }) => {
  const errors = [];
  const pc = await teacher(browser, errors);
  await toFlow(pc.page);
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  await expect.poll(() => pc.popups.length).toBe(1);
  const stage = pc.popups[0];
  await nextBtn(pc.page).click();
  await expect(chip(stage)).toHaveText(LABELS[1]);
  const closed = stage.waitForEvent("close", { timeout: 15000 });
  // 로그인 도우미에서 바로 로그아웃(앱의 단추를 거치지 않음) → 페이지가 다시 열려요
  await Promise.all([pc.page.waitForEvent("load"), pc.page.evaluate(() => window.naviAuth.signOut()).catch(() => {})]);
  await closed;
  expect(pc.popups.length).toBe(1);
  expect(real(errors)).toEqual([]);
});
