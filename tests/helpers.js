// 시험 공통 도우미
import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// 예시 수업 데이터 (public/lessons.js를 그대로 읽어요)
const box = {};
vm.runInNewContext(readFileSync(new URL("../public/lessons.js", import.meta.url), "utf8"), { window: box });
export const DATA = box.NAVI_DATA;
export const lesson = (id) => DATA.lessons.find((L) => L.id === id);

// 기본 예시 수업(4학년 과학 물이 끓을 때)의 장면 순서
export const LABELS = lesson("ex-s4-boiling").pages.map((p) => p.label);
// 교사 화면(노트북·PC·태블릿)으로 쓰는 크기: 휴대폰이 아니면 교사 화면이에요
export const isPc = (info) => !info.project.name.startsWith("phone");
export const isTablet = (info) => info.project.name.startsWith("tablet");
export const fixture = (name) => fileURLToPath(new URL("./fixtures/" + name, import.meta.url));

// JS 오류, 우리 서버에서 난 콘솔 오류, 우리 서버의 실패한 요청을 모아요 (외부 글꼴·CDN은 제외)
const OWN = process.env.BASE_URL || "http://localhost";
export function watch(page, errors) {
  const own = (url) => String(url || "").startsWith(OWN);
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && own(m.location().url)) errors.push("console: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && own(r.url())) errors.push(r.status() + " " + r.url()); });
  return errors;
}
export const scroll = (page) => page.evaluate(() => {
  const el = document.scrollingElement;
  return { down: el.scrollHeight > innerHeight + 1, side: el.scrollWidth > innerWidth + 1 };
});
export async function noSideScroll(page, where) {
  expect((await scroll(page)).side, where + ": 가로 스크롤이 생겨요").toBe(false);
}
// 지금 장면 이름 (교사 화면, 모바일 리모컨 모두)
export const curLabel = (page) => page.locator(".js-cur-label");
export const nextBtn = (page) => page.locator('[data-act="next"]').first();
// 수업 끝내기: 마지막 장면의 ‘수업 끝내기’ → 화면의 확인 줄에서 한 번 더 (다음 키·단추로는 끝나지 않아요)
export async function finishLesson(page) {
  await page.locator('[data-act="end-ask"]').first().click();
  await page.locator('.end-confirm [data-act="end"]').click();
}

// 처음 열면 '내 수업'이 떠요(2026-11-11). 교사처럼 옆 메뉴 '수업 준비'를 눌러 지금 수업의 준비 화면으로 가요.
// '내 수업'에는 머리 막대(수업 시작 · 수업 미리보기 · 휴대폰 연결)가 없어요(2026-11-14): 그 단추들은 수업 준비 화면에서 눌러요
export async function toFlow(page) {
  if (!(await page.locator(".flow3").count())) await page.getByRole("tab", { name: "수업 준비" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  await expect(page.locator(".sbar")).toBeVisible();
}
// 수업 준비 화면에서 ‘수업 시작’을 눌러요(수업 화면 창이 열려요). 내 수업에 있으면 먼저 수업 준비로 가요
export async function startFromPrep(page) {
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  return stage;
}
// 내 수업 목록의 한 줄에서 ⋯ 메뉴를 열고 그 안의 단추(열기 · 복제 · 삭제)를 눌러요
export async function rowAction(row, name) {
  await row.locator('[data-act="my-menu"]').click();
  await row.locator(".m-menu").getByRole("button", { name, exact: true }).click();
}
// '예시 수업'(내 수업과 따로 둔 메뉴)으로 가요
export async function toExamples(page) {
  if (await page.locator(".lcard").count()) return;
  await page.getByRole("tab", { name: "예시 수업" }).click();
  await expect(page.locator(".lcard").first()).toBeVisible();
}
// 예시 수업을 골라 그대로 열어요(예시 원본은 읽기 전용이에요)
export async function openLesson(page, id) {
  await toExamples(page);
  await page.locator('.lcard[data-v="' + id + '"]').click();
  await page.locator('.lib-sum [data-act="lib-open"], .lib-sum [data-act="lib-close"]').first().click();
  await expect(page.locator(".flow3")).toBeVisible();
}
// 예시 원본은 고칠 수 없어서(2026-11-11), 지금 연 예시를 '수정해서 사용하기'로 내 수업에 복제해요. 장면 id · 내용은 그대로예요
export async function copyCurrent(page) {
  await page.locator('.ex-ro [data-act="ex-copy"]').click();
  await expect(page.locator(".lmeta")).toBeVisible();
  await expect(page.locator(".flow3")).toBeVisible();
}
// 예시를 골라 내 수업으로 복제해 열어요
export async function copyLesson(page, id) {
  await openLesson(page, id);
  await copyCurrent(page);
}
// 이 브라우저(IndexedDB)에 저장된 수업 기록
// 로그인한 교사는 계정마다 따로(navi-local-{교사 id}), 로그인하지 않으면 navi-local이에요
export const localRecords = (page) => page.evaluate(async () => {
  const db = window.claude && window.claude.use ? await window.claude.use("db") : null;
  const name = "navi-local" + (db && db.account && db.account.uid && !db.account.device ? "-" + db.account.uid : "");
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => { const q = r.result.transaction("records", "readonly").objectStore("records").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); };
    r.onerror = () => rej(r.error);
  });
});

