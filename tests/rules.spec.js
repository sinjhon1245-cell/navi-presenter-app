// Firestore 보안 규칙(firestore.rules) 허용 · 거부 시험
// Firebase 에뮬레이터 안의 가짜 프로젝트(demo-navi-rules)에서 돌려요. 실제 Firebase 프로젝트와 상관없어요.
// 실행: npm run test:emu (에뮬레이터 없이 npm test로 돌리면 '건너뜀'으로 나와요)
import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, getDocs, arrayUnion, setLogLevel, writeBatch, increment } from "firebase/firestore";
import { EMU, needEmulator } from "./firebase-helpers.js";
import { DATA } from "./helpers.js";

// 앱이 실제로 쓰는 모양(public/index.html의 lessonDeck · newDeck · defaultC)을 그대로 만들어요
const tagOf = (L) => L.grade + "학년 " + L.subject + " · " + L.unit + " · " + L.period;
// lessons.js는 다른 실행 공간(vm)에서 읽어서, Firestore 도구가 받도록 보통 객체로 한 번 옮겨요
const plain = (o) => JSON.parse(JSON.stringify(o));
const exampleDeck = (src) => { const L = plain(src); return { v: 5, kind: "example", lessonId: L.id, key: L.id, oldKeys: L.oldKeys || [], title: L.title, tag: tagOf(L), grade: L.grade, subject: L.subject, total: L.total,
  pages: L.pages.map((p, i) => Object.assign({ rec: [], want: "", notes: "" }, p, i === 0 && p.layout === "cover" ? { eye: tagOf(L), title: p.title || L.title } : {})),
  res: L.res.map((r) => Object.assign({ s: "ex" }, r)) }; };
const fileDeck = (kind, n) => ({ v: 5, kind, key: kind + ":4학년 과학 수업", title: "4학년 과학 수업", tag: "내 파일 · 4학년 과학 수업", total: 40, prep: "basic", srcLink: "",
  pages: Array.from({ length: n }, (_, i) => ({ id: "p" + (i + 1), n: i + 1, stage: "전개", label: (i + 1) + "장", min: 3, layout: "page", url: "", ar: 1.333, rec: [], want: "", notes: "", say: [], concepts: [] })), res: [] });
const settings = () => ({ v: 5, monitor: "2", presenter: true, strength: "보통", reactions: true, ai: true, theme: "light", palette: "navy", pin: "1234", className: "4학년 2반", classSize: 25,
  fontSize: "보통", showConcepts: true, showNotes: true, showNext: true, pace: true, tapNav: true, liveTone: "dark" });
// 앱의 연결 코드(public/claude-shim.js)처럼, Firestore가 못 담는 배열 안의 배열을 { __a: [...] }로 감싸서 써요
const pack = (v, inArr) => Array.isArray(v) ? (inArr ? { __a: v.map((x) => pack(x, true)) } : v.map((x) => pack(x, true)))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pack(x, false)])) : v;

// 거절이 맞는 시험이 많아서, Firestore가 거절마다 남기는 경고 글은 꺼요
setLogLevel("silent");
needEmulator();
test.describe.configure({ mode: "serial" });

const A = "teacher-a", B = "teacher-b";
const session = () => ({ v: 5, started: true, ended: false, cur: "s1", t0: 1, enteredAt: 1, log: [], reactions: [], qs: [], used: [], tv: null, blank: null, tool: null, memoId: null });
let env;

test.beforeAll(async () => {
  const [host, port] = EMU.split(":");
  env = await initializeTestEnvironment({ projectId: "demo-navi-rules", firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") } });
});
test.afterAll(async () => { if (env) await env.cleanup(); });
test.beforeEach(async () => {
  await env.clearFirestore();
  // 교사 A의 수업이 이미 진행 중인 상태에서 시작해요
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "teachers/" + A + "/sessions/s1234"), session());
    await setDoc(doc(db, "teachers/" + A + "/lessons/deck"), pack(exampleDeck(DATA.lessons[0])));
    await setDoc(doc(db, "teachers/" + A + "/lessons/settings"), settings());
    // 교사 B도 같은 PIN(1234)을 자기 설정에 둔 상태예요(같은 PIN을 쓰는 두 교사 시험. 한 계정은 자기 설정의 PIN 자리만 열어요)
    await setDoc(doc(db, "teachers/" + B + "/lessons/settings"), Object.assign(settings(), { className: "5학년 1반" }));
    // PIN 시험은 PIN 스위치를 켠 채로 해요(관리자가 콘솔에서 만드는 config/pin). 1차 정식 활성화처럼 꺼진 경우는 맨 아래 시험
    await setDoc(doc(db, "config/pin"), { on: true });
  });
});
// 구글로 로그인한 교사(앱이 쓰는 유일한 방식). provider를 바꾸면 같은 UID의 다른 로그인 방식이에요
const as = (uid, provider) => env.authenticatedContext(uid, { email: uid + "@example.com", firebase: { sign_in_provider: provider || "google.com" } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

test("교사는 자기 수업 진행 상태 · 수업 내용 · 설정을 읽고 쓸 수 있어요", async () => {
  const db = as(A);
  await assertSucceeds(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s2", enteredAt: 2 }));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { reactions: arrayUnion({ id: "s2", type: "red", at: 3 }) }));
  await assertSucceeds(setDoc(doc(db, "teachers/" + A + "/sessions/s5678"), session()));
  await assertSucceeds(getDocs(collection(db, "teachers/" + A + "/sessions")));
  await assertSucceeds(setDoc(doc(db, "teachers/" + A + "/lessons/deck"), pack(exampleDeck(DATA.lessons[0]))));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/settings"), { pin: "5678" }));
  await assertSucceeds(getDoc(doc(db, "teachers/" + A + "/lessons/settings")));
});

test("다른 교사 계정은 내 수업을 읽지도 쓰지도 못해요", async () => {
  const db = as(B);
  await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
  await assertFails(getDocs(collection(db, "teachers/" + A + "/sessions")));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s9" }));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/s9999"), session()));
  await assertFails(getDoc(doc(db, "teachers/" + A + "/lessons/deck")));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/lessons/settings"), { pin: "0000" }));
  // B는 자기 자리에서는 돼요(같은 PIN이어도 서로 다른 수업)
  await assertSucceeds(setDoc(doc(db, "teachers/" + B + "/sessions/s1234"), session()));
});

test("로그인하지 않은 사람은 아무것도 읽거나 쓰지 못해요", async () => {
  const db = nobody();
  await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
  await assertFails(getDocs(collection(db, "teachers/" + A + "/sessions")));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s9" }));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/s4321"), session()));
  await assertFails(getDoc(doc(db, "teachers/" + A + "/lessons/deck")));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/lessons/deck"), { v: 5 }));
  await assertFails(getDoc(doc(db, "teachers/" + A)));
});

test("정해진 모양이 아니면 자기 것이어도 거절해요", async () => {
  const db = as(A);
  // 세션 이름은 s + 숫자 4자리만
  await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/s12"), session()));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/x1234"), session()));
  // 정해진 칸 밖의 칸(예: 학생 이름)은 넣을 수 없어요
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { studentName: "홍길동" }));
  // 지나치게 큰 배열은 막아요
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { reactions: Array.from({ length: 301 }, (_, i) => ({ id: "s1", type: "red", at: i })) }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { qs: Array.from({ length: 121 }, (_, i) => ({ id: "s1", text: "q", at: i })) }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { reactions: "red" }));
  // lessons 아래는 deck · settings 두 문서만
  await assertFails(setDoc(doc(db, "teachers/" + A + "/lessons/other"), { v: 5 }));
  // 지우기는 1단계-1에서 막아 둬요
  await assertFails(deleteDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
  await assertFails(deleteDoc(doc(db, "teachers/" + A + "/lessons/deck")));
  // 교사 문서 자체 · 정해지지 않은 곳은 모두 막아요
  await assertFails(setDoc(doc(db, "teachers/" + A), { name: "A" }));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/memos/m1"), { at: 1 }));
  await assertFails(setDoc(doc(db, "students/x"), { name: "x" }));
  await assertFails(getDocs(collection(db, "teachers")));
});

