// 예시 수업 5개를 Firestore에 저장했다가 다른 기기(다른 브라우저)에서 다시 읽어, 원본과 깊게 비교해요 (1단계-1)
// Firestore는 ‘배열 안의 배열’(표 rows · 낱말 defs)을 그대로 못 담아서, 연결 코드(shim)가 감싸 저장하고 읽을 때 풀어요.
// 그 과정에서 장면 · 핵심 발화 · 수업 자료 · 표가 하나라도 달라지면 실패해요. Firebase 에뮬레이터에서만 돌아요.
import { test, expect } from "@playwright/test";
import { DATA, openLesson, watch } from "./helpers.js";
import { needEmulator, PC, PHONE, email, device, signIn, readDoc } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 120000 });

const plain = (o) => JSON.parse(JSON.stringify(o));
// 배열 안에 배열이 든 곳(Firestore가 그대로 못 담는 곳)
function nested(v, path, inArr, out) {
  if (Array.isArray(v)) { if (inArr) out.add(path.replace(/\[\d+\]/g, "[]")); v.forEach((x, i) => nested(x, path + "[" + i + "]", true, out)); }
  else if (v && typeof v === "object") Object.keys(v).forEach((k) => nested(v[k], path + "." + k, false, out));
  return out;
}
const tag = (L) => L.grade + "학년 " + L.subject + " · " + L.unit + " · " + L.period;

// 읽는 쪽은 모바일 리모컨(따라가는 기기)으로 열어서, 그 기기가 수업 내용을 스스로 쓰지 않게 해요
async function pair(browser, errors) {
  const who = email("teacher");
  const a = await device(browser, PC, errors);
  await a.page.goto("/");
  await signIn(a.page, who);
  const b = await device(browser, PHONE, errors);
  await b.page.goto("/#remote-0000");
  await signIn(b.page, who);
  // 휴대폰이 서버와 이어진 뒤에(실제 수업처럼) PC가 저장해요
  await expect(b.page.locator(".ph-top .chip").first()).toHaveText(/준비 완료|PC 준비 기다리는 중|PC 응답 없음/, { timeout: 20000 });
  // 대기 화면의 휴대폰은 20초마다 PC에 묻고(ping) PC가 곧바로 답해요(pong). 둘 다 lessons/hub에 쓰는 작은 쓰기예요.
  // 에뮬레이터는 이 작은 쓰기를 먼저 저장된 큰 수업 내용보다 앞서 휴대폰에 보내면서 ‘여기까지 다 보냈다’는 시각을 큰 저장 뒤로 매겨요.
  // 그러면 휴대폰의 Firestore SDK가 ‘수업 내용 없음’으로 굳히고, 뒤늦게 온 수업 내용을 ‘옛 소식’으로 버려요(Ignoring outdated watch update,
  // 다음 저장부터는 받아요. docs/AUTH-POLICY.md 8). 그래서 첫 묻고 답하기가 서버에서 끝난 뒤(다음 물음까지 20초)에 저장해요. 비교하는 내용은 그대로예요
  await b.page.evaluate(() => new Promise(async (res, rej) => {
    const db = await window.claude.use("db");
    const timer = setTimeout(() => { off(); rej(new Error("휴대폰의 첫 묻고 답하기(ping · pong)가 30초 안에 끝나지 않아요")); }, 30000);
    const off = db.doc("lessons/hub").onSnapshot((s) => {
      const d = s.exists ? s.data() : null;
      if (s.metadata.fromCache || s.metadata.hasPendingWrites || !d || !d.ping || !d.pong || d.pong.id !== d.ping.id) return;
      clearTimeout(timer); off(); res();
    });
  }));
  return { a, b };
}

