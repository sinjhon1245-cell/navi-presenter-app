// 영상 재생 제어(2026-11-11, docs/VIDEO.md): 영상 장면 · 영상 자료는 수업 화면에 멈춘 채 뜨고, 교사 PC의 재생 · 일시정지로만 움직여요.
// 다시 그리기 · 신호등 · 도구에 처음부터 다시 시작하지 않고, 재생 중 넘기면 5초 동안 되돌릴 수 있고(장면 이동 취소),
// 돌아오면 멈춘 곳에서 멈춘 채예요. 영상이 끝나도 다음 장면으로 넘어가지 않아요.
// YouTube 주소는 시험 안에서 가짜 플레이어 페이지로 돌려줘요(밖으로 나가는 요청 없음). 이 페이지는 YouTube 삽입 플레이어의 메시지
// (listening · onReady · infoDelivery · onStateChange · onError, 명령 playVideo · pauseVideo · seekTo)를 흉내 내요.
// 휴대폰과 함께 쓰는 경우(Firebase)는 tests/realtime.spec.js에서 봐요.
import { test, expect } from "@playwright/test";
import { isPc, watch, curLabel, scroll, V, fakeYouTube, player, pstate, ptime, pborn, frame, bar, chip, videoLesson, toFlow, openMore } from "./helpers.js";

test.describe.configure({ timeout: 90000 });
async function start(page) {
  await toFlow(page);
  const [stage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "수업 시작" }).click()]);
  await expect(curLabel(page)).toHaveText("영상 장면");
  return stage;
}
// 지금 진행 중인 수업의 장면 기록(이 브라우저의 끝나지 않은 수업 사본 navi-run)
const runLog = (page) => page.evaluate(() => { const r = JSON.parse(localStorage.getItem("navi-run") || "null"); return r && r.S ? r.S.log.map((x) => x.id) : null; });

test("영상 장면: 들어가면 멈춘 채로 뜨고(자동 재생 없음), 교사 PC의 재생 · 일시정지(단추 · K 키)로만 움직여요. 신호등 · 도구 · 자료 서랍 · 다시 그리기에도 처음부터 다시 시작하지 않아요", async ({ page, context }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []), hits = await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.ok);
  // 준비 화면의 장면 미리보기는 영상 카드(재생하지 않아요)
  await expect(page.locator(".sp-slide .slide.vid")).toContainText("YouTube 영상");
  await expect(page.locator(".sp-slide iframe")).toHaveCount(0);
  const stage = await start(page);
  watch(stage, errors);
  await expect(frame(stage)).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/navitest001\?.*enablejsapi=1/);
  expect(await frame(stage).getAttribute("src")).not.toMatch(/autoplay/);
  // 교사 화면: 수업 화면 미리보기는 카드(소리가 두 번 나지 않게), 아래에 영상 줄
  await expect(page.locator(".pv-screen iframe")).toHaveCount(0);
  await expect(bar(page)).toContainText("일시정지");
  await page.waitForTimeout(1500);
  expect(await pstate(stage), "들어가자마자 재생됐어요").toBe(-1);
  expect(await player(stage).evaluate(() => window.plays), "재생 명령이 갔어요").toBe(0);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  expect((await scroll(page)).down, "교사 화면이 한 화면을 넘어요").toBe(false);
  // 재생
  const born = await pborn(stage);
  await page.locator('[data-act="vid-play"]').click();
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(bar(page)).toContainText("재생 중");
  // 재생 중 교사 화면만 바뀌는 조작 · 수업 화면 위 도구: 영상은 그대로
  await page.keyboard.press("1");
  await expect(page.locator('.sig.s-red[aria-pressed="true"]').first()).toBeVisible();
  await page.keyboard.press("m");
  await page.keyboard.press("m");
  await page.locator('[data-act="tools"]').click();
  await page.locator('[data-act="tool-timer"][data-v="60"]').click();
  await expect(stage.locator(".stage .slide.media .tool-timer")).toBeVisible();
  await page.keyboard.press("2");
  await expect.poll(() => ptime(stage)).toBeGreaterThan(2);
  expect(hits.length, "영상 페이지를 다시 불렀어요").toBe(1);
  expect(await pborn(stage)).toBe(born);
  expect(await pstate(stage)).toBe(1);
  await expect(page.locator(".js-vid-t")).toContainText("0:0");
  // 일시정지 · K 키
  await page.locator('[data-act="vid-pause"]').click();
  await expect.poll(() => pstate(stage)).toBe(2);
  await expect(bar(page)).toContainText("일시정지");
  await page.keyboard.press("k");
  await expect.poll(() => pstate(stage)).toBe(1);
  await page.keyboard.press("k");
  await expect.poll(() => pstate(stage)).toBe(2);
  expect(hits.length).toBe(1);
  expect(await chip(stage).textContent()).toBe("영상 장면");
  expect(errors).toEqual([]);
});