test("PIN이나 세션 이름(s1234) · 교사 id를 알아도, 그 교사로 로그인하지 않으면 읽거나 쓸 수 없어요", async () => {
  // 교사 A의 PIN(1234)과 교사 id를 아는 다른 교사 B · 로그인 안 한 사람 · 다른 방식으로 로그인한 사람(익명 등)
  const other = [as(B), nobody(), env.authenticatedContext("anon-x", { firebase: { sign_in_provider: "anonymous" } }).firestore()];
  for (const db of other) {
    await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
    await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s9" }));
    await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { reactions: arrayUnion({ id: "s1", type: "red", at: 9 }) }));
    await assertFails(getDoc(doc(db, "teachers/" + A + "/lessons/settings")));
    // 교사 id를 몰라도 PIN만으로 찾는 길(모든 교사의 sessions를 한꺼번에 찾기)도 막혀요
    await assertFails(getDocs(collectionGroup(db, "sessions")));
    await assertFails(getDocs(query(collectionGroup(db, "lessons"), where("pin", "==", "1234"))));
  }
  // 교사 A 자신도 모든 교사의 sessions를 한꺼번에 찾을 수는 없어요(자기 경로로만 읽어요)
  await assertFails(getDocs(collectionGroup(as(A), "sessions")));
  // 같은 PIN을 쓰는 교사 B의 수업은 B의 자리에 따로 있고, A의 수업과 섞이지 않아요
  await assertSucceeds(setDoc(doc(as(B), "teachers/" + B + "/sessions/s1234"), Object.assign(session(), { cur: "b1" })));
  let a = null;
  await env.withSecurityRulesDisabled(async (c) => { a = (await getDoc(doc(c.firestore(), "teachers/" + A + "/sessions/s1234"))).data(); });
  if (!a || a.cur !== "s1") throw new Error("교사 A의 수업이 바뀌었어요: " + (a && a.cur));
});

test("구글 로그인만: 같은 UID라도 익명 · 이메일 · 전화 로그인이면 자기 자리조차 읽고 쓰지 못해요", async () => {
  for (const provider of ["anonymous", "password", "phone", "custom"]) {
    const db = as(A, provider);
    await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
    await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s2" }));
    await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/s4321"), session()));
    await assertFails(getDoc(doc(db, "teachers/" + A + "/lessons/deck")));
    await assertFails(setDoc(doc(db, "teachers/" + A + "/lessons/settings"), settings()));
  }
  // 같은 UID를 구글로 로그인하면 돼요
  await assertSucceeds(getDoc(doc(as(A), "teachers/" + A + "/sessions/s1234")));
});

test("수업 내용 · 설정: 앱이 실제로 쓰는 모양은 모두 받아요(예시 수업 5개 · PDF 40장 · PPTX · 기본 설정 · 휴대폰 밝게)", async () => {
  const db = as(A), deck = doc(db, "teachers/" + A + "/lessons/deck"), conf = doc(db, "teachers/" + A + "/lessons/settings");
  for (const L of DATA.lessons) await assertSucceeds(setDoc(deck, pack(exampleDeck(L))));
  await assertSucceeds(setDoc(deck, fileDeck("pdf", 40)));
  await assertSucceeds(setDoc(deck, Object.assign(fileDeck("pptx", 12), { prep: "ai" })));
  // 올린 파일 수업은 글자만(쪽 그림 주소를 뺀) 모양으로 가요
  await assertSucceeds(setDoc(deck, Object.assign(fileDeck("pdf", 3), { srcLink: "https://example.com/textbook" })));
  await assertSucceeds(setDoc(conf, settings()));
  await assertSucceeds(updateDoc(conf, { liveTone: "light" }));
  await assertSucceeds(updateDoc(conf, { className: "", classSize: 1 }));
  await assertSucceeds(updateDoc(conf, { pin: "0420", monitor: "1", presenter: false, fontSize: "아주 크게" }));
});

test("수업 내용 · 설정: 정해진 칸 · 자료형 · 길이가 아니면 자기 것이어도 거절해요", async () => {
  const db = as(A), deck = doc(db, "teachers/" + A + "/lessons/deck"), conf = doc(db, "teachers/" + A + "/lessons/settings");
  const ok = pack(exampleDeck(DATA.lessons[0]));
  // 수업 내용
  await assertFails(setDoc(deck, Object.assign({}, ok, { studentNames: ["가", "나"] })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { kind: "video" })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { title: "가".repeat(201) })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { title: 7 })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { pages: "장면" })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { pages: Array.from({ length: 101 }, (_, i) => ({ id: "p" + i })) })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { res: Array.from({ length: 401 }, (_, i) => ({ id: "r" + i })) })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { prep: "magic" })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { total: "40분" })));
  await assertFails(setDoc(deck, Object.assign({}, ok, { v: "5" })));
  await assertFails(setDoc(deck, { v: 5, kind: "example", title: "칸이 빠짐", pages: [] }));
  await assertFails(updateDoc(deck, { srcLink: "x".repeat(1001) }));
  // 설정
  await assertFails(setDoc(conf, Object.assign(settings(), { students: ["가", "나"] })));
  await assertFails(updateDoc(conf, { pin: "12a4" }));
  await assertFails(updateDoc(conf, { pin: "12345" }));
  await assertFails(updateDoc(conf, { pin: 1234 }));
  await assertFails(setDoc(conf, Object.assign(settings(), { pin: "" })));
  await assertFails(updateDoc(conf, { className: "가".repeat(41) }));
  await assertFails(updateDoc(conf, { classSize: 0 }));
  await assertFails(updateDoc(conf, { classSize: 41 }));
  await assertFails(updateDoc(conf, { classSize: "25" }));
  await assertFails(updateDoc(conf, { presenter: "yes" }));
  await assertFails(updateDoc(conf, { liveTone: "x".repeat(11) }));
  // 그 사이 거절된 쓰기는 하나도 남지 않았어요
  let a = null;
  await env.withSecurityRulesDisabled(async (c) => { a = (await getDoc(doc(c.firestore(), "teachers/" + A + "/lessons/settings"))).data(); });
  if (!a || a.pin !== "1234" || a.classSize !== 25 || "students" in a) throw new Error("거절된 쓰기가 남았어요: " + JSON.stringify(a));
});

// ---------- 1단계-1 UX: PC 준비 상태(lessons/hub) · PIN으로 연결한 휴대폰(devices · cmds · pins) ----------
// PIN 휴대폰은 익명 로그인이에요. 교사가 허용한 기기 문서가 있고, 허용받은 그 수업(run)이 아직 PC의 수업일 때만 읽어요.
// 수업 문서는 쓰지 못하고 명령(cmds/{휴대폰})만 남겨요. 교사 PC가 검증해 적용해요
const RUN = "run-a-0123456789abcdef", RUN2 = "run-b-0123456789abcdef";
const anon = (uid) => as(uid, "anonymous");
const hubDoc = (run) => ({ v: 1, on: true, pc: "tab1", run: run || RUN, stage: true, title: "물의 상태 변화", scenes: 8, offer: false, live: true, at: 1, startReq: null });
const runSession = (run, p) => Object.assign(session(), { run: run || RUN, reactions: [{ id: "s1", type: "red", at: 1 }], log: [{ id: "s0", sec: 30 }], qs: [{ id: "s1", text: "왜요?", at: 1 }] }, p || {});
const admin = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
const allowPhone = (phone, p) => admin((db) => setDoc(doc(db, "teachers/" + A + "/devices/" + phone), Object.assign({ sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 }, p || {})));
// 이번 수업(run A): PC 준비 상태 · 수업 문서 모두 run A
const classA = () => admin((db) => Promise.all([setDoc(doc(db, "teachers/" + A + "/lessons/hub"), hubDoc()), setDoc(doc(db, "teachers/" + A + "/sessions/s1234"), runSession()),
  setDoc(doc(db, "teachers/" + A + "/sessions/s5678"), runSession())]));
const cmd = (p) => Object.assign({ sid: "s1234", run: RUN, q: [{ n: 1, op: "go", v: "s2", id: "s1", base: 1, at: 1 }], at: 1 }, p || {});

test("PC 준비 상태(hub): 교사는 쓰고, 정해진 칸만 받아요", async () => {
  const db = as(A);
  await assertSucceeds(setDoc(doc(db, "teachers/" + A + "/lessons/hub"), hubDoc()));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { startReq: { id: "r1", at: 2, pc: "tab1" } }));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { startReq: null, startAck: { id: "r1", ok: true, why: "", at: 3 } }));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { ping: { id: "p1", at: 4 }, pong: { id: "p1", at: 5 } }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { student: "김철수" }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { startReq: { id: "r2", at: 2, pc: "tab1", extra: 1 } }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { ping: { id: "p2", at: 2, who: "x" } }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { title: "x".repeat(201) }));
  await assertFails(getDoc(doc(as(B), "teachers/" + A + "/lessons/hub")));
  await assertFails(setDoc(doc(as(B), "teachers/" + A + "/lessons/hub"), hubDoc()));
  await assertFails(getDoc(doc(nobody(), "teachers/" + A + "/lessons/hub")));
});