// 보안 규칙이 수업 내용 문서에 앱이 쓰는 칸만 받아서, 원본의 장면(pages) · 수업 자료(res) 전체를 그 칸에 그대로 담아 보내요
// (lessons.js 맨 위의 id · unit · period는 앱이 수업 내용 문서에 쓰지 않는 칸이에요. 표지 머리말(tag)로만 들어가요)
test("예시 수업 5개 원본의 장면 · 수업 자료 전체: 저장 → 다른 기기에서 다시 읽기 → 원본과 똑같아요(배열 안의 배열 포함)", async ({ browser }) => {
  const errors = [];
  const { a, b } = await pair(browser, errors);
  expect(DATA.lessons.map((L) => L.id).sort()).toEqual(["ex-k6-cardnews", "ex-m3-fraction", "ex-p6-algorithm", "ex-s4-boiling", "ex-s5-ecosystem"]);
  const found = [];
  for (const L of DATA.lessons) {
    const orig = plain(L);
    found.push(L.id + ": " + [...nested(orig, "", false, new Set())].join(", "));
    const sent = { v: 5, kind: "example", lessonId: orig.id, key: orig.id, title: orig.title, grade: orig.grade, subject: orig.subject, total: orig.total, pages: orig.pages, res: orig.res };
    await a.page.evaluate(async (d) => { const db = await window.claude.use("db"); await db.doc("lessons/deck").set(d); }, sent);
    const got = await readDoc(b.page, "lessons/deck", { lessonId: L.id });
    expect(got, L.id + " 전체").toEqual(sent);
    expect(got.pages, L.id + " 원본 장면 전체").toEqual(orig.pages);
    // 화면이 쓰는 것을 하나씩 한 번 더: 장면 수와 순서, 장면 이름 · 핵심 발화 · 핵심 개념 · 표, 수업 자료
    expect(got.pages.map((p) => p.id), L.id + " 장면 순서").toEqual(orig.pages.map((p) => p.id));
    expect(got.pages.map((p) => [p.label, p.say, p.concepts, p.rows, p.defs]), L.id + " 장면 내용").toEqual(orig.pages.map((p) => [p.label, p.say, p.concepts, p.rows, p.defs]));
    expect(got.res, L.id + " 수업 자료").toEqual(orig.res);
  }
  test.info().annotations.push({ type: "배열 안의 배열이 있는 곳", description: found.join(" | ") });
  expect(errors).toEqual([]);
});

test("예시 수업 5개를 교사 PC에서 차례로 열면, 휴대폰이 읽는 수업 내용이 원본 장면 · 발화 · 자료와 같아요", async ({ browser }) => {
  const errors = [];
  const { a, b } = await pair(browser, errors);
  for (const L of DATA.lessons) {
    await openLesson(a.page, L.id);
    const got = await readDoc(b.page, "lessons/deck", { lessonId: L.id });
    expect([got.kind, got.title, got.total, got.grade, got.subject], L.id).toEqual(["example", L.title, L.total, L.grade, L.subject]);
    expect(got.pages.length, L.id + " 장면 수").toBe(L.pages.length);
    L.pages.forEach((p, i) => {
      const cover = i === 0 && p.layout === "cover";
      Object.keys(p).forEach((k) => {
        if (cover && (k === "eye" || k === "title")) return;
        expect(got.pages[i][k], L.id + " " + p.id + "." + k).toEqual(plain(p[k]));
      });
      if (cover) expect(got.pages[0].eye, L.id + " 표지 머리말").toBe(tag(L));
    });
    expect(got.res.length, L.id + " 자료 수").toBe(L.res.length);
    L.res.forEach((r, j) => Object.keys(r).forEach((k) => expect(got.res[j][k], L.id + " 자료 " + r.id + "." + k).toEqual(plain(r[k]))));
  }
  expect(errors).toEqual([]);
});

test("수업 진행 상태(장면 · 지나간 장면 · 신호등 · 질문 메모 · 띄운 자료 · 도구)도 저장 → 다시 읽기가 똑같아요", async ({ browser }) => {
  const errors = [];
  const { a, b } = await pair(browser, errors);
  const s = { v: 5, started: true, ended: false, cur: "s3", t0: 1762131600000, enteredAt: 1762131900000, at: 1762131950000,
    log: [{ id: "s1", sec: 120 }, { id: "s2", sec: 180 }], reactions: [{ id: "s2", type: "red", at: 1762131800000 }, { id: "s2", type: "clear", at: 1762131810000 }],
    qs: [{ id: "s2", text: "왜 거품이 생겨요?", at: 1762131820000 }], used: ["r1", "r4"], tv: "r4", blank: null, tool: { kind: "timer", end: 1762132000000, sec: 60 }, memoId: null };
  await a.page.evaluate(async (s) => { const db = await window.claude.use("db"); await db.doc("sessions/s4321").set(s); }, s);
  expect(await readDoc(b.page, "sessions/s4321", { cur: "s3" })).toEqual(s);
  expect(errors).toEqual([]);
});
