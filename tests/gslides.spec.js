// PPTX → Google Drive · Slides → 원래 모양(2026-11-15, docs/PPTX-GOOGLE.md). Firebase 에뮬레이터(가짜 프로젝트 demo-navi) + 가짜 Google.
// 실제 Google에는 요청하지 않아요: Drive · Slides · 그림 주소 요청은 이 시험이 모두 가로채 가짜로 답해요(에뮬레이터에서는 열쇠도 가짜).
// - 동의하기 전에는 Google로 아무 요청도 가지 않아요(안내 칸을 열거나 취소해도, ‘바로 바꾸기’를 켜기 전에는 다른 PPTX를 올려도)
// - 동의하면: 앱 폴더에 Slides로 올리고 → PDF로 내보내 → 예전 ‘PDF 넣기’처럼 장마다 그림, 장면 이름 · 노트 그대로 → 변환 파일은 바로 휴지통,
//   ‘PDF 사본 남겨 두기’면 그 PDF(같은 바이트)만 Drive에. 계정(Firestore)에는 Drive id · 그림 주소가 없어요
// - 올리는 사본만 고쳐요: 한 단계짜리 ‘여러 단계 차트 항목’(Google이 글자 대신 1, 2, 3…을 그리던 것) · 숨긴 장. 교사 PC의 파일은 그대로
// - 차트 · 없는 글꼴 같은 장은 ‘수업 전에 확인할 장’으로. 10MB 넘는 PDF는 장마다 Google 그림으로 자동 대체
// - 같은 계정 휴대폰: 교사 PC와 같은 PDF(지문 확인)로 지금 장면 크게 · 다음 장면 작게, 그 아래 노트 전체
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { watch, fixture, nextBtn, curLabel, touchMisses } from "./helpers.js";
import { EMU, PROJECT, PC, needEmulator, email, device, signIn, pcLinked, qrUrl, phoneJoins, uidAfterSignIn } from "./firebase-helpers.js";

needEmulator();
test.describe.configure({ timeout: 180000 });

const PNG = fs.readFileSync(fixture("picture.png"));
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Expose-Headers": "Location" };
const docUrl = (p) => "http://" + EMU + "/v1/projects/" + PROJECT + "/databases/(default)/documents/" + p;
const adminList = async (p) => { const r = await fetch(docUrl(p), { headers: { Authorization: "Bearer owner" } }); return r.ok ? r.json() : null; };
// one file out of a zip (what the app actually sent to Google)
function unzip(buf, name) {
  let e = buf.length - 22; while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0, n = buf.readUInt16LE(e + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const fname = buf.toString("utf8", p + 46, p + 46 + nl);
    if (fname === name) { const d = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(d, d + size); return (method ? inflateRawSync(raw) : raw).toString("utf8"); }
    p += 46 + nl + xl + cl;
  }
  return null;
}

