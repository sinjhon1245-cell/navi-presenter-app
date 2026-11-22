// 정식 사이트 1차 Firebase 활성화(2026-11-15, docs/PRODUCTION-ACTIVATION.md): navi-config.js는 정식 주소에서만 운영 Firebase를 켜고
// PIN은 꺼요(구글 계정 로그인만). 미리보기 · 이 PC · 모르는 주소는 비어 있어 이 기기 안에서만 동작해요
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync("public/navi-config.js", "utf8");
const run = (hostname, preset) => {
  const box = { window: preset ? { NAVI_FIREBASE: preset } : {}, location: { hostname } };
  vm.runInNewContext(SRC, box);
  return box.window.NAVI_FIREBASE === undefined ? "없음" : JSON.parse(JSON.stringify(box.window.NAVI_FIREBASE));
};

test("Firebase 설정: 정식 주소에서만 켜지고 PIN은 꺼져 있어요. 미리보기 · 이 PC · 모르는 주소는 비어 있고, 공개 값 네 개만 있어요", ({}, info) => {
  test.skip(info.project.name !== "pc-1536x864", "설정 파일만 읽는 시험이라 한 번만 돌려요");
  const prod = run("navi-presenter.vercel.app");
  expect(prod.app.projectId).toBe("navi-presenter-fd289");
  expect(prod.app.authDomain).toBe("navi-presenter-fd289.firebaseapp.com");
  expect(Object.keys(prod.app).sort()).toEqual(["apiKey", "appId", "authDomain", "projectId"]);
  expect(prod.pin).toBe(false);
  // PPTX를 Google로 바꾸기(2026-11-15): 정식 주소에서 켬. 교사가 동의하기 전에는 아무것도 보내지 않아요(tests/gslides.spec.js)
  expect(prod.drive).toBe(true);
  for (const h of ["localhost", "127.0.0.1", "navi-presenter-jin-jin2.vercel.app", "navi-presenter-git-main-jin-jin2.vercel.app",
    "navi-presenter-git-feature-stage-1-ux-jin-jin2.vercel.app", "navi-presenter-git-feature-stage-1-realtime-jin-jin2.vercel.app",
    "navi-presenter-git-test-live-firebase-jin-jin2.vercel.app", "navi-presenter-abc123-jin-jin2.vercel.app", "evil.example.com", "constructor", "__proto__"]) expect(run(h), h).toBeNull();
  // 시험이 먼저 넣은 설정(에뮬레이터)은 그대로 둬요
  expect(run("navi-presenter.vercel.app", { emulator: 1 })).toEqual({ emulator: 1 });
  // 비밀 값(서비스 계정 키 · OAuth 비밀값)은 없어요
  expect(SRC).not.toMatch(/private_key|client_secret|BEGIN [A-Z ]*PRIVATE KEY/);
});
