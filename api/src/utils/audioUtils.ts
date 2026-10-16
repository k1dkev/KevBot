import ffmpeg from "fluent-ffmpeg";

export const INTEGRATED_LOUDNESS_TARGET = -16;
export const MAX_TRUE_PEAK = -1.5;
const LOUDNRESS_RANGE_TARGET = 11;
const LOUDNORM_FILTER_STRING = `loudnorm=I=${INTEGRATED_LOUDNESS_TARGET}:TP=${MAX_TRUE_PEAK}:LRA=${LOUDNRESS_RANGE_TARGET}`;

/** Wait for FFmpeg to exit before callers remove its input/output files. */
function saveAudio(command: ffmpeg.FfmpegCommand, outputFile: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => command.kill("SIGKILL");
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    command
      .on("start", () => {
        // Cancellation can arrive while fluent-ffmpeg is still preparing the process.
        if (signal?.aborted) abort();
      })
      .on("error", (error) => {
        cleanup();
        reject(error);
      })
      .on("end", () => {
        cleanup();
        resolve();
      })
      .save(outputFile);
  });
}

export const getTrackMetaData = (filePath: string): Promise<ffmpeg.FfprobeData> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
};

/**
 * Analyze the loudness of an audio file and return I, TP, and LRA measurements.
 * It uses the loudnorm filter with print_format=json to gather stats.
 *
 * @param inputFile - Path to the input audio file.
 * @returns An object containing { i, tp, lra } measurements.
 */
export async function analyzeLoudness(inputFile: string, signal?: AbortSignal) {
  const parsed = JSON.parse(await runFirstPass(inputFile, signal));
  return {
    i: parseFloat(parsed.input_i),
    tp: parseFloat(parsed.input_tp),
    lra: parseFloat(parsed.input_lra),
  };
}

/**
 * Normalize audio loudness in two passes using EBU R128 loudnorm filter.
 *
 * @param inputFile - Path to the input audio file
 * @param outputFile - Path to the normalized output audio file
 */
export async function loudnessNormalize(inputFile: string, outputFile: string, signal?: AbortSignal): Promise<void> {
  const loudnormData = await runFirstPass(inputFile, signal);
  const measuredValues = parseLoudnormData(loudnormData);
  await runSecondPass(inputFile, outputFile, measuredValues, signal);
}

/**
 * Runs the first pass to get measurement data from loudnorm filter.
 * The filter uses the parameters: I=-16, TP=-1.5, LRA=11, plus print_format=json
 */
async function runFirstPass(inputFile: string, signal?: AbortSignal): Promise<string> {
  let jsonData = "";
  let collectingJson = false;

  const command = ffmpeg(inputFile)
    .audioFilter(`${LOUDNORM_FILTER_STRING}:print_format=json`)
    .format("null")
    .on("stderr", (line: string) => {
      if (line.trim().startsWith("{")) {
        collectingJson = true;
      }
      if (collectingJson) {
        jsonData += line;
      }
    });
  await saveAudio(command, process.platform === "win32" ? "NUL" : "/dev/null", signal);
  return jsonData;
}

/**
 * Extract the needed loudness measurement values from the JSON output
 * of the first pass.
 */
function parseLoudnormData(loudnormData: string) {
  const parsed = JSON.parse(loudnormData);
  return {
    input_i: parsed.input_i,
    input_tp: parsed.input_tp,
    input_lra: parsed.input_lra,
    input_thresh: parsed.input_thresh,
    target_offset: parsed.target_offset,
  };
}

/**
 * Uses the measured loudness values from the first pass in a second pass
 * to actually normalize the audio.
 */
function runSecondPass(
  inputFile: string,
  outputFile: string,
  measured: {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    target_offset: string;
  },
  signal?: AbortSignal,
): Promise<void> {
  const loudnormFilter = [
    `${LOUDNORM_FILTER_STRING}`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true:print_format=summary",
  ].join(":");

  return saveAudio(ffmpeg(inputFile).audioFilter(loudnormFilter), outputFile, signal);
}

/**
 * Verifies the normalization actually worked.
 */
export async function verifyLoudnessNormalization(
  normalizedPath: string,
  acceptableIntegratedLoudnessBand: number,
  signal?: AbortSignal,
) {
  const loudnessData = await analyzeLoudness(normalizedPath, signal);
  if (!Number.isFinite(loudnessData.i) || !Number.isFinite(loudnessData.tp)) {
    throw new Error("Failed to normalize audio. Loudness measurements must be finite.");
  }
  const loudnessHighRange = INTEGRATED_LOUDNESS_TARGET + acceptableIntegratedLoudnessBand;
  const loudnessLowRange = INTEGRATED_LOUDNESS_TARGET - acceptableIntegratedLoudnessBand;
  if (loudnessData.i > loudnessHighRange || loudnessData.i < loudnessLowRange) {
    throw new Error(
      `Failed to normalize audio. Integrated loudness out of range. Actual: ${loudnessData.i}, Range: [${loudnessLowRange}, ${loudnessHighRange}]`,
    );
  }
  if (loudnessData.tp > MAX_TRUE_PEAK) {
    throw new Error(
      `Failed to normalize audio. True Peak exceeds max. Actual: ${loudnessData.tp}, Max: ${MAX_TRUE_PEAK}`,
    );
  }
}
