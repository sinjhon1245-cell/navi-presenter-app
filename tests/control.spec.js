// 수업 안정성: 여러 PC · 창, 수업 중 PIN, 교사별 로컬 기록, PC가 끊겼을 때 끝내기 (docs/CLASS-STABILITY.md)
// 실제 브라우저 여러 개와 Firebase 에뮬레이터(가짜 프로젝트 demo-navi, 가짜 계정)로 그대로 재현해요. 실행: npm run test:emu
import { test, expect } from "@playwright/test";
import { LABELS, DATA, watch, curLabel, nextBtn, localRecords, finishLesson, V, fakeYouTube, pstate, chip, frame, videoLesson, toFlow } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, teacherStarts, phoneJoins, stageLabel, uidAfterSignIn } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const uidOf = (pc) => pc.page.evaluate(async () => (await window.claude.use("db")).account.uid);
const pinOf = (url) => url.match(/#remote-(\d{4})/)[1];
// 에뮬레이터에서만(관리자 권한): 그 교사의 문서를 있는 그대로 읽어요. updateTime까지 같으면 아무도 쓰지 않은 거예요
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
const adminDoc = async (p) => { const r = await fetch(docUrl(p), { headers: { Authorization: "Bearer owner" } }); return r.ok ? r.json() : null; };
const classDocs = async (uid, pin) => { const out = {}; for (const p of ["lessons/hub", "lessons/deck", "lessons/settings", "sessions/s" + pin]) out[p] = await adminDoc("teachers/" + uid + "/" + p); return out; };
const field = (d, k) => { const v = d && d.fields && d.fields[k]; return v ? Object.values(v)[0] : undefined; };
const hubOf = async (uid) => adminDoc("teachers/" + uid + "/lessons/hub");
// 에뮬레이터에서만: 한 칸만 바꿔요(강제 종료로 ‘닫힘’ 소식이 못 간 PC를 만들 때)
const adminSet = (p, k, value) => fetch(docUrl(p) + "?updateMask.fieldPaths=" + k, { method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields: { [k]: value } }) });

// 같은 계정으로 다른 PC(다른 브라우저)를 열고 로그인만 해요
async function otherPc(browser, errors, who) {
  const b = await device(browser, PC, errors);
  await b.page.goto("/");
  await signIn(b.page, who);
  await pcLinked(b.page);
  return b;
}
const ctlBox = (pc) => pc.page.locator(".ctl-offer");
const take = async (pc) => {
  await ctlBox(pc).getByRole("button", { name: /이 기기에서 이어서 진행하기/ }).click();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), ctlBox(pc).getByRole("button", { name: "이어서 진행", exact: true }).click()]);
  return stage;
};
// PIN 휴대폰: 교사 PC가 연결 창을 열고, QR로 요청하고, 허용
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
// 교사 PC가 로그인만(구글로 가입한 교사는 누구나 PIN을 써요, 2026-11-11)
async function teacherReady(browser, errors, who) {
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  return pc;
}
const startClass = async (pc, errors) => {
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  pc.stage = stage;
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  return stage;
};