test("PIN 휴대폰: 교사가 허용하지 않은 익명 로그인은 아무것도 못 읽고 못 써요", async () => {
  await classA();
  const db = anon("phone-1");
  for (const p of ["sessions/s1234", "lessons/deck", "lessons/settings", "lessons/hub", "devices/phone-1", "cmds/phone-1"]) await assertFails(getDoc(doc(db, "teachers/" + A + "/" + p)));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/sessions/s1234"), { cur: "s2" }));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/cmds/phone-1"), cmd()));
  // 스스로 기기 문서를 만들 수도 없어요
  await assertFails(setDoc(doc(db, "teachers/" + A + "/devices/phone-1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 }));
});

test("PIN 휴대폰: 허용받은 수업을 읽기만 하고, 수업 끝 · 기록 · 장면을 직접 바꾸려 하면 모두 거절돼요", async () => {
  await classA();
  await allowPhone("phone-1");
  const db = anon("phone-1"), ses = doc(db, "teachers/" + A + "/sessions/s1234");
  for (const p of ["sessions/s1234", "lessons/deck", "lessons/settings", "lessons/hub"]) await assertSucceeds(getDoc(doc(db, "teachers/" + A + "/" + p)));
  // 수업 시작 · 끝 상태
  await assertFails(updateDoc(ses, { ended: true }));
  await assertFails(updateDoc(ses, { started: false }));
  await assertFails(updateDoc(ses, { t0: 2, memoId: "x" }));
  // 지난 기록 · 신호등 기록 · 질문 메모 덮어쓰기와 지우기
  await assertFails(updateDoc(ses, { reactions: [] }));
  await assertFails(updateDoc(ses, { log: [] }));
  await assertFails(updateDoc(ses, { qs: [] }));
  await assertFails(updateDoc(ses, { reactions: arrayUnion({ id: "s1", type: "green", at: 3 }) }));
  // 장면 이동 · 다른 칸 · 수업 통째로 바꾸기 · 지우기
  await assertFails(updateDoc(ses, { cur: "s9", enteredAt: 2 }));
  await assertFails(updateDoc(ses, { run: RUN2 }));
  await assertFails(setDoc(ses, runSession(RUN, { ended: true })));
  await assertFails(deleteDoc(ses));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/sessions/s9999"), runSession()));
  // 다른 수업 번호 · 다른 교사 · 수업 내용과 설정 · 기기 목록
  await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s5678")));
  await assertFails(getDoc(doc(db, "teachers/" + B + "/sessions/s1234")));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/deck"), { title: "바꿈" }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/settings"), { pin: "0000" }));
  await assertFails(getDocs(collection(db, "teachers/" + A + "/devices")));
  // PC 준비 상태에는 ‘수업 시작’ 요청과 ‘응답 확인’ 칸만
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { startReq: { id: "r1", at: 2, pc: "tab1" } }));
  await assertSucceeds(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { ping: { id: "p1", at: 2 } }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { live: false }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { stage: false, on: false }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { run: RUN2 }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { pong: { id: "p1", at: 3 } }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { startAck: { id: "r1", ok: true, why: "", at: 3 } }));
  // 같은 휴대폰이라도 다른 로그인 방식이면 안 돼요
  await assertFails(getDoc(doc(as("phone-1", "password"), "teachers/" + A + "/sessions/s1234")));
  // 수업은 그대로예요
  let left;
  await admin(async (a) => { left = (await getDoc(doc(a, "teachers/" + A + "/sessions/s1234"))).data(); });
  if (left.ended || left.reactions.length !== 1 || left.log.length !== 1 || left.qs.length !== 1 || left.cur !== "s1") throw new Error("수업이 바뀌었어요");
});

test("PIN 휴대폰: 명령은 자기 문서에만, 허용받은 수업으로만 남기고, ‘처리함’ 표시는 교사만 적어요", async () => {
  await classA();
  await allowPhone("phone-1");
  await allowPhone("phone-2");
  const db = anon("phone-1"), mine = doc(db, "teachers/" + A + "/cmds/phone-1");
  await assertSucceeds(setDoc(mine, cmd(), { merge: true }));
  await assertSucceeds(getDoc(mine));
  await assertSucceeds(setDoc(mine, cmd({ q: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, op: "signal", v: "red", id: "s1", at: 1 })), at: 2 }), { merge: true }));
  // 다른 휴대폰 문서 · 다른 수업(run) · 다른 수업 번호 · 너무 많은 명령 · 처리함 표시 · 모르는 칸
  await assertFails(setDoc(doc(db, "teachers/" + A + "/cmds/phone-2"), cmd()));
  await assertFails(getDoc(doc(db, "teachers/" + A + "/cmds/phone-2")));
  await assertFails(setDoc(mine, cmd({ run: RUN2 }), { merge: true }));
  await assertFails(setDoc(mine, cmd({ sid: "s5678" }), { merge: true }));
  await assertFails(setDoc(mine, cmd({ q: Array.from({ length: 11 }, (_, i) => ({ n: i + 1, op: "go" })) }), { merge: true }));
  await assertFails(updateDoc(mine, { done: 99 }));
  await assertFails(setDoc(mine, cmd({ ended: true }), { merge: true }));
  await assertFails(getDocs(collection(db, "teachers/" + A + "/cmds")));
  // 교사: 모두 읽고, 처리함 · 거절만 적어요(명령 내용은 바꾸지 않아요)
  await assertSucceeds(getDocs(collection(as(A), "teachers/" + A + "/cmds")));
  await assertSucceeds(updateDoc(doc(as(A), "teachers/" + A + "/cmds/phone-1"), { done: 10, no: 3 }));
  await assertFails(updateDoc(doc(as(A), "teachers/" + A + "/cmds/phone-1"), { q: [] }));
  await assertFails(getDoc(doc(as(B), "teachers/" + A + "/cmds/phone-1")));
});

test("PIN 휴대폰: 수업이 끝나 run이 바뀌면 PC가 기기 문서를 지우지 못했어도 다음 수업을 못 읽고, 시간이 지나도 막혀요", async () => {
  await classA();
  await allowPhone("phone-1");
  const db = anon("phone-1"), ses = doc(db, "teachers/" + A + "/sessions/s1234");
  await assertSucceeds(getDoc(ses));
  // 교사 PC가 다음 수업을 준비해요(같은 4자리 수업 번호 s1234 · 새 run). 기기 문서는 그대로 남아 있어요(지우기 실패를 흉내)
  await admin((a) => setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc(RUN2)));
  for (const p of ["sessions/s1234", "lessons/deck", "lessons/settings", "lessons/hub", "cmds/phone-1"]) await assertFails(getDoc(doc(db, "teachers/" + A + "/" + p)));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/cmds/phone-1"), cmd(), { merge: true }));
  await assertFails(updateDoc(doc(db, "teachers/" + A + "/lessons/hub"), { ping: { id: "p1", at: 2 } }));
  // 다음 수업이 시작돼 수업 문서도 새 run이면, 옛 run으로 허용받은 휴대폰은 읽지 못해요
  await admin((a) => setDoc(doc(a, "teachers/" + A + "/sessions/s1234"), runSession(RUN2)));
  await assertFails(getDoc(ses));
  // 새 수업에 새로 허용받은 휴대폰만 읽어요
  await allowPhone("phone-3", { run: RUN2 });
  await assertSucceeds(getDoc(doc(anon("phone-3"), "teachers/" + A + "/sessions/s1234")));
  // 끝나는 시각이 지나면 · 교사가 지우면
  await allowPhone("phone-3", { run: RUN2, exp: Date.now() - 1000 });
  await assertFails(getDoc(doc(anon("phone-3"), "teachers/" + A + "/sessions/s1234")));
  await allowPhone("phone-3", { run: RUN2 });
  await assertSucceeds(deleteDoc(doc(as(A), "teachers/" + A + "/devices/phone-3")));
  await assertFails(getDoc(doc(anon("phone-3"), "teachers/" + A + "/sessions/s1234")));
});

// PIN 4자리 연결: PIN은 교사 PC가 ‘휴대폰 연결’을 연 동안만 그 교사 한 명이 맡는 자리(pins/{PIN})예요. 휴대폰은 요청 하나만 남기고, 교사가 허용해야 이어져요
const PIN = "1234", LEASE = "lease-a-0123456789ab", LEASE2 = "lease-b-0123456789ab", LEASE3 = "lease-c-0123456789ab";
// PIN 자리에는 교사 id 대신 SHA-256(교사 id)만 둬요(앱의 claude-shim.js와 같은 계산)
const hashOf = (uid) => createHash("sha256").update(uid).digest("hex");
const HA = hashOf(A), HB = hashOf(B);
const pinDoc = (p) => Object.assign({ owner: HA, sid: "s1234", lease: LEASE, exp: Date.now() + 180000, open: true, asks: 0, no: 0 }, p || {});
// 교사의 거절: 요청에 ‘거절’ + 그 자리의 거절 수 +1을 한 번에(앱의 claude-shim.js deny와 같아요)
const denyPin = (teacher, phone) => { const db = as(teacher), b = writeBatch(db); b.update(doc(db, "pins/" + PIN + "/asks/" + phone), { no: true }); b.update(doc(db, "pins/" + PIN), { no: increment(1) }); return b.commit(); };
// 휴대폰의 요청: 요청 문서 하나 + 그 자리의 요청 수 +1을 한 번에(앱의 claude-shim.js pinJoin과 같아요)
const askPin = (phone, p) => {
  const o = Object.assign({ pin: PIN, lease: LEASE, kind: "iPhone" }, p || {}), db = anon(phone), b = writeBatch(db);
  b.set(doc(db, "pins/" + o.pin + "/asks/" + phone), Object.assign({ lease: o.lease, at: 1 }, o.kind ? { kind: o.kind } : {}, o.extra || {}));
  if (!o.noCount) b.update(doc(db, "pins/" + o.pin), { asks: increment(1) });
  return b.commit();
};

