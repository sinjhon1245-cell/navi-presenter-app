// 휴대폰 ↔ 교사 PC 실시간 연결 시험 (1단계-1)
// Firebase 에뮬레이터(Firestore · 로그인) 안의 가짜 프로젝트 demo-navi에서, 교사 PC(1366×768)와 휴대폰(390×844)을 따로 열어 시험해요.
// 실제 Firebase 프로젝트 · 실제 구글 계정과 상관없어요. 로그인은 에뮬레이터의 가짜 구글 계정으로 해요.
// 실행: npm run test:emu (에뮬레이터 없이 npm test로 돌리면 '건너뜀'으로 나와요)
import { test, expect } from "@playwright/test";
import { LABELS, watch, curLabel, nextBtn, localRecords, finishLesson, idbRecords, VIDEO, fakeMedia, addMaterial, showOnStage, frameEl, mark, marked, born, played, V, fakeYouTube, pstate, ptime, pborn, frame, bar, chip, videoLesson } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, teacherStarts, phoneJoins, stageLabel, readDoc, uidAfterSignIn } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 120000 });

test("양방향 넘기기: 휴대폰으로 넘기면 교사 화면과 수업 화면이, 교사 PC로 넘기면 휴대폰이 함께 바뀌어요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await expect(ph.page.locator(".rm-top .chip")).toContainText("수업 진행 중");

  // 휴대폰 → 교사 PC · 수업 화면(TV). 누른 순간부터 TV가 바뀔 때까지 걸린 시간도 재요
  const lag = [];
  for (let i = 1; i <= 3; i++) {
    const t = Date.now();
    await nextBtn(ph.page).click();
    await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]);
    lag.push(Date.now() - t);
    await expect(curLabel(pc.page)).toHaveText(LABELS[i]);
    await expect(curLabel(ph.page)).toHaveText(LABELS[i]);
  }
  // 교사 PC(무선 프레젠터 키) → 휴대폰
  await pc.page.keyboard.press("PageDown");
  await expect(curLabel(ph.page)).toHaveText(LABELS[4]);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[4]);
  // 휴대폰 이전 → 교사 PC · 수업 화면
  await ph.page.locator('.thumb-nav [data-act="prev"]').click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[3]);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[3]);
  // 목차에서 바로 가기
  await ph.page.locator('.thumb-nav [data-act="toc"]').click();
  await ph.page.locator('.toc [data-act="jump"]').nth(6).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[6]);
  test.info().annotations.push({ type: "휴대폰 누름 → 수업 화면 반영(ms)", description: lag.join(", ") });
  expect(Math.max(...lag), "휴대폰 누름 → 수업 화면 반영이 너무 느려요").toBeLessThan(3000);
  expect(errors).toEqual([]);
});

