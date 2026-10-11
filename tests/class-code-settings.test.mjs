import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

function fixture() {
  let savedCode = null;
  const env = {
    ECO_CLASS_CODE: "SAMGYE-ECO-2026",
    ECO_DB: {
      async batch() { return []; },
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) return { role: "teacher", expires_at: "9999-12-31T00:00:00.000Z" };
            if (sql.includes("FROM eco_settings")) return savedCode ? { setting_value: savedCode } : null;
            throw new Error("Unexpected first query: " + sql);
          },
          async run() {
            if (sql.startsWith("CREATE TABLE")) return { success: true };
            if (sql.includes("INSERT INTO eco_settings")) {
              savedCode = this.values[0];
              return { success: true };
            }
            throw new Error("Unexpected run query: " + sql);
          }
        };
        return statement;
      }
    }
  };
  return {
    env,
    get savedCode() { return savedCode; },
    context(path, init = {}) {
      return {
        request: new Request("https://example.test/api/eco/" + path, {
          ...init,
          headers: { Cookie: "eco_session=teacher-token", ...(init.headers || {}) }
        }),
        env,
        waitUntil() {}
      };
    }
  };
}

test("teacher reads the Cloudflare class code until an override is saved", async () => {
  const app = fixture();
  const response = await onRequest(app.context("admin/class-code"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).class_code, "SAMGYE-ECO-2026");
});

test("teacher can save and read a simpler class code", async () => {
  const app = fixture();
  const update = await onRequest(app.context("admin/class-code", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_code: "SG2026" })
  }));
  assert.equal(update.status, 200);
  assert.equal((await update.json()).class_code, "SG2026");
  assert.equal(app.savedCode, "SG2026");

  const read = await onRequest(app.context("admin/class-code"));
  assert.equal((await read.json()).class_code, "SG2026");
});

test("invalid class codes are rejected without changing the saved code", async () => {
  const app = fixture();
  const response = await onRequest(app.context("admin/class-code", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_code: "코드 2026!" })
  }));
  assert.equal(response.status, 400);
  assert.equal(app.savedCode, null);
});