// 슬라이드가 창 안에 다 들어오는지: 잘림 없이 보이는 영역
export async function slideFits(stage) {
  return stage.evaluate(() => {
    const s = document.querySelector(".stage .slide");
    if (!s) return { ok: false, why: "슬라이드 없음" };
    const r = s.getBoundingClientRect();
    const ok = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 100;
    return { ok, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, ratio: +(r.width / r.height).toFixed(3) };
  });
}

// 수업 화면 영상 · PDF 시험(tests/stage-screen.spec.js · realtime.spec.js): 유튜브 · PDF 주소를 가짜 페이지로 돌려주고 몇 번 불렸는지 세요
export const VIDEO = "https://www.youtube.com/watch?v=navitest001";
export const PDF = "https://example.com/navi-test.pdf";
// 가짜 영상 페이지: 열린 시각(born)과 1초마다 하나씩 느는 숫자(재생된 초)를 가져요
export const FAKE = '<!doctype html><title>가짜 영상</title><body style="margin:0;background:#123;color:#fff;font:40px sans-serif"><p id="t">0</p>' +
  '<script>window.born = Date.now(); let n = 0; setInterval(() => { document.getElementById("t").textContent = ++n; }, 1000);</script>';
export async function fakeMedia(context) {
  const hits = [];
  await context.route(/youtube-nocookie\.com\/embed\/|example\.com\/navi-test\.pdf/, (r) => { hits.push(r.request().url()); return r.fulfill({ contentType: "text/html", body: FAKE }); });
  return hits;
}
// 수업 준비의 ‘더 넣기’(선택: 핵심 개념 · 단계 · 예상 시간 · 장면 영상 · 수업 자료)를 펼쳐요(2026-11-14, docs/SLIDE-PREP.md).
// 넣은 것이 없는 장면에서는 접혀 있고, 한 번 펼치면 다른 장면에서도 펼쳐진 채예요
export async function openMore(page) {
  const d = page.locator("#sp-more");
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
  await expect(d).toHaveAttribute("open", "");
}
// 수업 준비: 첫 장면에 링크 자료를 하나 넣어요. 지금 수업이 예시 원본이면 먼저 내 수업으로 복제해요
export async function addMaterial(page, title, link) {
  await toFlow(page);
  if (await page.locator(".ex-ro").count()) await copyCurrent(page);
  await page.locator('[data-act="scene-sel"]').first().click();
  await openMore(page);
  await page.locator('[data-act="add-open"]').click();
  await page.locator("#d-title").fill(title);
  await page.locator("#d-link").fill(link);
  await page.locator('[data-act="add-res"]').click();
  await expect(page.locator(".res-pane")).toContainText(title);
}
export async function showOnStage(page, title) {
  if (!(await page.locator(".pv-right .item").count())) await page.keyboard.press("m");
  await page.locator(".pv-right .item").filter({ hasText: title }).getByRole("button", { name: "수업 화면에 띄우기" }).click();
}
export const frameEl = (stage) => stage.locator(".stage .slide.media iframe");
// 처음 띄운 영상 칸에 표시를 달아 두고, 나중에 같은 요소인지 봐요(다시 만들어지면 표시가 없어요)
export const mark = (stage) => stage.evaluate(() => { document.querySelector(".stage iframe").__navi = "처음 것"; });
export const marked = (stage) => stage.evaluate(() => (document.querySelector(".stage iframe") || {}).__navi || "");
export const media = (stage) => stage.frames().find((f) => /youtube-nocookie|navi-test\.pdf/.test(f.url()));
export const born = async (stage) => { const f = media(stage); return f ? f.evaluate(() => window.born) : null; };
export const played = async (stage) => { const f = media(stage); return f ? f.evaluate(() => Number(document.getElementById("t").textContent)) : 0; };

