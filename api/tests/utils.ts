import { Express } from "express";
import request from "supertest";
import path from "path";

export async function i32IdCheck(requestBuilder: any) {
  let res = await requestBuilder("hello");
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
  expect(res.body?.message).toMatch(/validation error.*nan/i);

  res = await requestBuilder(5.4);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
  expect(res.body?.message).toMatch(/validation error.*float/i);

  res = await requestBuilder(-5);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
  expect(res.body?.message).toMatch(/validation error.*greater.*0/i);

  res = await requestBuilder(3147483647);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
  expect(res.body?.message).toMatch(/validation error.*less.*2147483647/i);
}

export async function getLoginTokenAndTestResult(
  user: { user_id?: number; discord_id?: string } | undefined,
  app: Express,
) {
  const devAuthSecret = process.env.DEV_AUTH_SECRET ?? "TEST_DEV_AUTH_SECRET";
  const requestBody = user?.discord_id ? { discord_id: user.discord_id } : { user_id: user?.user_id ?? 1 };
  const res = await request(app).post("/v1/dev/sessions").set("x-dev-auth-secret", devAuthSecret).send(requestBody);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    access_token: expect.any(String),
    token_type: "Bearer",
    expires_in: expect.any(Number),
    user: { id: expect.any(Number) },
  });
  return res.body?.access_token;
}

export const fixturePath = (fileName: string) => path.join(__dirname, "fixtures", fileName);
