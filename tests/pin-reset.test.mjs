import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

const rosterId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function setup({ role = "teacher", registered = true } = {}) {
  const batches = [];
  const env = {
    ECO_AUTH_PEPPER: "test-pepper",
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) { return { ...statement, values }; },
          async run() {
            if (sql.startsWith("CREATE TABLE")) return { success: true };
            throw new Error("Unexpected run query: " + sql);
          },
          async first() {
            if (sql.includes("FROM sessions")) return { role, expires_at: "9999-12-31T00:00:00.000Z", status: "active" };
            if (sql.includes("FROM student_roster WHERE id")) return { id: rosterId, class_number: 3, student_number: 7, student_name: "홍길동" };
            if (sql.includes("SELECT id FROM students")) return registered ? { id: "student-3-7" } : null;
            throw new Error("Unexpected first query: " + sql);
          },
          async all() {
            if (sql.startsWith("PRAGMA table_info")) return { results: [{ name: "group_number", notnull: 0 }] };
            throw new Error("Unexpected all query: " + sql);
          }
        };
        return statement;
      },
      async batch(statements) {
        batches.push(statements);
        return [];
      }
    }
  };
  return {
    batches,
    context(pin = "2580") {
      return {
        request: new Request("https://example.test/api/eco/admin/roster/" + rosterId + "/pin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: "eco_session=teacher-token" },
          body: JSON.stringify({ pin })
        }),
        env,
        waitUntil() {}
      };
    }
  };
}

test("teacher resets only the selected student's PIN and sessions", async () => {
  const app = setup();
  const response = await onRequest(app.context());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.student.student_name, "홍길동");

  const statements = app.batches.flat();
  const update = statements.find((statement) => statement.sql.startsWith("UPDATE students SET pin_salt"));
  const logout = statements.find((statement) => statement.sql.startsWith("DELETE FROM sessions WHERE role = 'student'"));
  assert.ok(update);
  assert.ok(logout);
  assert.equal(update.values.at(-1), "student-3-7");
  assert.equal(logout.values[0], "student-3-7");
  assert.ok(!update.values.includes("2580"), "the raw PIN must never be stored");
});

test("PIN reset rejects values other than four digits", async () => {
  const app = setup();
  const response = await onRequest(app.context("12ab"));
  assert.equal(response.status, 400);
  assert.ok(app.batches.flat().every((statement) => !statement.sql.startsWith("UPDATE students SET pin_salt")));
});

test("students who have not joined yet do not need a PIN reset", async () => {
  const app = setup({ registered: false });
  const response = await onRequest(app.context());
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /처음 로그인하지 않은/);
});
