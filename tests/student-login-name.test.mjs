import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStudentLoginName } from "../functions/api/eco/[[path]].js";

test("a roster name ending in 공동 can be entered without the suffix", () => {
  assert.equal(normalizeStudentLoginName("홍길동(공동)"), normalizeStudentLoginName("홍길동"));
  assert.equal(normalizeStudentLoginName("홍길동 (공동)"), normalizeStudentLoginName(" 홍 길 동 "));
  assert.equal(normalizeStudentLoginName("홍길동（공동）"), normalizeStudentLoginName("홍길동"));
});

test("only the exact 공동 suffix is ignored", () => {
  assert.notEqual(normalizeStudentLoginName("홍길동(공동학생)"), normalizeStudentLoginName("홍길동"));
  assert.notEqual(normalizeStudentLoginName("홍길동(전학)"), normalizeStudentLoginName("홍길동"));
});