test("수업 준비 중 다른 PC로 로그인: 계정의 수업 내용 · 준비 상태 · 설정 · 세션이 한 글자도 바뀌지 않고, 두 번째 PC는 그 뜻을 말해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await device(browser, PC, errors);
  await a.page.goto("/");
  await signIn(a.page, who);
  await pcLinked(a.page);
  const url = await qrUrl(a.page), pin = pinOf(url), uid = await uidOf(a);
  // A가 첫 예시가 아닌 다른 수업을 골라 준비해요
  const other = DATA.lessons.find((L) => L.id === "ex-m3-fraction");
  await a.page.getByRole("tab", { name: "예시 수업" }).click();
  await a.page.locator('.lcard[data-v="ex-m3-fraction"]').click();
  await a.page.locator('.lib-sum [data-act="lib-open"], .lib-sum [data-act="lib-close"]').first().click();
  await expect.poll(async () => field((await classDocs(uid, pin))["lessons/deck"], "lessonId")).toBe("ex-m3-fraction");
  await a.page.waitForTimeout(800);
  const before = await classDocs(uid, pin);
  // B가 같은 계정으로 로그인해요
  const b = await otherPc(browser, errors, who);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await expect(ctlBox(b)).toContainText(other.title);
  await b.page.waitForTimeout(1200);
  expect(await classDocs(uid, pin), "로그인만으로는 아무 문서도 쓰이지 않아요").toEqual(before);
  expect(await b.page.evaluate(() => window.__naviWrites || 0), "B가 서버에 쓴 횟수").toBe(0);
  // B가 자기 브라우저에서 다른 수업을 골라도(자기 최근 수업이 생겨도) 다시 열어도 계정의 수업은 그대로예요
  await b.page.getByRole("tab", { name: "예시 수업" }).click();
  await b.page.locator('.lcard[data-v="ex-s5-ecosystem"]').click();
  await b.page.locator('.lib-sum [data-act="lib-open"], .lib-sum [data-act="lib-close"]').first().click();
  await b.page.waitForTimeout(900);
  await b.page.reload();
  await pcLinked(b.page);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await b.page.waitForTimeout(1200);
  expect(await classDocs(uid, pin), "다시 열어도 그대로예요").toEqual(before);
  // A는 그대로 맡고 있어요
  await a.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(a.page.locator(".ctl-offer")).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

// 영상 장면의 ‘다음’ 두 단계(2026-11-12, docs/VIDEO.md 1-1): PIN 휴대폰은 세션을 쓰지 못해서 명령(vid)을 남기고, 교사 PC가 검사해 적용해요
test("PIN 휴대폰: 영상 장면의 첫 ‘다음’은 수업 화면 영상 재생(장면 그대로), 둘째 ‘다음’은 다음 장면이에요. 교사 PC와 같은 흐름이에요", async ({ browser }) => {
  const errors = [], who = email("pin-video");
  const a = await teacherReady(browser, errors, who);
  await fakeYouTube(a.ctx);
  await videoLesson(a.page, V.ok);
  const ph = await pinPhone(browser, errors, a);
  await expect(ph.page.locator(".checks")).toContainText("켜져 있어요");
  const [stage] = await Promise.all([a.page.waitForEvent("popup"), a.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(a.page)).toHaveText("영상 장면");
  await expect(curLabel(ph.page)).toHaveText("영상 장면");
  await expect(frame(stage)).toHaveCount(1);
  await expect(a.page.locator('[data-act="vid-play"]')).toBeEnabled();
  expect(await pstate(stage)).toBe(-1);
  const big = ph.page.locator(".thumb-nav .nav-main");
  await expect(big).toContainText("영상 재생");
  await nextBtn(ph.page).click();
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(a.page)).toHaveText("영상 장면");
  await expect(chip(stage)).toHaveText("영상 장면");
  await expect(big).toContainText("둘째 장면");
  await nextBtn(ph.page).click();
  await expect(chip(stage)).toHaveText("둘째 장면");
  await expect(curLabel(a.page)).toHaveText("둘째 장면");
  await expect(curLabel(ph.page)).toHaveText("둘째 장면");
  // 재생 중이었으니 교사 PC에 5초 되돌리기
  await expect(a.page.locator(".undo-move")).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("PC A 수업 중 PC B 접속: run · 준비 상태 · 수업 · 세션이 그대로이고 PIN 휴대폰은 끊기지 않아요. B가 있어도 A와 휴대폰은 그대로 수업해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, a);
  await expect(ph.page.locator(".checks")).toContainText("켜져 있어요");
  await startClass(a, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  const pin = await a.page.evaluate(async () => { const db = await window.claude.use("db"); return new Promise((res) => { const off = db.doc("lessons/settings").onSnapshot((s) => { if (s.exists) { off(); res(s.data().pin); } }); }); });
  await a.page.waitForTimeout(800);
  const before = await classDocs(a.uid, pin);
  const run = field(before["lessons/hub"], "run");
  expect(field(before["sessions/s" + pin], "run")).toBe(run);
  // B가 들어와요
  const b = await otherPc(browser, errors, who);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 진행하고 있어요");
  await expect(ctlBox(b)).toContainText("1 / " + LABELS.length);
  await expect(ctlBox(b).getByRole("button", { name: "현재 수업 확인하기" })).toBeVisible();
  await expect(ctlBox(b).getByRole("button", { name: /이 기기에서 이어서 진행하기/ })).toBeVisible();
  await expect(ctlBox(b).getByRole("button", { name: "새 수업 준비하기" })).toBeVisible();
  await expect(b.page.getByRole("button", { name: "기록 없이 버리기" })).toHaveCount(0);
  await b.page.waitForTimeout(1200);
  expect(await classDocs(a.uid, pin), "B가 열리고 로그인한 것만으로는 아무 문서도 쓰이지 않아요").toEqual(before);
  expect(await b.page.evaluate(() => window.__naviWrites || 0)).toBe(0);
  // PC B 접속 중 PC A 조작: A의 넘기기가 수업 화면과 휴대폰에 그대로 가고, B는 따라 읽어요
  await nextBtn(a.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[1]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await expect(ctlBox(b)).toContainText("2 / " + LABELS.length);
  // PIN 휴대폰의 명령도 A가 적용해요(B는 받지 않아요)
  await nextBtn(ph.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[2]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  // 현재 수업 확인하기: 읽기 전용이고, 수업을 바꿀 단추가 없어요
  await ctlBox(b).getByRole("button", { name: "현재 수업 확인하기" }).click();
  await expect(b.page.locator(".watch")).toContainText("읽기 전용");
  await expect(b.page.locator(".js-watch-cur")).toHaveText(LABELS[2]);
  await expect(b.page.locator('.watch [data-act="next"], .watch [data-act="prev"], .watch [data-act="end"], .watch [data-act="signal"]')).toHaveCount(0);
  await nextBtn(a.page).click();
  await expect(b.page.locator(".js-watch-cur")).toHaveText(LABELS[3]);
  const w = await b.page.evaluate(() => window.__naviWrites || 0);
  expect(w, "확인만 하는 동안 B가 쓴 횟수").toBe(0);
  // B를 닫아도 run은 그대로이고 PIN 휴대폰은 수업을 계속해요
  await b.ctx.close();
  await a.page.waitForTimeout(800);
  expect(field(await hubOf(a.uid), "run")).toBe(run);
  expect(field(await hubOf(a.uid), "pc")).toBe(field(before["lessons/hub"], "pc"));
  await nextBtn(ph.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[4]);
  expect(real(errors)).toEqual([]);
});

test("수업 전 PIN 휴대폰: 다른 PC를 열어도 끊기지 않고 ‘준비 완료’ 그대로예요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, a);
  await expect(ph.page.locator(".checks")).toContainText("켜져 있어요");
  const run = field(await hubOf(a.uid), "run");
  const b = await otherPc(browser, errors, who);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await ph.page.waitForTimeout(1500);
  await expect(ph.page.locator(".checks")).toContainText("켜져 있어요");
  await expect(ph.page.locator(".warn-note")).toHaveCount(0);
  expect(field(await hubOf(a.uid), "run")).toBe(run);
  // B를 닫아도 그대로이고, A가 시작하면 그 휴대폰이 함께 시작해요
  await b.ctx.close();
  await startClass(a, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

test("PC B에서 제어권 이전: 확인 뒤 B가 이어받고 A는 읽기 전용이 돼요. run과 PIN 휴대폰은 그대로, 기록은 B에 한 번만 남아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, a);
  await startClass(a, errors);
  await nextBtn(a.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  const run = field(await hubOf(a.uid), "run");
  const b = await otherPc(browser, errors, who);
  // 한 번 눌러서는 넘어가지 않아요(확인 줄)
  await ctlBox(b).getByRole("button", { name: /이 기기에서 이어서 진행하기/ }).click();
  await expect(ctlBox(b)).toContainText("다른 기기는 읽기 전용이 돼요");
  await ctlBox(b).getByRole("button", { name: "취소" }).click();
  await expect(curLabel(a.page)).toHaveText(LABELS[1]);
  const stageB = await take(b);
  watch(stageB, errors);
  await expect(curLabel(b.page)).toHaveText(LABELS[1]);
  await expect(stageLabel(stageB)).toHaveText(LABELS[1]);
  // A: 진행 화면에서 빠지고, 학생 창은 넘어갔다고 말해요
  await expect(ctlBox(a)).toContainText("다른 기기에서 수업을 진행하고 있어요");
  await expect(ctlBox(a)).toContainText("이 기기의 수업이 다른 기기로 넘어갔어요");
  await expect(curLabel(a.page)).toHaveCount(0);
  await expect(a.stage.locator(".stage-msg")).toContainText("다른 기기에서 수업을 진행하고 있어요");
  // run은 그대로, 맡은 PC만 바뀌어요. PIN 휴대폰은 끊기지 않고 이제 B가 명령을 적용해요
  expect(field(await hubOf(a.uid), "run")).toBe(run);
  await nextBtn(ph.page).click();
  await expect(stageLabel(stageB)).toHaveText(LABELS[2]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  await expect(ctlBox(a)).toContainText("3 / " + LABELS.length);
  // 끝내면 맡은 B에만 기록이 하나 남아요
  for (let i = 3; i < LABELS.length; i++) { await nextBtn(b.page).click(); await expect(stageLabel(stageB)).toHaveText(LABELS[i]); }
  await finishLesson(b.page);
  await expect(stageB.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(b.page)).length).toBe(1);
  await a.page.waitForTimeout(800);
  expect((await localRecords(a.page)).length, "넘겨준 A에는 기록이 없어요").toBe(0);
  await expect(ctlBox(a)).not.toContainText("수업을 진행하고 있어요");
  expect(real(errors)).toEqual([]);
});

test("두 PC가 같은 순간 이어받기: 서버 거래가 한쪽만 받아요. 진 쪽은 진행 화면으로 가지 않고 그 뜻을 말해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherStarts(browser, errors, who);
  const b = await otherPc(browser, errors, who), c = await otherPc(browser, errors, who);
  const open = async (pc) => { await ctlBox(pc).getByRole("button", { name: /이 기기에서 이어서 진행하기/ }).click(); await expect(ctlBox(pc).getByRole("button", { name: "이어서 진행", exact: true })).toBeVisible(); };
  await open(b); await open(c);
  const press = (pc) => pc.page.evaluate(() => { document.querySelector('.ctl-offer [data-act="ctl-take"]').click(); });
  await Promise.all([press(b), press(c)]);
  await expect.poll(async () => (await curLabel(b.page).count()) + (await curLabel(c.page).count())).toBe(1);
  await b.page.waitForTimeout(1200);
  const uid = await uidOf(a), holder = field(await hubOf(uid), "pc");
  const ids = await Promise.all([b, c].map((pc) => pc.page.evaluate(() => sessionStorage.getItem("navi-tab"))));
  expect(ids.filter((id) => holder.endsWith("-" + id)).length, "맡은 창은 정확히 하나").toBe(1);
  const lost = (await curLabel(b.page).count()) ? c : b;
  await expect(lost.page.locator(".ctl-msg")).toContainText("방금 다른 기기가 먼저 맡았어요");
  await expect(curLabel(a.page)).toHaveCount(0);
  expect(real(errors).filter((e) => !/popup/.test(e))).toEqual([]);
});

test("다른 PC의 ‘기록 없이 버리기’: 같은 브라우저의 두 번째 창에도 없고, 서버 거래도 맡지 않은 창의 쓰기를 거절해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherStarts(browser, errors, who);
  const pin = pinOf(a.url), uid = await uidOf(a);
  await nextBtn(a.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[1]);
  // 같은 브라우저의 새 창(로그인 유지가 기본이라 같은 계정): 이 브라우저에 수업 사본(navi-run)이 있어도 버리기 · 끝내기를 보여 주지 않아요
  const tab = await a.ctx.newPage();
  watch(tab, errors);
  await tab.goto("/");
  await expect(tab.locator(".ctl-offer")).toContainText("다른 기기에서 수업을 진행하고 있어요");
  await expect(tab.getByRole("button", { name: "기록 없이 버리기" })).toHaveCount(0);
  await expect(tab.getByRole("button", { name: /기록 저장하고 끝내기/ })).toHaveCount(0);
  // 다른 PC
  const b = await otherPc(browser, errors, who);
  await expect(b.page.getByRole("button", { name: "기록 없이 버리기" })).toHaveCount(0);
  // 화면을 건너뛰고 코드로 해도: 맡지 않은 창의 쓰기는 서버 거래가 거절해요
  const tries = await b.page.evaluate(async (path) => {
    const db = await window.claude.use("db"), mine = "x-" + sessionStorage.getItem("navi-tab");
    return db.held(mine, [{ path, op: "set", data: { v: 5, started: false, ended: false } }]).then(() => "들어감", (e) => e.code);
  }, "sessions/s" + pin);
  expect(tries).toBe("lost");
  const s = await adminDoc("teachers/" + uid + "/sessions/s" + pin);
  expect(field(s, "started")).toBe(true);
  expect(field(s, "cur")).toBeTruthy();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[1]);
  await nextBtn(a.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[2]);
  expect(real(errors)).toEqual([]);
});

test("끊긴 PC의 오래된 쓰기: A가 끊긴 사이 넘긴 장면은 B가 이어받은 뒤 서버에 닿지 않고, A가 돌아와도 B의 수업이 그대로예요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherStarts(browser, errors, who);
  const b = await otherPc(browser, errors, who);
  await a.ctx.setOffline(true);
  await expect(a.page.locator(".chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  // 끊긴 A는 이 기기에서 계속 넘겨요(서버에는 아직 닿지 않아요)
  await nextBtn(a.page).click();
  await nextBtn(a.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[2]);
  // B가 이어받고 한 장면 넘겨요
  const stageB = await take(b);
  watch(stageB, errors);
  await expect(curLabel(b.page)).toHaveText(LABELS[0]);
  await nextBtn(b.page).click();
  await expect(stageLabel(stageB)).toHaveText(LABELS[1]);
  // A가 돌아와요: A의 쓰기는 버려지고 A는 읽기 전용이 돼요. B의 장면은 그대로예요
  await a.ctx.setOffline(false);
  await expect(ctlBox(a)).toContainText("다른 기기에서 수업을 진행하고 있어요", { timeout: 30000 });
  await a.page.waitForTimeout(2500);
  await expect(stageLabel(stageB)).toHaveText(LABELS[1]);
  await expect(curLabel(b.page)).toHaveText(LABELS[1]);
  await expect(ctlBox(a)).toContainText("2 / " + LABELS.length);
  expect(real(errors)).toEqual([]);
});

test("수업 준비 중인 다른 PC가 있어도 시작은 확인 뒤에만, 다른 PC의 수업이 진행 중이면 시작하지 못해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await device(browser, PC, errors);
  await a.page.goto("/");
  await signIn(a.page, who);
  await pcLinked(a.page);
  await qrUrl(a.page);
  const b = await otherPc(browser, errors, who);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await toFlow(b.page);
  // A가 수업을 시작해요 → B의 ‘수업 시작’은 막혀요
  await startClass(a, errors);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 진행하고 있어요");
  await ctlBox(b).getByRole("button", { name: "새 수업 준비하기" }).click();
  await expect(ctlBox(b)).toContainText("이 브라우저에만 남아요");
  await b.page.getByRole("button", { name: "수업 시작" }).click();
  await expect(b.page.locator(".ctl-msg")).toContainText("다른 기기의 수업이 끝나면 시작할 수 있어요");
  await expect(curLabel(b.page)).toHaveCount(0);
  await expect(curLabel(a.page)).toHaveText(LABELS[0]);
  // A가 끝낸 뒤에는 B가 시작할 수 있어요(한 번 더 확인)
  for (let i = 1; i < LABELS.length; i++) await nextBtn(a.page).click();
  await finishLesson(a.page);
  await expect(a.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await b.page.getByRole("button", { name: "수업 시작" }).click();
  await expect(ctlBox(b)).toContainText("다른 기기의 준비는 멈춰요");
  const [stageB] = await Promise.all([b.page.waitForEvent("popup"), ctlBox(b).getByRole("button", { name: "이 기기에서 시작" }).click()]);
  watch(stageB, errors);
  await expect(curLabel(b.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(stageB)).toHaveText(LABELS[0]);
  // A의 끝난 수업 화면은 교사가 떠날 때까지 그대로예요
  await expect(a.page.locator(".memo-sheet")).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("같은 창을 새로고침하거나 강제로 닫은 뒤 다시 열면 ‘다른 기기’가 아니라 이 브라우저의 끝나지 않은 수업이에요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherStarts(browser, errors, who);
  const uid = await uidOf(a);
  await nextBtn(a.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[1]);
  await a.page.waitForTimeout(500);
  const pc0 = field(await hubOf(uid), "pc");
  // 새로고침: 같은 창이에요
  await a.page.reload();
  await expect(a.page.locator(".run-offer")).toContainText("끝나지 않은 수업이 있어요");
  await expect(ctlBox(a)).toHaveCount(0);
  await expect.poll(async () => field(await hubOf(uid), "on")).toBe(true);
  expect(field(await hubOf(uid), "pc")).toBe(pc0);
  // 강제 종료: ‘닫힘’ 소식이 서버에 못 갔어요(on이 true로 남아요)
  await a.page.close({ runBeforeUnload: false });
  await adminSet("teachers/" + uid + "/lessons/hub", "on", { booleanValue: true });
  const again = await a.ctx.newPage();
  watch(again, errors);
  await again.goto("/");
  await expect(again.locator(".run-offer")).toContainText("끝나지 않은 수업이 있어요");
  await expect(again.locator(".ctl-offer")).toHaveCount(0);
  const [stage] = await Promise.all([again.waitForEvent("popup"), again.locator(".run-offer").getByRole("button", { name: "이어서 하기" }).click()]);
  watch(stage, errors);
  await expect(curLabel(again)).toHaveText(LABELS[1]);
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  expect(field(await hubOf(uid), "pc")).not.toBe(pc0);
  expect(real(errors)).toEqual([]);
});

test("수업 중 PIN 바꾸기: 막혀 있고 서버 거래도 거절해요. 수업이 끝난 뒤에는 바뀌고, 지난 세션 문서와 기록은 그대로예요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, a);
  await startClass(a, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  const pin = await a.page.evaluate(async () => { const db = await window.claude.use("db"); return new Promise((res) => { const off = db.doc("lessons/settings").onSnapshot((s) => { if (s.exists) { off(); res(s.data().pin); } }); }); });
  await a.page.waitForTimeout(500);
  const before = await classDocs(a.uid, pin);
  // 수업 준비 화면으로 나와서 발표 설정의 단추를 봐요
  await a.page.locator('.pv-head [data-act="more"]').click();
  await a.page.locator('.more-menu [data-act="roles"]').click();
  await a.page.getByRole("tab", { name: "발표 설정" }).click();
  const btn = a.page.getByRole("button", { name: "PIN 바꾸기" });
  await expect(btn).toBeDisabled();
  await expect(a.page.locator(".pin-lock")).toContainText("수업 중에는 PIN을 바꿀 수 없어요");
  // 단추를 건너뛰어 눌러도(화면 코드), 서버 거래를 바로 불러도 바뀌지 않아요
  await a.page.evaluate(() => { const b = [...document.querySelectorAll('[data-act="new-pin"]')][0]; b.disabled = false; b.click(); });
  await a.page.waitForTimeout(800);
  const tab = await a.page.evaluate(() => localStorage.getItem("navi-browser") + "-" + sessionStorage.getItem("navi-tab"));
  const tried = await a.page.evaluate(async ([tab, pin]) => {
    const db = await window.claude.use("db");
    return db.held(tab, [{ path: "lessons/settings", op: "update", data: { pin: "0000" } }], { calm: "s" + pin }).then(() => "들어감", (e) => e.code);
  }, [tab, pin]);
  expect(tried).toBe("live");
  const after = await classDocs(a.uid, pin);
  expect(field(after["lessons/settings"], "pin")).toBe(pin);
  expect(field(after["lessons/hub"], "run")).toBe(field(before["lessons/hub"], "run"));
  expect(field(after["sessions/s" + pin], "started")).toBe(true);
  // 수업과 휴대폰은 그대로 이어져요
  await a.page.getByRole("tab", { name: "수업 준비" }).click();
  await a.page.getByRole("button", { name: "진행 중인 수업으로" }).click();
  await nextBtn(ph.page).click();
  await expect(stageLabel(a.stage)).toHaveText(LABELS[1]);
  // 끝난 뒤에는 바뀌어요. 지난 세션 문서와 기록은 그대로예요
  for (let i = 2; i < LABELS.length; i++) { await nextBtn(a.page).click(); await expect(stageLabel(a.stage)).toHaveText(LABELS[i]); }
  await finishLesson(a.page);
  await expect.poll(async () => (await localRecords(a.page)).length).toBe(1);
  await a.page.getByRole("button", { name: "새 수업 준비" }).click();
  await a.page.locator('[data-act="reset"]').click();
  await a.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(async () => field(await adminDoc("teachers/" + a.uid + "/lessons/settings"), "pin")).not.toBe(pin);
  expect((await localRecords(a.page)).length, "기록은 그대로예요").toBe(1);
  expect(await adminDoc("teachers/" + a.uid + "/sessions/s" + pin), "지난 PIN의 세션 문서도 지워지지 않아요").not.toBeNull();
  expect(real(errors)).toEqual([]);
});

test("다른 PC에서는 PIN을 바꿀 수 없어요(수업을 맡은 기기에서 바꿔요)", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await device(browser, PC, errors);
  await a.page.goto("/");
  await signIn(a.page, who);
  await pcLinked(a.page);
  await qrUrl(a.page);
  const b = await otherPc(browser, errors, who);
  await expect(ctlBox(b)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  await b.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(b.page.getByRole("button", { name: "PIN 바꾸기" })).toBeDisabled();
  await expect(b.page.locator(".pin-lock")).toContainText("수업을 맡은 기기에서");
  expect(real(errors)).toEqual([]);
});

// 로그인 없이 쓰던 기록(이 브라우저의 navi-local)을 시험용으로 넣어요
const seedOld = (page, recs) => page.evaluate((recs) => new Promise((res, rej) => {
  const r = indexedDB.open("navi-local", 1);
  r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: "id" }); });
  r.onsuccess = () => { const t = r.result.transaction("records", "readwrite"); recs.forEach((x) => t.objectStore("records").put(x)); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
  r.onerror = () => rej(r.error);
}), recs);
const oldRows = (page) => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open("navi-local", 1);
  r.onsuccess = () => { const q = r.result.transaction("records", "readonly").objectStore("records").getAll(); q.onsuccess = () => { r.result.close(); res(q.result); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}));
const logout = async (page) => {
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "로그아웃" }).click()]);
};
const records = (page) => page.getByRole("tab", { name: "수업 기록" }).click();

