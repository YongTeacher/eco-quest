import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

test("student photos are analyzed by Workers AI and taxonomy candidates are validated", async () => {
  const calls = [];
  const env = {
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) {
              return {
                role: "student", student_id: "student-1", class_number: 9, student_number: 99,
                student_name: "테스트학생", group_number: 1, guide_limit: 3, status: "active",
                expires_at: "9999-12-31T00:00:00.000Z"
              };
            }
            if (sql.includes("SELECT result_json")) return null;
            if (sql.includes("COUNT(*)")) return { count: 1 };
            throw new Error("Unexpected first query: " + sql);
          },
          async run() {
            calls.push({ sql, values: this.values || statement.values });
            return { meta: { changes: 1 } };
          }
        };
        return statement;
      },
      async batch(statements) {
        calls.push(...statements.map(function (statement) { return { sql: statement.sql, values: statement.values || [] }; }));
        return [];
      }
    },
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return {
          choices: [{ message: { content: JSON.stringify({
            candidates: [{ name: "왕사마귀", scientific: "Tenodera sinensis", clue: "낫 모양 앞다리와 긴 앞가슴", confidence: "높음" }],
            uncertain: false,
            note: "사마귀류의 형태가 뚜렷합니다."
          }) } }]
        };
      }
    }
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url) {
    assert.match(String(url), /api\.inaturalist\.org\/v1\/taxa/);
    return Response.json({ results: [{ name: "Tenodera sinensis", preferred_common_name: "왕사마귀" }] });
  };
  try {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3])], "mantis.jpg", { type: "image/jpeg" }));
    form.append("category", "insect");
    form.append("features", "낫 모양의 앞다리와 긴 몸");
    const response = await onRequest({
      request: new Request("https://example.test/api/eco/identify", {
        method: "POST", headers: { Cookie: "eco_session=test-token" }, body: form
      }),
      env,
      waitUntil() {}
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.candidates[0].name, "왕사마귀");
    assert.equal(body.candidates[0].scientific, "Tenodera sinensis");
    assert.equal(body.limits.student_limit, 3);
    assert.equal(body.limits.daily_limit, 100);
    const aiCall = calls.find(function (call) { return call.model; });
    assert.equal(aiCall.model, "@cf/google/gemma-4-26b-a4b-it");
    assert.match(aiCall.input.messages[1].content[0].text, /낫 모양의 앞다리/);
    assert.match(aiCall.input.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
