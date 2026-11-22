// 내 수업을 계정에(2026-11-11, docs/MY-LESSONS.md): teachers/{UID}/decks/{수업 id}. 같은 계정의 다른 PC에서 같은 목록,
// 다른 계정과는 섞이지 않고, 수업 진행(세션 · 지금 수업 lessons/deck · 휴대폰)은 예전 그대로예요. Firebase 에뮬레이터(가짜 프로젝트 demo-navi)에서만 돌아요
import { test, expect } from "@playwright/test";
import { LABELS, watch, curLabel, nextBtn, toFlow, copyCurrent, localRecords, finishLesson, fixture } from "./helpers.js";
import { EMU, PROJECT, PC, PHONE, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, stageLabel, uidAfterSignIn } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const real = (errors) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::|permission-denied|Missing or insufficient permissions/.test(e));
const ADMIN = { Authorization: "Bearer owner" };
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
const adminDoc = async (p) => { const r = await fetch(docUrl(p), { headers: ADMIN }); return r.ok ? r.json() : null; };
const val = (d, k) => { const v = d && d.fields && d.fields[k]; return v ? Object.values(v)[0] : undefined; };
// 관리자 권한(에뮬레이터만)으로 그 교사의 내 수업을 있는 그대로 읽어요
async function decks(uid) {
  const r = await fetch(docUrl("teachers/" + uid + "/decks") + "?pageSize=300", { headers: ADMIN });
  const j = r.ok ? await r.json() : {};
  return (j.documents || []).map((d) => ({ id: d.name.split("/").pop(), title: val(d, "title"), myId: val(d, "myId"), kind: val(d, "kind"),
    n: ((d.fields.pages || {}).arrayValue || {}).values ? d.fields.pages.arrayValue.values.length : 0, updated: d.updateTime }));
}
const rows = (page) => page.locator(".mylib .mrow");
async function newLesson(page, title) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  await page.locator("#ls-title").fill(title);
  await page.locator("#ls-title").blur();
  await expect(page.locator(".sbar-title b")).toHaveText(title);
}
async function teacher(browser, errors, who) {
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  return pc;
}
async function logout(page) {
  await page.getByRole("tab", { name: "발표 설정" }).click();
  await Promise.all([page.waitForEvent("load"), page.locator(".set-layout").getByRole("button", { name: "로그아웃" }).click()]);
  await expect(page.locator(".side-foot .dstate").filter({ hasText: "모바일 리모컨" })).toContainText("연결 전");
}

test("계정에 저장: 수업 3개를 만들면 계정에 3개, 같은 계정의 다른 PC에서도 같은 목록 · 같은 장면이에요. 휴대폰은 PC가 연 내 수업을 따라가요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacher(browser, errors, who);
  // 저장 위치는 제목 아래 한 줄(2026-11-14): 계정에 저장, 아직 0개
  await expect(a.page.locator(".mylib .my-where")).toContainText("계정에 저장돼요");
  await expect(a.page.locator(".mylib .m-empty")).toContainText("아직 만든 수업이 없어요");
  await expect(rows(a.page)).toHaveCount(0);
  for (const t of ["국어 1", "수학 2", "과학 3"]) {
    await newLesson(a.page, t);
    await a.page.getByRole("button", { name: "+ 장면 추가" }).click();
  }
  await expect(a.page.locator(".sbar .save")).toContainText("계정에 저장");
  await expect.poll(async () => (await decks(a.uid)).map((d) => d.title + ":" + d.n + ":" + (d.id === d.myId) + ":" + d.kind).sort().join("|"), { timeout: 15000 })
    .toBe("과학 3:2:true:mine|국어 1:2:true:mine|수학 2:2:true:mine");
  // 지금 수업(휴대폰이 읽는 lessons/deck)은 마지막에 연 내 수업이에요
  await expect.poll(async () => { const d = await adminDoc("teachers/" + a.uid + "/lessons/deck"); return val(d, "kind") + ":" + val(d, "title"); }).toBe("mine:과학 3");
  // 같은 계정의 다른 PC(다른 브라우저): 같은 3개, 열면 같은 장면
  const b = await teacher(browser, errors, who);
  await b.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(b.page)).toHaveCount(3);
  await expect(rows(b.page).locator(".m-text b")).toHaveText(["과학 3", "수학 2", "국어 1"]);
  await rows(b.page).filter({ hasText: "국어 1" }).locator(".m-open").click();
  await expect(b.page.locator(".sbar-title b")).toHaveText("국어 1");
  await expect(b.page.locator(".srow .t")).toHaveText(["새 장면", "새 장면"]);
  // 휴대폰(같은 계정): PC A가 연 수업 ‘과학 3’을 보여 주고, 시작하면 그 장면을 따라가요
  const url = await qrUrl(a.page);
  const ph = await phoneJoins(browser, errors, url, who);
  await expect(ph.page.locator("body")).toContainText("과학 3");
  const [stage] = await Promise.all([a.page.waitForEvent("popup"), a.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText("새 장면");
  await expect(ph.page.locator(".rm-n").first()).toContainText("1");
  expect(real(errors)).toEqual([]);
});