test("넘기기 되돌리기: 재생 중 다음 장면으로 넘기면 5초 동안 ‘이전 장면으로 되돌리기’가 뜨고, 누르면 넘기기가 없던 것처럼 그 장면으로(기록에도 남지 않아요). 영상은 멈춘 곳에서 멈춘 채예요", async ({ page, context }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []), hits = await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.ok);
  const stage = await start(page);
  watch(stage, errors);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.locator('[data-act="vid-play"]').click();
  await expect.poll(() => ptime(stage)).toBeGreaterThanOrEqual(2);
  const before = await runLog(page);
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await expect(chip(stage)).toHaveText("둘째 장면");
  await expect(frame(stage)).toHaveCount(0);
  const undo = page.locator(".undo-move");
  await expect(undo).toContainText("‘둘째 장면’(으)로 넘겼어요");
  await expect(undo.getByRole("button", { name: /이전 장면으로 되돌리기/ })).toBeVisible();
  expect((await scroll(page)).down, "되돌리기 줄이 화면을 밀어요").toBe(false);
  await undo.getByRole("button", { name: /이전 장면으로 되돌리기/ }).click();
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(chip(stage)).toHaveText("영상 장면");
  await expect(undo).toHaveCount(0);
  // 넘기기가 없던 것처럼: 장면 기록이 넘기기 전과 같아요(둘째 장면에 머문 몇 초가 남지 않아요)
  expect(await runLog(page)).toEqual(before);
  // 영상은 새로 뜨되 멈춘 곳(2초 이후)부터, 멈춘 채
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=[2-9]/);
  await expect(bar(page)).toContainText("일시정지");
  await page.waitForTimeout(1200);
  expect(await pstate(stage)).toBe(-1);
  expect(await ptime(stage)).toBeGreaterThanOrEqual(2);
  expect(hits.length).toBe(2);
  // 다시 재생하면 그 자리에서 이어서
  await page.locator('[data-act="vid-play"]').click();
  await expect.poll(() => pstate(stage)).toBe(1);
  // 5초가 지나면 되돌리기는 사라지고, 이전 키(←)로 돌아가면 그때도 멈춘 곳에서 멈춘 채예요
  await expect.poll(() => ptime(stage)).toBeGreaterThanOrEqual(4);
  await page.keyboard.press("PageDown");
  await expect(undo).toBeVisible();
  await page.waitForTimeout(5300);
  await expect(undo).toHaveCount(0);
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await page.keyboard.press("PageUp");
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=[4-9]/);
  await page.waitForTimeout(1200);
  expect(await pstate(stage)).toBe(-1);
  // 돌아온 영상 장면의 첫 ‘다음’은 다시 재생(2026-11-12 정책), 일시정지(K)한 뒤의 ‘다음’은 다음 장면이고, 멈춘 채 넘겼으니 되돌리기는 없어요(재생 중일 때만)
  await page.keyboard.press("PageDown");
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(page)).toHaveText("영상 장면");
  await page.keyboard.press("k");
  await expect.poll(() => pstate(stage)).toBe(2);
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await page.waitForTimeout(400);
  await expect(undo).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("영상이 끝나도 다음 장면으로 넘어가지 않고, 수업 화면은 끝난 화면(다른 영상 추천)을 가려요. ‘처음부터 다시’로 다시 봐요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.end);
  const stage = await start(page);
  watch(stage, errors);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.locator('[data-act="vid-play"]').click();
  await expect.poll(() => pstate(stage), { timeout: 10000 }).toBe(0);
  await expect(bar(page)).toContainText("다음 장면으로 저절로 넘어가지 않아요");
  await expect(stage.locator(".vid-cover")).toContainText("영상이 끝났어요");
  await page.waitForTimeout(2000);
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(chip(stage)).toHaveText("영상 장면");
  await page.locator('[data-act="vid-play"]').filter({ hasText: "처음부터 다시" }).click();
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(stage.locator(".vid-cover")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("수업 화면이 재생을 막을 때(브라우저 자동 재생 제한): 되는 척하지 않고 교사 화면이 까닭과 할 일을 말해요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.block);
  const stage = await start(page);
  watch(stage, errors);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.locator('[data-act="vid-play"]').click();
  await expect(bar(page)).toContainText("수업 화면 브라우저가 재생을 막았어요", { timeout: 6000 });
  await expect(bar(page)).toContainText("영상을 한 번 눌러 주세요");
  expect(await pstate(stage)).toBe(-1);
  // 일시정지를 누르면 막힘 안내는 걷히고, 다시 재생을 누를 수 있어요
  await page.locator('[data-act="vid-play"]').click();
  await expect(bar(page)).toContainText("수업 화면 브라우저가 재생을 막았어요", { timeout: 6000 });
  expect(errors).toEqual([]);
});

test("삽입이 금지된 영상: 수업 화면은 YouTube 오류 화면 대신 가리고, 교사 화면은 까닭과 ‘YouTube에서 열기’를 보여 줘요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.bad);
  const stage = await start(page);
  watch(stage, errors);
  await expect(bar(page)).toContainText("다른 사이트에서 재생할 수 없게 막혀 있어요");
  await expect(bar(page).getByRole("link", { name: "YouTube에서 열기" })).toHaveAttribute("href", V.bad);
  await expect(page.locator('[data-act="vid-play"]')).toBeDisabled();
  await expect(stage.locator(".vid-cover")).toContainText("이 영상은 여기서 재생할 수 없어요");
  // 재생할 수 없는 영상은 ‘영상 재생’ 단계를 건너뛰어요: 큰 단추는 ‘다음’, 다음 키 한 번에 다음 장면
  await expect(page.locator(".pv-bar .nav-main")).toContainText("둘째 장면");
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  expect(errors).toEqual([]);
});

