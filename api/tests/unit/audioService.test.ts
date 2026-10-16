import { FfprobeData } from "fluent-ffmpeg";
import { normalizeAudioUpload } from "../../src/services/audioService";
import * as audioUtils from "../../src/utils/audioUtils";

const config: Parameters<typeof normalizeAudioUpload>[0] = {
  supportedTrackExtensions: [".mp3"],
  maxTrackDurationInSeconds: 15,
  acceptableDurationChangeInSeconds: 0.01,
  acceptableIntegratedLoudnessBand: 2.5,
};
const upload = { path: "/test/input", originalname: "clip.mp3" };

function metadata(duration: number): FfprobeData {
  return { streams: [{ index: 0, codec_name: "mp3" }], format: { format_name: "mp3", duration }, chapters: [] };
}

beforeEach(() => {
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValue(metadata(4));
  jest.spyOn(audioUtils, "loudnessNormalize").mockResolvedValue();
  jest.spyOn(audioUtils, "verifyLoudnessNormalization").mockResolvedValue();
});

afterEach(() => jest.restoreAllMocks());

it("accepts the exact 14.999-second decision D3 case and uses the shared verification tolerance", async () => {
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValue(metadata(14.999));
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).resolves.toBe(14.999);
  expect(audioUtils.verifyLoudnessNormalization).toHaveBeenCalledWith("/test/output.mp3", 2.5, undefined);
});

it.each([15, 15.001, 16])("rejects %s seconds before starting normalization", async (duration) => {
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValue(metadata(duration));
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).rejects.toMatchObject({
    output: { statusCode: 400, payload: { message: "Track duration must be less than 15 seconds" } },
  });
  expect(audioUtils.loudnessNormalize).not.toHaveBeenCalled();
});

it.each([undefined, 0, -1, NaN, Infinity])("rejects an invalid input duration (%s)", async (duration) => {
  const invalid = metadata(4);
  invalid.format.duration = duration;
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValueOnce(invalid);
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).rejects.toMatchObject({
    output: { statusCode: 400 },
  });
  expect(audioUtils.loudnessNormalize).not.toHaveBeenCalled();
});

it("rejects a container with no MP3 audio stream", async () => {
  const invalid = metadata(4);
  invalid.streams = [];
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValueOnce(invalid);
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).rejects.toMatchObject({
    output: { statusCode: 400 },
  });
});

it.each([undefined, 0, NaN, Infinity])("rejects an invalid normalized duration (%s)", async (duration) => {
  const invalid = metadata(4);
  invalid.format.duration = duration;
  jest.spyOn(audioUtils, "getTrackMetaData").mockResolvedValueOnce(metadata(4)).mockResolvedValueOnce(invalid);
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).rejects.toMatchObject({
    output: { statusCode: 500 },
  });
  expect(audioUtils.verifyLoudnessNormalization).not.toHaveBeenCalled();
});

it("reports unreadable normalized output as a processing error", async () => {
  jest
    .spyOn(audioUtils, "getTrackMetaData")
    .mockResolvedValueOnce(metadata(4))
    .mockRejectedValueOnce(new Error("read failed"));
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3")).rejects.toMatchObject({
    output: { statusCode: 500 },
  });
});

it("does not start processing after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(normalizeAudioUpload(config, upload, "/test/output.mp3", controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(audioUtils.getTrackMetaData).not.toHaveBeenCalled();
});