// 파일을 저장할 수 없는 브라우저(사생활 보호 창 · 저장이 꺼진 브라우저)처럼: 파일 저장소(IndexedDB navi-files…)만 열리지 않아요(2026-11-11).
// 이때 올린 파일은 예전처럼 이 창에서만 쓰고, 다른 수업으로 바꾸기 전에 잃을 것을 알려 줘요. 기록 · 내 수업(navi-local)은 그대로 열려요
export const noFileStore = (page) => page.addInitScript(() => {
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (name) {
    if (String(name).indexOf("navi-files") !== 0) return open.apply(this, arguments);
    const req = {};
    setTimeout(() => { req.error = new DOMException("저장 꺼짐", "InvalidStateError"); if (req.onerror) req.onerror({ target: req }); }, 0);
    return req;
  };
});

// ---------- 영상 재생 제어 시험(tests/video.spec.js · realtime.spec.js, 2026-11-11 docs/VIDEO.md) ----------
// 영상 id(11자)로 가짜 플레이어의 모양을 골라요: 보통(10분) · 짧음(3초 뒤 끝) · 재생이 막힘(자동 재생 제한) · 삽입 금지(오류 150)
export const V = { ok: "https://youtu.be/navitest001", end: "https://www.youtube.com/watch?v=navitestend", block: "https://youtu.be/navitestblk", bad: "https://youtu.be/navitestbad", other: "https://youtu.be/navitest002" };
export const PLAYER = '<!doctype html><title>가짜 YouTube</title><body style="margin:0;background:#000;color:#fff;font:28px sans-serif"><p id="s">-1</p><p id="t">0</p><script>' +
  'const q = new URLSearchParams(location.search), id = location.pathname.split("/").pop(), DUR = /end$/.test(id) ? 3 : 600;' +
  'window.born = Date.now(); window.plays = 0; let state = -1, t = Number(q.get("start") || 0), timer = null, ready = false;' +
  'const send = (o) => parent.postMessage(JSON.stringify(o), "*");' +
  'const show = () => { document.getElementById("s").textContent = state; document.getElementById("t").textContent = t; };' +
  'const info = () => { show(); send({ event: "infoDelivery", info: { playerState: state, currentTime: t, duration: DUR } }); };' +
  'const set = (n) => { state = n; send({ event: "onStateChange", info: n }); info(); };' +
  'addEventListener("message", (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; }' +
  ' if (m.event === "listening" && !ready) { ready = true; if (/bad$/.test(id)) { send({ event: "onReady" }); send({ event: "onError", info: 150 }); return; } send({ event: "onReady" }); info(); }' +
  ' if (m.event !== "command") return;' +
  ' if (m.func === "playVideo") { if (/blk$/.test(id)) return; window.plays++; clearInterval(timer); set(1); timer = setInterval(() => { t = Math.round((t + 0.25) * 100) / 100; if (t >= DUR) { clearInterval(timer); t = DUR; set(0); } else info(); }, 250); }' +
  ' if (m.func === "pauseVideo") { clearInterval(timer); set(2); }' +
  ' if (m.func === "seekTo") { t = Number(m.args[0]) || 0; info(); } });' +
  "</script>";