test("계정끼리 섞이지 않아요: 같은 브라우저에서 교사 A가 로그아웃하고 교사 B가 로그인하면 A의 내 수업은 보이지 않고, B가 만든 수업은 A에게 보이지 않아요", async ({ browser }) => {
  const errors = [], whoA = email("teacher-a"), whoB = email("teacher-b");
  const pc = await teacher(browser, errors, whoA);
  const uidA = pc.uid;
  await newLesson(pc.page, "A의 수업 1");
  await newLesson(pc.page, "A의 수업 2");
  await expect.poll(async () => (await decks(uidA)).length, { timeout: 15000 }).toBe(2);
  await logout(pc.page);
  // 로그인하지 않은 화면: 계정의 내 수업은 보이지 않아요
  await pc.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(pc.page)).toHaveCount(0);
  await expect(pc.page.locator("#app")).not.toContainText("A의 수업");
  // 교사 B: 목록 0, 지금 수업도 A의 것이 아니에요
  await signIn(pc.page, whoB);
  await pcLinked(pc.page);
  const uidB = await uidAfterSignIn(pc.page);
  await pc.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(pc.page.locator(".mylib .my-where")).toContainText("계정에 저장돼요");
  await expect(pc.page.locator(".mylib .m-empty")).toContainText("아직 만든 수업이 없어요");
  await expect(rows(pc.page)).toHaveCount(0);
  await expect(pc.page.locator("#app")).not.toContainText("A의 수업");
  await newLesson(pc.page, "B의 수업");
  await expect.poll(async () => (await decks(uidB)).map((d) => d.title).join(), { timeout: 15000 }).toBe("B의 수업");
  expect((await decks(uidA)).map((d) => d.title).sort()).toEqual(["A의 수업 1", "A의 수업 2"]);
  // 다시 A: A의 두 수업만, 마지막에 연 ‘A의 수업 2’가 지금 수업
  await logout(pc.page);
  await signIn(pc.page, whoA);
  await pcLinked(pc.page);
  await expect(rows(pc.page)).toHaveCount(2);
  await expect(rows(pc.page).locator(".m-text b")).toHaveText(["A의 수업 2", "A의 수업 1"]);
  // 마지막에 연 수업에는 ‘최근에 연 수업’이 붙고, 수업 준비에 그 수업이 열려 있어요
  await expect(rows(pc.page).filter({ hasText: "A의 수업 2" })).toContainText("최근에 연 수업");
  await toFlow(pc.page);
  await expect(pc.page.locator(".sbar-title b")).toHaveText("A의 수업 2");
  await expect(pc.page.locator("#app")).not.toContainText("B의 수업");
  expect(real(errors)).toEqual([]);
});