test("장면 진행: 휴대폰과 교사 PC가 같은 장면 번호 · 같은 지나온 / 지금 / 건너뛴 칸을 보여 주고, 수업 화면에는 진행 막대가 없어요", async ({ browser }) => {
  const errors = [], who = email("teacher"), n = LABELS.length;
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  const marks = (page, where) => page.locator(where + " .tl.by-scene .seg").evaluateAll((els) => els.map((e) => ["now", "done", "skip", "seen"].find((c) => e.classList.contains(c)) || "-").map((c) => ({ now: "n", done: "d", skip: "k", seen: "v" })[c] || "-").join(""));
  const same = async (k, want) => {
    await expect(pc.page.locator(".pv-head .prog-n")).toHaveText(k + " / " + n + " 장면");
    await expect(ph.page.locator(".rm-top .rm-n")).toHaveText(k + " / " + n);
    await expect.poll(() => marks(ph.page, ".remote")).toBe(want);
    await expect.poll(() => marks(pc.page, ".pv-head")).toBe(want);
  };
  await same(1, "n" + "-".repeat(n - 1));
  // 휴대폰으로 세 번 넘기기 → 4번째, 지나온 3칸
  for (let i = 1; i <= 3; i++) { await nextBtn(ph.page).click(); await expect(curLabel(pc.page)).toHaveText(LABELS[i]); }
  await same(4, "ddd" + "n" + "-".repeat(n - 4));
  // 교사 PC 이전 → 3번째, 4번째는 이미 본 장면
  await pc.page.keyboard.press("PageUp");
  await same(3, "dd" + "n" + "v" + "-".repeat(n - 4));
  // 휴대폰 목차로 7번째로 건너뛰기: 5 · 6번째는 건너뜀
  await ph.page.locator('.thumb-nav [data-act="toc"]').click();
  await ph.page.locator('.toc [data-act="jump"]').nth(6).click();
  await same(7, "dddd" + "kk" + "n" + "-".repeat(n - 7));
  // 두 화면의 수업 시계는 같은 수업 시작 시각에서 세요(기기끼리 시각을 비교하지 않고, 몇 초 차이 안에서 같아요)
  const sec = async (page) => (await page.locator(".js-elapsed").first().innerText()).split(":").reduce((a, x) => a * 60 + Number(x), 0);
  expect(Math.abs((await sec(pc.page)) - (await sec(ph.page)))).toBeLessThanOrEqual(3);
  // 수업 화면(TV)에는 장면 진행 · 시계 · 핵심 발화가 없어요
  for (const sel of [".prog", ".tl", ".tbar", ".js-elapsed", ".say"]) await expect(pc.stage.locator(sel)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("신호등: 휴대폰과 교사 PC가 같은 순간 눌러도 둘 다 남고, 지금 장면 · 신호가 양쪽에 같고, 휴대폰에서 끝내도 기록은 교사 PC에 1건", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  // 수업 끝내기는 첫 장면부터 휴대폰 위쪽 줄에도 있어요(2026-11-15)
  await expect(ph.page.locator('.rm-top [data-act="end-ask"]')).toBeVisible();
  // 같은 순간: 휴대폰은 빨강, 교사 PC는 노랑(키 2)
  await Promise.all([ph.page.locator(".thumb-nav .sig.s-red").click(), pc.page.keyboard.press("2")]);
  // 둘 중 나중에 서버에 닿은 것이 지금 신호예요. 양쪽 화면이 같은 신호를 보여 줘요
  const lit = async (page) => (await page.locator('.sig[aria-pressed="true"]').first().getAttribute("class")).match(/s-(red|yellow|green)/)[1];
  await expect.poll(async () => (await lit(pc.page)) === (await lit(ph.page))).toBe(true);
  // 교사 PC가 다음 장면에서 초록 → 휴대폰에도 같은 장면 · 같은 신호
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await pc.page.locator(".sig.s-green").click();
  await expect(ph.page.locator(".thumb-nav .sig.s-green")).toHaveAttribute("aria-pressed", "true");
  // ‘지금 쓸 것’은 누른 기기에만 떠요(신호는 양쪽에 같고, 수업 화면은 띄우기 전까지 그대로)
  await expect(pc.page.locator(".pv-right .sug")).toBeVisible();
  await expect(ph.page.locator(".sug")).toHaveCount(0);
  // 휴대폰 질문 메모 → 교사 PC에도
  await ph.page.locator('.thumb-nav [data-act="sheet"]').click();
  await ph.page.getByRole("button", { name: /질문 메모/ }).first().click();
  await ph.page.locator("#q-in").fill("물이 끓을 때 나오는 거품은 무엇인지");
  await ph.page.locator("#q-in").press("Enter");
  await expect(pc.page.getByRole("button", { name: "질문 메모 1" })).toBeVisible();
  // 휴대폰에서 마지막 장면까지 가서 수업 끝내기
  await ph.page.keyboard.press("Escape");
  for (let i = 2; i < LABELS.length; i++) {
    await nextBtn(ph.page).click();
    await expect(curLabel(pc.page)).toHaveText(LABELS[i]);
  }
  await finishLesson(ph.page);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(pc.page.locator(".memo-sheet")).toBeVisible();
  await expect(ph.page.locator(".memo-sheet")).toContainText("교사 PC가 이 수업의 기록을 만들었어요");
  // 기록은 교사 PC 브라우저에 1건, 휴대폰 브라우저에는 없어요. 동시에 누른 빨강 · 노랑과 초록이 모두 남아요
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  const rec = (await localRecords(pc.page))[0];
  expect(rec.events.map((e) => e.type).sort()).toEqual(["green", "red", "yellow"]);
  expect(rec.questions.map((q) => q.text)).toEqual(["물이 끓을 때 나오는 거품은 무엇인지"]);
  expect(await localRecords(ph.page)).toEqual([]);
  expect(errors).toEqual([]);
});

// 2026-11-12(PR #15, docs/STABILITY.md 1): 서버가 ‘수업 시작’을 받았다고 답한 바로 그때 교사 PC가 끊기면, 서버가 확인한 소식이 오기 전이라
// 교사 화면 · 수업 화면이 예전 상태(수업 시작 전)로 돌아갔어요(고치기 전 재현 18번 중 15번). 서버가 받은 쓰기를 확인 소식이 올 때까지 화면에 둬요
test("수업 시작 직후 교사 PC가 끊겨도: 교사 화면 · 수업 화면은 그 수업 그대로(‘연결 끊김’), 끊긴 채 넘기고 다시 이어지면 휴대폰까지 같은 장면, 수업 시작 · 기록은 한 번씩만", async ({ browser }) => {
  const errors = [], who = email("start-cut");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const uid = await uidAfterSignIn(pc.page);
  const url = await qrUrl(pc.page), pin = url.match(/#remote-(\d{4})$/)[1];
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(ph.page.locator(".checks")).toBeVisible();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  // 시작 직후 곧바로 끊어요(서버가 시작을 받았는지와 상관없이)
  await pc.ctx.setOffline(true);
  for (const ms of [300, 700, 1500, 3000]) {
    await pc.page.waitForTimeout(ms);
    await expect(curLabel(pc.page), ms + "ms 뒤 교사 화면").toHaveText(LABELS[0]);
    await expect(stageLabel(stage), ms + "ms 뒤 수업 화면").toHaveText(LABELS[0]);
  }
  await expect(pc.page.locator(".chip.warn")).toContainText("연결 끊김");
  // 끊긴 채 넘겨요: 교사 화면 · 수업 화면은 바로, 서버 · 휴대폰은 다시 이어진 뒤에
  await nextBtn(pc.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await pc.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 20000 });
  await expect(pc.page.locator(".chip.live")).toBeVisible({ timeout: 20000 });
  const ses = await readDoc(pc.page, "sessions/s" + pin, { cur: "s2" });
  expect(ses.started).toBe(true);
  // 끝내기: 기록은 이 브라우저와 계정에 한 건씩, 수업 시작은 한 번(시작 시각이 그대로)
  await pc.page.keyboard.press("End");
  await finishLesson(pc.page);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 20000 });
  const recs = await idbRecords(pc.page, "navi-local-" + uid);
  expect(recs.length).toBe(1);
  expect(recs[0].startAt).toBe(ses.t0);
  const acct = await fetch("http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/teachers/" + uid + "/records?pageSize=50", { headers: { Authorization: "Bearer owner" } }).then((r) => r.json());
  expect((acct.documents || []).length).toBe(1);
  await expect(curLabel(ph.page)).toHaveCount(0, { timeout: 20000 });
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::/.test(e))).toEqual([]);
});