test("PIN 자리: 한 PIN은 한 번에 한 교사만 맡고, 닫히거나 시간이 지나야 같은 PIN의 다른 교사가 맡아요", async () => {
  const ref = (db) => doc(db, "pins/" + PIN);
  // 만들기: 구글 교사가 자기 이름으로만, 4자리, 그 PIN의 수업, 길어야 5분, 열림 · 요청 0개, 정해진 칸만
  await assertFails(setDoc(ref(anon("x")), pinDoc()));
  await assertFails(setDoc(ref(as(B)), pinDoc()));
  await assertFails(setDoc(ref(as(A)), pinDoc({ sid: "s5678" })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ exp: Date.now() + 3600000 })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ asks: 2 })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ open: false })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ lease: "short" })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ className: "4학년 2반" })));
  // 교사 id를 그대로 두거나, 남의 해시 · 대문자 해시로는 만들 수 없어요
  await assertFails(setDoc(ref(as(A)), Object.assign(pinDoc(), { teacher: A })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ owner: HB })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ owner: HA.toUpperCase() })));
  await assertFails(setDoc(ref(as(A)), pinDoc({ no: 1 })));
  await assertFails(setDoc(doc(as(A), "pins/12345"), pinDoc({ sid: "s12345" })));
  // 자기 설정에 없는 PIN 자리는 못 열어요(자유 가입이라 한 계정이 여러 PIN을 맡아 두지 못하게). 설정의 PIN을 바꾸면 그 PIN만 열어요
  await assertFails(setDoc(doc(as(A), "pins/4321"), pinDoc({ sid: "s4321" })));
  await assertSucceeds(setDoc(ref(as(A)), pinDoc()));
  // 같은 PIN을 쓰는 교사 B: A가 연 동안에는 맡지도 닫지도 못해요
  await assertFails(setDoc(ref(as(B)), pinDoc({ owner: HB, lease: LEASE2 })));
  await assertFails(updateDoc(ref(as(B)), { open: false }));
  await assertFails(updateDoc(ref(as(B)), { no: increment(1) }));
  // 읽는 사람에게 보이는 것은 해시뿐이에요(교사 id가 없어요)
  let seen;
  await admin(async (a) => { seen = (await getDoc(doc(a, "pins/" + PIN))).data(); });
  if ("teacher" in seen || JSON.stringify(seen).includes(A)) throw new Error("PIN 자리에 교사 id가 보여요");
  // 하나씩은 로그인한 누구나 읽지만(교사 id · 수업 이름 · 끝나는 시각 · 요청 수뿐) 목록은 아무도 못 봐요. 지우기도 안 돼요
  await assertSucceeds(getDoc(ref(anon("x"))));
  await assertSucceeds(getDoc(ref(as(B))));
  await assertFails(getDoc(ref(nobody())));
  await assertFails(getDocs(collection(anon("x"), "pins")));
  await assertFails(getDocs(collection(as(A), "pins")));
  await assertFails(deleteDoc(ref(as(A))));
  // 맡은 A는 새 lease로만 다시 열고(같은 lease로 시간만 늘리기는 안 돼요), 닫아요
  await assertFails(setDoc(ref(as(A)), pinDoc()));
  await assertSucceeds(setDoc(ref(as(A)), pinDoc({ lease: LEASE3 })));
  await assertSucceeds(updateDoc(ref(as(A)), { open: false }));
  // 닫힌 뒤에는 B가 새 lease로 맡아요. 이제 A는 B의 자리를 닫거나 다시 열지 못해요
  await assertSucceeds(setDoc(ref(as(B)), pinDoc({ owner: HB, lease: LEASE2 })));
  await assertFails(updateDoc(ref(as(A)), { open: false }));
  await assertFails(setDoc(ref(as(A)), pinDoc({ lease: LEASE })));
  // B의 PC가 닫지 못하고 꺼졌어도 3분이 지나면 A가 다시 맡을 수 있어요
  await admin((a) => updateDoc(doc(a, "pins/" + PIN), { exp: Date.now() - 1000 }));
  await assertSucceeds(setDoc(ref(as(A)), pinDoc({ lease: LEASE })));
});

test("PIN 요청: 열린 자리에 휴대폰마다 하나, 자리마다 3개까지만, 닫히거나 시간이 지나면 못 보내요", async () => {
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc()));
  // 요청 수를 함께 올려야만 · 지금 lease로만 · 정해진 칸만(학생 이름 같은 칸은 안 돼요) · 익명 휴대폰 자기 자리에만
  await assertFails(askPin("p1", { noCount: true }));
  await assertFails(askPin("p1", { lease: LEASE2 }));
  await assertFails(askPin("p1", { extra: { name: "김철수" } }));
  await assertFails(askPin("p1", { kind: "x".repeat(21) }));
  await assertFails(setDoc(doc(anon("p9"), "pins/" + PIN + "/asks/p1"), { lease: LEASE, at: 1 }));
  await assertSucceeds(askPin("p1"));
  await assertFails(askPin("p1"));
  await assertSucceeds(askPin("p2"));
  await assertSucceeds(askPin("p3"));
  await assertFails(askPin("p4"));
  // 아무도 열지 않은 PIN
  await assertFails(askPin("p5", { pin: "4321" }));
  // 휴대폰은 자기 요청만 봐요
  await assertSucceeds(getDoc(doc(anon("p1"), "pins/" + PIN + "/asks/p1")));
  await assertFails(getDoc(doc(anon("p2"), "pins/" + PIN + "/asks/p1")));
  await assertFails(getDocs(collection(anon("p1"), "pins/" + PIN + "/asks")));
  // 취소했다가 다시 요청해도 요청 수는 그대로예요. 스스로 허용을 적거나, 요청 수 · 자리를 바꾸지는 못해요
  const mine = doc(anon("p1"), "pins/" + PIN + "/asks/p1");
  await assertSucceeds(updateDoc(mine, { gone: true, at: 2 }));
  await assertSucceeds(updateDoc(mine, { gone: false, at: 3 }));
  await assertFails(updateDoc(mine, { ok: true, teacher: A, sid: "s1234" }));
  await assertFails(updateDoc(doc(anon("p1"), "pins/" + PIN), { asks: increment(1) }));
  await assertFails(updateDoc(doc(anon("p1"), "pins/" + PIN), { asks: 0 }));
  await assertFails(updateDoc(doc(anon("p1"), "pins/" + PIN), { open: true, exp: Date.now() + 300000 }));
  // 교사가 새 lease로 다시 열면 요청 0개부터예요. 지난 lease의 요청은 다시 써도 안 되고, 새 lease로는 돼요
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc({ lease: LEASE3 })));
  await assertFails(askPin("p4"));
  await assertSucceeds(askPin("p4", { lease: LEASE3 }));
  await assertSucceeds(askPin("p1", { lease: LEASE3 }));
  // 닫힌 자리 · 시간이 지난 자리
  await admin((a) => updateDoc(doc(a, "pins/" + PIN), { open: false }));
  await assertFails(askPin("p6", { lease: LEASE3 }));
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc({ exp: Date.now() - 1000 })));
  await assertFails(askPin("p7"));
});