test("진행 중인 수업과 새 수업: 수업 중에는 내 수업을 바꾸지 못하고, 끝난 뒤 새 수업을 만들어도 끝난 수업의 세션 · 기록 · 그 수업은 그대로, 휴대폰은 새 수업을 따라가요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacher(browser, errors, who);
  // 예시를 내 수업으로 복제해 그 수업으로 가르쳐요
  await toFlow(a.page);
  await copyCurrent(a.page);
  await expect.poll(async () => (await decks(a.uid)).length, { timeout: 15000 }).toBe(1);
  const first = (await decks(a.uid))[0];
  const url = await qrUrl(a.page), pin = url.match(/#remote-(\d{4})/)[1];
  const ph = await phoneJoins(browser, errors, url, who);
  const [stage] = await Promise.all([a.page.waitForEvent("popup"), a.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(LABELS[0]);
  await nextBtn(a.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  // 같은 계정의 다른 PC가 수업 중에 새 수업을 만들고 고쳐요: 내 수업에는 저장되지만, 진행 중인 수업(세션 · 지금 수업 · 휴대폰)은 그대로예요
  const b = await teacher(browser, errors, who);
  await expect(b.page.locator(".ctl-offer")).toContainText("다른 기기에서 수업을 진행하고 있어요");
  const deckBefore = await adminDoc("teachers/" + a.uid + "/lessons/deck"), sesBefore = await adminDoc("teachers/" + a.uid + "/sessions/s" + pin);
  await newLesson(b.page, "B가 만든 수업");
  await b.page.getByRole("button", { name: "+ 장면 추가" }).click();
  await expect.poll(async () => (await decks(a.uid)).map((d) => d.title).sort().join("|"), { timeout: 15000 }).toBe(["B가 만든 수업", first.title].sort().join("|"));
  await b.page.waitForTimeout(1000);
  expect(await adminDoc("teachers/" + a.uid + "/lessons/deck"), "지금 수업 문서는 한 글자도 바뀌지 않아요").toEqual(deckBefore);
  expect(await adminDoc("teachers/" + a.uid + "/sessions/s" + pin), "세션도 그대로").toEqual(sesBefore);
  expect(val(sesBefore, "cur")).toBe("s2");
  await expect(curLabel(ph.page)).toHaveText(LABELS[1]);
  await expect(curLabel(a.page)).toHaveText(LABELS[1]);
  // 수업은 계속 넘어가요
  await nextBtn(a.page).click();
  await expect(curLabel(ph.page)).toHaveText(LABELS[2]);
  // A가 수업을 끝내요 → 기록 1건, 세션 끝남
  await a.page.keyboard.press("End");
  await finishLesson(a.page);
  await expect.poll(async () => val(await adminDoc("teachers/" + a.uid + "/sessions/s" + pin), "ended")).toBe(true);
  await expect.poll(async () => (await localRecords(a.page)).length).toBe(1);
  const rec = (await localRecords(a.page))[0];
  expect(rec.title).toBe(first.title);
  // 새 수업을 만들고 고쳐요(‘새 수업 준비’ → 비우기는 진행 화면만 비워요. 기록은 남아요)
  await a.page.getByRole("button", { name: "새 수업 준비" }).click();
  await a.page.getByRole("button", { name: "비우기" }).click();
  await newLesson(a.page, "다음 시간 수업");
  await a.page.getByRole("button", { name: "+ 장면 추가" }).click();
  await expect.poll(async () => (await decks(a.uid)).length, { timeout: 15000 }).toBe(3);
  // 끝난 수업의 기록 · 그 수업(복제본)은 그대로
  expect(await localRecords(a.page)).toEqual([rec]);
  const again = (await decks(a.uid)).find((d) => d.id === first.id);
  expect([again.title, again.n, again.updated]).toEqual([first.title, first.n, first.updated]);
  // 지금 수업 · 휴대폰은 새 수업을 따라가요
  await expect.poll(async () => val(await adminDoc("teachers/" + a.uid + "/lessons/deck"), "title")).toBe("다음 시간 수업");
  await expect(ph.page.locator("body")).toContainText("다음 시간 수업", { timeout: 15000 });
  expect(real(errors)).toEqual([]);
});

// 이 브라우저의 파일 저장소(IndexedDB)에 있는 파일 수(교사마다 navi-files-{교사 id}, 로그인하지 않으면 navi-files)
const fileCount = (page, name) => page.evaluate((name) => new Promise((res, rej) => {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => ["files", "pages"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
  r.onsuccess = () => { const q = r.result.transaction("files", "readonly").objectStore("files").count(); q.onsuccess = () => { res(q.result); r.result.close(); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}), name);
const drawn = (img) => expect.poll(() => img.evaluate((i) => (i.src.indexOf("blob:") === 0 && i.complete ? i.naturalWidth : 0)).catch(() => 0), { timeout: 15000 }).toBeGreaterThan(0);
const filesCard = (page) => page.locator(".scard").filter({ has: page.getByRole("heading", { name: "이 브라우저의 파일" }) });

test("올린 파일은 그 교사 · 그 브라우저에만: 계정에는 파일 id만 올라가고, 휴대폰 · 다른 PC는 ‘교사 PC에만 있어요 · 이 브라우저에 없어요’라고 말해요. 같은 브라우저의 교사 B에게는 A의 파일이 보이지 않아요", async ({ browser }) => {
  const errors = [], whoA = email("teacher-a"), whoB = email("teacher-b");
  const a = await teacher(browser, errors, whoA);
  const uidA = a.uid;
  await a.page.locator("#pdf-in").setInputFiles(fixture("lesson.pdf"));
  await expect(a.page.getByText("파일은 이 브라우저에 저장했어요")).toBeVisible({ timeout: 30000 });
  await drawn(a.page.locator(".sp-slide .slide.img img"));
  // 계정의 내 수업: 장면 글자와 파일 id만(파일 · blob 주소는 계정에 없어요)
  await expect.poll(async () => (await decks(uidA)).map((d) => d.kind + ":" + d.n).join(), { timeout: 15000 }).toBe("mine:3");
  const raw = JSON.stringify(await adminDoc("teachers/" + uidA + "/decks/" + (await decks(uidA))[0].id));
  expect(raw).not.toContain("blob:");
  expect(raw).toMatch(/"fid":{"stringValue":"f-[0-9a-f]{32}"}/);
  expect(await fileCount(a.page, "navi-files-" + uidA)).toBe(1);
  expect(await fileCount(a.page, "navi-files"), "로그인하지 않은 칸에는 넣지 않아요").toBe(0);
  // 휴대폰(같은 계정): 장면은 따라가지만 쪽 그림은 교사 PC에만 있다고 말해요. 수업 화면(이 PC의 창)은 그림 그대로
  const url = await qrUrl(a.page);
  const ph = await phoneJoins(browser, errors, url, whoA);
  const [stage] = await Promise.all([a.page.waitForEvent("popup"), a.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await drawn(stage.locator(".stage .slide.img img"));
  await expect(ph.page.locator(".rm-tv")).toContainText("이 파일은 교사 PC에만 있어요", { timeout: 20000 });
  await a.page.keyboard.press("End");
  await finishLesson(a.page);
  await expect.poll(async () => (await localRecords(a.page)).length).toBe(1);
  await a.page.getByRole("button", { name: "수업 준비로" }).click();
  // 같은 브라우저에서 교사 B: A의 파일은 목록에도, 저장소에도 없어요
  await logout(a.page);
  await signIn(a.page, whoB);
  await pcLinked(a.page);
  const uidB = await uidAfterSignIn(a.page);
  await a.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(filesCard(a.page)).toContainText("파일 0개");
  await expect(filesCard(a.page)).toContainText("저장한 파일이 없어요");
  expect(await fileCount(a.page, "navi-files-" + uidB)).toBe(0);
  await a.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(a.page)).toHaveCount(0);
  // 다시 A: 파일 그대로, 수업을 열면 그림이 보여요
  await logout(a.page);
  await signIn(a.page, whoA);
  await pcLinked(a.page);
  await a.page.getByRole("tab", { name: "내 수업" }).click();
  await rows(a.page).filter({ hasText: "lesson" }).locator(".m-open").click();
  await drawn(a.page.locator(".sp-slide .slide.img img"));
  await a.page.getByRole("tab", { name: "발표 설정" }).click();
  await expect(filesCard(a.page)).toContainText("파일 1개");
  await expect(filesCard(a.page).locator(".frow")).toContainText("쓰는 수업 lesson");
  // A의 다른 PC(다른 브라우저): 같은 수업이 열리지만 파일은 없다고 말하고, 다시 넣는 길을 알려 줘요
  const o = await teacher(browser, errors, whoA);
  await o.page.getByRole("tab", { name: "내 수업" }).click();
  await rows(o.page).filter({ hasText: "lesson" }).locator(".m-open").click();
  await expect(o.page.locator(".sp-slide .slide.img.miss")).toContainText("이 브라우저에 파일이 없어요");
  await expect(o.page.locator(".file-need")).toContainText("파일 다시 넣기");
  expect(real(errors)).toEqual([]);
});

test("로그인하기 전에 만든 내 수업: 로그인해도 저절로 계정에 올라가지 않고, ‘이 계정으로 가져오기’ 뒤 열면 계정에 저장돼요. 원래 줄은 지우지 않아요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const pc = await device(browser, PC, errors);
  await pc.page.goto("/");
  await newLesson(pc.page, "로그인 전 수업");
  await expect(pc.page.locator(".sbar .save")).toContainText("이 브라우저에 저장");
  await pc.page.waitForTimeout(800);
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  const uid = await uidAfterSignIn(pc.page);
  await pc.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(pc.page)).toHaveCount(0);
  expect((await decks(uid)).length).toBe(0);
  // 기록 화면에서 가져오기(교사가 고를 때만)
  await pc.page.getByRole("tab", { name: /수업 기록/ }).click();
  await expect(pc.page.locator(".old-note")).toContainText("내 수업 1개");
  await pc.page.getByRole("button", { name: "이 계정으로 가져오기" }).click();
  await pc.page.getByRole("button", { name: "가져오기", exact: true }).click();
  await pc.page.getByRole("tab", { name: "내 수업" }).click();
  const row = rows(pc.page).filter({ hasText: "로그인 전 수업" });
  await expect(row).toContainText("이 브라우저에만 있어요");
  expect((await decks(uid)).length, "열기 전에는 계정에 쓰지 않아요").toBe(0);
  await row.locator(".m-open").click();
  await expect(pc.page.locator(".sbar-title b")).toHaveText("로그인 전 수업");
  await expect.poll(async () => (await decks(uid)).map((d) => d.title).join(), { timeout: 15000 }).toBe("로그인 전 수업");
  await pc.page.getByRole("tab", { name: "내 수업" }).click();
  await expect(rows(pc.page)).toHaveCount(1);
  await expect(rows(pc.page).filter({ hasText: "이 브라우저에만 있어요" })).toHaveCount(0);
  // 원래 줄: 로그인하지 않은 칸(navi-local)에는 가져간 계정 표시로, 이 계정 칸에는 옮긴 곳 표시로 남아요
  const kept = await pc.page.evaluate(async (uid) => {
    const all = (name) => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" })); r.onsuccess = () => { const q = r.result.transaction("lessons", "readonly").objectStore("lessons").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); });
    const a = (await all("navi-local")).filter((x) => x.kind === "mine"), b = (await all("navi-local-" + uid)).filter((x) => x.kind === "mine");
    return [a.map((x) => x.claimedBy === uid && !!x.deck), b.map((x) => !!x.movedTo && !!x.deck)];
  }, uid);
  expect(kept).toEqual([[true], [true]]);
  expect(real(errors)).toEqual([]);
});

// 저장 표시는 그대로(2026-11-13, docs/STABILITY.md 2-1): 계정이 받았다고 답하기 전에는 ‘계정에 저장’이라고 하지 않아요.
// 예전에는 저장이 0.4초를 기다리거나 가는 중에도 ‘계정에 저장’이어서, 그 사이 브라우저를 닫으면 방금 넣은 자료가 남지 않았어요(tests/e2e.spec.js 5단계에서 찾음)
test("내 수업 저장 표시: 고친 직후 · 인터넷이 끊긴 동안은 ‘계정에 저장’이라고 하지 않고, 계정이 받은 뒤에만 그렇게 말해요", async ({ browser }) => {
  const errors = [], who = email("teacher");
  const a = await teacher(browser, errors, who);
  await newLesson(a.page, "저장 표시");
  const save = a.page.locator(".sbar .save");
  await expect.poll(async () => (await decks(a.uid)).map((d) => d.title + ":" + d.n).join("|"), { timeout: 15000 }).toBe("저장 표시:1");
  await expect(save).toHaveText("계정에 저장");
  // 고친 바로 그때는 아직 계정에 없어요: ‘저장하는 중’ → 계정이 받으면 ‘계정에 저장’
  await a.page.getByRole("button", { name: "+ 장면 추가" }).click();
  await expect(save).toHaveText("저장하는 중");
  await expect(save).toHaveText("계정에 저장");
  expect((await decks(a.uid))[0].n).toBe(2);
  // 인터넷이 끊긴 채 고치면 계정에 가지 않아요: ‘저장 기다리는 중’(경고), 계정의 수업도 그대로
  await a.ctx.setOffline(true);
  await a.page.getByRole("button", { name: "+ 장면 추가" }).click();
  await expect(save).toHaveText("저장 기다리는 중");
  await expect(save).toHaveClass(/warn/);
  await a.page.waitForTimeout(1500);
  await expect(save).toHaveText("저장 기다리는 중");
  expect((await decks(a.uid))[0].n).toBe(2);
  // 다시 이어지면 계정에 가고, 그 뒤에만 ‘계정에 저장’
  await a.ctx.setOffline(false);
  await expect.poll(async () => (await decks(a.uid))[0].n, { timeout: 15000 }).toBe(3);
  await expect(save).toHaveText("계정에 저장");
  expect(real(errors)).toEqual([]);
});

// ---------- 내 수업 첫 화면 · 계정 자리(2026-11-14, docs/MY-LESSONS.md) ----------
// 계정은 왼쪽 메뉴 맨 아래(모든 준비 화면), 휴대폰은 위쪽 머리 줄. 이메일은 계정 메뉴 안에만. 수업 진행 화면 · 모바일 리모컨에는 없어요
const acctBtn = (page) => page.locator(".side .acct-btn");
test("계정 자리: 로그인 전에는 왼쪽 메뉴에 ‘구글로 로그인’, 로그인하면 표시 이름 · 계정 메뉴(이메일 · 이름 바꾸기 · 로그아웃). 펼친 · 접은 메뉴 · 태블릿 · 1280×590에서 겹치지 않아요", async ({ browser }) => {
  const errors = [], who = email("acct");
  const pc = await device(browser, { viewport: { width: 1280, height: 590 } }, errors);
  await pc.page.goto("/");
  // 로그인 전: 저장 위치와 로그인 길이 보이고, 로그인하지 않아도 새 수업을 만들 수 있어요
  await expect(pc.page.locator(".side .acct-login")).toContainText("구글로 로그인");
  await expect(pc.page.locator(".side .keep-mini input")).toBeChecked();
  await expect(pc.page.locator(".mylib .my-where")).toContainText("이 브라우저에만 저장돼요");
  await expect(pc.page.locator('.mylib [data-act="my-new"]')).toBeEnabled();
  await signIn(pc.page, who, { name: "김하늘" });
  await pcLinked(pc.page);
  // 처음 로그인: 표시 이름을 묻는 줄이 내 수업 위에 짧게(강한 단추는 ‘새 수업 만들기’ 하나)
  await expect(pc.page.locator(".name-ask")).toBeVisible();
  await expect(pc.page.locator("#app .main .btn.warm:visible")).toHaveCount(1);
  // 이름을 정하기 전에도 내 수업 · 왼쪽 메뉴에는 이메일이 보이지 않아요(구글 이름으로 말해요)
  await expect(pc.page.locator(".mylib .my-where")).toContainText("김하늘 계정에 저장돼요");
  await expect(pc.page.locator(".mylib")).not.toContainText(who);
  await expect(pc.page.locator("aside.side")).not.toContainText(who);
  await pc.page.locator(".name-ask").getByRole("button", { name: "이 이름으로 시작" }).click();
  await expect(pc.page.locator(".name-ask")).toHaveCount(0);
  // 왼쪽 메뉴: 이름과 ‘구글 계정’만(이메일은 보이지 않아요)
  await expect(acctBtn(pc.page)).toContainText("김하늘");
  await expect(acctBtn(pc.page)).toContainText("구글 계정");
  await expect(pc.page.locator("aside.side")).not.toContainText(who);
  await expect(pc.page.locator(".mylib .my-where")).toContainText("김하늘 계정에 저장돼요");
  await expect(pc.page.locator(".mylib .my-help")).toContainText("PDF · PPTX 원본은 이 브라우저에, 장면 글자는 계정에 저장돼요");
  // 1280×590: 계정 자리가 기기 상태 아래에 겹치지 않고 화면 안에 있어요
  const box = async () => pc.page.evaluate(() => { const a = document.querySelector(".side .acct-btn").getBoundingClientRect(), f = document.querySelector(".side .side-foot").getBoundingClientRect(), n = document.querySelector(".side .side-nav").getBoundingClientRect();
    return { below: a.top >= f.bottom - 0.5, navAbove: n.bottom <= f.top + 0.5, inView: a.bottom <= innerHeight + 0.5, w: a.width, h: a.height }; });
  for (const tab of ["내 수업", "수업 준비", "수업 기록", "발표 설정"]) {
    await pc.page.getByRole("tab", { name: new RegExp("^" + tab) }).click();
    const b = await box();
    expect(b, tab + " 1280×590").toMatchObject({ below: true, navAbove: true, inView: true });
    expect(b.h).toBeGreaterThanOrEqual(44);
  }
  // 계정 메뉴: 이메일 · 이름 바꾸기 · 로그아웃. Esc로 닫혀요
  await acctBtn(pc.page).click();
  const pop = pc.page.locator(".acct-pop");
  await expect(pop).toContainText(who);
  await expect(pop.getByRole("button", { name: "이름 바꾸기" })).toBeVisible();
  await expect(pop.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await pc.page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  // 이름 바꾸기 → 발표 설정의 이름 칸
  await acctBtn(pc.page).click();
  await pop.getByRole("button", { name: "이름 바꾸기" }).click();
  await expect(pc.page.getByRole("tab", { name: "발표 설정" })).toHaveAttribute("aria-selected", "true");
  await expect(pc.page.locator("#name-in")).toBeVisible();
  await pc.page.getByRole("button", { name: "취소" }).click();
  // 접은 메뉴(64px): 동그라미 하나, 누르면 메뉴가 메뉴 오른쪽에 열려요
  await pc.page.locator('.side [data-act="side"]').click();
  await expect(acctBtn(pc.page)).toBeVisible();
  expect((await acctBtn(pc.page).boundingBox()).width).toBeLessThanOrEqual(64);
  await acctBtn(pc.page).click();
  expect((await pop.boundingBox()).x).toBeGreaterThanOrEqual(64);
  await pc.page.keyboard.press("Escape");
  await pc.page.locator('.side [data-act="side"]').click();
  // 태블릿(1024×768): 메뉴가 저절로 접혀도 같은 동그라미
  await pc.page.setViewportSize({ width: 1024, height: 768 });
  await expect(acctBtn(pc.page)).toBeVisible();
  expect((await acctBtn(pc.page).boundingBox()).width).toBeLessThanOrEqual(64);
  // 로그아웃(메뉴에서): 로그인 전 화면으로
  await pc.page.setViewportSize({ width: 1280, height: 590 });
  await acctBtn(pc.page).click();
  await Promise.all([pc.page.waitForEvent("load"), pop.getByRole("button", { name: "로그아웃" }).click()]);
  await expect(pc.page.locator(".side .acct-login")).toContainText("구글로 로그인");
  expect(real(errors)).toEqual([]);
});

test("휴대폰 계정 자리: 준비 화면 머리 줄의 동그라미 → 아래에서 올라오는 계정 메뉴. 모바일 리모컨 수업 화면에는 계정 단추 · 머리 줄이 없어요", async ({ browser }) => {
  const errors = [], who = email("acct-ph");
  const pc = await teacher(browser, errors, who);
  const url = await qrUrl(pc.page);
  // 같은 계정의 휴대폰, 준비 화면(주소에 #remote 없음)
  const ph = await device(browser, PHONE, errors);
  await ph.page.goto("/");
  await signIn(ph.page, who);
  const head = ph.page.locator(".ph-head");
  await expect(head).toBeVisible();
  await expect(head.locator(".acct-btn")).toBeVisible();
  // 누르는 곳은 44px 이상(로그인 직후 다시 그려지는 동안은 기다려요)
  await expect.poll(async () => { const hb = await head.locator(".acct-btn").boundingBox(); return hb ? Math.min(hb.width, hb.height) : 0; }).toBeGreaterThanOrEqual(44);
  await head.locator(".acct-btn").click();
  const pop = ph.page.locator(".acct-pop");
  await expect(pop).toContainText(who);
  const pb = await pop.boundingBox();
  expect(Math.round(pb.y + pb.height)).toBe(844);
  await ph.page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  // 수업 시작 → 휴대폰을 리모컨(QR 주소)으로: 계정 단추 · 머리 줄이 없어요
  await toFlow(pc.page);
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  const rm = await phoneJoins(browser, errors, url, who);
  await expect(curLabel(rm.page)).toHaveText(LABELS[0]);
  await expect(rm.page.locator(".ph-head, .acct-btn, .acct-spot, .acct-pop")).toHaveCount(0);
  await expect(rm.page.locator("body")).not.toContainText(who);
  // 교사 화면(수업 진행)에도 계정 자리는 없어요
  await expect(pc.page.locator(".pv-head")).toBeVisible();
  await expect(pc.page.locator(".acct-btn, .acct-spot")).toHaveCount(0);
  expect(real(errors)).toEqual([]);
});

test("끝나지 않은 수업(실제 수업을 시작해 넘긴 뒤 PC 새로고침): 내 수업 맨 위 알림 한 곳에 ‘이어서 하기’가 강한 단추, 그 수업 줄에 장면 위치. 이어서 하기는 예전처럼 돼요", async ({ browser }) => {
  const errors = [], who = email("run");
  const pc = await teacher(browser, errors, who);
  await newLesson(pc.page, "끝나지 않을 수업");
  for (let i = 0; i < 3; i++) await pc.page.getByRole("button", { name: "+ 장면 추가" }).click();
  await expect(pc.page.locator(".sbar .save")).toContainText("계정에 저장", { timeout: 20000 });
  const [stage] = await Promise.all([pc.page.waitForEvent("popup"), pc.page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await nextBtn(pc.page).click();
  await expect(curLabel(pc.page)).toHaveText("새 장면");
  await expect(pc.page.locator(".prog-n").first()).toContainText("2");
  await pc.page.waitForTimeout(600);
  await pc.page.reload();
  const offer = pc.page.locator(".run-offer");
  await expect(offer).toHaveCount(1, { timeout: 30000 });
  await expect(offer).toContainText("끝나지 않은 수업이 있어요");
  await expect(pc.page.locator(".mylib")).toBeVisible();
  await expect(pc.page.locator(".sbar")).toHaveCount(0);
  await expect(pc.page.locator("#app .main .btn.warm:visible")).toHaveText(["이어서 하기"]);
  await expect(rows(pc.page).filter({ hasText: "끝나지 않을 수업" })).toContainText("끝나지 않은 수업 · 2 / 4");
  await expect(pc.page.locator(".mylib")).not.toContainText("계속 준비하기");
  const [stage2] = await Promise.all([pc.page.waitForEvent("popup"), offer.getByRole("button", { name: "이어서 하기" }).click()]);
  watch(stage2, errors);
  await expect(pc.page.locator(".prog-n").first()).toContainText("2");
  expect(real(errors)).toEqual([]);
});