test("공용 PC: 교사 A의 기록은 로그아웃하면 사라지고 교사 B에게 보이지 않아요. A가 다시 로그인하면 그대로 있어요", async ({ browser }) => {
  const errors = [], whoA = email("teacher-a"), whoB = email("teacher-b");
  const a = await teacherStarts(browser, errors, whoA);
  const page = a.page;
  for (let i = 1; i < LABELS.length; i++) await nextBtn(page).click();
  await finishLesson(page);
  await expect(a.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  await page.getByRole("button", { name: "새 수업 준비" }).click();
  await page.locator('[data-act="reset"]').click();
  await records(page);
  await expect(page.locator('.hist[aria-label="내 수업 기록"] .rec, .hist[aria-label="내 수업 기록"] > *')).toHaveCount(1);
  // 로그아웃: 이 브라우저에 남은 기록이 화면에 보이지 않아요
  await logout(page);
  await records(page);
  await expect(page.locator('.hist[aria-label="내 수업 기록"]')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^navi-run/.test(k)).length)).toBe(0);
  expect((await localRecords(page)).length, "로그인하지 않은 화면의 기록").toBe(0);
  // 교사 B가 같은 브라우저에서 로그인: A의 기록도, 최근 수업도, 가져오기 안내도 없어요
  await signIn(page, whoB);
  await pcLinked(page);
  await records(page);
  await expect(page.locator('.hist[aria-label="내 수업 기록"]')).toHaveCount(0);
  await expect(page.locator(".old-note")).toHaveCount(0);
  expect((await localRecords(page)).length).toBe(0);
  // 교사 A가 다시 로그인하면 기록은 그대로예요
  await logout(page);
  await signIn(page, whoA);
  await pcLinked(page);
  await records(page);
  await expect.poll(async () => (await localRecords(page)).length).toBe(1);
  await expect(page.locator('.hist[aria-label="내 수업 기록"]')).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("예전 로컬 기록: 지우지 않고 로그인하지 않은 화면에 그대로 있어요. 교사가 고른 계정으로만 가져오고, 되돌릴 수 있어요", async ({ browser }) => {
  const errors = [], whoA = email("teacher-a"), whoB = email("teacher-b");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  const old = { id: "local-old1", v: 2, key: "옛 수업", title: "옛 수업 기록", at: Date.now() - 86400000, totalSec: 60, plannedMin: 40, again: [], used: [], text: "", scenes: [], sig: { red: 0, yellow: 0, green: 0 }, questions: [], events: [], usedTitles: [] };
  await seedOld(pc.page, [old]);
  await pc.page.reload();
  await records(pc.page);
  await pc.page.getByRole("button", { name: /전체/ }).click();
  await expect(pc.page.locator("#records")).toContainText("옛 수업 기록");
  // 교사 A 로그인: 기록 내용은 보이지 않고 몇 건 있는지만 말해요
  await signIn(pc.page, whoA);
  await pcLinked(pc.page);
  await records(pc.page);
  await pc.page.getByRole("button", { name: /전체/ }).click();
  await expect(pc.page.locator(".old-note")).toContainText("수업 기록 1건");
  await expect(pc.page.locator("#records")).not.toContainText("옛 수업 기록");
  // 가져오기(확인 줄 뒤): 이 계정에 보이고, 원본은 지워지지 않아요
  await pc.page.getByRole("button", { name: "이 계정으로 가져오기" }).click();
  await expect(pc.page.locator('.pop[aria-label="기록 가져오기"]')).toContainText("내가 남긴 기록일 때만");
  await pc.page.getByRole("button", { name: "가져오기", exact: true }).click();
  await expect(pc.page.locator("#records")).toContainText("옛 수업 기록");
  const uidA = await uidOf(pc);
  expect((await oldRows(pc.page)).map((r) => [r.id, r.claimedBy])).toEqual([["local-old1", uidA]]);
  // 로그아웃하면 보이지 않고, 교사 B에게도 안내조차 없어요
  await logout(pc.page);
  await records(pc.page);
  await expect(pc.page.locator("#records")).not.toContainText("옛 수업 기록");
  await signIn(pc.page, whoB);
  await pcLinked(pc.page);
  await records(pc.page);
  await expect(pc.page.locator(".old-note")).toHaveCount(0);
  await expect(pc.page.locator("#records")).not.toContainText("옛 수업 기록");
  // A가 되돌리면 원래대로 로그인하지 않은 화면에 보여요
  await logout(pc.page);
  await signIn(pc.page, whoA);
  await pcLinked(pc.page);
  await records(pc.page);
  await pc.page.getByRole("button", { name: "가져오기 되돌리기" }).click();
  await expect(pc.page.locator(".old-note")).toContainText("수업 기록 1건");
  await expect(pc.page.locator("#records")).not.toContainText("옛 수업 기록");
  expect((await oldRows(pc.page)).map((r) => [r.id, r.claimedBy])).toEqual([["local-old1", undefined]]);
  await logout(pc.page);
  await records(pc.page);
  await pc.page.getByRole("button", { name: /전체/ }).click();
  await expect(pc.page.locator("#records")).toContainText("옛 수업 기록");
  expect(real(errors)).toEqual([]);
});

const endFrom = async (ph) => {
  await ph.page.locator('[data-act="end-ask"]').first().click();
  await ph.page.locator('.end-confirm [data-act="end"]').click();
};

test("PC 끊김 → 휴대폰에서 끝내기 → 복구 → 정상 종료: 끊긴 동안은 끝나지 않고 그 뜻을 말해요. 이어진 뒤 끝내면 기록은 한 번만 남아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  await pc.ctx.setOffline(true);
  await expect(pc.page.locator(".chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  await endFrom(ph);
  await expect(ph.page.locator(".end-note")).toContainText("교사 PC를 다시 연결한 후 수업을 종료해 주세요", { timeout: 15000 });
  const s = await adminDoc("teachers/" + uid + "/sessions/s" + pin);
  expect(field(s, "ended"), "서버의 수업은 끝나지 않았어요").toBe(false);
  await expect(curLabel(ph.page)).toHaveText(LABELS[LABELS.length - 1]);
  // 다시 이어져도 그 요청으로 저절로 끝나지 않아요
  await pc.ctx.setOffline(false);
  await expect(pc.page.locator(".chip").filter({ hasText: "수업 진행 중" }).first()).toBeVisible({ timeout: 30000 });
  await pc.page.waitForTimeout(2000);
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended")).toBe(false);
  expect((await localRecords(pc.page)).length).toBe(0);
  // 이어진 뒤 휴대폰에서 끝내면 PC가 끝내고 기록을 하나 남겨요
  await endFrom(ph);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect(ph.page.locator(".memo-sheet")).toContainText("교사 PC가 이 수업의 기록을 만들었어요");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await ph.page.waitForTimeout(800);
  expect((await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("PC를 닫은 뒤 휴대폰에서 끝내기: 바로 안내하고 수업은 남아요. PC를 다시 열어 저장하고 끝내면 기록은 한 번만, 휴대폰도 끝나요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(500);
  // 창을 닫을 때의 ‘닫힘’ 소식은 서버에 못 갈 수 있어요. 그래도 휴대폰은 답이 없으면 끝내지 않고 안내해요
  await pc.page.close({ runBeforeUnload: true });
  for (let i = 2; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(curLabel(ph.page)).toHaveText(LABELS[i]); }
  await endFrom(ph);
  await expect(ph.page.locator(".end-note")).toContainText("교사 PC를 다시 연결한 후 수업을 종료해 주세요", { timeout: 15000 });
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended")).toBe(false);
  // PC를 다시 열면 이 브라우저의 끝나지 않은 수업으로, 휴대폰이 넘긴 장면까지 보여요
  const again = await pc.ctx.newPage();
  watch(again, errors);
  await again.goto("/");
  const offer = again.locator(".run-offer");
  await expect(offer).toContainText("끝나지 않은 수업이 있어요");
  await expect(offer).toContainText(LABELS.length + " / " + LABELS.length);
  await offer.getByRole("button", { name: /기록 저장하고 끝내기/ }).click();
  await expect.poll(async () => (await localRecords(again)).length).toBe(1);
  await expect(ph.page.locator(".memo-sheet")).toContainText("교사 PC가 이 수업의 기록을 만들었어요", { timeout: 15000 });
  await again.reload();
  await pcLinked(again);
  await again.waitForTimeout(1000);
  expect((await localRecords(again)).length, "다시 열어도 기록은 1건").toBe(1);
  await expect(again.locator(".run-offer")).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

test("안내가 뜬 뒤 PC가 돌아와도: 낡은 끝내기 요청이 서버에 남아 있어도 PC는 끝내지 않아요. 휴대폰이 이미 포기했기 때문이에요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  await pc.ctx.setOffline(true);
  await expect(pc.page.locator(".chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  await endFrom(ph);
  await expect.poll(async () => { const r = field(await hubOf(uid), "startReq"); return !!r && !!r.fields; }).toBe(true);
  // 휴대폰의 ‘요청 지우기’가 서버에 닿지 못하게 해서, 낡은 요청이 남은 채로 PC가 돌아오는 순간을 그대로 만들어요
  const sends = /127\.0\.0\.1:8080\//;
  await ph.ctx.route(sends, (route) => (/Listen\/channel/.test(route.request().url()) ? route.continue() : route.abort()));
  await expect(ph.page.locator(".end-note")).toContainText("교사 PC를 다시 연결한 후 수업을 종료해 주세요", { timeout: 15000 });
  const left = field(await hubOf(uid), "startReq");
  expect(left.fields && left.fields.id.stringValue, "낡은 요청이 서버에 남아 있어요").toMatch(/^end-/);
  await pc.ctx.setOffline(false);
  await expect(pc.page.locator(".chip").filter({ hasText: "수업 진행 중" }).first()).toBeVisible({ timeout: 30000 });
  await pc.page.waitForTimeout(3000);
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended"), "교사는 안 끝난 줄 알아요. 수업은 끝나지 않아요").toBe(false);
  expect((await localRecords(pc.page)).length).toBe(0);
  await expect(curLabel(pc.page)).toHaveText(LABELS[LABELS.length - 1]);
  // 휴대폰이 다시 이어진 뒤 끝내면 정상으로 끝나요
  await ph.ctx.unroute(sends);
  await endFrom(ph);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

test("PIN 휴대폰도 같아요: 끊긴 PC에는 끝내기가 가지 않고, 이어진 뒤 끝내면 PC가 끝내고 기록을 남기며 휴대폰 연결을 거둬요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, pc);
  await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(pc.page).click(); await expect(curLabel(ph.page)).toHaveText(LABELS[i]); }
  await pc.ctx.setOffline(true);
  await expect(pc.page.locator(".chip").filter({ hasText: "연결 끊김" }).first()).toBeVisible();
  await endFrom(ph);
  await expect(ph.page.locator(".end-note")).toContainText("교사 PC를 다시 연결한 후 수업을 종료해 주세요", { timeout: 15000 });
  await pc.ctx.setOffline(false);
  await expect(pc.page.locator(".chip").filter({ hasText: "수업 진행 중" }).first()).toBeVisible({ timeout: 30000 });
  await pc.page.waitForTimeout(1500);
  expect((await localRecords(pc.page)).length).toBe(0);
  await endFrom(ph);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await expect(ph.page.locator(".warn-note")).toContainText("이 휴대폰 연결을 끝냈어요", { timeout: 20000 });
  expect(real(errors)).toEqual([]);
});

test("PIN 휴대폰의 빠른 연속 넘기기: PC 쓰기가 끝나기 전에 눌러도, 휴대폰 자신의 명령이 이어진 것이면 받아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherReady(browser, errors, who);
  const ph = await pinPhone(browser, errors, pc);
  await startClass(pc, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let r = 0; r < 6; r++) {
    await nextBtn(ph.page).click();
    await nextBtn(ph.page).click();
    await expect(stageLabel(pc.stage)).toHaveText(LABELS[2]);
    await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
    await ph.page.locator('[data-act="prev"]').first().click();
    await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
    await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
    await ph.page.locator('[data-act="prev"]').first().click();
    await expect(stageLabel(pc.stage)).toHaveText(LABELS[0]);
    await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  }
  expect(real(errors)).toEqual([]);
});

// ---------- 휴대폰의 수업 시작 요청: 늦게 실행되지 않고, 실제로 시작됐으면 실패라 말하지 않아요 ----------
const startBtn = (page) => page.locator('[data-act="m-start-ask"]');
const tapStart = async (ph) => { await startBtn(ph.page).click(); await ph.page.locator('[data-act="m-start"]').click(); };
const openStage = async (pc, errors) => {
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.locator('.set-layout [data-act="stage-open"]').first().click()]);
  watch(stage, errors);
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  return stage;
};
// 교사 PC + 같은 계정 휴대폰 + 학생 창: 휴대폰이 ‘수업 시작’을 누를 수 있을 때까지
async function readyToStart(browser, errors) {
  const who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const url = await qrUrl(pc.page);
  Object.assign(pc, { who, uid: await uidOf(pc), pin: pinOf(url) });
  const ph = await phoneJoins(browser, errors, url, who);
  pc.stage = await openStage(pc, errors);
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 30000 });
  return { pc, ph };
}
const sessionOf = (pc) => adminDoc("teachers/" + pc.uid + "/sessions/s" + pc.pin);
const noClass = async (pc, ph) => {
  await expect(curLabel(pc.page)).toHaveCount(0);
  await expect(curLabel(ph.page)).toHaveCount(0);
  await expect(stageLabel(pc.stage)).toHaveText("수업 시작 전");
  expect(field(await sessionOf(pc), "started") === true, "서버의 수업이 시작되지 않았어요").toBe(false);
};
const hubField = async (pc, k) => field(await hubOf(pc.uid), k);
const reqId = async (pc) => { const r = await hubField(pc, "startReq"); return r && r.fields ? r.fields.id.stringValue : ""; };
const ackOf = async (pc) => { const a = await hubField(pc, "startAck"); return a && a.fields ? { id: a.fields.id.stringValue, ok: a.fields.ok.booleanValue, why: a.fields.why.stringValue } : null; };
// 휴대폰 화면을 거치지 않고 요청을 그대로 보내요(위조 · 중복 · 순서를 만들 때)
const send = (ph, id, pc) => ph.page.evaluate(async ([id, pc]) => { const db = await window.claude.use("db"); await db.doc("lessons/hub").update({ startReq: { id, at: Date.now(), pc } }); }, [id, pc]);
const waitAck = (ph, id) => ph.page.evaluate((id) => new Promise(async (res) => {
  const db = await window.claude.use("db");
  const off = db.doc("lessons/hub").onSnapshot((s) => { const a = s.data().startAck; if (a && a.id === id) { off(); res(a); } });
}), id);
const fnv = (title, n) => { const s = String(title || "") + "|" + (Number(n) || 0); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); };
// 서버의 준비 상태에 보이는 수업(휴대폰이 보는 것)의 지문
const sigNow = async (pc) => { const h = await hubOf(pc.uid); return fnv(field(h, "title"), field(h, "scenes")); };
const settle = (ph, id) => ph.page.evaluate(async (id) => (await window.claude.use("db")).settle(id), id);
const onlySends = /127\.0\.0\.1:8080\//;
const blockSends = (ph) => ph.ctx.route(onlySends, (route) => (/Listen\/channel/.test(route.request().url()) ? route.continue() : route.abort()));
// 그 글이 담긴 쓰기만 잠깐 늦춰요(느린 네트워크)
const slowCommit = (pc, ms, hit) => pc.ctx.route(/documents:commit/, async (route) => {
  if (hit(route.request().postData() || "")) await new Promise((r) => setTimeout(r, ms));
  await route.continue().catch(() => {});
});

test("수업 시작 시간 초과: 안내 뒤 PC가 돌아와도 시작되지 않아요. 취소가 닿았을 때도, 못 닿아 낡은 요청이 남았을 때도요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  const note = ph.page.locator(".warn-note");
  // 취소가 서버에 닿은 경우
  await pc.ctx.setOffline(true);
  await tapStart(ph);
  await expect(note).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  expect(await reqId(pc), "휴대폰이 요청을 지웠어요").toBe("");
  await pc.ctx.setOffline(false);
  await pcLinked(pc.page);
  await pc.page.waitForTimeout(2500);
  await noClass(pc, ph);
  // 취소가 닿지 못해 낡은 요청이 서버에 남은 경우: PC가 돌아와 답해도, 포기한 휴대폰은 실행 단계를 보내지 않아요
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await pc.ctx.setOffline(true);
  await tapStart(ph);
  await expect.poll(() => reqId(pc)).toMatch(/^sta-/);
  await blockSends(ph);
  await expect(note).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  const left = await reqId(pc);
  expect(left, "낡은 요청이 서버에 남아 있어요").toMatch(/^sta-/);
  await pc.ctx.setOffline(false);
  await pcLinked(pc.page);
  await expect.poll(async () => (await ackOf(pc) || {}).id, { timeout: 15000 }).toBe(left);
  await pc.page.waitForTimeout(3000);
  await noClass(pc, ph);
  expect(await reqId(pc)).toBe("");
  // 휴대폰이 다시 이어지면 새 요청으로 정상 시작해요. 수업은 하나예요
  await ph.ctx.unroute(onlySends);
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await tapStart(ph);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

test("PC가 승인해 실제로 시작됐으면: 수업 소식이 휴대폰에 늦게 와도 실패라고 말하지 않아요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  await slowCommit(pc, 9000, (b) => b.includes("/sessions/s"));
  await tapStart(ph);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[0]);
  // 수업 문서가 서버에 닿기 전: 휴대폰은 기다리기만 해요
  const seen = [];
  for (let i = 0; i < 26; i++) { seen.push(...await ph.page.locator(".warn-note").allInnerTexts()); await ph.page.waitForTimeout(300); }
  expect(seen.filter((t) => /응답하지|보내지 못했|늦게 닿|연결되어 있지/.test(t)), "실패 안내").toEqual([]);
  expect(seen.some((t) => t.includes("PC가 시작 요청을 받았어요")), "늦다는 안내는 PC가 받았다는 사실만 말해요").toBe(true);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 25000 });
  await expect(ph.page.locator(".warn-note")).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

test("PC의 승인이 휴대폰의 취소보다 늦으면: PC는 시작하지 않고, 휴대폰은 시작되지 않았다고 말해요. 다시 누르면 시작돼요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  await slowCommit(pc, 5500, (b) => b.includes("startAck") && b.includes("go-"));
  await tapStart(ph);
  await expect(ph.page.locator(".warn-note")).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  await pc.page.waitForTimeout(4000);
  await noClass(pc, ph);
  await pc.ctx.unroute(/documents:commit/);
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await tapStart(ph);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

test("취소와 승인이 겹쳐도: 휴대폰이 받은 답과 서버의 수업이 늘 같아요(둘 중 하나만 일어나요)", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  const to = await hubField(pc, "pc"), rounds = [];
  let started = false;
  for (const wait of [0, 4, 8, 15, 25, 40, 70, 120, 250, 500, 900]) {
    const k = (await sigNow(pc)) + "-r" + wait;
    await send(ph, "sta-" + k, to);
    expect((await waitAck(ph, "sta-" + k)).ok).toBe(true);
    await send(ph, "go-" + k, to);
    await ph.page.waitForTimeout(wait);
    const out = await settle(ph, "go-" + k);
    await ph.page.waitForTimeout(900);
    started = field(await sessionOf(pc), "started") === true;
    const told = !!((out.ack && out.ack.ok) || out.live);
    rounds.push(wait + "ms:" + (started ? "시작" : "취소"));
    expect(started, wait + "ms 뒤 취소: 휴대폰이 받은 답과 서버의 수업이 같아요").toBe(told);
    expect(await reqId(pc)).toBe("");
    if (started) break;
  }
  test.info().annotations.push({ type: "겹친 결과", description: rounds.join(" · ") });
  expect(started, "기다리면 결국 PC가 승인해요").toBe(true);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  expect(real(errors)).toEqual([]);
});

test("위조 · 중복 요청: 승인받지 않은 실행 요청은 받지 않고, 같은 요청을 다시 보내도 수업은 한 번만 시작돼요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  const to = await hubField(pc, "pc");
  // 묻는 단계 없이 실행부터 보내면 받지 않아요
  const forged = "go-" + (await sigNow(pc)) + "-forged";
  await send(ph, forged, to);
  await expect.poll(async () => (await ackOf(pc) || {}).id).toBe(forged);
  expect(await ackOf(pc)).toEqual({ id: forged, ok: false, why: "late" });
  await send(ph, "모르는-요청", to);
  await expect.poll(async () => (await ackOf(pc) || {}).why).toBe("late");
  await ph.page.waitForTimeout(800);
  await noClass(pc, ph);
  // 정상 시작
  await tapStart(ph);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(ph.page).click();
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  await pc.page.waitForTimeout(500);
  const t0 = field(await sessionOf(pc), "t0"), go = (await ackOf(pc)).id;
  expect(go).toMatch(/^go-/);
  // 같은 실행 요청을 다시 보내도, 새 요청을 보내도 수업은 처음으로 돌아가지 않아요
  await send(ph, go, to);
  await send(ph, "sta-again", to);
  await expect.poll(async () => (await ackOf(pc) || {}).why).toBe("live");
  await send(ph, "go-again", to);
  await pc.page.waitForTimeout(1200);
  expect(field(await sessionOf(pc), "t0"), "수업은 그대로예요").toBe(t0);
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[1]);
  expect(real(errors)).toEqual([]);
});