test("끊김과 다시 잇기: 휴대폰이 끊기면 넘기기를 막고, 다시 이어지면 지금 장면으로 맞춰요. 교사 PC가 끊겨도 수업은 계속되고 다시 이어지면 휴대폰이 따라와요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);

  // 휴대폰 끊김: ‘연결 끊김’을 그대로 말하고, 넘기기 · 신호를 막아요
  await ph.ctx.setOffline(true);
  await expect(ph.page.locator(".rm-top .chip")).toContainText("연결 끊김");
  await expect(ph.page.locator(".thumb-nav.frozen")).toBeVisible();
  await expect(ph.page.locator(".thumb-nav .warn-note")).toContainText("다시 연결되면 지금 장면으로 맞춰요");
  await nextBtn(ph.page).click({ force: true });
  await ph.page.waitForTimeout(500);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  // 그동안 교사 PC가 두 장면 넘겨요
  await pc.page.keyboard.press("PageDown");
  await pc.page.keyboard.press("PageDown");
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[2]);
  // 다시 이어지면 지금 장면으로(걸린 시간을 재요)
  let t = Date.now();
  await ph.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[2], { timeout: 30000 });
  await expect(ph.page.locator(".rm-top .chip")).toContainText("수업 진행 중");
  const phoneBack = Date.now() - t;
  await expect(ph.page.locator(".thumb-nav.frozen")).toHaveCount(0);

  // 교사 PC 끊김: 수업과 수업 화면은 계속돼요. 휴대폰은 그 사이 바뀐 걸 모르고 기다려요
  await pc.ctx.setOffline(true);
  await expect(pc.page.locator(".pv-head .chip, .pv .chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  await pc.page.keyboard.press("PageDown");
  await expect(curLabel(pc.page)).toHaveText(LABELS[3]);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[3]);
  await pc.page.waitForTimeout(500);
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  t = Date.now();
  await pc.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[3], { timeout: 30000 });
  const pcBack = Date.now() - t;

  // 휴대폰 새로고침: 서버의 지금 장면으로 다시 열려요
  await ph.page.reload();
  await expect(curLabel(ph.page)).toHaveText(LABELS[3]);
  // 교사 PC 새로고침: 저절로 이어서 하지 않고 ‘끝나지 않은 수업’을 보여 줘요. 그동안 휴대폰이 넘긴 것까지 이어서 해요
  await pc.page.reload();
  const offer = pc.page.locator(".run-offer");
  await expect(offer).toContainText("끝나지 않은 수업이 있어요");
  await nextBtn(ph.page).click();
  await expect(offer).toContainText("5 / " + LABELS.length);
  // 수업 화면 창은 새로고침해도 그대로예요(2026-11-19, docs/STAGE-KEEP.md): 이어서 하기 전에는 마지막 장면(교사 PC가 그리기 전), 뒤에는 지금 장면
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[3]);
  await offer.getByRole("button", { name: "이어서 하기" }).click();
  const again = pc.stage;
  await expect(curLabel(pc.page)).toHaveText(LABELS[4]);
  await expect(stageLabel(again)).toHaveText(LABELS[4]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(again)).toHaveText(LABELS[5]);
  test.info().annotations.push({ type: "다시 이어진 뒤 맞춰지기까지(ms)", description: "휴대폰 " + phoneBack + " · 교사 PC " + pcBack });
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::/.test(e))).toEqual([]);
});

test("다른 교사 계정으로 로그인한 휴대폰은 내 수업을 볼 수도 넘길 수도 없어요", async ({ browser }) => {
  const errors = [];
  const pc = await teacherStarts(browser, errors, email("teacher-a"));
  const ph = await phoneJoins(browser, errors, pc.url, email("teacher-b"));
  await expect(ph.page.locator(".panel")).toContainText("이 계정에는 교사 PC에서 연 수업이 없어요");
  await expect(curLabel(ph.page)).toHaveCount(0);
  await expect(ph.page.locator('[data-act="next"]')).toHaveCount(0);
  // 교사 A의 수업은 그대로예요
  await pc.page.keyboard.press("PageDown");
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  await expect(ph.page.locator(".panel")).toContainText("이 계정에는 교사 PC에서 연 수업이 없어요");
  expect(errors).toEqual([]);
});

test("로그인하지 않은 휴대폰은 로그인 화면만 보고, 서버도 로그인 없는 읽기 · 쓰기를 거절해요", async ({ browser, request }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await device(browser, PHONE, errors);
  await ph.page.goto(pc.url);
  await expect(ph.page.getByRole("button", { name: /구글 계정으로 연결/ })).toBeVisible();
  await expect(curLabel(ph.page)).toHaveCount(0);
  // 서버에 직접: 교사 수업 문서를 로그인 없이 읽고 쓰기 → 거절(403). 관리 권한으로는 있어요(문서가 실제로 있다는 확인)
  // 교탁 PC의 로그인은 그 탭에만 있어요(2026-11-10). 계정 id는 연결 코드가 알려 줘요
  const uid = await uidAfterSignIn(pc.page);
  const pin = pc.url.match(/#remote-(\d{4})$/)[1];
  const docUrl = "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/teachers/" + uid + "/sessions/s" + pin;
  expect((await request.get(docUrl)).status()).toBe(403);
  expect((await request.patch(docUrl + "?updateMask.fieldPaths=cur", { data: { fields: { cur: { stringValue: "x" } } } })).status()).toBe(403);
  expect((await request.get(docUrl, { headers: { Authorization: "Bearer owner" } })).status()).toBe(200);
  expect(errors).toEqual([]);
});

test("수업 중 시계는 매초 바뀌어도 Firestore에 쓰지 않고, 장면을 넘길 때만 써요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  const writes = (page) => page.evaluate(() => window.__naviWrites || 0);
  const before = [await writes(pc.page), await writes(ph.page)];
  const clock = await pc.page.locator(".js-elapsed").first().innerText();
  await pc.page.waitForTimeout(6000);
  // 화면의 시계는 움직였어요
  expect(await pc.page.locator(".js-elapsed").first().innerText()).not.toBe(clock);
  expect([await writes(pc.page), await writes(ph.page)], "6초 동안 쓴 횟수(교사 PC, 휴대폰)").toEqual(before);
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  expect(await writes(ph.page), "휴대폰에서 한 번 넘기면 한 번만 써요").toBe(before[1] + 1);
  expect(await writes(pc.page)).toBe(before[0]);
  expect(errors).toEqual([]);
});