// 2026-11-12 확정 정책: 영상 장면에 들어오면 멈춤, 첫 ‘다음’ = 영상 재생, 둘째 ‘다음’ = 다음 장면. 휴대폰은 tests/realtime.spec.js(같은 계정) · control.spec.js(PIN)
test("다음 두 단계(교사 PC): 영상 장면의 첫 ‘다음’(스페이스 · → · 큰 단추)은 재생, 둘째는 다음 장면(5초 되돌리기 그대로). 되돌아오면 다시 첫 ‘다음’이 재생(멈춘 곳부터), K로 이미 틀었으면 바로 다음 장면, 마지막 장면의 영상도 같아요", async ({ page, context }, info) => {
  test.skip(!isPc(info) || info.project.name.startsWith("tablet"), "수업 화면 창은 교탁 PC에서 열어요");
  const errors = watch(page, []), hits = await fakeYouTube(context);
  await page.goto("/");
  const ids = await videoLesson(page, V.ok);
  // 마지막 장면에도 영상
  await page.locator('.srow[data-v="' + ids[2] + '"]').click();
  await openMore(page);
  await page.locator("#pg-" + ids[2] + "-video").fill(V.other);
  await page.locator("#pg-" + ids[2] + "-video").blur();
  const stage = await start(page);
  watch(stage, errors);
  const big = page.locator(".pv-bar .nav-main");
  await expect(big).toContainText("영상 재생");
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  expect(await pstate(stage)).toBe(-1);
  // 첫 ‘다음’(스페이스): 재생, 장면은 그대로
  await page.keyboard.press(" ");
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(chip(stage)).toHaveText("영상 장면");
  await expect(big).toContainText("둘째 장면");
  await expect.poll(() => ptime(stage)).toBeGreaterThanOrEqual(1.5);
  // 둘째 ‘다음’(→): 다음 장면, 재생 중이었으니 5초 되돌리기
  await page.keyboard.press("ArrowRight");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await expect(chip(stage)).toHaveText("둘째 장면");
  const undo = page.locator(".undo-move");
  await undo.getByRole("button", { name: /이전 장면으로 되돌리기/ }).click();
  // 되돌아오면 다시 멈춘 채, 큰 단추는 다시 ‘영상 재생’, 첫 ‘다음’(큰 단추)은 멈춘 곳부터 재생
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(big).toContainText("영상 재생");
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=[1-9]/);
  await page.waitForTimeout(1000);
  expect(await pstate(stage)).toBe(-1);
  const from = await ptime(stage);
  expect(from).toBeGreaterThanOrEqual(1);
  await big.click();
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(page)).toHaveText("영상 장면");
  expect(await ptime(stage)).toBeGreaterThanOrEqual(from);
  // 일시정지 → ‘다음’은 다음 장면(멈춘 채라 되돌리기 없음) → 이전 키로 돌아오면 멈춘 채 ‘영상 재생’
  await page.keyboard.press("k");
  await expect.poll(() => pstate(stage)).toBe(2);
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await page.keyboard.press("PageUp");
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(big).toContainText("영상 재생");
  // K(또는 재생 단추)로 먼저 틀면 그 방문의 ‘다음’은 바로 다음 장면
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.keyboard.press("k");
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(big).toContainText("둘째 장면");
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await expect(undo).toBeVisible();
  // 마지막 장면의 영상: 첫 ‘다음’은 재생, 둘째는 ‘다음 장면이 없어요’(수업은 끝나지 않아요)
  await page.keyboard.press("End");
  await expect(curLabel(page)).toHaveText("셋째 장면");
  await expect(big).toContainText("영상 재생");
  await expect(frame(stage)).toHaveAttribute("src", /navitest002/);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.keyboard.press("PageDown");
  await expect.poll(() => pstate(stage)).toBe(1);
  await expect(curLabel(page)).toHaveText("셋째 장면");
  await page.keyboard.press("PageDown");
  await expect(big).toContainText("다음 장면이 없어요");
  await expect(curLabel(page)).toHaveText("셋째 장면");
  expect(await pstate(stage)).toBe(1);
  expect(errors).toEqual([]);
});