test("연속 탭 · PC와 동시에 시작: 요청은 하나만 나가고 수업은 하나만 시작돼요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  const ids = new Set();
  ph.page.on("request", (r) => { if (/documents:commit/.test(r.url())) (r.postData() || "").match(/sta-[0-9a-f]+/g)?.forEach((x) => ids.add(x)); });
  await startBtn(ph.page).click();
  // 같은 순간 여러 번 눌러요
  await ph.page.evaluate(() => { const b = document.querySelector('[data-act="m-start"]'); b.click(); b.click(); b.click(); });
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await pc.page.waitForTimeout(800);
  expect(ids.size, "나간 시작 요청").toBe(1);
  const t0 = field(await sessionOf(pc), "t0");
  await pc.page.waitForTimeout(1500);
  expect(field(await sessionOf(pc), "t0")).toBe(t0);
  // 다음 수업: 앞 수업의 시작 상태가 남아 있지 않아서 다시 시작할 수 있어요
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(pc.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  await finishLesson(pc.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await pc.page.getByRole("button", { name: "새 수업 준비" }).click();
  await pc.page.locator('[data-act="reset"]').click();
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  // PC와 휴대폰이 같은 순간 시작해도 수업은 하나예요
  await startBtn(ph.page).click();
  await Promise.all([pc.page.getByRole("button", { name: "수업 시작" }).click(), ph.page.locator('[data-act="m-start"]').click()]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 15000 });
  await pc.page.waitForTimeout(1500);
  const t1 = field(await sessionOf(pc), "t0");
  expect(t1).not.toBe(t0);
  await pc.page.waitForTimeout(1500);
  expect(field(await sessionOf(pc), "t0"), "둘이 눌러도 수업은 한 번만 시작돼요").toBe(t1);
  expect(real(errors)).toEqual([]);
});