test("연결 방식: Firestore는 웹소켓이 아니라 HTTPS(WebChannel) 요청으로 받고 보내요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await device(browser, PHONE, errors);
  const seen = [], sockets = [];
  // 받기는 Listen 채널, 휴대폰의 조작은 조건부 거래(batchGet → commit)로 보내요(교사 PC는 Write 채널)
  ph.page.on("request", (r) => { if (/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel|documents:(batchGet|commit|beginTransaction)/.test(r.url())) seen.push(r.method() + " " + r.url()); });
  ph.page.on("websocket", (w) => sockets.push(w.url()));
  await ph.page.goto(pc.url);
  await signIn(ph.page, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  const kinds = [...new Set(seen.map((s) => { const u = new URL(s.split(" ")[1]); return s.split(" ")[0] + " " + u.pathname.split("/").slice(-2).join("/") + " TYPE=" + u.searchParams.get("TYPE") + (u.searchParams.has("CI") ? " CI=" + u.searchParams.get("CI") : ""); }))];
  test.info().annotations.push({ type: "Firestore 연결 요청", description: kinds.join(" | ") });
  expect(seen.some((s) => /Listen\/channel/.test(s)), "받기(Listen) 요청").toBe(true);
  expect(seen.some((s) => /documents:commit/.test(s)), "휴대폰 보내기(조건부 거래 commit) 요청").toBe(true);
  expect(seen.every((s) => /^(GET|POST) http:\/\//.test(s)), "모두 보통 HTTP(S) 요청").toBe(true);
  expect(sockets, "웹소켓을 쓰지 않아요").toEqual([]);
  expect(errors).toEqual([]);
});

// ---------- 추가 검증: 동시 조작 · 중복 명령 · 끝난 뒤 조작 · 끊긴 동안 양쪽에서 바꾸기 ----------
// 교사 화면 · 휴대폰 · 수업 화면이 같은 장면을 보이는지(셋 다 같으면 그 이름)
const same3 = async (pc, ph) => {
  const a = (await curLabel(pc.page).innerText()).trim(), b = (await curLabel(ph.page).innerText()).trim(), c = (await stageLabel(pc.stage).innerText()).trim();
  return a === b && b === c ? a : null;
};
const litOf = (page) => page.evaluate(() => { const b = document.querySelector('.sig[aria-pressed="true"]'); return b ? (b.className.match(/s-(red|yellow|green)/) || [])[1] || null : null; });
const pinOf = (pc) => pc.url.match(/#remote-(\d{4})$/)[1];

test("동시 조작: 휴대폰과 교사 PC가 같은 순간 넘기거나, 한쪽은 넘기고 한쪽은 신호를 눌러도 세 화면이 같은 상태로 모여요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  // 같은 순간 둘 다 ‘다음’: 같은 장면에서 계산하면 한 장면, 한쪽이 먼저 닿으면 두 장면. 어느 쪽이든 세 화면은 같아야 해요
  await Promise.all([nextBtn(ph.page).click(), pc.page.keyboard.press("PageDown")]);
  await expect.poll(() => same3(pc, ph)).toMatch(new RegExp("^(" + LABELS[1] + "|" + LABELS[2] + ")$"));
  // 휴대폰은 다음, 교사 PC는 빨강을 같은 순간
  await Promise.all([nextBtn(ph.page).click(), pc.page.keyboard.press("1")]);
  await expect.poll(() => same3(pc, ph)).not.toBeNull();
  // 여러 번 엇갈려 누르기(양쪽 다음 · 이전 · 신호): 끝나면 세 화면과 신호가 같아요
  for (let i = 0; i < 6; i++) {
    await Promise.all([
      ph.page.locator('.thumb-nav [data-act="' + (i % 2 ? "prev" : "next") + '"]').click(),
      pc.page.keyboard.press(i % 3 === 0 ? "2" : i % 2 ? "PageDown" : "PageUp")
    ]);
  }
  await expect.poll(() => same3(pc, ph)).not.toBeNull();
  await expect.poll(async () => (await litOf(pc.page)) === (await litOf(ph.page))).toBe(true);
  expect(errors).toEqual([]);
});

test("중복 명령: 빠르게 여러 번 눌러도 누른 만큼만 넘어가고, 같은 소식이 두 번 와도 신호는 한 번만 남아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  // 휴대폰에서 기다리지 않고 다섯 번 → 정확히 다섯 장면
  for (let i = 0; i < 5; i++) await nextBtn(ph.page).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[5]);
  await expect.poll(() => same3(pc, ph)).toBe(LABELS[5]);
  await pc.page.waitForTimeout(800);
  expect(await same3(pc, ph), "더 넘어가지 않아요").toBe(LABELS[5]);
  // 같은 신호를 빠르게 두 번 = 켰다가 끄기(교사 PC와 같은 규칙)
  await ph.page.locator(".thumb-nav .sig.s-red").click();
  await ph.page.locator(".thumb-nav .sig.s-red").click();
  // 휴대폰 조작은 차례대로 서버에 확인받으며 가요. 두 번 누른 것이 서버에 다 닿은 뒤를 기준으로 세요
  // (GitHub에서 한 번, 닿기 전에 세기 시작해서 0으로 센 적이 있어요. 기다림 없이 세면 시험이 틀려요)
  const serverLights = (ok) => ph.page.evaluate(([pin, ok]) => new Promise(async (res) => {
    const db = await window.claude.use("db"), ref = db.doc("sessions/s" + pin), want = new Function("r", "return " + ok);
    const off = ref.onSnapshot((s) => { if (s.metadata.fromCache || s.metadata.hasPendingWrites) return; const r = s.data().reactions || []; if (want(r)) { off(); res(r); } });
  }), [pinOf(pc), ok]);
  const before = await serverLights("r.length >= 2");
  expect(before.map((e) => e.type), "빨강 두 번 = 켜기 · 끄기 두 소식(더도 덜도 아님)").toEqual(["red", "clear"]);
  // 양쪽 화면 모두 신호가 꺼져 있어요
  await expect.poll(() => litOf(pc.page)).toBeNull();
  expect(await litOf(ph.page)).toBeNull();
  // 같은 신호 소식이 다시 보내져도(다시 보내기) 서버에는 한 번만 남아요
  await ph.page.evaluate(async (pin) => {
    const db = await window.claude.use("db"), ref = db.doc("sessions/s" + pin);
    const ev = { id: "s6", type: "green", at: 1762131999000 };
    await ref.update({ reactions: db.append(ev) });
    await ref.update({ reactions: db.append(ev) });
  }, pinOf(pc));
  const after = await serverLights("r.some((e) => e.at === 1762131999000)");
  expect(after.filter((e) => e.at === 1762131999000).length, "같은 소식 두 번 → 서버에는 하나").toBe(1);
  expect(after.length - before.length, "같은 소식 두 번 → 하나만 더해져요").toBe(1);
  expect(errors).toEqual([]);
});