test("PIN 요청의 답: 그 PIN을 맡은 교사만, 지금 lease의 요청에만, 자기 이름 · 그 PIN의 수업으로 허용해요", async () => {
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc()));
  for (const p of ["p1", "p2", "p3"]) await assertSucceeds(askPin(p));
  const ask = (db, phone) => doc(db, "pins/" + PIN + "/asks/" + phone);
  const asks = (db, lease) => getDocs(query(collection(db, "pins/" + PIN + "/asks"), where("lease", "==", lease || LEASE)));
  await assertSucceeds(asks(as(A)));
  await assertSucceeds(getDoc(ask(as(A), "p1")));
  // 같은 PIN을 쓰는 다른 교사 B는 요청을 보지도 답하지도 못해요
  await assertFails(asks(as(B)));
  await assertFails(getDoc(ask(as(B), "p1")));
  await assertFails(updateDoc(ask(as(B), "p1"), { ok: true, teacher: B, sid: "s1234" }));
  // A도 자기 이름 · 그 PIN의 수업으로만, 정해진 칸만
  await assertFails(updateDoc(ask(as(A), "p1"), { ok: true, teacher: B, sid: "s1234" }));
  await assertFails(updateDoc(ask(as(A), "p1"), { ok: true, teacher: A, sid: "s5678" }));
  await assertFails(updateDoc(ask(as(A), "p1"), { ok: true, teacher: A, sid: "s1234", run: RUN }));
  await assertSucceeds(updateDoc(ask(as(A), "p1"), { ok: true, teacher: A, sid: "s1234" }));
  // 한 번 답하면 바꾸지 못해요. 휴대폰도 답이 난 요청은 못 바꿔요
  await assertFails(updateDoc(ask(as(A), "p1"), { no: true }));
  await assertSucceeds(updateDoc(ask(as(A), "p2"), { no: true }));
  await assertFails(updateDoc(ask(as(A), "p2"), { ok: true, teacher: A, sid: "s1234" }));
  await assertFails(updateDoc(ask(anon("p2"), "p2"), { gone: false, at: 5 }));
  // 휴대폰이 취소한 요청은 허용할 수 없어요
  await assertSucceeds(updateDoc(ask(anon("p3"), "p3"), { gone: true, at: 5 }));
  await assertFails(updateDoc(ask(as(A), "p3"), { ok: true, teacher: A, sid: "s1234" }));
  // 시간이 지나면 허용할 수 없어요(거절은 돼요)
  await assertSucceeds(updateDoc(ask(anon("p3"), "p3"), { gone: false, at: 6 }));
  await admin((a) => updateDoc(doc(a, "pins/" + PIN), { exp: Date.now() - 1000 }));
  await assertFails(updateDoc(ask(as(A), "p3"), { ok: true, teacher: A, sid: "s1234" }));
  await assertSucceeds(updateDoc(ask(as(A), "p3"), { no: true }));
  // 그 뒤 B가 이 PIN을 맡으면: A는 더 못 보고, B도 A 때의 요청(지난 lease)은 보지도 답하지도 못해요
  await assertSucceeds(setDoc(doc(as(B), "pins/" + PIN), pinDoc({ owner: HB, lease: LEASE2 })));
  await assertFails(asks(as(A)));
  await assertFails(asks(as(B), LEASE));
  await assertFails(getDoc(ask(as(B), "p1")));
  await assertSucceeds(asks(as(B), LEASE2));
  await assertFails(updateDoc(ask(as(B), "p3"), { no: true }));
});

test("PIN 요청 막기: 모르는 요청이 자리를 채워도 교사가 거절하면 비고, 거절된 휴대폰은 그 PIN에 다시 못 오고, 한 번 열 때 20개까지", async () => {
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc()));
  for (const ph of ["x1", "x2", "x3"]) await assertSucceeds(askPin(ph));
  // 기다리는 요청 3개: 내 휴대폰(me)은 못 들어와요
  await assertFails(askPin("me"));
  // 교사가 하나를 거절하면 그만큼 자리가 비어요
  await assertSucceeds(denyPin(A, "x1"));
  await assertSucceeds(askPin("me"));
  // 거절 수는 맡은 교사만, 하나씩만, 받은 요청 수를 넘지 않게
  await assertFails(updateDoc(doc(as(B), "pins/" + PIN), { no: increment(1) }));
  await assertFails(updateDoc(doc(anon("x2"), "pins/" + PIN), { no: increment(1) }));
  await assertFails(updateDoc(doc(as(A), "pins/" + PIN), { no: increment(2) }));
  await assertFails(updateDoc(doc(as(A), "pins/" + PIN), { no: 9 }));
  // 교사가 다시 열어도(새 lease) 거절된 휴대폰은 이 PIN에 다시 요청하지 못해요. 거절되지 않은 휴대폰은 돼요
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc({ lease: LEASE3 })));
  await assertFails(askPin("x1", { lease: LEASE3 }));
  await assertSucceeds(askPin("x2", { lease: LEASE3 }));
  // 한 번 열 때 받은 요청이 20개가 되면, 거절해서 자리가 비어도 더 받지 않아요(교사가 다시 열어요)
  await admin((a) => updateDoc(doc(a, "pins/" + PIN), { asks: 19, no: 17 }));
  await assertSucceeds(askPin("y1", { lease: LEASE3 }));
  await admin((a) => updateDoc(doc(a, "pins/" + PIN), { no: 19 }));
  await assertFails(askPin("y2", { lease: LEASE3 }));
});

test("자유 가입(2026-11-11): 승인 목록 없이 구글 계정은 처음부터 자기 자리만 읽고 쓰고, PIN 자리는 자기 설정의 PIN 하나만 열어요. 예전 시범 교사 목록은 읽지도 쓰지도 않아요", async () => {
  const C = "teacher-c", HC = hashOf(C), db = as(C);
  // 처음 로그인한 계정: 자기 설정 · 수업 내용 · 세션 · 준비 상태를 바로 쓰고 읽어요
  await assertSucceeds(setDoc(doc(db, "teachers/" + C + "/lessons/settings"), Object.assign(settings(), { pin: "5555" })));
  await assertSucceeds(setDoc(doc(db, "teachers/" + C + "/lessons/deck"), pack(exampleDeck(DATA.lessons[0]))));
  await assertSucceeds(setDoc(doc(db, "teachers/" + C + "/sessions/s5555"), session()));
  await assertSucceeds(setDoc(doc(db, "teachers/" + C + "/lessons/hub"), hubDoc()));
  await assertSucceeds(getDoc(doc(db, "teachers/" + C + "/lessons/settings")));
  await assertSucceeds(getDocs(collection(db, "teachers/" + C + "/sessions")));
  // 다른 교사(A)의 자리는 읽지도 쓰지도 못해요. A도 C의 자리를 못 봐요
  await assertFails(getDoc(doc(db, "teachers/" + A + "/sessions/s1234")));
  await assertFails(getDoc(doc(db, "teachers/" + A + "/lessons/settings")));
  await assertFails(setDoc(doc(db, "teachers/" + A + "/lessons/deck"), pack(exampleDeck(DATA.lessons[0]))));
  await assertFails(getDoc(doc(as(A), "teachers/" + C + "/lessons/settings")));
  await assertFails(getDocs(collection(as(A), "teachers/" + C + "/sessions")));
  // PIN 자리: 자기 설정의 PIN(5555)만. 남의 PIN · 설정에 없는 PIN은 못 열어요
  await assertSucceeds(setDoc(doc(db, "pins/5555"), pinDoc({ owner: HC, sid: "s5555" })));
  await assertFails(setDoc(doc(db, "pins/6666"), pinDoc({ owner: HC, sid: "s6666" })));
  await admin((a) => setDoc(doc(a, "pins/" + PIN), pinDoc({ open: false })));
  await assertFails(setDoc(doc(db, "pins/" + PIN), pinDoc({ owner: HC, lease: LEASE2 })));
  // 설정의 PIN을 바꾸면 그 PIN만 열어요(앱은 설정을 먼저 저장하고 연다)
  await assertSucceeds(updateDoc(doc(db, "teachers/" + C + "/lessons/settings"), { pin: PIN }));
  await assertSucceeds(setDoc(doc(db, "pins/" + PIN), pinDoc({ owner: HC, lease: LEASE2 })));
  // 설정이 없는 새 계정은 PIN 자리를 하나도 못 열어요
  await assertFails(setDoc(doc(as("teacher-d"), "pins/7777"), pinDoc({ owner: hashOf("teacher-d"), sid: "s7777" })));
  // 예전 시범 교사 목록(allowed): 이제 아무도 읽거나 쓰지 않아요(운영 데이터는 지우지 않고 그대로 둬요)
  await assertFails(getDoc(doc(db, "allowed/" + C)));
  await assertFails(getDoc(doc(as(A), "allowed/" + A)));
  await assertFails(setDoc(doc(db, "allowed/" + C), { role: "trial" }));
  await assertFails(getDocs(collection(db, "allowed")));
});

test("표시 이름(profile/me): 본인만 읽고 쓰고, 이름 1–40자 · 학교명은 선택(60자) · 정해진 칸만. 다른 교사 · PIN 휴대폰 · 로그인 안 함은 못 봐요", async () => {
  const me = (db) => doc(db, "teachers/" + A + "/profile/me");
  await assertSucceeds(setDoc(me(as(A)), { v: 1, name: "김하늘", at: 1 }));
  await assertSucceeds(getDoc(me(as(A))));
  await assertSucceeds(updateDoc(me(as(A)), { name: "하늘 선생님", at: 2 }));
  await assertSucceeds(updateDoc(me(as(A)), { school: "새싹초등학교" }));
  // 이름이 비었거나 길거나 · 학교명이 길거나 · 정해진 칸 밖(이메일 · 학생 정보)이면 거절
  await assertFails(setDoc(me(as(A)), { v: 1, name: "", at: 1 }));
  await assertFails(setDoc(me(as(A)), { v: 1, name: "가".repeat(41), at: 1 }));
  await assertFails(setDoc(me(as(A)), { v: 1, at: 1 }));
  await assertFails(setDoc(me(as(A)), { v: 1, name: "김하늘", school: "가".repeat(61) }));
  await assertFails(setDoc(me(as(A)), { v: 1, name: "김하늘", email: "a@example.com" }));
  await assertFails(setDoc(doc(as(A), "teachers/" + A + "/profile/other"), { v: 1, name: "김하늘" }));
  await assertFails(deleteDoc(me(as(A))));
  // 남은 못 봐요: 다른 교사 · 허용받은 PIN 휴대폰 · 익명 · 로그인 안 함 · 같은 UID의 다른 로그인 방식
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc());
    await setDoc(doc(a, "teachers/" + A + "/devices/p1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 });
  });
  for (const db of [as(B), anon("p1"), anon("p2"), nobody(), as(A, "password")]) {
    await assertFails(getDoc(me(db)));
    await assertFails(setDoc(me(db), { v: 1, name: "가짜 이름", at: 1 }));
  }
});