test("제어권이 넘어가는 중의 시작 요청: 앞 PC가 승인했어도 앞 PC도 새 PC도 시작하지 않아요. 새 PC로 다시 누르면 시작돼요", async ({ browser }) => {
  const errors = [];
  const { pc: a, ph } = await readyToStart(browser, errors);
  const pcA = await hubField(a, "pc"), mv = (await sigNow(a)) + "-move";
  // A가 묻는 단계에 승인했어요
  await send(ph, "sta-" + mv, pcA);
  expect((await waitAck(ph, "sta-" + mv)).ok).toBe(true);
  // 그 사이 B가 이어서 준비로 맡아요
  const b = await otherPc(browser, errors, a.who);
  await ctlBox(b).getByRole("button", { name: "이 기기에서 이어서 준비하기" }).click();
  await ctlBox(b).getByRole("button", { name: "이어서 준비", exact: true }).click();
  await expect(ctlBox(a)).toContainText("다른 기기에서 수업을 준비하고 있어요");
  const pcB = await hubField(a, "pc");
  expect(pcB).not.toBe(pcA);
  // 실행 요청이 앞 PC 앞으로 가도 아무도 시작하지 않고, 휴대폰이 취소해요
  await send(ph, "go-" + mv, pcA);
  await a.page.waitForTimeout(1500);
  await expect(curLabel(a.page)).toHaveCount(0);
  await expect(curLabel(b.page)).toHaveCount(0);
  expect(field(await sessionOf(a), "started") === true).toBe(false);
  expect((await settle(ph, "go-" + mv)).ack).toBeNull();
  expect(await reqId(a)).toBe("");
  // 새 PC가 시작할 준비를 다 마쳐도(학생 창까지), 새 PC가 승인한 요청이 아니라서 받지 않아요
  const stageB = await openStage(b, errors);
  await send(ph, "go-" + mv, pcB);
  await expect.poll(async () => await ackOf(a)).toEqual({ id: "go-" + mv, ok: false, why: "late" });
  await b.page.waitForTimeout(800);
  await expect(curLabel(b.page)).toHaveCount(0);
  expect(field(await sessionOf(a), "started") === true).toBe(false);
  // 휴대폰에서 새로 누르면 정상으로 시작해요
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await tapStart(ph);
  await expect(curLabel(b.page)).toHaveText(LABELS[0]);
  await expect(stageLabel(stageB)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await expect(curLabel(a.page)).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

test("끊긴 PC 앞으로 간 낡은 시작 요청: 그 사이 다른 PC가 맡으면 앞 PC가 돌아와도 시작하지 않아요", async ({ browser }) => {
  const errors = [];
  const { pc: a, ph } = await readyToStart(browser, errors);
  await a.ctx.setOffline(true);
  await tapStart(ph);
  await expect.poll(() => reqId(a)).toMatch(/^sta-/);
  await blockSends(ph);
  await expect(ph.page.locator(".warn-note")).toContainText("교사 PC가 응답하지 않아요", { timeout: 15000 });
  const b = await otherPc(browser, errors, a.who);
  await ctlBox(b).getByRole("button", { name: "이 기기에서 이어서 준비하기" }).click();
  await ctlBox(b).getByRole("button", { name: "이어서 준비", exact: true }).click();
  await expect.poll(async () => (await hubField(a, "pc")).length).toBeGreaterThan(0);
  await a.ctx.setOffline(false);
  await expect(ctlBox(a)).toContainText("다른 기기에서 수업을 준비하고 있어요", { timeout: 30000 });
  await a.page.waitForTimeout(2500);
  await expect(curLabel(a.page)).toHaveCount(0);
  await expect(curLabel(b.page)).toHaveCount(0);
  expect(field(await sessionOf(a), "started") === true).toBe(false);
  expect(real(errors)).toEqual([]);
});

test("끝내기도 같아요: PC의 승인이 휴대폰의 취소보다 늦으면 끝나지 않고 기록도 없어요. 다시 누르면 끝나고 기록은 하나예요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  await slowCommit(pc, 5500, (b) => b.includes("startAck") && b.includes("fin-"));
  await endFrom(ph);
  await expect(ph.page.locator(".end-note")).toContainText("교사 PC를 다시 연결한 후 수업을 종료해 주세요", { timeout: 15000 });
  await pc.page.waitForTimeout(4000);
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended")).toBe(false);
  expect((await localRecords(pc.page)).length).toBe(0);
  await expect(curLabel(pc.page)).toHaveText(LABELS[LABELS.length - 1]);
  await pc.ctx.unroute(/documents:commit/);
  await endFrom(ph);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝");
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  expect(real(errors)).toEqual([]);
});

// ---------- 승인 거래가 늦거나 응답만 잃어버린 경우(별도 검토가 찾은 두 경우) ----------
test("PC의 승인이 서버에 닿았는데 응답만 사라져도: 다시 시도한 PC가 같은 일을 이어서 해요. 시작은 한 번, 휴대폰과 서버가 같아요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  // 승인 거래의 첫 쓰기는 서버에 보내되, 그 응답은 PC에 닿지 않게 해요(망이 순간 끊김)
  let cut = 0;
  await pc.ctx.route(/documents:commit/, async (route) => {
    const body = route.request().postData() || "";
    if (!cut && body.includes("startAck") && body.includes("go-")) { cut++; await route.fetch().catch(() => {}); await route.abort(); return; }
    await route.continue().catch(() => {});
  });
  await tapStart(ph);
  await expect.poll(() => cut).toBe(1);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0], { timeout: 15000 });
  await expect(stageLabel(pc.stage)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 15000 });
  await expect.poll(async () => field(await sessionOf(pc), "started"), { timeout: 15000 }).toBe(true);
  const t0 = field(await sessionOf(pc), "t0");
  await pc.page.waitForTimeout(1500);
  expect(field(await sessionOf(pc), "t0"), "한 번만 시작해요").toBe(t0);
  expect(real(errors)).toEqual([]);
});