test("끝난 뒤 조작: 양쪽에서 동시에 끝내도 기록은 1건, 끝난 수업은 키 · 신호로 바뀌지 않고, 끊겼던 휴대폰도 새 수업으로 맞춰지고, 새 수업 기록은 따로 남아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) await nextBtn(ph.page).click();
  await expect.poll(() => same3(pc, ph)).toBe(LABELS[LABELS.length - 1]);
  // 양쪽 다 ‘수업 끝내기’ 확인 줄을 열고 같은 순간 확인(한쪽이 먼저 끝내면 다른 쪽 단추는 사라져요. 그래도 기록은 1건이어야 해요)
  await pc.page.locator('[data-act="end-ask"]').first().click();
  await ph.page.locator('[data-act="end-ask"]').first().click();
  const press = (page) => page.evaluate(() => { const b = document.querySelector('.end-confirm [data-act="end"]'); if (b) b.click(); return !!b; });
  const pressed = await Promise.all([press(pc.page), press(ph.page)]);
  test.info().annotations.push({ type: "끝내기 확인을 실제로 누른 쪽(교사 PC, 휴대폰)", description: pressed.join(", ") });
  expect(pressed).toEqual([true, true]);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(ph.page.locator(".memo-sheet")).toContainText("교사 PC가 이 수업의 기록을 만들었어요");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  const first = (await localRecords(pc.page))[0];
  // 끝난 수업: 교사 PC의 다음 · 신호 키, 휴대폰의 키는 아무것도 바꾸지 않아요(휴대폰에는 넘기기 · 신호 단추도 없어요)
  const path = "sessions/s" + pinOf(pc);
  const before = await readDoc(ph.page, path, { ended: true, memoId: first.id });
  await pc.page.keyboard.press("PageDown");
  await pc.page.keyboard.press("1");
  await ph.page.keyboard.press("PageDown");
  await expect(ph.page.locator('[data-act="next"], [data-act="signal"]')).toHaveCount(0);
  await pc.page.waitForTimeout(800);
  const after = await readDoc(ph.page, path, { ended: true });
  expect([after.cur, after.reactions.length, after.at, after.memoId]).toEqual([before.cur, before.reactions.length, before.at, first.id]);
  expect((await localRecords(pc.page)).length, "기록은 그대로 1건").toBe(1);

  // 새 수업 준비 → 휴대폰이 끊긴 사이에 새 수업 시작 → 다시 이어지면 새 수업의 지금 장면으로
  await pc.page.getByRole("button", { name: "새 수업 준비" }).click();
  await pc.page.locator('[data-act="reset"]').click();
  await ph.ctx.setOffline(true);
  // 앞 수업의 수업 화면 창이 아직 열려 있어서(‘수업 끝’), 새 수업도 그 창에 그대로 띄워요
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  const stage2 = pc.stage;
  await expect(stageLabel(stage2)).toHaveText(LABELS[0]);
  await pc.page.keyboard.press("PageDown");
  await expect(stageLabel(stage2)).toHaveText(LABELS[1]);
  await ph.ctx.setOffline(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1], { timeout: 30000 });
  // 새 수업은 휴대폰으로 넘기고 끝내면 기록이 하나 더(서로 다른 id). 휴대폰 브라우저에는 기록이 없어요
  for (let i = 2; i < LABELS.length; i++) await nextBtn(ph.page).click();
  await expect(stageLabel(stage2)).toHaveText(LABELS[LABELS.length - 1]);
  await finishLesson(ph.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(2);
  expect(new Set((await localRecords(pc.page)).map((r) => r.id)).size, "기록 id가 서로 달라요").toBe(2);
  expect(await localRecords(ph.page)).toEqual([]);
  expect(errors.filter((e) => !/net::/.test(e))).toEqual([]);
});

test("끊긴 동안 양쪽에서 바꾸기: 교사 PC가 끊긴 사이 휴대폰과 PC가 각각 넘기면, 다시 이어진 뒤 휴대폰이 넘긴 장면으로 세 화면이 같아지고, 교사 PC가 반영하지 않은 것을 알려 그 장면으로 되돌릴 수 있어요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await pc.ctx.setOffline(true);
  await expect(pc.page.locator(".chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  // 휴대폰은 서버와 이어져 있어서 넘길 수 있어요(교사 PC는 그 사이 몰라요)
  await nextBtn(ph.page).click();
  await nextBtn(ph.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  // 끊긴 교사 PC는 이 기기에서 계속 수업해요
  await pc.page.keyboard.press("PageDown");
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  await pc.ctx.setOffline(false);
  // 2026-11-21 교사 결정(docs/CLASS-CLOCK.md 2-4): 끊긴 PC가 옛 장면에서 넘긴 것은 서버의 더 새 진행(휴대폰이 넘긴 곳)을 덮지 않아요.
  // 휴대폰이 넘긴 장면으로 셋이 모이고, 교사 PC는 반영하지 않은 것을 알려요. [그 장면으로 가기]면 수업 화면(TV)에 보이던 장면으로 셋이 모여요
  await expect.poll(() => same3(pc, ph), { timeout: 30000 }).toBe(LABELS[2]);
  await expect(pc.page.locator(".clk-held")).toContainText("반영하지 않았어요");
  await pc.page.locator('.clk-held [data-act="clk-go"]').click();
  await expect.poll(() => same3(pc, ph), { timeout: 30000 }).toBe(LABELS[1]);
  await expect(pc.page.locator(".clk-held")).toHaveCount(0);
  expect(errors.filter((e) => !/net::/.test(e))).toEqual([]);
});

// 휴대폰에서 서버로 ‘보내는 길’만 끊긴 상태: 받기는 되고 브라우저도 온라인이라, 휴대폰은 아직 끊긴 줄 몰라요(실제 교실 와이파이에서 생기는 틈)
const blockSending = (ctx) => ctx.route(/127\.0\.0\.1:8080\//, (route) => (/Listen\/channel/.test(route.request().url()) ? route.continue() : route.abort("internetdisconnected")));
const unblockSending = (ctx) => ctx.unroute(/127\.0\.0\.1:8080\//);

test("늦게 닿는 휴대폰 조작: 보내지 못한 ‘다음’은 다시 이어진 뒤에 뒤늦게 적용되지 않고, 휴대폰은 지금 장면으로 돌아와요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await blockSending(ph.ctx);
  // 휴대폰에서 ‘다음’ 두 번(보내지지 않아요)
  await nextBtn(ph.page).click();
  await nextBtn(ph.page).click();
  // 그 사이 교사 PC는 세 장면 넘겨요. 수업 화면(TV)은 PC를 따라가요
  for (let i = 0; i < 3; i++) await pc.page.keyboard.press("PageDown");
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[3]);
  // 휴대폰은 보내지 못했다고 말하고, 서버의 지금 장면(PC가 넘긴 곳)을 보여 줘요
  await expect(ph.page.locator(".thumb-nav .warn-note")).toContainText("보내지 못했어요", { timeout: 15000 });
  await expect(curLabel(ph.page)).toHaveText(LABELS[3]);
  // 다시 이어져도 휴대폰의 오래된 ‘다음’이 뒤늦게 적용되지 않아요(수업 화면이 거꾸로 돌아가지 않음)
  await unblockSending(ph.ctx);
  await pc.page.waitForTimeout(5000);
  expect(await same3(pc, ph), "5초 뒤에도 교사 PC가 넘긴 장면 그대로").toBe(LABELS[3]);
  // 다시 누르면 지금 장면에서 이어서 넘어가요
  await nextBtn(ph.page).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[4]);
  await expect.poll(() => same3(pc, ph)).toBe(LABELS[4]);
  expect(errors.filter((e) => !/net::/.test(e))).toEqual([]);
});

test("늦게 닿는 휴대폰 조작: 교사 PC가 그 사이 아무것도 안 해도, 몇 초 넘게 보내지 못한 조작은 버려요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await blockSending(ph.ctx);
  await nextBtn(ph.page).click();
  await expect(ph.page.locator(".thumb-nav .warn-note")).toContainText("보내지 못했어요", { timeout: 15000 });
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  // 수업이 그대로인 채 10초 뒤에 길이 열려도, 그 ‘다음’은 적용하지 않아요
  await pc.page.waitForTimeout(10000);
  await unblockSending(ph.ctx);
  await pc.page.waitForTimeout(5000);
  expect(await same3(pc, ph)).toBe(LABELS[0]);
  expect(errors.filter((e) => !/net::/.test(e))).toEqual([]);
});