test("다음 두 단계는 미리보기에서도 같고(수업 화면은 그대로), 새로고침 뒤 · 수업 화면 창을 다시 열어도 영상이 저절로 재생되지 않아요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.ok);
  // 수업 미리보기: 큰 단추가 ‘영상 재생’ → ‘다음’, 수업 화면은 열리지 않아요
  await page.getByRole("button", { name: "수업 미리보기" }).click();
  const big = page.locator(".pv-bar .nav-main");
  await expect(big).toContainText("영상 재생");
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("영상 장면");
  await expect(big).toContainText("둘째 장면");
  await page.keyboard.press("PageDown");
  await expect(curLabel(page)).toHaveText("둘째 장면");
  await page.locator('[data-act="rehearse-end"]').first().click();
  // 실제 수업: 첫 ‘다음’으로 재생한 뒤 수업 화면 창을 닫았다 다시 열면, 영상은 다시 멈춘 채 떠요
  const stage = await start(page);
  watch(stage, errors);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.keyboard.press("PageDown");
  await expect.poll(() => pstate(stage)).toBe(1);
  await stage.close();
  await expect(page.locator(".pv-warn")).toBeVisible();
  const [again] = await Promise.all([page.waitForEvent("popup"), page.locator('.pv-warn [data-act="stage-open"]').click()]);
  watch(again, errors);
  await expect(frame(again)).toHaveCount(1);
  await page.waitForTimeout(2500);
  expect(await pstate(again), "다시 연 수업 화면 창에서 영상이 저절로 재생됐어요").toBe(-1);
  // 이 방문에서 이미 틀었으니 ‘다음’은 다음 장면
  await expect(page.locator(".pv-bar .nav-main")).toContainText("둘째 장면");
  expect(errors).toEqual([]);
});

