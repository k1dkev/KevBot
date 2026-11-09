import { aggregatePlayCounts } from "../../src/tasks/aggregatePlayCounts";
import { logContext } from "../../src/logging/context";
import { KevbotDb } from "../../src/db/connection";
import { capture } from "./capture";

test("aggregation keeps failure behavior and emits one correlated sanitized failure", async () => {
  const { log, records } = capture();
  const db = {
    transaction: () => ({
      execute: async () => {
        throw new Error("mysql://user:job-canary@db/kevbot");
      },
    }),
  } as unknown as KevbotDb;
  await expect(logContext.run(log, () => aggregatePlayCounts(db))).resolves.toBeUndefined();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    level: 50,
    job: "aggregatePlayCounts",
    component: "jobs",
    msg: "aggregation.failed",
  });
  expect(records[0].jobId).toBeTruthy();
  expect(JSON.stringify(records)).not.toContain("job-canary");
});

test("aggregation reports committed summary at info and per-item updates only at debug", async () => {
  for (const level of ["info", "debug"] as const) {
    const { log, records } = capture(level);
    const execute = jest
      .fn()
      .mockResolvedValueOnce([{ track_id: 1, play_type: 1, count: 4 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);
    const query: Record<string, any> = { execute };
    for (const method of ["selectFrom", "select", "where", "groupBy", "insertInto", "values", "onDuplicateKeyUpdate"])
      query[method] = () => query;
    let committed = false;
    const db = {
      transaction: () => ({
        execute: async (run: (trx: unknown) => Promise<void>) => {
          await run(query);
          committed = true;
        },
      }),
    } as unknown as KevbotDb;
    await logContext.run(log, () => aggregatePlayCounts(db));
    expect(committed).toBe(true);
    expect(records.filter(({ level }) => level === 30)).toHaveLength(1);
    expect(records.at(-1)).toMatchObject({ msg: "aggregation.completed", typeUpdates: 1, trackUpdates: 1 });
    expect(records.filter(({ level }) => level === 20)).toHaveLength(level === "debug" ? 3 : 0);
    expect(new Set(records.map(({ jobId }) => jobId)).size).toBe(1);
  }
});
