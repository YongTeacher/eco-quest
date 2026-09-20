import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

const observationId = "22222222-2222-4222-8222-222222222222";
const guideId = "33333333-3333-4333-8333-333333333333";
const photoKey = "observations/" + observationId + ".jpg";

function setup({ role = "teacher", observation = { id: observationId, photo_key: photoKey }, guides = [] } = {}) {
  const batches = [];
  const photoDeletes = [];
  const env = {
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) return { role, student_id: "student-1", status: "active", expires_at: "9999-12-31T00:00:00.000Z" };
            if (sql.includes("FROM observations WHERE id")) return observation;
            throw new Error("Unexpected first query: " + sql);
          },
          async all() {
            if (sql.includes("FROM field_guides WHERE observation_id =")) return { results: guides };
            if (sql.includes("FROM reflections f")) return { results: [] };
            if (sql.includes("SELECT student_id, COUNT(*)")) return { results: [] };
            throw new Error("Unexpected all query: " + sql);
          }
        };
        return statement;
      },
      async batch(statements) { batches.push(statements); return []; }
    },
    ECO_PHOTOS: {
      async delete(key) { photoDeletes.push(key); }
    }
  };
  return {
    batches,
    photoDeletes,
    context: {
      request: new Request("https://example.test/api/eco/admin/observations/" + observationId, {
        method: "DELETE", headers: { Cookie: "eco_session=test-token" }
      }),
      env,
      waitUntil(promise) { void promise; }
    }
  };
}

test("students cannot delete observations", async () => {
  const fixture = setup({ role: "student" });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 403);
  assert.equal(fixture.batches.length, 0);
  assert.deepEqual(fixture.photoDeletes, []);
});

test("a missing observation is not modified", async () => {
  const fixture = setup({ observation: null });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 404);
  assert.equal(fixture.batches.length, 0);
});

test("teacher deletion removes linked guides, photo objects and queues Sheets cleanup", async () => {
  const fixture = setup({ guides: [{ id: guideId, student_id: "student-1" }] });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).deleted, { observations: 1, guides: 1 });
  assert.deepEqual(fixture.photoDeletes, [photoKey, photoKey + ".thumb.webp"]);
  const statements = fixture.batches.flat();
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM field_guides WHERE observation_id")));
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM observations WHERE id")));
  const cleanup = statements.find((statement) => statement.sql.includes("INSERT INTO sheet_sync_queue") && statement.values?.[1] === "test.cleanup");
  assert.ok(cleanup);
  assert.deepEqual(JSON.parse(cleanup.values[3]).guide_ids, [guideId]);
});