test("허용한 휴대폰의 기기 문서: 교사만, 그 수업 하나(run) · 길어야 4시간", async () => {
  const dv = (p) => Object.assign({ sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 }, p || {});
  await assertFails(setDoc(doc(as(A), "teachers/" + A + "/devices/p1"), dv({ exp: Date.now() + 5 * 3600000 })));
  await assertFails(setDoc(doc(as(A), "teachers/" + A + "/devices/p1"), dv({ sid: "x" })));
  await assertFails(setDoc(doc(as(A), "teachers/" + A + "/devices/p1"), dv({ run: "short" })));
  await assertFails(setDoc(doc(as(A), "teachers/" + A + "/devices/p1"), { sid: "s1234", exp: Date.now() + 3600000, at: 1 }));
  await assertFails(setDoc(doc(as(B), "teachers/" + A + "/devices/p1"), dv()));
  await assertFails(setDoc(doc(anon("p1"), "teachers/" + A + "/devices/p1"), dv()));
  await assertSucceeds(setDoc(doc(as(A), "teachers/" + A + "/devices/p1"), dv()));
});

test("누가 무엇을: 가입한 교사 · 새로 가입한 다른 구글 계정 · 다른 교사 · 같은 UID의 다른 로그인 방식 · 로그인 안 함 · 익명 휴대폰(허용 전 · 허용 뒤 · 수업이 바뀐 뒤)", async () => {
  const SES = "teachers/" + A + "/sessions/s1234", SET = "teachers/" + A + "/lessons/settings", C = "teacher-c";
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc());
    await setDoc(doc(a, SES), Object.assign(session(), { run: RUN }));
  });
  // 1. 가입한 교사 본인: 자기 수업 · 설정을 읽고 써요
  await assertSucceeds(getDoc(doc(as(A), SES)));
  await assertSucceeds(updateDoc(doc(as(A), SES), { cur: "s2", enteredAt: 2 }));
  await assertSucceeds(getDoc(doc(as(A), SET)));
  // 2. 새로 가입한 다른 구글 계정: 승인 없이 자기 자리는 쓰지만, A의 자리는 못 읽고 못 써요
  await assertSucceeds(setDoc(doc(as(C), "teachers/" + C + "/sessions/s1234"), session()));
  await assertFails(getDoc(doc(as(C), SES)));
  await assertFails(updateDoc(doc(as(C), SES), { cur: "s9" }));
  await assertFails(getDoc(doc(as(C), SET)));
  // 3. 다른 교사 B: 같은 PIN이어도 내 수업은 못 읽고 못 써요
  await assertFails(getDoc(doc(as(B), SES)));
  await assertFails(updateDoc(doc(as(B), SES), { cur: "s9" }));
  // 4. 같은 UID라도 구글이 아닌 로그인(익명 · 이메일): 자기 자리조차 못 읽고 못 써요(계정 본인 확인)
  for (const db of [as(A, "anonymous"), as(A, "password")]) {
    await assertFails(getDoc(doc(db, SES)));
    await assertFails(updateDoc(doc(db, SES), { cur: "s9" }));
  }
  // 5. 로그인 안 함 · 익명(허용 전): 교사 문서는 아무것도 못 해요. PIN 자리 하나 읽기는 돼요(연결 요청에 필요)
  for (const db of [nobody(), anon("p9")]) {
    await assertFails(getDoc(doc(db, SES)));
    await assertFails(updateDoc(doc(db, SES), { cur: "s9" }));
    await assertFails(getDoc(doc(db, SET)));
  }
  await assertSucceeds(getDoc(doc(anon("p9"), "pins/1234")));
  await assertFails(getDoc(doc(nobody(), "pins/1234")));
  // 6. 익명 휴대폰(교사가 허용함): 그 수업만 읽고, 수업 문서는 못 쓰고, 명령만 남겨요. 허용받지 않은 다른 휴대폰은 못 읽어요
  await admin((a) => setDoc(doc(a, "teachers/" + A + "/devices/p1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 }));
  await assertSucceeds(getDoc(doc(anon("p1"), SES)));
  await assertFails(updateDoc(doc(anon("p1"), SES), { cur: "s9" }));
  await assertSucceeds(setDoc(doc(anon("p1"), "teachers/" + A + "/cmds/p1"), { sid: "s1234", run: RUN, q: [], at: 1 }));
  await assertFails(getDoc(doc(anon("p2"), SES)));
  await assertFails(getDoc(doc(anon("p1"), "teachers/" + C + "/sessions/s1234")));
  // 7. 수업이 끝나 run이 바뀌면 허용받았던 휴대폰도 못 읽어요(기기 문서가 남아 있어도)
  await admin((a) => updateDoc(doc(a, "teachers/" + A + "/lessons/hub"), { run: RUN2 }));
  await assertFails(getDoc(doc(anon("p1"), SES)));
  await assertFails(setDoc(doc(anon("p1"), "teachers/" + A + "/cmds/p1"), { sid: "s1234", run: RUN, q: [], at: 2 }));
});

// ---------- 내 수업(여러 수업, 2026-11-11 docs/MY-LESSONS.md) ----------
const MID = "m-0123456789abcdef", MID2 = "m-fedcba9876543210";
const minePage = { id: "n1", n: 1, label: "새 장면", min: 3, layout: "question", eye: "", title: "새 장면", sub: "", notes: "", concepts: [], say: [], rec: [], want: "" };
const mineDoc = (id, p) => Object.assign({ v: 5, kind: "mine", myId: id, key: "mine:" + id, title: "새 수업", tag: "", grade: null, subject: "", total: 40, pages: [minePage], res: [], at: 1, made: 1 }, p || {});
// 예시를 '수정해서 사용하기'로 복제한 모양(앱의 copyExample과 같아요): lessonId 대신 from · oldKeys
const copyOf = (src, id) => { const d = Object.assign(exampleDeck(src), { kind: "mine", myId: id, key: "mine:" + id, from: src.id, oldKeys: [src.id], at: 2, made: 2 }); delete d.lessonId; return pack(d); };

test("내 수업(decks): 본인만 만들고 · 읽고 · 고치고 · 지워요. 수업 id는 m-16자리이고 myId와 같아야 하고, 장면은 1개 이상, 정해진 칸만 받아요", async () => {
  const ref = (db, id) => doc(db, "teachers/" + A + "/decks/" + (id || MID));
  await assertSucceeds(setDoc(ref(as(A)), mineDoc(MID)));
  await assertSucceeds(getDoc(ref(as(A))));
  await assertSucceeds(getDocs(query(collection(as(A), "teachers/" + A + "/decks"))));
  await assertSucceeds(updateDoc(ref(as(A)), { title: "분수 다시 보기", grade: 3, subject: "수학", at: 3 }));
  // 예시 복제본(배열 안의 배열이 든 표 · 낱말 포함)도 그대로 받아요
  for (const L of DATA.lessons) await assertSucceeds(setDoc(ref(as(A), MID2), copyOf(L, MID2)));
  // 모양이 틀리면 거절: 문서 id와 myId가 다름 · id 모양 · 다른 kind · 장면 0개 · 칸 밖(학생 정보) · 긴 제목 · 장면 101개
  await assertFails(setDoc(ref(as(A)), mineDoc(MID2)));
  await assertFails(setDoc(ref(as(A), "x1"), mineDoc("x1")));
  await assertFails(setDoc(ref(as(A), "m-0123456789ABCDEF"), mineDoc("m-0123456789ABCDEF")));
  await assertFails(setDoc(ref(as(A)), mineDoc(MID, { kind: "example" })));
  await assertFails(setDoc(ref(as(A)), mineDoc(MID, { pages: [] })));
  await assertFails(setDoc(ref(as(A)), mineDoc(MID, { studentName: "홍길동" })));
  await assertFails(setDoc(ref(as(A)), mineDoc(MID, { title: "가".repeat(201) })));
  await assertFails(setDoc(ref(as(A)), mineDoc(MID, { pages: Array.from({ length: 101 }, (_, i) => Object.assign({}, minePage, { id: "n" + i })) })));
  await assertFails(updateDoc(ref(as(A)), { pages: [] }));
  // 지우기는 본인만(수업 기록은 다른 곳이라 그대로예요)
  await assertSucceeds(deleteDoc(ref(as(A), MID2)));
  // 남은 못 봐요: 다른 교사 · 같은 UID의 다른 로그인 · 허용받은 PIN 휴대폰 · 익명 · 로그인 안 함
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc());
    await setDoc(doc(a, "teachers/" + A + "/devices/p1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 });
  });
  for (const db of [as(B), as(A, "anonymous"), as(A, "password"), anon("p1"), anon("p2"), nobody()]) {
    await assertFails(getDoc(ref(db)));
    await assertFails(getDocs(query(collection(db, "teachers/" + A + "/decks"))));
    await assertFails(setDoc(ref(db, MID2), mineDoc(MID2)));
    await assertFails(updateDoc(ref(db), { title: "가짜" }));
    await assertFails(deleteDoc(ref(db)));
  }
  // B는 자기 자리에 같은 id로 따로 만들어요(서로 섞이지 않아요)
  await assertSucceeds(setDoc(doc(as(B), "teachers/" + B + "/decks/" + MID), mineDoc(MID, { title: "B의 수업" })));
  const mine = (await getDoc(ref(as(A)))).data();
  if (mine.title !== "분수 다시 보기") throw new Error("A의 수업이 바뀌었어요: " + mine.title);
});