test("끝내기 승인의 응답만 사라져도: PC가 끝내고 기록은 하나예요(휴대폰은 끝났다고 알아요)", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  let cut = 0;
  await pc.ctx.route(/documents:commit/, async (route) => {
    const body = route.request().postData() || "";
    if (!cut && body.includes("startAck") && body.includes("fin-")) { cut++; await route.fetch().catch(() => {}); await route.abort(); return; }
    await route.continue().catch(() => {});
  });
  await endFrom(ph);
  await expect.poll(() => cut).toBe(1);
  await expect(pc.stage.locator(".stage-msg")).toContainText("수업 끝", { timeout: 15000 });
  await expect.poll(async () => (await localRecords(pc.page)).length, { timeout: 15000 }).toBe(1);
  await expect(ph.page.locator(".memo-sheet")).toBeVisible({ timeout: 15000 });
  expect(real(errors)).toEqual([]);
});

test("PC의 승인이 늦게 닿고 휴대폰도 끊기면: 휴대폰은 ‘응답 없음’이라 단정하지 않고 확인하지 못했다고 말해요. 결과는 서버와 같아요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  // PC의 승인 쓰기가 6.5초 걸려요
  await slowCommit(pc, 6500, (b) => b.includes("startAck") && b.includes("go-"));
  await tapStart(ph);
  // 실행 요청이 서버에 닿은 뒤 휴대폰의 쓰기가 끊겨요(취소도 닿지 못해요)
  await expect.poll(() => reqId(pc), { timeout: 10000 }).toMatch(/^go-/);
  await blockSends(ph);
  const seen = [];
  for (let i = 0; i < 40 && !(await curLabel(ph.page).count()); i++) { seen.push(...await ph.page.locator(".warn-note").allInnerTexts()); await ph.page.waitForTimeout(250); }
  test.info().annotations.push({ type: "휴대폰 안내", description: [...new Set(seen)].join(" / ") });
  expect(seen.filter((t) => /응답하지 않아요|보내지 못했/.test(t)), "단정하는 실패 안내").toEqual([]);
  // PC의 승인이 닿았으니 수업은 시작됐고, 휴대폰도 그 수업을 보여 줘요
  await expect.poll(async () => field(await sessionOf(pc), "started"), { timeout: 20000 }).toBe(true);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0], { timeout: 20000 });
  await ph.ctx.unroute(onlySends);
  expect(real(errors)).toEqual([]);
});

test("승인 거래의 마감: PC가 실행 요청을 본 뒤 4초가 지나도록 승인하지 못했으면, 나중에 다시 시도해도 실행하지 않아요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  // PC 창이 손대지 않는 요청 하나를 서버에 둬요(다른 창 앞으로 간 실행 요청). 그 위에서 서버 거래를 직접 불러요:
  // 마감이 지난 승인은 거절되고 아무것도 쓰지 않아요
  await send(ph, "go-deadline2", "다른-창");
  await expect.poll(() => reqId(pc)).toBe("go-deadline2");
  const tab = await pc.page.evaluate(() => localStorage.getItem("navi-browser") + "-" + sessionStorage.getItem("navi-tab"));
  const tried = await pc.page.evaluate(async (tab) => {
    const db = await window.claude.use("db");
    return db.held(tab, [{ path: "lessons/hub", op: "update", data: { startReq: null, startAck: { id: "go-deadline2", ok: true, why: "", at: Date.now() } } }], { req: "go-deadline2", until: Date.now() - 1 }).then(() => "들어감", (e) => e.code);
  }, tab);
  expect(tried).toBe("late");
  expect(await reqId(pc), "요청은 그대로예요").toBe("go-deadline2");
  expect(await ackOf(pc), "답을 쓰지 않았어요").toBeNull();
  await noClass(pc, ph);
  expect(real(errors)).toEqual([]);
});

// ---------- 재검토가 찾은 경우: 늦게 다시 시도된 승인은 그 요청의 수업에만 ----------
test("응답을 잃은 끝내기 승인이 한참 늦게 다시 시도돼도: 그 사이 교사가 끝내고 시작한 다음 수업은 끝나지 않아요. 기록도 수업마다 하나예요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  for (let i = 1; i < LABELS.length; i++) { await nextBtn(ph.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  // 끝내기 승인 쓰기는 서버에 닿지만 응답을 잃어요. 그 거래의 다시 시도(첫 읽기)는 교사가 놓아줄 때까지 붙잡아 둬요
  let cut = 0, release, held = null;
  const gate = new Promise((r) => { release = r; });
  await pc.ctx.route(/documents:(commit|batchGet)/, async (route) => {
    const url = route.request().url(), body = route.request().postData() || "";
    if (!cut && /commit/.test(url) && body.includes("startAck") && body.includes("fin-")) { cut++; await route.fetch().catch(() => {}); await route.abort(); return; }
    if (cut && !held && /batchGet/.test(url) && body.includes("lessons/hub")) { held = 1; await gate; }
    await route.continue().catch(() => {});
  });
  await endFrom(ph);
  await expect.poll(() => cut).toBe(1);
  await expect.poll(() => held, { timeout: 15000 }).toBe(1);
  // 그 사이 교사가 PC에서 수업을 끝내고(기록 1), 다음 수업을 시작해요
  await expect(curLabel(pc.page)).toHaveText(LABELS[LABELS.length - 1]);
  await finishLesson(pc.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  await pc.page.getByRole("button", { name: "새 수업 준비" }).click();
  await pc.page.locator('[data-act="reset"]').click();
  await pc.page.getByRole("button", { name: "수업 시작" }).click();
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  // 다음 수업이 서버에 쓰인 뒤에(시작됨 · 끝나지 않음) 그 수업을 기억해요
  const live = async () => { const s = await adminDoc("teachers/" + uid + "/sessions/s" + pin); return field(s, "started") === true && field(s, "ended") === false ? field(s, "t0") : ""; };
  await expect.poll(live, { timeout: 15000 }).not.toBe("");
  const t1 = await live();
  // 붙잡아 둔 다시 시도를 놓아줘요: 앞 수업을 끝내려던 승인이라 다음 수업에는 아무것도 하지 않아요
  release();
  await pc.page.waitForTimeout(3000);
  const s = await adminDoc("teachers/" + uid + "/sessions/s" + pin);
  expect([field(s, "t0"), field(s, "ended")], "다음 수업은 그대로 진행 중").toEqual([t1, false]);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  expect((await localRecords(pc.page)).length, "기록은 앞 수업 하나").toBe(1);
  expect(real(errors)).toEqual([]);
});

test("확인하지 못한 실행 요청: 휴대폰이 다시 서버에 닿으면 스스로 다시 확인해, 시작되지 않았다고 정확히 말해요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  // PC의 실행 승인 쓰기는 늘 실패해요(PC는 시작하지 않아요)
  await pc.ctx.route(/documents:commit/, async (route) => {
    const body = route.request().postData() || "";
    if (body.includes("startAck") && body.includes("go-")) { await route.abort(); return; }
    await route.continue().catch(() => {});
  });
  await tapStart(ph);
  await expect.poll(() => reqId(pc), { timeout: 10000 }).toMatch(/^go-/);
  await blockSends(ph);
  await expect(ph.page.locator(".warn-note")).toContainText("확인하지 못했어요", { timeout: 15000 });
  // 휴대폰 쪽 거래가 스스로 다시 시도하는 시간이 다 지나도록 끊겨 있어요
  await ph.page.waitForTimeout(10000);
  await expect(ph.page.locator(".warn-note")).toContainText("확인하지 못했어요");
  // 휴대폰의 쓰기가 다시 되면, 남은 실행 요청을 스스로 정리하고 ‘응답 없음’을 정확히 말해요
  await ph.ctx.unroute(onlySends);
  await expect(ph.page.locator(".warn-note")).toContainText("교사 PC가 응답하지 않아요", { timeout: 20000 });
  expect(await reqId(pc), "남은 요청이 지워졌어요").toBe("");
  await noClass(pc, ph);
  expect(real(errors)).toEqual([]);
});