// ---------- 반영 시간: 한쪽에서 누른 순간부터 반대쪽 화면 글자가 바뀐 순간까지(두 브라우저 안의 시각으로 재요) ----------
const stats = (a) => {
  const s = a.slice().sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { n: s.length, avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length), p50: q(0.5), p90: q(0.9), p95: q(0.95), max: s[s.length - 1], over300: s.filter((x) => x > 300).length, over1000: s.filter((x) => x > 1000).length };
};
const showStats = (x) => "평균 " + x.avg + " · 중간 " + x.p50 + " · 90% " + x.p90 + " · 95% " + x.p95 + " · 가장 느림 " + x.max + " ms (" + x.n + "번 중 300ms 넘음 " + x.over300 + ", 1초 넘음 " + x.over1000 + ")";
// 글자가 바뀔 때마다 그 페이지 안의 시각을 적어 두는 관찰자
const observe = (page, sel) => page.evaluate((sel) => {
  window.__seen = []; let last = null;
  const look = () => { const el = document.querySelector(sel), t = el ? el.textContent.trim() : ""; if (t !== last) { last = t; window.__seen.push([t, Date.now()]); } };
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true });
  look();
}, sel);
const pressAt = (page, sel) => page.evaluate((sel) => { const b = document.querySelector(sel); const t = Date.now(); b.click(); return t; }, sel);
const seenAt = (page, label, since) => page.evaluate(([label, since]) => { const hit = window.__seen.find(([t, at]) => t === label && at >= since); return hit ? hit[1] : 0; }, [label, since]);

test("반영 시간: 휴대폰 → 수업 화면 · 교사 화면, 교사 PC → 휴대폰을 30번씩 재요(평균과 느린 경우를 나눠 봐요)", async ({ browser }) => {
  test.setTimeout(300000);
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await observe(pc.stage, ".stage-bar .chip");
  await observe(pc.page, ".js-cur-label");
  await observe(ph.page, ".js-cur-label");
  const toStage = [], toPc = [], toPhone = [];
  // 실제 수업처럼 누르는 사이를 바꿔 가며(0.2초 · 0.2초 · 1초 · 3초)
  const gaps = [200, 200, 1000, 3000];
  let at = 0, dir = 1;
  const step = async (from, k) => {
    if (at + dir < 0 || at + dir > LABELS.length - 1) dir = -dir;
    const next = at + dir, label = LABELS[next], act = dir > 0 ? "next" : "prev";
    const t = await pressAt(from === "phone" ? ph.page : pc.page, (from === "phone" ? ".thumb-nav" : ".pv-bar") + ' [data-act="' + act + '"]');
    const lands = from === "phone" ? [[pc.stage, toStage], [pc.page, toPc]] : [[ph.page, toPhone]];
    for (const [page, list] of lands) {
      await expect.poll(() => seenAt(page, label, t), { timeout: 15000 }).toBeGreaterThan(0);
      list.push((await seenAt(page, label, t)) - t);
    }
    at = next;
    await ph.page.waitForTimeout(gaps[k % gaps.length]);
  };
  for (let k = 0; k < 30; k++) await step("phone", k);
  for (let k = 0; k < 30; k++) await step("pc", k);
  const s1 = stats(toStage), s2 = stats(toPc), s3 = stats(toPhone);
  test.info().annotations.push({ type: "휴대폰 → 수업 화면(TV)", description: showStats(s1) + " · 하나씩: " + toStage.join(",") });
  test.info().annotations.push({ type: "휴대폰 → 교사 화면", description: showStats(s2) });
  test.info().annotations.push({ type: "교사 PC → 휴대폰", description: showStats(s3) + " · 하나씩: " + toPhone.join(",") });
  // 에뮬레이터(이 컴퓨터 안) 기준. 실제 Firebase(서울)에서는 인터넷 왕복 시간이 더해져요
  expect(s1.p50, "휴대폰 → 수업 화면 중간값").toBeLessThan(500);
  expect(s3.p50, "교사 PC → 휴대폰 중간값").toBeLessThan(500);
  expect(Math.max(s1.max, s3.max), "가장 느린 경우").toBeLessThan(3000);
  expect(errors).toEqual([]);
});

