// GitHub Actions 결과 요약: Playwright JSON 결과를 통과 · 실패 · 불안정 · 건너뜀 · 미실행으로 나눠 실행 화면 요약에 적어요.
// 건너뜀 = 시험 안에서 "이 기기에는 해당 없어요"라고 정한 것(test.skip).
// 미실행 = 돌지 않은 것: 아직 만들지 않은 기능의 시험(test.fixme)이나 중단·시간 초과. 통과로 세지 않아요.
// firebase 묶음(보안 규칙 · 휴대폰 ↔ 교사 PC 실시간 · 저장 비교)은 따로 한 줄 더 적어요.
import { readFileSync, appendFileSync, existsSync } from "node:fs";

const file = "playwright-report/results.json";
const lines = [];
if (!existsSync(file)) {
  lines.push("## 시험 결과", "", "**시험이 실행되지 않았어요.** 결과 파일이 없어요(설치나 서버 시작 단계에서 멈췄을 수 있어요).");
} else {
  const report = JSON.parse(readFileSync(file, "utf8"));
  const n = { passed: 0, failed: 0, flaky: 0, skipped: 0, notRun: 0 };
  const failed = [], notRun = [], notBuilt = new Set(), fb = { passed: 0, other: 0 };
  const walk = (suite) => {
    (suite.suites || []).forEach(walk);
    (suite.specs || []).forEach((spec) => spec.tests.forEach((t) => {
      const name = "[" + t.projectName + "] " + spec.title;
      const ran = t.results.filter((r) => r.status !== "skipped");
      if (t.projectName === "firebase") { if (t.status === "expected" && ran.length) fb.passed++; else fb.other++; }
      if (t.status === "expected" && ran.length) n.passed++;
      else if (t.status === "unexpected") { n.failed++; failed.push(name); }
      else if (t.status === "flaky") n.flaky++;
      else if (t.annotations.some((a) => a.type === "skip")) n.skipped++;
      else if (t.annotations.some((a) => a.type === "fixme")) { n.notRun++; notBuilt.add(spec.title); }
      else { n.notRun++; notRun.push(name); }
    }));
  };
  report.suites.forEach(walk);
  lines.push("## 시험 결과", "",
    "| 통과 | 실패 | 불안정(다시 해서 통과) | 건너뜀(그 기기에 해당 없음) | 미실행 |", "| --- | --- | --- | --- | --- |",
    "| " + [n.passed, n.failed, n.flaky, n.skipped, n.notRun].join(" | ") + " |", "",
    "걸린 시간: " + Math.round(report.stats.duration / 1000) + "초", "",
    "Firebase 에뮬레이터 시험(보안 규칙 · 실시간 · 저장 비교): 통과 " + fb.passed + (fb.other ? " · 통과 못 함 " + fb.other : ""));
  if (failed.length) lines.push("", "### 실패", ...failed.map((x) => "- " + x));
  if (notBuilt.size) lines.push("", "### 미실행: 아직 만들지 않은 기능 (기기 크기마다 1개씩)", ...[...notBuilt].map((x) => "- " + x));
  if (notRun.length) lines.push("", "### 미실행: 중단·시간 초과", ...notRun.slice(0, 30).map((x) => "- " + x));
}
const text = lines.join("\n") + "\n";
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