export async function fakeYouTube(context) {
  const hits = [];
  await context.route(/youtube-nocookie\.com\/embed\//, (r) => { hits.push(r.request().url()); return r.fulfill({ contentType: "text/html", body: PLAYER }); });
  return hits;
}
export const player = (stage) => stage.frames().find((f) => /youtube-nocookie\.com\/embed\//.test(f.url()));
export const pstate = async (stage) => { const f = player(stage); return f ? f.evaluate(() => Number(document.getElementById("s").textContent)) : null; };
export const ptime = async (stage) => { const f = player(stage); return f ? f.evaluate(() => Number(document.getElementById("t").textContent)) : 0; };
export const pborn = async (stage) => { const f = player(stage); return f ? f.evaluate(() => window.born) : null; };
export const frame = (stage) => stage.locator(".stage iframe[data-vkey]");
export const bar = (page) => page.locator(".vid-bar");
export const chip = (stage) => stage.locator(".stage-bar .chip").first();
// 새 내 수업: 장면 3개, 첫 장면에 영상(링크), 이름은 ‘영상 장면’ · ‘둘째 장면’ · ‘셋째 장면’
export async function videoLesson(page, link) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.getByRole("button", { name: "새 수업 만들기" }).click();
  await expect(page.locator(".flow3")).toBeVisible();
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  await page.getByRole("button", { name: "+ 장면 추가" }).click();
  const ids = await page.locator(".srow").evaluateAll((els) => els.map((e) => e.getAttribute("data-v")));
  const names = ["영상 장면", "둘째 장면", "셋째 장면"];
  for (let i = 0; i < 3; i++) {
    await page.locator('.srow[data-v="' + ids[i] + '"]').click();
    await page.locator("#pg-" + ids[i] + "-label").fill(names[i]);
    await page.locator("#pg-" + ids[i] + "-label").blur();
  }
  await page.locator('.srow[data-v="' + ids[0] + '"]').click();
  if (link) { await openMore(page); await page.locator("#pg-" + ids[0] + "-video").fill(link); await page.locator("#pg-" + ids[0] + "-video").blur(); }
  return ids;
}

// ---------- 수업 기록 시험(tests/records.spec.js · history.spec.js, 2026-11-12 docs/RECORDS.md) ----------
// 이 브라우저의 기록 저장소(IndexedDB navi-local 또는 navi-local-{교사 id})를 있는 그대로 읽고 써요. 쓰기 전에는 같은 주소의 다른 파일을 열어 앱이 저장소를 열지 않게 해요
export const idbRecords = (page, name) => page.evaluate((name) => new Promise((res, rej) => {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
  r.onsuccess = () => { const q = r.result.transaction("records", "readonly").objectStore("records").getAll(); q.onsuccess = () => { r.result.close(); res(q.result); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}), name);
export async function seedRecords(page, name, list) {
  await page.goto("/lessons.js");
  await page.evaluate(([name, list]) => new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => ["records", "lessons"].forEach((s) => r.result.createObjectStore(s, { keyPath: "id" }));
    r.onsuccess = () => { const t = r.result.transaction("records", "readwrite"); list.forEach((x) => t.objectStore("records").put(x)); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }), [name, list]);
}
// 시험용 기록 하나(v2 모양: 0.6 · 0.7이 남기던 것). days: 며칠 전에 끝난 수업
export const oldRecord = (id, o) => Object.assign({ id, v: 2, key: "ex-m3-fraction", title: "분수 수업", grade: 3, subject: "수학", cls: "", at: Date.now() - (o && o.days || 0) * 86400000, totalSec: 600, plannedMin: 10,
  again: ["‘나누기’에서 다시 설명이 필요했어요"], used: [], text: "", usedTitles: [],
  scenes: [{ label: "도입", min: 3, sec: 200, sig: "green" }, { label: "나누기", min: 4, sec: 300, sig: "red" }, { label: "정리", min: 3, sec: 100, sig: "" }],
  sig: { red: 1, yellow: 0, green: 1 }, questions: [{ label: "나누기", text: "똑같이 나누는 까닭" }], events: [] }, o || {});

// 손가락으로 누르는 칸(PR #24 검토, 2026-11-16): sel 안의 누르는 것마다 44px 칸(보이는 크기가 작으면 가운데에서 위아래 · 좌우 22px)의
// 네 끝을 눌러 보고, 그것이 아닌 것(이웃 단추 · 빈 곳)이 눌리는 자리를 돌려줘요. seen은 보이는 크기
export const touchMisses = (page, sel) => page.evaluate(async (sel) => {
  const bad = [], seen = [];
  // 화면이 다시 그려질 수 있어 매번 새로 찾고, 재고 누르는 것은 그 사이에 그려지지 않게 한 번에 해요
  const n = document.querySelectorAll(sel).length;
  for (let i = 0; i < n; i++) {
    const first = document.querySelectorAll(sel)[i];
    if (!first || !first.getClientRects().length) continue;
    first.scrollIntoView({ block: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const el = document.querySelectorAll(sel)[i];
    if (!el || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, name = (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 20);
    const dy = Math.max(r.height, 44) / 2 - 0.5, dx = Math.max(r.width, 44) / 2 - 0.5;
    seen.push(name + " " + Math.round(r.width) + "×" + Math.round(r.height));
    for (const [x, y] of [[cx, cy - dy], [cx, cy + dy], [cx - dx, cy], [cx + dx, cy]]) {
      const at = document.elementFromPoint(x, y), hit = at && at.closest("button, label");
      if (hit !== el) bad.push(name + " @" + Math.round(x - r.left) + "," + Math.round(y - r.top) + " → " + (hit ? (hit.getAttribute("aria-label") || hit.textContent || "").trim().slice(0, 16) : at ? at.className : "none"));
    }
  }
  return { bad, seen };
}, sel);