test("지금 수업(lessons/deck)도 내 수업을 받아요: kind mine · myId · from. 휴대폰은 지금 수업만 읽어요", async () => {
  const deck = (db) => doc(db, "teachers/" + A + "/lessons/deck");
  const now = mineDoc(MID); delete now.at; delete now.made;
  await assertSucceeds(setDoc(deck(as(A)), now));
  const copy = copyOf(DATA.lessons[0], MID); delete copy.at; delete copy.made;
  await assertSucceeds(setDoc(deck(as(A)), copy));
  await assertFails(setDoc(deck(as(A)), Object.assign({}, now, { kind: "shared" })));
  await assertFails(setDoc(deck(as(A)), Object.assign({}, now, { at: 1 })));
  // 허용받은 PIN 휴대폰: 지금 수업은 읽고, 내 수업 목록은 못 읽어요
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc());
    await setDoc(doc(a, "teachers/" + A + "/devices/p1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 });
    await setDoc(doc(a, "teachers/" + A + "/decks/" + MID), mineDoc(MID));
  });
  await assertSucceeds(getDoc(deck(anon("p1"))));
  await assertFails(getDoc(doc(anon("p1"), "teachers/" + A + "/decks/" + MID)));
});

// ---------- 이 브라우저에 저장한 파일로 만든 수업(2026-11-11, docs/LOCAL-FILES.md) ----------
// 계정에는 파일 id(f-32자리) · 종류(pdf · pptx) · 이름만. 파일 자체 · 주소는 올라가지 않아요
const FID = "f-0123456789abcdef0123456789abcdef";
const filePages = [1, 2, 3].map((i) => ({ id: "p" + i, n: i, url: "", aid: "", fid: FID, pg: i, ar: 1.333, text: i + "쪽", label: i + "쪽", notes: "", min: 13, concepts: [], say: [], rec: [], want: "" }));
const fileRes = [{ id: "m1", scene: "p1", t: "보충", lv: "red", s: "mine", title: "그림", note: "파일 · 이 브라우저에 저장", link: "", aid: "", mt: "image", fid: FID, fname: "그림.png" },
  { id: "m2", scene: "p2", t: "활동", lv: "yellow", s: "mine", title: "활동지", note: "파일 · 이 브라우저에 저장", link: "", aid: "", mt: "pptx", fid: FID, fname: "활동지.pptx", slides: [{ title: "1장", lines: ["가", "나"] }] }];
test("파일로 만든 내 수업: 파일 id · 종류 · 이름만 받고(내 수업 · 지금 수업 모두), 모양이 틀린 파일 칸은 거절해요", async () => {
  const ref = doc(as(A), "teachers/" + A + "/decks/" + MID), deck = doc(as(A), "teachers/" + A + "/lessons/deck");
  const made = mineDoc(MID, { title: "lesson", tag: "내 파일 · lesson", pages: filePages, res: fileRes, file: { fid: FID, kind: "pdf", name: "lesson" } });
  await assertSucceeds(setDoc(ref, made));
  const now = Object.assign({}, made); delete now.at; delete now.made;
  await assertSucceeds(setDoc(deck, now));
  await assertSucceeds(setDoc(ref, Object.assign({}, made, { file: { fid: FID, kind: "pptx", name: "lesson" } })));
  // 파일 칸이 없는 예전 수업도 그대로 받아요
  await assertSucceeds(setDoc(ref, mineDoc(MID)));
  for (const bad of [{ fid: "f-123", kind: "pdf", name: "x" }, { fid: FID.toUpperCase(), kind: "pdf", name: "x" }, { fid: FID, kind: "docx", name: "x" },
    { fid: FID, kind: "pdf", name: "가".repeat(121) }, { fid: FID, kind: "pdf", name: "x", url: "blob:http://x/1" }, { fid: FID, kind: "pdf" }, "f-0123", null]) {
    await assertFails(setDoc(ref, Object.assign({}, made, { file: bad })));
    await assertFails(setDoc(deck, Object.assign({}, now, { file: bad })));
  }
  // 다른 교사는 여전히 못 봐요
  await assertFails(getDoc(doc(as(B), "teachers/" + A + "/decks/" + MID)));
});

// ---------- 영상 장면의 ‘다음’ 두 단계(2026-11-12, docs/VIDEO.md 1-1) ----------
// 세션의 vid = { k: 's:장면 id', at }: 이번 방문에서 장면 영상을 틀었거나 틀어 달라고 했다는 표시. 장면이 바뀌면 null
test("세션의 영상 표시(vid): 교사는 { k, at }나 null로 쓰고, 모양이 다르면 거절해요. PIN 휴대폰은 세션에 쓰지 못해요(명령으로만)", async () => {
  const ref = (db) => doc(db, "teachers/" + A + "/sessions/s1234");
  await assertSucceeds(setDoc(ref(as(A)), Object.assign(session(), { vid: { k: "s:s1", at: 5 } })));
  await assertSucceeds(updateDoc(ref(as(A)), { vid: { k: "s:s1", at: 6 } }));
  await assertSucceeds(updateDoc(ref(as(A)), { cur: "s2", enteredAt: 7, vid: null }));
  // 영상 표시가 없는 예전 세션도 그대로
  await assertSucceeds(setDoc(ref(as(A)), session()));
  for (const bad of [{ k: "s:s1" }, { k: 5, at: 1 }, { k: "s:s1", at: "1" }, { k: "s:s1", at: 1, play: true }, { k: "x".repeat(121), at: 1 }, "s:s1", 1]) {
    await assertFails(updateDoc(ref(as(A)), { vid: bad }));
  }
  await assertFails(updateDoc(ref(as(B)), { vid: { k: "s:s1", at: 8 } }));
  await assertFails(updateDoc(ref(anon("p1")), { vid: { k: "s:s1", at: 8 } }));
  await assertFails(updateDoc(ref(nobody()), { vid: { k: "s:s1", at: 8 } }));
});

// ---------- 수업 기록(records/{r-…}, 2026-11-12 docs/RECORDS.md) ----------
const REC = (o) => Object.assign({ v: 3, key: "ex-s4-boiling", title: "물이 끓을 때", grade: 4, subject: "과학", cls: "", startAt: Date.now() - 3600000, endAt: Date.now() - 600000, at: Date.now() - 600000,
  totalSec: 3000, plannedMin: 40, scenes: [{ id: "s1", label: "도입", min: 5, sec: 300, sig: "red" }], sig: { red: 1, yellow: 0, green: 0 }, questions: [{ sid: "s1", label: "도입", text: "질문" }],
  again: ["다시 짚기"], text: "", used: [], usedTitles: [], events: [], trashedAt: null, editedAt: null, from: "local-abc", src: "pc" }, o || {});