// a small fake Google Drive + Slides, shared by the devices of one test. pdfFor(): the PDF Google "draws"
function fakeGoogle(o) {
  const g = { log: [], files: [], folder: false, exportFail: !!(o && o.exportFail), pdfFor: (o && o.pdfFor) || (() => fs.readFileSync(fixture("lesson.pdf"))), slideN: (o && o.slideN) || 3 };
  // only Drive · Slides · the picture addresses: Firebase, fonts and the rest go on as usual
  g.attach = (ctx) => ctx.route(/^https:\/\/(www\.googleapis\.com\/(drive|upload)\/|slides\.googleapis\.com\/|lh3\.googleusercontent\.com\/fake-)/, async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    g.log.push(m + " " + url.replace(/^https:\/\/[^/]+/, "").replace(/\?alt=media.*$/, "?alt=media").replace(/\?(?!alt=media).*$/, ""));
    const json = (body, status) => route.fulfill({ status: status || 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
    if (/googleusercontent\.com\/fake-/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: "image/png", body: PNG });
    if (!/upload_id=/.test(url) && (req.headers().authorization || "") !== "Bearer test-drive-token") return json({ error: { status: "UNAUTHENTICATED" } }, 401);
    const live = () => g.files.filter((f) => !f.trashed);
    if (m === "GET" && /\/drive\/v3\/files\?/.test(url)) {
      const q = new URL(url).searchParams.get("q") || "";
      if (q.includes("value='folder'")) return json({ files: g.folder ? [{ id: "dir1" }] : [] });
      const fid = (q.match(/key='fid' and value='([^']+)'/) || [])[1];
      return json({ files: live().filter((f) => !fid || (f.appProperties || {}).fid === fid).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, createdTime: "2026-11-15T01:00:00Z", appProperties: f.appProperties })) });
    }
    if (m === "GET" && /\/drive\/v3\/files\/[^/?]+\?alt=media/.test(url)) { const f = g.files.find((x) => x.id === url.match(/files\/([^?]+)/)[1]); return f ? route.fulfill({ status: 200, headers: CORS, contentType: f.mimeType, body: f.body }) : json({}, 404); }
    if (m === "POST" && /\/drive\/v3\/files\?fields=id$/.test(url)) { g.folder = true; g.folderMeta = JSON.parse(req.postData()); return json({ id: "dir1" }); }
    if (m === "POST" && /\/upload\/drive\/v3\/files\?uploadType=resumable/.test(url)) {
      g.pending = JSON.parse(req.postData());
      return route.fulfill({ status: 200, headers: Object.assign({ Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=u" + (g.files.length + 1) }, CORS), body: "" });
    }
    if (m === "PUT" && /upload_id=/.test(url) && g.failUpload) return json({ error: { status: "INTERNAL" } }, 500);
    if (m === "PUT" && /upload_id=/.test(url)) { const f = Object.assign({ id: (g.pending.mimeType === "application/pdf" ? "pdf" : "gs") + (g.files.length + 1), body: req.postDataBuffer() }, g.pending); g.files.push(f); return json({ id: f.id }); }
    if (m === "GET" && /\/export\?/.test(url)) {
      if (g.exportFail) return json({ error: { errors: [{ reason: "exportSizeLimitExceeded" }], status: "PERMISSION_DENIED" } }, 403);
      return route.fulfill({ status: 200, headers: CORS, contentType: "application/pdf", body: g.pdfFor() });
    }
    if (m === "PATCH" && /\/drive\/v3\/files\//.test(url)) {
      const id = decodeURIComponent(url.match(/files\/([^?]+)/)[1]), f = g.files.find((x) => x.id === id), b = JSON.parse(req.postData());
      if (!f) return json({ error: { status: "NOT_FOUND" } }, 404);
      if (b.trashed) f.trashed = true;
      if (b.appProperties) f.appProperties = Object.assign({}, f.appProperties, b.appProperties);
      return json({ id });
    }
    if (m === "GET" && /slides\.googleapis\.com\/v1\/presentations\/[^/?]+\?/.test(url)) return json({ slides: Array.from({ length: g.slideN }, (_, i) => ({ objectId: "p" + (i + 1) })) });
    if (m === "GET" && /\/thumbnail\?/.test(url)) return json({ contentUrl: "https://lh3.googleusercontent.com/fake-" + url.match(/pages\/([^/]+)\//)[1], width: 1600, height: 900 });
    return json({ error: { status: "NOT_FOUND" } }, 404);
  });
  return g;
}
async function teacher(browser, errors, who, g) {
  const pc = await device(browser, PC, errors);
  await g.attach(pc.ctx);
  await pc.page.goto("/");
  await signIn(pc.page, who);
  await pcLinked(pc.page);
  pc.uid = await uidAfterSignIn(pc.page);
  return pc;
}
async function addPptx(page, name, n) {
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator("#pdf-in").setInputFiles(fixture(name));
  await expect(page.getByText(n + "장을 가져왔어요").first()).toBeVisible({ timeout: 30000 });
}
const notes = async (page, n) => { const out = []; for (let i = 0; i < n; i++) { await page.locator(".srow").nth(i).click(); out.push(await page.locator('textarea[data-k="notes"]').inputValue()); } return out; };
const drawn = (img) => expect.poll(() => img.evaluate((i) => (i.src.indexOf("blob:") === 0 && i.complete ? i.naturalWidth : 0)).catch(() => 0), { timeout: 15000 }).toBeGreaterThan(0);
const deckJson = async (uid) => JSON.stringify(await adminList("teachers/" + uid + "/decks"));
const consent = async (page, o) => {
  await page.getByRole("button", { name: "Google로 원래 모양 만들기" }).click();
  const ask = page.locator(".gs-ask");
  if (o && o.drop) await ask.getByRole("radio", { name: /아무것도 남기지 않기/ }).check();
  if (o && o.auto) await ask.getByRole("checkbox", { name: /다음부터는 묻지 않고/ }).check();
  await ask.getByRole("button", { name: "동의하고 바꾸기" }).click();
};

test("동의 전에는 Google로 아무것도 가지 않고, 동의하면 원래 모양(노트 그대로) · 변환 파일은 바로 휴지통 · PDF 사본만 Drive에. 계정에는 Drive id가 없고, 발표 설정에서 휴지통으로", async ({ browser }) => {
  const errors = [], g = fakeGoogle();
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  const before = await notes(page, 3);
  const row = page.locator(".words-only");
  await expect(row).toContainText("글자 화면 · 원본 디자인 아님");
  // 안내 칸: 무엇이 어디로 가는지 · 남길 것 · 다음부터 바로 바꾸기(기본 꺼짐). 열고 닫아도 Google로 요청이 없어요
  await row.getByRole("button", { name: "Google로 원래 모양 만들기" }).click();
  const ask = page.locator(".gs-ask");
  await expect(ask).toContainText("처음으로 PPTX가 이 브라우저 밖");
  await expect(ask).toContainText("자기가 만든 파일만");
  await expect(ask).toContainText("다른 사람과 공유하지 않아요");
  await expect(ask.getByRole("radio", { name: /PDF 사본 남겨 두기/ })).toBeChecked();
  await expect(ask.getByRole("checkbox", { name: /다음부터는 묻지 않고/ })).not.toBeChecked();
  await ask.getByRole("button", { name: "취소" }).click();
  await expect(ask).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(g.log, "동의 전에 Google로 요청했어요").toEqual([]);
  // 동의 → 장마다 그림, 노트 · 장면 이름 그대로
  await consent(page);
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".words-only")).toHaveCount(0);
  await drawn(page.locator(".sp-slide .slide.img img"));
  expect(await notes(page, 3)).toEqual(before);
  // Drive: 앱 폴더, 변환 파일(Slides)은 휴지통, 남는 것은 그 PDF 사본 하나(같은 바이트 · 수업 파일 지문), 공유 없음
  expect(g.folderMeta).toMatchObject({ name: "수업 내비 변환 파일", mimeType: "application/vnd.google-apps.folder" });
  const [gs, pdf] = g.files;
  expect(gs).toMatchObject({ mimeType: "application/vnd.google-apps.presentation", parents: ["dir1"], trashed: true });
  expect(gs.appProperties.src).toMatch(/^f-[0-9a-f]{32}$/);
  expect(pdf).toMatchObject({ mimeType: "application/pdf", parents: ["dir1"] });
  expect(pdf.trashed).toBeFalsy();
  expect(pdf.appProperties.navi).toBe("pdf");
  expect(pdf.body.equals(fs.readFileSync(fixture("lesson.pdf"))), "Drive 사본이 수업 PDF와 달라요").toBe(true);
  expect(g.log.some((l) => /permissions/.test(l)), "공유 권한을 더했어요").toBe(false);
  await expect.poll(async () => (await deckJson(pc.uid)).includes(pdf.appProperties.fid), { timeout: 15000 }).toBe(true);
  const raw = await deckJson(pc.uid);
  for (const bad of ["gs1", "pdf2", "googleusercontent", "googleapis", "blob:"]) expect(raw, bad).not.toContain(bad);
  // ‘바로 바꾸기’를 켜지 않았으면 다른 PPTX를 올려도 Google로 가지 않아요
  const n0 = g.log.length;
  await addPptx(page, "other.pptx", 4);
  await page.waitForTimeout(800);
  expect(g.log.length).toBe(n0);
  await expect(page.locator(".words-only")).toBeVisible();
  // 발표 설정: 남은 파일 보기 → 휴지통으로
  await page.getByRole("tab", { name: "발표 설정" }).click();
  const card = page.locator(".scard").filter({ has: page.getByRole("heading", { name: "Google Drive 변환 파일" }) });
  await card.getByRole("button", { name: "Drive의 파일 보기" }).click();
  await expect(card.locator(".gs-files li")).toHaveCount(1);
  await card.getByRole("button", { name: "휴지통으로", exact: true }).click();
  await expect(card).toContainText("남아 있는 파일이 없어요");
  await expect(card).toContainText("1개를 Drive 휴지통으로 보냈어요");
  expect(pdf.trashed).toBe(true);
  expect(errors).toEqual([]);
});

test("‘바로 바꾸기’: 처음 한 번 동의하면 다음 PPTX는 올리자마자 바뀌고(이번 시간 허용이 있으면 누를 것 없음), 발표 설정에서 끄면 다시 묻고 보내지 않아요", async ({ browser }) => {
  const errors = [], g = fakeGoogle();
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  await consent(page, { auto: true, drop: true });
  await expect(page.getByText("Drive에는 아무것도 남기지 않았어요")).toBeVisible({ timeout: 30000 });
  expect(g.files.map((f) => !!f.trashed)).toEqual([true]);
  // 다음 PPTX: 올리기만 하면 바뀌어요(글자만 수업이 생기자마자 이어서)
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".words-only")).toHaveCount(0);
  expect(g.files).toHaveLength(2);
  // 발표 설정에서 끄면: 다음 PPTX는 글자만 · Google로 요청 없음
  await page.getByRole("tab", { name: "발표 설정" }).click();
  const card = page.locator(".scard").filter({ has: page.getByRole("heading", { name: "Google Drive 변환 파일" }) });
  await expect(card.getByRole("checkbox", { name: /바로 Google로 바꾸기/ })).toBeChecked();
  await card.getByRole("checkbox", { name: /바로 Google로 바꾸기/ }).uncheck();
  const n0 = g.log.length;
  await addPptx(page, "other.pptx", 4);
  await page.waitForTimeout(800);
  expect(g.log.length).toBe(n0);
  await expect(page.locator(".words-only")).toBeVisible();
  expect(errors).toEqual([]);
});

