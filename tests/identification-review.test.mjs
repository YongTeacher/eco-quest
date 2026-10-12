import assert from "node:assert/strict";
import test from "node:test";
import { sameIdentification } from "../functions/api/eco/[[path]].js";

test("the same identification ignores spacing and letter case", () => {
  assert.equal(sameIdentification("왕벚나무", "Prunus × yedoensis", " 왕벚나무 ", "prunus×YEDOENSIS"), true);
});

test("a corrected common name is treated as a different identification", () => {
  assert.equal(sameIdentification("왕벚나무", "", "미확인 식물", ""), false);
});

test("a corrected scientific name can be proposed even when the common name is unchanged", () => {
  assert.equal(sameIdentification("민들레", "Taraxacum officinale", "민들레", ""), false);
});