test("수업 화면 영상: 휴대폰 신호등 · 교사 PC 연결 끊김과 다시 잇기로 서버 소식이 오가도 영상은 처음부터 다시 시작하지 않고, 휴대폰으로 넘기면 원래대로 바뀌어요", async ({ browser }) => {
  const errors = [], who = email("video");
  const pc = await device(browser, PC, errors);
  const hits = await fakeMedia(pc.ctx);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  await addMaterial(pc.page, "물이 끓는 영상", VIDEO);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await showOnStage(pc.page, "물이 끓는 영상");
  await expect(frameEl(stage)).toHaveCount(1);
  await expect.poll(() => born(stage)).not.toBeNull();
  await mark(stage);
  const first = await born(stage), t0 = Date.now();
  await pc.page.evaluate(() => { document.querySelector(".pv-head").__navi = "그대로"; });
  // 휴대폰 신호등: 서버를 거쳐 교사 PC에 와요
  await ph.page.locator(".thumb-nav .sig.s-green").click();
  await expect(pc.page.locator('.sig.s-green[aria-pressed="true"]').first()).toBeVisible();
  await ph.page.locator(".thumb-nav .sig.s-red").click();
  await expect(pc.page.locator('.sig.s-red[aria-pressed="true"]').first()).toBeVisible();
  // 교사 PC 인터넷이 끊겼다가 3초 뒤 다시 이어져요: 수업 화면의 연결 표시만 바뀌어요
  await pc.ctx.setOffline(true);
  await expect(stage.locator(".stage-bar .chip.warn")).toBeVisible({ timeout: 15000 });
  await pc.page.waitForTimeout(3000);
  await pc.ctx.setOffline(false);
  await expect(stage.locator(".stage-bar .chip.live")).toBeVisible({ timeout: 20000 });
  // 다시 이어진 뒤에도 휴대폰 · PC 신호가 오가요. 그리고 30초가 넘을 때까지(그 사이 20초마다 하는 다시 그리기도 지나가요)
  await ph.page.locator(".thumb-nav .sig.s-yellow").click();
  await expect(pc.page.locator('.sig.s-yellow[aria-pressed="true"]').first()).toBeVisible();
  await pc.page.keyboard.press("3");
  await expect(ph.page.locator(".thumb-nav .sig.s-green")).toHaveAttribute("aria-pressed", "true");
  await pc.page.waitForTimeout(Math.max(1500, 31000 - (Date.now() - t0)));
  expect(await pc.page.evaluate(() => (document.querySelector(".pv-head") || {}).__navi || ""), "그동안 교사 화면이 한 번도 다시 그려지지 않았어요").toBe("");
  expect(hits.length, "영상 페이지를 다시 불렀어요(처음부터 다시 시작)").toBe(1);
  expect(await marked(stage), "영상 칸이 새로 만들어졌어요").toBe("처음 것");
  expect(await born(stage)).toBe(first);
  expect(await played(stage), "영상이 30초 넘게 이어서 재생되지 않았어요").toBeGreaterThanOrEqual(30);
  // 휴대폰의 큰 단추는 자료가 떠 있으면 ‘슬라이드로 돌아가기’예요(예전 그대로): 영상이 내려가고, 그다음 ‘다음’으로 다음 장면
  await ph.page.getByRole("button", { name: "슬라이드로 돌아가기" }).click();
  await expect(frameEl(stage)).toHaveCount(0);
  await expect(stageLabel(stage)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  expect(errors).toEqual([]);
});

// 영상 재생 제어(2026-11-11, docs/VIDEO.md): 휴대폰 조작은 서버를 거쳐 PC에 와도 영상을 다시 불러오지 않고, 휴대폰으로 넘긴 것도 PC에서 5초 안에 되돌려요
test("영상 장면 + 휴대폰: 재생 중 휴대폰 신호등에도 영상은 이어서 재생되고, 휴대폰으로 넘기면 PC에 5초 되돌리기가 떠서 되돌리면 휴대폰 · 수업 화면도 그 장면으로, 영상은 멈춘 곳에서 멈춘 채예요", async ({ browser }) => {
  const errors = [], who = email("video-scene");
  const pc = await device(browser, PC, errors);
  const hits = await fakeYouTube(pc.ctx);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  await videoLesson(pc.page, V.ok);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText("영상 장면");
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(curLabel(ph.page)).toHaveText("영상 장면");
  // 휴대폰에는 영상 대신 카드(첫 ‘다음’에 재생, 일시정지는 교사 PC에서)
  await expect(ph.page.locator(".rm-tv")).toContainText("첫 ‘다음’에 재생");
  await expect(ph.page.locator("iframe")).toHaveCount(0);
  await expect(pc.page.locator('[data-act="vid-play"]')).toBeEnabled();
  expect(await pstate(stage)).toBe(-1);
  const first = await pborn(stage);
  // 휴대폰의 첫 ‘다음’은 영상 재생(2026-11-12 정책): 휴대폰 큰 단추가 ‘영상 재생’이고, 누르면 PC가 수업 화면 영상을 틀어요. 장면은 그대로
  const phBig = ph.page.locator(".thumb-nav .nav-main");
  await expect(phBig).toContainText("영상 재생");
  await nextBtn(ph.page).click();
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(pc.page)).toHaveText("영상 장면");
  await expect(curLabel(ph.page)).toHaveText("영상 장면");
  await expect(phBig).toContainText("둘째 장면");
  // 휴대폰 신호등 두 번: 서버를 거쳐 PC에 와도 영상은 그대로 재생 중
  await ph.page.locator(".thumb-nav .sig.s-green").click();
  await expect(pc.page.locator('.sig.s-green[aria-pressed="true"]').first()).toBeVisible();
  await ph.page.locator(".thumb-nav .sig.s-yellow").click();
  await expect(pc.page.locator('.sig.s-yellow[aria-pressed="true"]').first()).toBeVisible();
  await expect.poll(() => ptime(stage)).toBeGreaterThanOrEqual(2);
  expect(hits.length, "영상 페이지를 다시 불렀어요").toBe(1);
  expect(await pborn(stage)).toBe(first);
  expect(await pstate(stage)).toBe(1);
  // 휴대폰으로 넘기기 → PC에 되돌리기 → 세 화면이 영상 장면으로, 영상은 멈춘 곳에서 멈춘 채
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText("둘째 장면");
  await expect(curLabel(pc.page)).toHaveText("둘째 장면");
  const undo = pc.page.locator(".undo-move");
  await expect(undo.getByRole("button", { name: /이전 장면으로 되돌리기/ })).toBeVisible();
  await undo.getByRole("button", { name: /이전 장면으로 되돌리기/ }).click();
  await expect(curLabel(pc.page)).toHaveText("영상 장면");
  await expect(curLabel(ph.page)).toHaveText("영상 장면");
  await expect(chip(stage)).toHaveText("영상 장면");
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=[2-9]/);
  await expect(bar(pc.page)).toContainText("일시정지");
  await pc.page.waitForTimeout(1200);
  expect(await pstate(stage)).toBe(-1);
  // 되돌아온 영상 장면: 휴대폰 큰 단추는 다시 ‘영상 재생’, 누르면 멈춘 곳부터 재생, 그다음은 다음 장면
  await expect(phBig).toContainText("영상 재생");
  await nextBtn(ph.page).click();
  await expect.poll(() => pstate(stage)).toBe(1);
  expect(await ptime(stage)).toBeGreaterThanOrEqual(2);
  await expect(phBig).toContainText("둘째 장면");
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText("둘째 장면");
  await expect(curLabel(ph.page)).toHaveText("둘째 장면");
  expect(errors).toEqual([]);
});

