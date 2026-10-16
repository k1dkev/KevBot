import express from "express";
import request from "supertest";
import * as Boom from "@hapi/boom";
import { z } from "zod";
import { requestLoggingFactory } from "../../src/middlewares/requestLogging";
import { errorHandlerFactory } from "../../src/middlewares/errorHandler";
import { getLogger } from "../../src/logging/context";
import { capture } from "./capture";

test("request IDs follow async work, isolate requests, and omit untrusted request data", async () => {
  const { log, records } = capture("debug");
  const app = express();
  app.use(requestLoggingFactory(log));
  const router = express.Router();
  router.get("/:id", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    getLogger().debug({}, "request.work");
    res.json({ ok: true });
  });
  app.use("/v1/tracks", router);
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .get("/v1/tracks/path-canary?code=oauth-canary")
        .set("Authorization", "Bearer auth-canary")
        .set("Cookie", "session=cookie-canary")
        .set("X-Request-ID", "client-canary"),
    ),
  );
  expect(new Set(responses.map((res) => res.headers["x-request-id"])).size).toBe(2);
  expect(records).toHaveLength(4);
  for (const response of responses) {
    const correlated = records.filter((record) => record.requestId === response.headers["x-request-id"]);
    expect(correlated).toHaveLength(2);
    expect(correlated[0].msg).toBe("request.work");
    expect(correlated[1]).toMatchObject({ route: "/v1/tracks/:id", status: 200, method: "GET", level: 30 });
  }
  expect(JSON.stringify(records)).not.toContain("canary");
});

test("expected responses log warnings once; unexpected errors log one sanitized diagnostic", async () => {
  const { log, records } = capture();
  const app = express();
  app.use(requestLoggingFactory(log));
  app.get("/auth", () => {
    throw Boom.unauthorized("expected-auth-canary");
  });
  app.get("/validation", () => {
    z.enum(["allowed"]).parse("validation-canary");
  });
  app.get("/unexpected", () => {
    throw new Error("password=unexpected-canary");
  });
  app.use(errorHandlerFactory(3000000));
  await request(app).get("/auth").expect(401);
  await request(app).get("/validation").expect(400);
  const response = await request(app).get("/unexpected").expect(500);
  expect(response.body.message).toBe("An internal server error occurred");
  expect(records.map(({ level }) => level)).toEqual([40, 40, 50]);
  expect(records[0]).not.toHaveProperty("err");
  expect(records[1]).not.toHaveProperty("err");
  expect(records[2].err.type).toBe("Error");
  expect(JSON.stringify(records)).not.toContain("canary");
});

test("unmatched requests omit raw paths; finished and closed emit only one event", async () => {
  const { log, records } = capture();
  const app = express();
  app.use(requestLoggingFactory(log));
  await request(app).get("/unknown/path-canary?token=query-canary").expect(404);
  await new Promise((resolve) => setImmediate(resolve));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ route: "unmatched", status: 404, level: 40 });
  expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(records)).not.toContain("canary");
});
