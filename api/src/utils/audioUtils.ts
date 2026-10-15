import ffmpeg from "fluent-ffmpeg";

export const INTEGRATED_LOUDNESS_TARGET = -16;
export const MAX_TRUE_PEAK = -1.5;
const LOUDNRESS_RANGE_TARGET = 11;
const LOUDNORM_FILTER_STRING = `loudnorm=I=${INTEGRATED_LOUDNESS_TARGET}:TP=${MAX_TRUE_PEAK}:LRA=${LOUDNRESS_RANGE_TARGET}`;

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
export async function analyzeLoudness(inputFile: string): Promise<{ i: number; tp: number; lra: number }> {
  return new Promise<{ i: number; tp: number; lra: number }>((resolve, reject) => {
    let jsonData = "";
    let collectingJson = false;

    ffmpeg(inputFile)
      .audioFilter(`${LOUDNORM_FILTER_STRING}:print_format=json`)
      .format("null")
      .on("stderr", (line) => {
        // The loudnorm filter prints JSON to stderr
        if (line.trim().startsWith("{")) {
          collectingJson = true;
        }
        if (collectingJson) {
          jsonData += line;
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .on("end", () => {
        try {
          const parsed = JSON.parse(jsonData);
          const result = {
            i: parseFloat(parsed.input_i),
            tp: parseFloat(parsed.input_tp),
            lra: parseFloat(parsed.input_lra),
          };
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse loudnorm JSON: ${err}`));
        }
      })
      .save(process.platform === "win32" ? "NUL" : "/dev/null");
  });
}

/**
 * Normalize audio loudness in two passes using EBU R128 loudnorm filter.
 *
 * @param inputFile - Path to the input audio file
 * @param outputFile - Path to the normalized output audio file
 */
export async function loudnessNormalize(inputFile: string, outputFile: string): Promise<void> {
  const loudnormData = await runFirstPass(inputFile);
  const measuredValues = parseLoudnormData(loudnormData);
  await runSecondPass(inputFile, outputFile, measuredValues);
}

/**
 * Runs the first pass to get measurement data from loudnorm filter.
 * The filter uses the parameters: I=-16, TP=-1.5, LRA=11, plus print_format=json
 */
function runFirstPass(inputFile: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let jsonData = "";
    let collectingJson = false;

    ffmpeg(inputFile)
      .audioFilter(`${LOUDNORM_FILTER_STRING}:print_format=json`)
      .format("null")
      .on("stderr", (line: string) => {
        if (line.trim().startsWith("{")) {
          collectingJson = true;
        }
        if (collectingJson) {
          jsonData += line;
        }
      })
      .on("error", (err: Error) => {
        reject(err);
      })
      .on("end", () => {
        resolve(jsonData);
      })
      .save(process.platform === "win32" ? "NUL" : "/dev/null");
  });
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
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const loudnormFilter = [
      `${LOUDNORM_FILTER_STRING}`,
      `measured_I=${measured.input_i}`,
      `measured_TP=${measured.input_tp}`,
      `measured_LRA=${measured.input_lra}`,
      `measured_thresh=${measured.input_thresh}`,
      `offset=${measured.target_offset}`,
      "linear=true:print_format=summary",
    ].join(":");

    ffmpeg(inputFile)
      .audioFilter(loudnormFilter)
      .on("error", (err: Error) => {
        reject(err);
      })
      .on("end", () => {
        resolve();
      })
      .save(outputFile);
  });
}

/**
 * Verifies the normalization actually worked.
 */
export async function verifyLoudnessNormalization(normalizedPath: string, acceptableIntegratedLoudnessBand: number) {
  const loudnessData = await analyzeLoudness(normalizedPath);
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