test("수업 기록(records): 본인만 만들고 · 읽고 · 고치고, 고칠 수 있는 칸은 메모 · 다시 지도할 것 · 질문 메모 · 휴지통뿐이에요. 다른 교사 · PIN 휴대폰 · 로그인 안 함은 못 봐요", async () => {
  const ref = (db, id) => doc(db, "teachers/" + A + "/records/" + (id || "r-abc123"));
  await assertSucceeds(setDoc(ref(as(A)), REC()));
  await assertSucceeds(getDoc(ref(as(A))));
  await assertSucceeds(getDocs(query(collection(as(A), "teachers/" + A + "/records"))));
  // 같은 내용을 다시 쓰기(다시 연결 · 새로고침 뒤 다시 보내기)는 돼요
  const same = (await getDoc(ref(as(A)))).data();
  await assertSucceeds(setDoc(ref(as(A)), same));
  await assertSucceeds(updateDoc(ref(as(A)), { text: "교사 메모", again: ["그림으로 다시"], questions: [{ sid: "s1", label: "도입", text: "고친 질문" }], editedAt: Date.now() }));
  // 고칠 수 없는 칸: 장면 · 시간 · 신호 · 제목 · 끝난 시각
  for (const p of [{ title: "다른 제목" }, { totalSec: 1 }, { sig: { red: 0, yellow: 0, green: 0 } }, { scenes: [] }, { endAt: 1, at: 1 }]) await assertFails(updateDoc(ref(as(A)), p));
  // 모양: id 모양 · 칸 밖(학생 정보) · v · 너무 긴 메모 · 휴지통에 든 채로 만들기
  await assertFails(setDoc(ref(as(A), "x-1"), REC()));
  await assertFails(setDoc(ref(as(A), "r-ABC"), REC()));
  await assertFails(setDoc(ref(as(A), "r-new001"), REC({ student: "홍길동" })));
  await assertFails(setDoc(ref(as(A), "r-new001"), REC({ v: 2 })));
  await assertFails(setDoc(ref(as(A), "r-new001"), REC({ text: "가".repeat(2001) })));
  await assertFails(setDoc(ref(as(A), "r-new001"), REC({ trashedAt: Date.now() })));
  // 남은 못 봐요
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/lessons/hub"), hubDoc());
    await setDoc(doc(a, "teachers/" + A + "/devices/p1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 });
  });
  for (const db of [as(B), as(A, "anonymous"), as(A, "password"), anon("p1"), nobody()]) {
    await assertFails(getDoc(ref(db)));
    await assertFails(getDocs(query(collection(db, "teachers/" + A + "/records"))));
    await assertFails(setDoc(ref(db, "r-new002"), REC()));
    await assertFails(updateDoc(ref(db), { text: "가짜" }));
    await assertFails(deleteDoc(ref(db)));
  }
  // B는 자기 자리에(섞이지 않아요)
  await assertSucceeds(setDoc(doc(as(B), "teachers/" + B + "/records/r-abc123"), REC({ title: "B의 기록" })));
  if ((await getDoc(ref(as(A)))).data().title !== "물이 끓을 때") throw new Error("A의 기록이 바뀌었어요");
});

test("수업 기록 휴지통: 넣는 시각은 지금(서버 시계 ± 10분)만, 되살리기는 언제나, 영구 삭제는 휴지통에 30일이 지난 기록만(본인만)", async () => {
  const ref = (db, id) => doc(db, "teachers/" + A + "/records/" + id), day = 86400000;
  await assertSucceeds(setDoc(ref(as(A), "r-t00001"), REC()));
  await assertFails(updateDoc(ref(as(A), "r-t00001"), { trashedAt: Date.now() - 31 * day }));
  await assertFails(updateDoc(ref(as(A), "r-t00001"), { trashedAt: Date.now() + 2 * 3600000 }));
  await assertSucceeds(updateDoc(ref(as(A), "r-t00001"), { trashedAt: Date.now(), editedAt: Date.now() }));
  // 휴지통에 갓 넣은 기록은 지울 수 없어요(30일 동안 되살릴 수 있게)
  await assertFails(deleteDoc(ref(as(A), "r-t00001")));
  await assertSucceeds(updateDoc(ref(as(A), "r-t00001"), { trashedAt: null }));
  await assertFails(deleteDoc(ref(as(A), "r-t00001")));
  // 30일이 지난 휴지통 기록(관리자로 넣어 둠)만 지워져요. 29일은 아직
  await admin(async (a) => {
    await setDoc(doc(a, "teachers/" + A + "/records/r-t31day"), REC({ trashedAt: Date.now() - 31 * day }));
    await setDoc(doc(a, "teachers/" + A + "/records/r-t29day"), REC({ trashedAt: Date.now() - 29 * day }));
  });
  await assertFails(deleteDoc(ref(as(B), "r-t31day")));
  await assertFails(deleteDoc(ref(as(A), "r-t29day")));
  await assertSucceeds(deleteDoc(ref(as(A), "r-t31day")));
});

// 1차 정식 활성화(2026-11-15): 구글 계정만, PIN 끔. 앱이 PIN을 쓰지 않는 동안 서버의 PIN 권한도 닫혀 있어야 해요(최소 권한)
test("PIN 스위치가 꺼지면(config/pin 없음): 구글 계정도 PIN 자리를 열거나 읽거나 휴대폰을 허용하지 못하고, 익명은 요청을 남기지 못해요. 본인 수업 · 기록 · 표시 이름 · 진행은 그대로예요", async () => {
  // 스위치를 켠 채 만든 자리 · 요청이 남아 있어도
  await admin(async (db) => {
    await setDoc(doc(db, "pins/" + PIN), pinDoc());
    await setDoc(doc(db, "pins/" + PIN + "/asks/phone-1"), { lease: LEASE, at: 1, kind: "iPhone" });
    await deleteDoc(doc(db, "config/pin"));
  });
  const a = as(A);
  await assertFails(setDoc(doc(a, "pins/5678"), pinDoc({ sid: "s5678" })));
  await assertFails(getDoc(doc(a, "pins/" + PIN)));
  await assertFails(updateDoc(doc(a, "pins/" + PIN), { open: false }));
  await assertFails(getDoc(doc(a, "pins/" + PIN + "/asks/phone-1")));
  await assertFails(updateDoc(doc(a, "pins/" + PIN + "/asks/phone-1"), { ok: true, teacher: A, sid: "s1234" }));
  await assertFails(setDoc(doc(a, "teachers/" + A + "/devices/phone-1"), { sid: "s1234", run: RUN, exp: Date.now() + 3600000, at: 1 }));
  await assertFails(askPin("phone-2"));
  await assertFails(getDoc(doc(anon("phone-2"), "pins/" + PIN)));
  // 스위치 문서는 누구도 앱에서 켜지 못해요
  await assertFails(setDoc(doc(a, "config/pin"), { on: true }));
  await assertFails(getDoc(doc(a, "config/pin")));
  // 교사 본인의 수업 · 설정 · 진행 · 내 수업 · 기록 · 표시 이름은 그대로
  await assertSucceeds(getDoc(doc(a, "teachers/" + A + "/sessions/s1234")));
  await assertSucceeds(updateDoc(doc(a, "teachers/" + A + "/sessions/s1234"), { cur: "s2", enteredAt: 2 }));
  await assertSucceeds(getDoc(doc(a, "teachers/" + A + "/lessons/settings")));
  await assertSucceeds(setDoc(doc(a, "teachers/" + A + "/decks/" + MID), mineDoc(MID)));
  await assertSucceeds(getDoc(doc(a, "teachers/" + A + "/decks/" + MID)));
  // 다른 교사는 여전히 못 봐요
  await assertFails(getDoc(doc(as(B), "teachers/" + A + "/decks/" + MID)));
  await assertFails(getDoc(doc(as(B), "teachers/" + A + "/sessions/s1234")));
});

// 수업 시계(2026-11-23, PR #27 · docs/CLASS-CLOCK.md): 세션의 선택 칸 by = { pc, at } — 수업을 맡은 PC 창이 자기 거래 안에서 쓴 쓰기라는 표시.
// 따라가는 기기가 시계 표본을 고르는 데만 써요(수업 제어 · 권한은 지금처럼 hub.pc + 거래). 같은 계정의 기기는 규칙으로 구별되지 않아서 규칙은 모양만 봐요
test("세션 by: { pc, at }는 모양만 받아요(없음 · null도 돼요). 다른 키 · 64자 넘는 pc · 숫자가 아닌 at · 지도 아닌 값은 거절, 다른 교사는 못 써요", async () => {
  const ref = (db) => doc(db, "teachers/" + A + "/sessions/s1234");
  const a = as(A);
  await assertSucceeds(updateDoc(ref(a), { at: 10, by: { pc: "b1c2d3e4f5a6-0a1b2c3d4e5f", at: 10 } }));
  await assertSucceeds(updateDoc(ref(a), { by: null }));
  await assertSucceeds(setDoc(ref(a), Object.assign(session(), { at: 11, by: { pc: "p", at: 11 } })));
  await assertSucceeds(setDoc(ref(a), session()));
  await assertFails(updateDoc(ref(a), { by: { pc: "p", at: 1, extra: 1 } }));
  await assertFails(updateDoc(ref(a), { by: { pc: "x".repeat(65), at: 1 } }));
  await assertFails(updateDoc(ref(a), { by: { pc: "p", at: "1" } }));
  await assertFails(updateDoc(ref(a), { by: { pc: 5, at: 1 } }));
  await assertFails(updateDoc(ref(a), { by: { pc: "p" } }));
  await assertFails(updateDoc(ref(a), { by: "pc" }));
  await assertFails(updateDoc(ref(as(B)), { at: 12, by: { pc: "p", at: 12 } }));
});