test("올리는 사본만 고쳐요(차트 항목), 차트 · 없는 글꼴은 ‘수업 전에 확인할 장’으로 · 누르면 그 장면으로", async ({ browser }) => {
  const errors = [], g = fakeGoogle({ pdfFor: () => fs.readFileSync(fixture("gtest.pdf")), slideN: 7 });
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "gtest.pptx", 7);
  await consent(page);
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 7장을 넣었어요")).toBeVisible({ timeout: 30000 });
  // 보낸 사본: 차트 가로축 항목이 보통 형식(Google이 글자 그대로 그려요). 교사 PC의 원본은 그대로(여러 단계 형식)
  const sent = g.files[0].body, orig = fs.readFileSync(fixture("gtest.pptx"));
  const sentChart = ["ppt/charts/chart1.xml", "ppt/charts/chart2.xml"].map((n) => unzip(sent, n)).join("");
  expect(sentChart).not.toContain("multiLvlStrRef");
  expect(sentChart).toContain("<c:strRef>");
  expect(sentChart).toContain("<c:v>월</c:v>");
  expect(unzip(orig, "ppt/charts/chart1.xml")).toContain("multiLvlStrRef");
  // 확인할 장(2026-11-16): 상태 줄의 ‘확인할 장’ 칩을 누르면 6장(차트) · 없는 글꼴 이름. 누르면 그 장면, ‘확인했어요’면 목록은 ‘확인한 장’으로 남아요
  await expect(page.locator(".pst .pchip").nth(0)).toHaveText("Google 변환 7장");
  await page.locator(".pst").getByRole("button", { name: /확인할 장 1 · 글꼴/ }).click();
  const rv = page.locator(".gs-review");
  await expect(rv).toContainText("수업 전에 확인할 장");
  await expect(rv.getByRole("button", { name: "6장 · 차트" })).toBeVisible();
  await expect(rv).toContainText("맑은 고딕");
  await rv.getByRole("button", { name: "6장 · 차트" }).click();
  await expect(page.locator(".srow").nth(5)).toHaveAttribute("aria-current", /.+/);
  await rv.getByRole("button", { name: "확인했어요" }).click();
  await expect(page.locator(".gs-review")).toContainText("확인한 장");
  await expect(page.locator(".gs-review").getByRole("button", { name: "확인했어요" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Google이 PDF를 못 만들 만큼 크면(10MB) 장마다 Google 그림으로 자동 대체 · 확인할 장 안내, 그 변환 파일은 휴대폰용으로 남겨요", async ({ browser }) => {
  const errors = [], g = fakeGoogle({ exportFail: true });
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  const before = await notes(page, 3);
  await consent(page);
  await expect(page.getByText("장마다 그림으로 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".words-only")).toHaveCount(0);
  await drawn(page.locator(".sp-slide .slide.img img"));
  expect(await notes(page, 3)).toEqual(before);
  expect(g.log.filter((l) => /thumbnail$/.test(l))).toHaveLength(3);
  await expect(page.locator(".pst .pchip").nth(0)).toHaveText("Google 그림(큰 파일) 3장");
  await expect(page.locator(".pst-limit")).toContainText("일부 기호는 흐리거나 빠질 수 있고");
  expect(g.files).toHaveLength(1);
  expect(g.files[0].trashed).toBeFalsy();
  expect(g.files[0].appProperties.fid).toMatch(/^f-[0-9a-f]{32}$/);
  // 내 수업 목록에서도 ‘글자만’이 아니에요
  await page.getByRole("tab", { name: "내 수업" }).click();
  await expect(page.locator(".mylib .mrow").first()).not.toContainText("PPTX 글자만");
  expect(errors).toEqual([]);
});

test("같은 계정 휴대폰: 교사 PC와 같은 PDF(지문 확인)로 지금 장면 크게 · 다음 장면 작게 · 그 아래 노트 전체, 장면을 넘기면 함께 바뀌어요", async ({ browser }) => {
  const errors = [], who = email("teacher"), g = fakeGoogle();
  const pc = await teacher(browser, errors, who, g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  const noteText = (await notes(page, 3)).map((t) => t.trim());
  await consent(page);
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  const url = await qrUrl(page);
  const ph = await phoneJoins(browser, errors, url, who);
  await g.attach(ph.ctx);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  watch(stage, errors);
  await expect(curLabel(ph.page)).toHaveText(await curLabel(page).innerText(), { timeout: 20000 });
  // 이 휴대폰에는 파일이 없어요: 누르기 전에는 Google로 요청하지 않아요
  const n0 = g.log.length;
  await expect(ph.page.locator(".gs-ph")).toContainText("슬라이드는 교사 PC에 있어요", { timeout: 20000 });
  await ph.page.waitForTimeout(500);
  expect(g.log.length).toBe(n0);
  await ph.page.locator(".gs-ph").getByRole("button", { name: "슬라이드 보기" }).click();
  await drawn(ph.page.locator(".rm-tv.big .slide.img img"));
  await drawn(ph.page.locator(".rm-tv .nx-pic"));
  await expect(ph.page.locator(".gs-ph")).toHaveCount(0);
  expect(g.log.filter((l) => /alt=media$/.test(l)), "PDF 사본을 받아요").toHaveLength(1);
  expect(g.log.some((l) => /thumbnail$/.test(l)), "그림 대신 같은 PDF를 써요").toBe(false);
  // 슬라이드 아래에 노트 전체(줄바꿈 그대로), 엄지 단추 · 끝내기 · 신호등은 그대로
  const rm = ph.page.locator(".remote");
  const tvBox = await ph.page.locator(".rm-tv.big").boundingBox(), prBox = await ph.page.locator(".remote .prompter").boundingBox();
  expect(prBox.y, "노트가 슬라이드 아래에").toBeGreaterThan(tvBox.y);
  if (noteText[0]) await expect(rm.locator(".prompter")).toContainText(noteText[0].split("\n")[0]);
  for (const sel of ['.thumb-nav [data-act="next"]', ".thumb-nav .sigs", '.rm-top [data-act="end-ask"]']) await expect(ph.page.locator(sel).first()).toBeInViewport();
  await ph.page.screenshot({ path: test.info().outputPath("phone-slide.png") });
  // 다음 장면: 그림 · 노트가 함께 바뀌고, 다시 누를 것이 없어요
  await nextBtn(ph.page).click();
  await expect(curLabel(page)).toHaveText(await curLabel(ph.page).innerText());
  await drawn(ph.page.locator(".rm-tv.big .slide.img img"));
  if (noteText[1]) await expect(rm.locator(".prompter")).toContainText(noteText[1].split("\n")[0]);
  expect(g.log.filter((l) => /alt=media$/.test(l))).toHaveLength(1);
  // 신호 → 지금 쓸 것도 그대로 휴대폰에
  await ph.page.locator(".thumb-nav .sig.s-red").click();
  await expect(ph.page.locator(".thumb-nav .sug")).toBeVisible();
  expect(await ph.page.locator(".rm-tv.big .slide.img img").getAttribute("src")).toMatch(/^blob:/);
  expect(await deckJson(pc.uid)).not.toContain("googleapis");
  expect(errors).toEqual([]);
});

test("상태 영역(2026-11-16): Google 변환 성공은 ‘Google 변환’ 칩과 한계, 실패는 이유를 말하고 글자 화면 그대로, 취소는 아무것도 보내지 않았다고", async ({ browser }) => {
  const errors = [], g = fakeGoogle();
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  // 처음 로그인: 표시 이름은 얇은 한 줄로 남아 있고(저장할 때까지), 그 줄이 있어도 올리기 · 변환이 막히지 않아요
  await expect(page.locator(".name-ask")).toBeVisible();
  await addPptx(page, "lesson.pptx", 3);
  await expect(page.locator(".pst .pchip").nth(0)).toHaveText("글자 화면 · 원본 디자인 아님");
  // 취소: Google 창을 닫으면 요청 없이 그대로
  await page.evaluate(() => { const real = window.naviAuth.driveToken; window.__realToken = real; window.naviAuth.driveToken = () => Promise.reject(Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" })); });
  await consent(page);
  await expect(page.locator(".pst .pst-err")).toContainText("Google 창을 닫아서 바꾸지 않았어요. 아무것도 Drive로 가지 않았어요.");
  expect(g.log).toEqual([]);
  await expect(page.locator(".pst .pchip").nth(0)).toHaveText("글자 화면 · 원본 디자인 아님");
  await page.evaluate(() => { window.naviAuth.driveToken = window.__realToken; });
  // 실패: 올리기가 막히면 이유를 말하고(경고는 닫히지 않아요), 수업은 글자 화면 그대로
  g.failUpload = true;
  await consent(page);
  await expect(page.locator(".pst .pst-err")).toContainText("Google로 바꾸지 못했어요", { timeout: 30000 });
  await expect(page.locator(".words-only")).toBeVisible();
  g.failUpload = false;
  // 성공
  await consent(page);
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".pst .pchip").nth(0)).toHaveText("Google 변환 3장");
  await expect(page.locator(".pst .pst-err")).toHaveCount(0);
  await expect(page.locator(".pst-limit")).toContainText("글꼴 · 배치 · 차트 · SmartArt가 원본과 달라질 수 있고");
  await expect(page.locator(".words-only")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// PR #24 검토(2026-11-16): 휴대폰 폭에서도 변환 단추와 동의 창 단추는 44px 칸 어디를 눌러도 눌려요. 보이는 크기와 슬라이드 자리는 그대로
test("휴대폰 폭(390): ‘Google로 원래 모양 만들기’와 동의 창 단추도 44px 칸 어디를 눌러도 눌리고, 누르기 전에는 아무것도 보내지 않아요", async ({ browser }) => {
  const errors = [], g = fakeGoogle();
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".pst-more").first().click();
  const go = page.locator(".pst-top .words-only").getByRole("button", { name: "Google로 원래 모양 만들기" });
  await expect(go).toBeVisible();
  let h = await touchMisses(page, ".pst button, .pst label.btn");
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  // 슬라이드는 여전히 첫 화면에 다 보여요
  await page.evaluate(() => window.scrollTo(0, 0));
  const s = await page.evaluate(() => { const r = document.querySelector(".sp-slide .slide").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  expect(s.bottom, JSON.stringify(s)).toBeLessThanOrEqual(844);
  await go.click();
  const ask = page.locator(".gs-ask");
  await expect(ask).toBeVisible();
  h = await touchMisses(page, ".pop-layer .gs-ask button, .pop-layer .gs-ask label.btn");
  expect(h.bad, h.seen.join(" | ")).toEqual([]);
  expect(g.log).toEqual([]);
  expect(errors).toEqual([]);
});

// CI에서 찾은 것(PR #24, 2026-11-16): 동의 창이 열린 동안 화면이 다시 그려지면(저장 · 동기화 표시) ‘다음부터는 묻지 않고’ 체크가 풀려
// 다음 PPTX가 바로 바뀌지 않았어요. 체크는 다시 그려져도 남고, ‘동의하고 바꾸기’를 눌러야만 저장돼요(체크하고 닫으면 저장하지 않아요)
test("동의 창이 열린 동안 화면이 다시 그려져도 ‘다음부터는 묻지 않고’ 체크는 남고, 닫으면 저장하지 않아요. 동의하면 다음 PPTX는 바로 바뀌어요", async ({ browser }) => {
  const errors = [], g = fakeGoogle();
  const pc = await teacher(browser, errors, email("teacher"), g), page = pc.page;
  await addPptx(page, "lesson.pptx", 3);
  const redraw = () => page.evaluate(() => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")); });
  const auto = () => page.locator(".gs-ask").getByRole("checkbox", { name: /다음부터는 묻지 않고/ });
  // 체크하고 닫기: 저장하지 않아요(다시 열면 꺼져 있어요), Google로 아무것도 가지 않아요
  await page.getByRole("button", { name: "Google로 원래 모양 만들기" }).click();
  await auto().check();
  await redraw();
  await expect(auto()).toBeChecked();
  await page.locator(".gs-ask").getByRole("button", { name: "취소" }).click();
  await expect(page.locator(".gs-ask")).toHaveCount(0);
  await page.getByRole("button", { name: "Google로 원래 모양 만들기" }).click();
  await expect(auto()).not.toBeChecked();
  expect(g.log).toEqual([]);
  // 체크 → 다시 그려짐 → 동의: 다음 PPTX는 올리자마자 바뀌어요
  await page.locator(".gs-ask").getByRole("radio", { name: /아무것도 남기지 않기/ }).check();
  await auto().check();
  await redraw();
  await expect(auto()).toBeChecked();
  await page.locator(".gs-ask").getByRole("button", { name: "동의하고 바꾸기" }).click();
  await expect(page.getByText("Drive에는 아무것도 남기지 않았어요")).toBeVisible({ timeout: 30000 });
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator("#pdf-in").setInputFiles(fixture("lesson.pptx"));
  await expect(page.getByText("Google Slides로 바꾼 원래 모양 3장을 넣었어요")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".words-only")).toHaveCount(0);
  expect(errors.filter((e) => !/offline|연결/.test(e))).toEqual([]);
});
