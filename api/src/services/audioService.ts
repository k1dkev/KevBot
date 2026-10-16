import * as Boom from "@hapi/boom";
import path from "path";
import { Config } from "../config/config";
import { getTrackMetaData, loudnessNormalize, verifyLoudnessNormalization } from "../utils/audioUtils";

/** The same validation and two-pass normalization for library and standalone uploads. */
export async function normalizeAudioUpload(
  config: Pick<
    Config,
    | "supportedTrackExtensions"
    | "maxTrackDurationInSeconds"
    | "acceptableDurationChangeInSeconds"
    | "acceptableIntegratedLoudnessBand"
  >,
  file: Pick<Express.Multer.File, "path" | "originalname">,
  normalizedPath: string,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  const extension = path.extname(file.originalname);
  if (!config.supportedTrackExtensions.includes(extension)) {
    throw Boom.badRequest(
      `Invalid file extension '${extension}'. Supported extensions: ${config.supportedTrackExtensions}`,
    );
  }
  const metadata = await getTrackMetaData(file.path).catch((cause) => {
    throw Boom.badRequest("Unsupported or corrupt file was received. Failed to parse track metadata from file.", {
      cause,
    });
  });
  signal?.throwIfAborted();
  if (metadata.format.format_name !== "mp3" || !metadata.streams.some((stream) => stream.codec_name === "mp3")) {
    throw Boom.badRequest("Invalid file format, must be mp3");
  }
  const duration = metadata.format.duration;
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    throw Boom.badRequest("Track duration failed to be determined, file is likely corrupt.");
  }
  // Accepted bot parity decision D3: the upper bound is exclusive for both clients.
  if (duration >= config.maxTrackDurationInSeconds) {
    throw Boom.badRequest(`Track duration must be less than ${config.maxTrackDurationInSeconds} seconds`);
  }

  await loudnessNormalize(file.path, normalizedPath, signal).catch((cause) => {
    throw Boom.internal("Failed to normalize track", { cause });
  });
  signal?.throwIfAborted();
  const normalizedMetadata = await getTrackMetaData(normalizedPath).catch((cause) => {
    throw Boom.internal("Failed to parse normalized audio meta data", { cause });
  });
  signal?.throwIfAborted();
  const normalizedDuration = normalizedMetadata.format.duration;
  if (!normalizedDuration || !Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
    throw Boom.internal("Normalized track duration failed to be determined.");
  }
  if (Math.abs(duration - normalizedDuration) > config.acceptableDurationChangeInSeconds) {
    throw Boom.internal(
      `Normalized duration does not match original. Original: ${duration}, Normalized: ${normalizedDuration}`,
    );
  }
  await verifyLoudnessNormalization(normalizedPath, config.acceptableIntegratedLoudnessBand, signal).catch((cause) => {
    throw Boom.internal("Failed to verify normalized audio", { cause });
  });
  return normalizedDuration;
}