test("영상 자료(장면의 수업 자료로 띄운 영상)도 같아요: 띄우면 멈춘 채, 재생 중 다음 키로 내리면 5초 동안 ‘영상 다시 띄우기’, 다시 띄우면 멈춘 곳부터 멈춘 채", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, "");
  await openMore(page);
  await page.locator('[data-act="add-open"]').click();
  await page.locator("#d-title").fill("물이 끓는 영상");
  await page.locator("#d-link").fill(V.other);
  await page.locator('[data-act="add-res"]').click();
  await expect(page.locator(".res-pane")).toContainText("물이 끓는 영상");
  const stage = await start(page);
  watch(stage, errors);
  await page.keyboard.press("m");
  await page.locator(".pv-right .item").filter({ hasText: "물이 끓는 영상" }).getByRole("button", { name: "수업 화면에 띄우기" }).click();
  await expect(frame(stage)).toHaveAttribute("data-vkey", /^r:/);
  await expect(page.locator('[data-act="vid-play"]')).toBeEnabled();
  await page.waitForTimeout(800);
  expect(await pstate(stage)).toBe(-1);
  await page.locator('[data-act="vid-play"]').click();
  await expect.poll(() => ptime(stage)).toBeGreaterThanOrEqual(2);
  // 다음 키: 먼저 자료를 내려요(장면은 그대로). 재생 중이었으니 5초 동안 다시 띄우기
  await page.keyboard.press("PageDown");
  await expect(frame(stage)).toHaveCount(0);
  await expect(curLabel(page)).toHaveText("영상 장면");
  const undo = page.locator(".undo-move");
  await expect(undo).toContainText("영상을 내렸어요");
  await undo.getByRole("button", { name: /영상 다시 띄우기/ }).click();
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=[2-9]/);
  await page.waitForTimeout(1000);
  expect(await pstate(stage)).toBe(-1);
  await expect(bar(page)).toContainText("일시정지");
  expect(errors).toEqual([]);
});

test("준비 화면: 장면 영상 칸은 YouTube 주소만 받고(다른 주소는 그대로 말해요), 비우면 영상이 빠지고, 내 수업에 저장돼요", async ({ page }, info) => {
  test.skip(!isPc(info), "수업 준비는 교사 화면(PC)에서 해요");
  const errors = watch(page, []);
  await page.goto("/");
  const ids = await videoLesson(page, "");
  await openMore(page);
  const box = page.locator("#pg-" + ids[0] + "-video");
  await box.fill("https://example.com/movie.mp4");
  await box.blur();
  // 영상 칸은 ‘더 넣기’ 안에 있어서, 잘못된 주소 안내도 그 칸 바로 아래에 떠요(2026-11-14, docs/SLIDE-PREP.md)
  await expect(page.locator("#sp-more .warn-note")).toContainText("YouTube 영상 주소를 넣어 주세요");
  await expect(page.locator(".sp-slide .slide.vid")).toHaveCount(0);
  await box.fill(V.ok + "?t=1m30s");
  await box.blur();
  await expect(page.locator("#sp-more .warn-note")).toHaveCount(0);
  await expect(page.locator(".sp-slide .slide.vid")).toContainText("YouTube 영상");
  // 카드는 장면 이름으로(슬라이드 제목은 수업 화면에 나오지 않아요)
  await expect(page.locator(".sp-slide .slide.vid")).toContainText("영상 장면");
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("tab", { name: "내 수업" }).click();
  await page.locator(".mylib .mrow").first().locator(".m-open").click();
  await expect(page.locator("#pg-" + ids[0] + "-video")).toHaveValue(V.ok + "?t=1m30s");
  await expect(page.locator(".sp-slide .slide.vid")).toBeVisible();
  await page.locator("#pg-" + ids[0] + "-video").fill("");
  await page.locator("#pg-" + ids[0] + "-video").blur();
  await expect(page.locator(".sp-slide .slide.vid")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("링크의 시작 시각(t=1m30s)부터 멈춘 채 떠요", async ({ page, context }, info) => {
  test.skip(info.project.name !== "pc-1536x864", "영상 플레이어 흐름이라 교탁 PC 크기에서 봐요");
  const errors = watch(page, []);
  await fakeYouTube(context);
  await page.goto("/");
  await videoLesson(page, V.ok + "?t=1m30s");
  const stage = await start(page);
  watch(stage, errors);
  await expect(frame(stage)).toHaveAttribute("src", /[?&]start=90(&|$)/);
  await expect(bar(page)).toContainText("1:30");
  expect(errors).toEqual([]);
});