// ---------- 세 번째 검토가 찾은 경우: 휴대폰이 본 수업만, 실행하지 못했으면 그렇다고 ----------
test("시작 요청 중 PC에서 다른 수업을 고르면: 휴대폰이 본 수업이 아니라서 시작하지 않고 그 뜻을 말해요. 다시 누르면 바뀐 수업으로 시작해요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  const to = await hubField(pc, "pc"), k = (await sigNow(pc)) + "-lesson";
  await send(ph, "sta-" + k, to);
  expect((await waitAck(ph, "sta-" + k)).ok).toBe(true);
  // 그 사이 교사가 PC에서 다른 수업을 골라요
  const other = DATA.lessons.find((L) => L.id === "ex-m3-fraction");
  await pc.page.getByRole("tab", { name: "예시 수업" }).click();
  await pc.page.locator('.lcard[data-v="ex-m3-fraction"]').click();
  await pc.page.locator('.lib-sum [data-act="lib-open"], .lib-sum [data-act="lib-close"]').first().click();
  await expect.poll(async () => field(await hubOf(pc.uid), "title")).toBe(other.title);
  // 앞 수업을 보고 승인받은 실행 요청은 받지 않아요
  await send(ph, "go-" + k, to);
  await expect.poll(async () => await ackOf(pc)).toEqual({ id: "go-" + k, ok: false, why: "moved" });
  await pc.page.waitForTimeout(800);
  await noClass(pc, ph);
  // 휴대폰 화면도 바뀐 수업을 보여 주고, 누르면 그 수업으로 시작해요
  await expect(ph.page.locator(".ph-hero h1")).toHaveText(other.title);
  await expect(startBtn(ph.page)).toBeEnabled({ timeout: 45000 });
  await tapStart(ph);
  await expect(curLabel(pc.page)).toHaveText(other.pages[0].label);
  await expect(curLabel(ph.page)).toHaveText(other.pages[0].label);
  expect(real(errors)).toEqual([]);
});

test("승인 직후 PC에서 미리보기를 누르면: PC는 시작하지 않고, 휴대폰은 시작 요청을 받았다고만 하지 않고 그 까닭을 말해요", async ({ browser }) => {
  const errors = [];
  const { pc, ph } = await readyToStart(browser, errors);
  // 승인 쓰기가 서버로 가는 2.5초 사이에 교사가 미리보기를 눌러요
  await slowCommit(pc, 2500, (b) => b.includes("startAck") && b.includes("go-"));
  await tapStart(ph);
  await expect.poll(() => reqId(pc), { timeout: 10000 }).toMatch(/^go-/);
  await pc.page.getByRole("button", { name: "수업 미리보기" }).click();
  await expect(ph.page.locator(".warn-note")).toContainText("수업 미리보기", { timeout: 15000 });
  await pc.page.waitForTimeout(1500);
  expect(field(await sessionOf(pc), "started") === true, "서버의 수업은 시작되지 않았어요").toBe(false);
  await expect(ph.page.locator(".warn-note")).not.toContainText("시작 요청을 받았어요");
  await expect(curLabel(ph.page)).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

// ---------- 로그인 유지 · 공용 학교 PC (2026-11-11, docs/AUTH-POLICY.md) ----------
// 로그인 화면의 ‘이 브라우저에서 로그인 유지’(기본 켜짐): 켜면 브라우저를 닫았다 열어도 로그인돼 있고, 끄면 그 탭에서만 로그인돼요.
// 시간이 지났다고 로그아웃시키지 않아요(예전 12시간 규칙은 없앴어요). 공용 PC 로그아웃 안내 · 수업 중 로그아웃 확인은 그대로예요
const linkOf = (page) => page.locator(".side-foot .dstate").filter({ hasText: "모바일 리모컨" });
// Firebase가 브라우저 저장소(IndexedDB)에 둔 로그인 수 · 탭 저장소에 둔 로그인 수
const keptLogins = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open("firebaseLocalStorageDb");
  r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains("firebaseLocalStorage")) { res(0); return; } const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").count(); q.onsuccess = () => res(q.result); };
  r.onerror = () => res(-1);
}));
const tabLogins = (page) => page.evaluate(() => Object.keys(sessionStorage).filter((k) => /^firebase:authUser:/.test(k)).length);
// 브라우저를 껐다 켠 것처럼: 쿠키 · localStorage · IndexedDB만 남고 탭 저장소는 없어요(state는 끄기 전에 받아 둬요)
async function restart(browser, state, cfg, errors) {
  const ctx = await browser.newContext(Object.assign({}, PC, { storageState: state }));
  await ctx.addInitScript((cfg) => { window.NAVI_FIREBASE = cfg; window.QRCode = function (box, o) { window.__qrText = o.text; }; }, cfg);
  const page = await ctx.newPage();
  watch(page, errors);
  return { ctx, page };
}
// 로그인 화면의 단추가 체크 상자의 값을 넘기는지(구글 창은 시험에서 열 수 없어서, 넘기는 값만 봐요)
async function loginArgs(page) {
  await page.evaluate(() => { window.__realSignIn = window.naviAuth.signIn; window.naviAuth.signIn = (o) => { window.__signInArgs = o; }; });
  await page.locator(".set-layout").getByRole("button", { name: "구글로 로그인" }).click();
  const got = await page.evaluate(() => window.__signInArgs);
  await page.evaluate(() => { window.naviAuth.signIn = window.__realSignIn; });
  return got;
}

test("로그인 유지(기본 켜짐): 로그인 화면의 체크 상자가 켜져 있고 단추가 그 선택을 넘겨요. 새 탭 · 브라우저를 다시 열어도 로그인돼 있고, 끝나지 않은 수업은 저절로 이어지지 않고 ‘이어서 하기’를 물어요. 하루가 지나도 로그아웃되지 않아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(pc.page.locator("#keep-login")).toBeChecked();
  await expect(pc.page.locator(".set-layout .keep-note")).toContainText("공용 PC라면 체크를 풀어요");
  expect(await loginArgs(pc.page)).toEqual({ keep: true });
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  // 로그인은 브라우저 저장소에 있고, 탭 저장소에는 없어요
  expect(await keptLogins(pc.page)).toBe(1);
  expect(await tabLogins(pc.page)).toBe(0);
  const url = await qrUrl(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(pc.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  await pc.page.keyboard.press("1");
  // 같은 브라우저의 새 탭: 같은 계정으로 이어져요(수업은 첫 창이 맡고 있어서 다른 기기의 수업으로 보여요)
  const tab = await pc.ctx.newPage();
  watch(tab, errors);
  await tab.goto("/");
  await pcLinked(tab);
  await expect(tab.locator(".ctl-offer")).toContainText("다른 기기에서 수업을 진행하고 있어요");
  await tab.close();
  // 브라우저를 껐다 켬: 로그인 그대로, 이 계정의 끝나지 않은 수업을 ‘이어서 하기’로 물어요
  const state = await pc.ctx.storageState({ indexedDB: true }), cfg = await pc.page.evaluate(() => window.NAVI_FIREBASE);
  await stage.close();
  await pc.page.close();
  const re = await restart(browser, state, cfg, errors);
  await re.page.goto("/");
  await pcLinked(re.page);
  await expect(re.page.locator(".run-offer")).toContainText("끝나지 않은 수업이 있어요");
  // 하루(26시간)가 지난 것처럼 시계를 돌려 다시 열어도 로그아웃되지 않아요
  await re.ctx.clock.install({ time: Date.now() + 26 * 3600 * 1000 });
  await re.page.reload();
  await pcLinked(re.page);
  // 휴대폰은 리모컨 주소를 새 탭으로 다시 열어도 로그인 · 연결 그대로예요
  const ph2 = await ph.ctx.newPage();
  watch(ph2, errors);
  await ph2.goto(url);
  await expect(curLabel(ph2)).toHaveText(LABELS[1]);
  await expect(ph2.getByRole("button", { name: /구글 계정으로 연결/ })).toHaveCount(0);
  await re.ctx.close();
  expect(real(errors)).toEqual([]);
});

test("로그인 유지를 끄면(공용 PC): 그 탭에서만 로그인돼요. 새로고침은 그대로, 새 탭 · 브라우저 다시 열기는 로그인 전이고 이 계정의 수업 · 기록이 보이지 않아요. 다시 로그인하면 이어서 하고, 탭 저장소가 되살아나도(탭 복원) 시간으로 로그아웃시키지 않아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await pc.page.locator("#keep-login").uncheck();
  await expect(pc.page.locator(".set-layout .keep-note")).toContainText("창을 닫으면 로그아웃돼요");
  expect(await loginArgs(pc.page)).toEqual({ keep: false });
  await signIn(pc.page, who, { keep: false });
  await pcLinked(pc.page);
  // 로그인은 이 탭의 저장소에만 있어요(브라우저 저장소 · IndexedDB에는 없어요). 예전 12시간 기록(navi-signed-at)도 쓰지 않아요
  expect(await tabLogins(pc.page)).toBe(1);
  expect(await keptLogins(pc.page)).toBe(0);
  expect(await pc.page.evaluate(() => [localStorage.getItem("navi-signed-in"), localStorage.getItem("navi-keep-login"), sessionStorage.getItem("navi-signed-at")])).toEqual([null, "0", null]);
  await pc.page.getByRole("tab", { name: "수업 준비" }).click();
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await nextBtn(pc.page).click();
  await expect(stageLabel(stage)).toHaveText(LABELS[1]);
  // 새로고침: 로그인 그대로, ‘이어서 하기’를 물어요(0.7 규칙)
  await pc.page.reload();
  await pcLinked(pc.page);
  await expect(pc.page.locator(".run-offer")).toContainText("끝나지 않은 수업이 있어요");
  const tabStore = await pc.page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])));
  // 같은 브라우저의 새 탭: 로그인 전이고, 이 계정의 수업 · 기록이 보이지 않아요
  const tab = await pc.ctx.newPage();
  watch(tab, errors);
  await tab.goto("/");
  await expect(tab.locator(".mylib")).toBeVisible();
  await expect(linkOf(tab)).toContainText("연결 전");
  await expect(tab.locator(".run-offer, .ctl-offer")).toHaveCount(0);
  expect((await localRecords(tab)).length).toBe(0);
  await tab.close();
  // 탭 복원 · 복제(탭 저장소가 되살아남): 로그인도 남아요. 오래된 로그인 시각이 있어도 시간으로 지우지 않아요
  const revived = await pc.ctx.newPage();
  watch(revived, errors);
  await revived.addInitScript((st) => { if (!sessionStorage.getItem("__revived")) { Object.entries(st).forEach(([k, v]) => sessionStorage.setItem(k, v)); sessionStorage.setItem("navi-signed-at", String(Date.now() - 13 * 3600 * 1000)); sessionStorage.setItem("__revived", "1"); } }, tabStore);
  await revived.goto("/");
  await pcLinked(revived);
  await revived.close();
  // 브라우저를 껐다 켬: 로그인 전
  const state = await pc.ctx.storageState({ indexedDB: true }), cfg = await pc.page.evaluate(() => window.NAVI_FIREBASE);
  const re = await restart(browser, state, cfg, errors);
  await re.page.goto("/");
  await expect(re.page.locator(".mylib")).toBeVisible();
  await expect(linkOf(re.page)).toContainText("연결 전");
  await expect(re.page.locator(".run-offer, .ctl-offer")).toHaveCount(0);
  // 다시 로그인하면 이 계정의 끝나지 않은 수업을 이어서 해요
  await signIn(re.page, who, { keep: false });
  await pcLinked(re.page);
  await expect(re.page.locator(".run-offer, .ctl-offer").first()).toBeVisible();
  await re.ctx.close();
  expect(real(errors)).toEqual([]);
});