test("한 화면 모드: 교사 PC 막대에 ‘수업 끝내기’가 있고, 휴대폰으로 넘기기 · 끝내기도 예전처럼 PC가 해서 기록은 PC에 1건이에요", async ({ browser }) => {
  const errors = [], who = email("onescreen");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await pc.page.locator("#pv").uncheck();
  await readDoc(pc.page, "lessons/settings", { presenter: false });
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  let popups = 0;
  pc.page.on("popup", () => popups++);
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  const bar = pc.page.locator(".stage-bar"), endBtn = bar.locator('[data-act="end-ask"]');
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[0]);
  await expect(endBtn).toHaveText("수업 끝내기");
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(bar.locator(".chip").first()).toHaveText(LABELS[1]);
  // PC 막대에서 확인 줄을 열었다가 ‘계속 수업’: 수업은 그대로, 휴대폰도 그대로
  await endBtn.click();
  await pc.page.locator(".end-confirm").getByRole("button", { name: "계속 수업" }).click();
  await expect(pc.page.locator(".end-confirm")).toHaveCount(0);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  // 휴대폰에서 마지막 장면까지 가서 끝내기 → 교사 PC가 끝내고 기록을 남겨요
  for (let i = 2; i < LABELS.length; i++) {
    await nextBtn(ph.page).click();
    await expect(bar.locator(".chip").first()).toHaveText(LABELS[i]);
  }
  await finishLesson(ph.page);
  await expect(pc.page.locator(".stage-msg")).toContainText("수업 끝");
  await expect(endBtn).toHaveCount(0);
  await expect(ph.page.locator(".memo-sheet")).toContainText("교사 PC가 이 수업의 기록을 만들었어요");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  expect(await localRecords(ph.page)).toEqual([]);
  expect(popups, "한 화면 모드인데 수업 화면 창이 따로 열렸어요").toBe(0);
  expect(errors).toEqual([]);
});

// 휴대폰의 수업 끝 화면(2026-11-22, docs/STABILITY.md 4절): 휴대폰은 기록을 읽지도 쓰지도 않아요. 그래서 기록이 저장됐는지를 휴대폰이
// 단정하지 않고(‘저장했어요’라고 하지 않아요), 누를 수 없는 ‘기록을 저장하는 중…’ 단추도 남기지 않아요. 저장 결과는 교사 PC가 말해요
const phoneSheet = (ph) => ph.page.locator(".memo-sheet");
async function phoneNeutral(ph, where) {
  const sheet = phoneSheet(ph);
  await expect(sheet, where).toContainText("교사 PC가 이 수업의 기록을 만들었어요", { timeout: 20000 });
  await expect(sheet, where).toContainText("저장됐는지는 교사 PC 화면에서 확인해 주세요");
  await expect(sheet.locator(".rec-go"), where + ": 휴대폰에 기록 단추").toHaveCount(0);
  await expect(sheet, where).not.toContainText("기록을 저장하는 중");
  await expect(sheet, where + ": 휴대폰이 저장을 단정해요").not.toContainText("저장했어요");
}

test("수업 끝 · 휴대폰: 기록 저장을 단정하지 않고 ‘기록을 저장하는 중…’ 단추가 남지 않아요. 새로고침 · 끊김 · 교사 PC 로그아웃 뒤에도 같고, 휴대폰 로그아웃이면 끝 화면이 사라져요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[1]);
  await finishLesson(pc.page);
  // 교사 PC는 그대로: 서버가 확인한 뒤 ‘계정에 저장했어요’, 주 단추 ‘수업 기록 보기’, 이 브라우저에 1건
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 20000 });
  await expect(pc.page.locator(".memo-sheet .rec-go")).toHaveText(/수업 기록 보기/);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await phoneNeutral(ph, "끝난 직후");
  await ph.page.reload();
  await phoneNeutral(ph, "휴대폰 새로고침 뒤");
  await ph.ctx.setOffline(true);
  await ph.page.waitForTimeout(1500);
  await phoneNeutral(ph, "휴대폰이 끊긴 동안");
  await ph.ctx.setOffline(false);
  await ph.page.waitForTimeout(1500);
  await phoneNeutral(ph, "휴대폰이 다시 이어진 뒤");
  // 교사 PC가 기록을 확인하고 로그아웃(공용 PC 안내 줄): 계정의 수업 끝 상태는 그대로라 휴대폰도 같은 말
  await Promise.all([pc.page.waitForEvent("load"), pc.page.locator('.memo-sheet [data-act="logout"]').click()]);
  await ph.page.waitForTimeout(1500);
  await phoneNeutral(ph, "교사 PC 로그아웃 뒤");
  // 휴대폰 로그아웃: 계정과 끊기니 수업 끝 화면도 사라져요(휴대폰 브라우저에는 기록이 없어요)
  await Promise.all([ph.page.waitForEvent("load"), ph.page.evaluate(() => window.naviAuth.signOut()).catch(() => {})]);
  await expect(phoneSheet(ph)).toHaveCount(0);
  expect(await localRecords(ph.page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("수업 끝 · 교사 PC가 끊긴 채 끝내기: PC는 ‘아직 계정에 저장하지 못했어요’ → 이어지면 ‘계정에 저장했어요’, 휴대폰은 그동안 끝났다고 하지 않고 이어진 뒤에도 저장을 단정하지 않아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await readDoc(pc.page, "sessions/s" + pc.url.match(/#remote-(\d{4})/)[1], { started: true });
  await pc.ctx.setOffline(true);
  await finishLesson(pc.page);
  // 교사 PC의 저장 상태: 이 브라우저에는 저장, 계정은 아직
  await expect(pc.page.locator(".memo-sheet .warn-note")).toContainText("인터넷이 끊겨 아직 계정에 저장하지 못했어요", { timeout: 15000 });
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  // 휴대폰은 PC의 끝내기를 아직 받지 못했어요: 끝 화면도, 저장했다는 말도 없어요
  await ph.page.waitForTimeout(1500);
  await expect(phoneSheet(ph)).toHaveCount(0);
  await expect(ph.page.locator("body")).not.toContainText("저장했어요");
  // 다시 이어지면: PC는 서버가 받은 뒤 ‘계정에 저장했어요’, 휴대폰은 끝 화면 + 확인은 PC에서
  await pc.ctx.setOffline(false);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 30000 });
  await phoneNeutral(ph, "교사 PC가 다시 이어진 뒤");
  expect((await localRecords(pc.page)).length, "기록은 한 건").toBe(1);
  expect(await localRecords(ph.page)).toEqual([]);
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::/.test(e))).toEqual([]);
});
