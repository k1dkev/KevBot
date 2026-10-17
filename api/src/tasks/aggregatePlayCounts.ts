import { KevbotDb } from "../db/connection";
import { PlayType, PLAY_TYPES_OF_TOTAL_PLAY_COUNT } from "../services/playsService";
import { withJobLogger } from "../logging/context";

interface AggregatedCounts {
  raw_total_play_count: number;
  total_play_count: number;
}

export const aggregatePlayCounts = async (db: KevbotDb) =>
  withJobLogger("aggregatePlayCounts", async (log) => {
    const started = performance.now();
    let typeUpdates = 0;
    let trackUpdates = 0;
    log.debug({}, "aggregation.started");
    try {
      const result = await db.transaction().execute(async (trx) => {
        // Aggregate play counts from track_plays
        const aggregatedPlayCountsByType = await trx
          .selectFrom("track_plays")
          .select(["track_id", "play_type"])
          .select((eb) => eb.fn.count("id").as("count"))
          .where("user_id", "is not", null)
          .groupBy(["track_id", "play_type"])
          .execute();

        // Fetch current play_type counts from track_play_type_counts
        const currentPlayCountsByType = await trx
          .selectFrom("track_play_type_counts")
          .select(["track_id", "play_type", "play_count"])
          .execute();

        const currentPlayCountsByTypeMap = new Map<string, number>();
        currentPlayCountsByType.forEach((row) => {
          const key = `${row.track_id}:${row.play_type}`;
          currentPlayCountsByTypeMap.set(key, row.play_count);
        });

        const aggregatedPlayCountsByTypeMap = new Map<string, number>();
        aggregatedPlayCountsByType.forEach((row) => {
          aggregatedPlayCountsByTypeMap.set(`${row.track_id}:${row.play_type}`, Number(row.count));
        });

        // Reconcile both directions so counts left by anonymous legacy rows are removed.
        const playTypeKeys = new Set([...currentPlayCountsByTypeMap.keys(), ...aggregatedPlayCountsByTypeMap.keys()]);
        for (const key of playTypeKeys) {
          const [track_id, play_type] = key.split(":").map(Number);
          const existingTypeCount = currentPlayCountsByTypeMap.get(key);
          const aggregatedCount = aggregatedPlayCountsByTypeMap.get(key) ?? 0;
          if (existingTypeCount !== aggregatedCount) {
            if (aggregatedCount === 0) {
              await trx
                .deleteFrom("track_play_type_counts")
                .where("track_id", "=", track_id)
                .where("play_type", "=", play_type)
                .execute();
            } else {
              await trx
                .insertInto("track_play_type_counts")
                .values({
                  track_id,
                  play_type,
                  play_count: aggregatedCount,
                })
                .onDuplicateKeyUpdate({
                  play_count: aggregatedCount,
                })
                .execute();
            }
            typeUpdates++;
            log.debug({ trackId: track_id, playType: play_type, count: aggregatedCount }, "aggregation.type.updated");
          }
        }

        // Loop over play counts by type and aggregate to total play counts
        const aggregatedTotalPlayCountsMap = new Map<number, AggregatedCounts>();
        aggregatedPlayCountsByType.forEach((row) => {
          if (aggregatedTotalPlayCountsMap.has(row.track_id)) {
            const item = aggregatedTotalPlayCountsMap.get(row.track_id)!;
            item.raw_total_play_count += Number(row.count);
            item.total_play_count += PLAY_TYPES_OF_TOTAL_PLAY_COUNT.includes(Number(row.play_type) as PlayType)
              ? Number(row.count)
              : 0;
            aggregatedTotalPlayCountsMap.set(row.track_id, item);
          } else {
            aggregatedTotalPlayCountsMap.set(row.track_id, {
              raw_total_play_count: Number(row.count),
              total_play_count: PLAY_TYPES_OF_TOTAL_PLAY_COUNT.includes(Number(row.play_type) as PlayType)
                ? Number(row.count)
                : 0,
            });
          }
        });

        // Fetch current total_play_count from track_play_counts
        const currentTotalPlayCounts = await trx
          .selectFrom("track_play_counts")
          .select(["track_id", "total_play_count", "raw_total_play_count"])
          .execute();

        const currentTotalPlayCountsMap = new Map<number, AggregatedCounts>();
        currentTotalPlayCounts.forEach((row) => {
          currentTotalPlayCountsMap.set(row.track_id, {
            total_play_count: row.total_play_count,
            raw_total_play_count: row.raw_total_play_count,
          });
        });

        // Check and update totals, clearing previously counted anonymous events.
        const trackIds = new Set([...currentTotalPlayCountsMap.keys(), ...aggregatedTotalPlayCountsMap.keys()]);
        for (const track_id of trackIds) {
          const aggregatedCounts = aggregatedTotalPlayCountsMap.get(track_id) || {
            total_play_count: 0,
            raw_total_play_count: 0,
          };
          const currentCounts = currentTotalPlayCountsMap.get(track_id) || {
            total_play_count: 0,
            raw_total_play_count: 0,
          };
          if (
            currentCounts.total_play_count !== aggregatedCounts.total_play_count ||
            currentCounts.raw_total_play_count !== aggregatedCounts.raw_total_play_count
          ) {
            await trx
              .insertInto("track_play_counts")
              .values({
                track_id,
                total_play_count: aggregatedCounts.total_play_count,
                raw_total_play_count: aggregatedCounts.raw_total_play_count,
              })
              .onDuplicateKeyUpdate({
                total_play_count: aggregatedCounts.total_play_count,
                raw_total_play_count: aggregatedCounts.raw_total_play_count,
              })
              .execute();
            trackUpdates++;
            log.debug({ trackId: track_id, ...aggregatedCounts }, "aggregation.track.updated");
          }
        }
      });
      log.info(
        { typeUpdates, trackUpdates, durationMs: Math.round(performance.now() - started) },
        "aggregation.completed",
      );
      return result;
    } catch (error) {
      log.error({ err: error, durationMs: Math.round(performance.now() - started) }, "aggregation.failed");
      return;
    }
  });