test("공용 PC 로그아웃: 수업 중에는 확인 줄(계속 수업 · 기록 저장하고 로그아웃)을 거치고, 로그아웃하면 수업을 끝내 기록을 그 계정에 남기고 서버의 수업도 끝나요. 다시 로그인해도 끝나지 않은 수업이 없고, 로그인하지 않은 칸에는 기록이 없어요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const pin = pinOf(pc.url), uid = await uidOf(pc);
  for (let i = 1; i <= 2; i++) { await nextBtn(pc.page).click(); await expect(stageLabel(pc.stage)).toHaveText(LABELS[i]); }
  await pc.page.keyboard.press("2");
  // 수업 중 발표 설정의 로그아웃 → 확인 줄
  await pc.page.locator('[data-act="more"]').click();
  await pc.page.locator('.more-menu [data-act="roles"]').click();
  await pc.page.getByRole("tab", { name: "발표 설정" }).click();
  await pc.page.getByRole("button", { name: "로그아웃" }).click();
  const ask = pc.page.locator('.confirm[aria-label="로그아웃"]');
  await expect(ask).toContainText("수업을 끝내고 기록을 저장한 뒤 로그아웃할까요?");
  // 계속 수업: 아무 일도 없어요(수업 · 로그인 그대로)
  await ask.getByRole("button", { name: "계속 수업" }).click();
  await expect(ask).toHaveCount(0);
  await pcLinked(pc.page);
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended")).toBe(false);
  expect((await localRecords(pc.page)).length).toBe(0);
  // 기록 저장하고 로그아웃: 수업을 끝내고(수업 화면 ‘수업 끝’) 서버에 끝남이 닿은 뒤 로그아웃
  await pc.page.getByRole("button", { name: "로그아웃" }).click();
  await Promise.all([pc.page.waitForEvent("load"), ask.getByRole("button", { name: "기록 저장하고 로그아웃" }).click()]);
  await expect(linkOf(pc.page)).toContainText("연결 전");
  expect(field(await adminDoc("teachers/" + uid + "/sessions/s" + pin), "ended")).toBe(true);
  await expect(pc.page.locator(".run-offer")).toHaveCount(0);
  expect((await localRecords(pc.page)).length, "로그인하지 않은 칸에는 기록이 없어요").toBe(0);
  // 다시 로그인: 그 계정의 기록 1건(신호 · 장면 그대로), 끝나지 않은 수업은 없어요
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(1);
  const rec = (await localRecords(pc.page))[0];
  expect(rec.events.map((e) => e.label + ":" + e.type)).toEqual([LABELS[2] + ":yellow"]);
  await expect(pc.page.locator(".run-offer")).toHaveCount(0);
  // 수업이 끝난 기록 화면에는 로그아웃 안내가 있고, 그때는 확인 없이 로그아웃돼요
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(pc.page)).toHaveText(LABELS[0]);
  await pc.page.keyboard.press("End");
  await expect(curLabel(pc.page)).toHaveText(LABELS[LABELS.length - 1]);
  await finishLesson(pc.page);
  await expect(pc.page.locator(".memo-sheet .logout-hint")).toContainText("공용 PC라면");
  await Promise.all([pc.page.waitForEvent("load"), pc.page.locator(".memo-sheet .logout-hint").getByRole("button", { name: "로그아웃" }).click()]);
  await expect(linkOf(pc.page)).toContainText("연결 전");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  await expect.poll(async () => (await localRecords(pc.page)).length).toBe(2);
  expect(real(errors)).toEqual([]);
});

// ---------- 끝난 수업과 새로 고른 수업(2026-11-22) ----------
// 수업이 끝난 뒤 교사 PC 창을 새로 열면(새로고침 · 다음 날) 그 창은 아직 수업을 맡지 않았어요. 거기서 다른 수업을 고르면 계정의 끝난 세션도
// 함께 비워요(수업 고르기 = 교사의 행동이라 맡아도 돼요). 예전에는 그 창의 화면만 비워서, 휴대폰이 앞 수업의 끝 화면에 새 수업 제목 · 장면을 섞어 보여 줬어요
const acctRecords = async (uid) => ((await fetch(docUrl("teachers/" + uid + "/records") + "?pageSize=50", { headers: { Authorization: "Bearer owner" } }).then((r) => r.json())).documents || []);
const pickExample = async (page, id) => {
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await page.locator('.lcard[data-v="' + id + '"]').click();
  await page.locator('.lib-sum [data-act="lib-open"], .lib-sum [data-act="lib-close"]').first().click();
};
async function endedThenNewWindow(browser, errors) {
  const who = email("teacher");
  const pc = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, pc.url, who);
  pc.pin = pinOf(pc.url); pc.uid = await uidOf(pc);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(pc.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await finishLesson(pc.page);
  await expect(pc.page.locator(".memo-sheet")).toContainText("계정에 저장했어요", { timeout: 20000 });
  await expect(ph.page.locator(".memo-sheet")).toBeVisible();
  const ended = await sessionOf(pc);
  expect(field(ended, "ended")).toBe(true);
  expect(field(ended, "memoId")).toBeTruthy();
  // 교사 PC 창을 닫고 새로 열어요: 이 창은 아직 수업을 맡지 않았어요
  await pc.stage.close().catch(() => {});
  await pc.page.close();
  const page = await pc.ctx.newPage();
  watch(page, errors);
  await page.goto("/");
  await pcLinked(page);
  return { pc: Object.assign(pc, { page }), ph, ended };
}

test("수업이 끝난 뒤 새 PC 창에서 다른 수업을 고르면: 계정의 끝난 세션을 비워 휴대폰은 새 수업을 기다려요(앞 수업 끝 화면에 새 제목이 섞이지 않음). 기록은 한 건 그대로", async ({ browser }) => {
  const errors = [];
  const { pc, ph, ended } = await endedThenNewWindow(browser, errors);
  const other = DATA.lessons.find((L) => L.id === "ex-m3-fraction");
  await pickExample(pc.page, other.id);
  await expect.poll(async () => field((await classDocs(pc.uid, pc.pin))["lessons/deck"], "lessonId")).toBe(other.id);
  // 계정의 세션: 비워졌고(끝난 앞 수업이 남지 않음), 새로 시작하지도 않았어요
  await expect.poll(async () => field(await sessionOf(pc), "ended"), { timeout: 15000 }).toBe(false);
  const now = await sessionOf(pc);
  expect(field(now, "started"), "고르기만 했는데 수업이 시작됐어요").toBe(false);
  expect(field(now, "memoId") || null).toBe(null);
  // 휴대폰: 앞 수업의 끝 화면이 아니라 새 수업을 기다리는 화면
  await expect(ph.page.locator(".memo-sheet")).toHaveCount(0, { timeout: 15000 });
  await expect(ph.page.locator(".ph-hero h1")).toHaveText(other.title);
  await expect(ph.page.locator("body")).not.toContainText("못 했어요");
  // 앞 수업의 기록은 그대로 한 건(지워지거나 늘지 않음)
  expect((await localRecords(pc.page)).length).toBe(1);
  const acct = await acctRecords(pc.uid);
  expect(acct.length).toBe(1);
  expect(acct[0].name.endsWith("/r-" + Number(field(ended, "t0")).toString(36))).toBe(true);
  expect(real(errors)).toEqual([]);
});

test("수업이 끝난 뒤 새 PC 창을 열기만 하면: 계정의 끝난 세션 · 수업 · 허브를 쓰지 않아요(휴대폰은 그 수업의 끝 화면 그대로)", async ({ browser }) => {
  const errors = [];
  const { pc, ph, ended } = await endedThenNewWindow(browser, errors);
  const before = await classDocs(pc.uid, pc.pin);
  await pc.page.waitForTimeout(2500);
  const after = await classDocs(pc.uid, pc.pin);
  expect(after["sessions/s" + pc.pin].updateTime, "세션을 다시 썼어요").toBe(before["sessions/s" + pc.pin].updateTime);
  expect(after["lessons/deck"].updateTime, "수업을 다시 썼어요").toBe(before["lessons/deck"].updateTime);
  expect(field(after["sessions/s" + pc.pin], "memoId")).toBe(field(ended, "memoId"));
  await expect(ph.page.locator(".memo-sheet")).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("다른 PC가 수업 중일 때 이 PC에서 다른 수업을 골라도: 그 수업의 세션은 그대로(초기화되지 않음), 휴대폰도 그 수업을 따라가요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacherStarts(browser, errors, who);
  const ph = await phoneJoins(browser, errors, a.url, who);
  a.pin = pinOf(a.url); a.uid = await uidOf(a);
  await nextBtn(a.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  const live = await sessionOf(a);
  const b = await otherPc(browser, errors, who);
  await pickExample(b.page, "ex-m3-fraction");
  await b.page.waitForTimeout(2500);
  const now = await sessionOf(a);
  expect(field(now, "started")).toBe(true);
  expect(field(now, "ended")).toBe(false);
  expect(field(now, "t0")).toBe(field(live, "t0"));
  expect(now.updateTime, "다른 PC가 수업 중인 세션을 썼어요").toBe(live.updateTime);
  expect(field((await classDocs(a.uid, a.pin))["lessons/deck"], "lessonId")).not.toBe("ex-m3-fraction");
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await nextBtn(a.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  expect(real(errors)).toEqual([]);
});
