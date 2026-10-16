import { Request, Response } from "express";
import * as Boom from "@hapi/boom";
import { createReadStream } from "fs";
import { mkdtemp, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { pipeline } from "stream/promises";
import multer from "multer";
import { Config } from "../config/config";
import { normalizeAudioUpload } from "../services/audioService";

function downloadFilename(originalname: string): string {
  const basename = path.posix.basename(originalname.replaceAll("\\", "/"));
  const stem = path
    .parse(basename)
    .name.replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);
  return `${stem || "audio"}-normalized.mp3`;
}

export function audioControllerFactory(config: Config) {
  // No partial files on disk while multipart data is still arriving. Memory is bounded
  // by the shared byte limit; library metadata is neither needed nor accepted here.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileSizeInBytes, files: 1, fields: 0 },
  }).single("file");

  return async (req: Request, res: Response) => {
    const controller = new AbortController();
    const { signal } = controller;
    const abort = () => controller.abort();
    const onClose = () => {
      if (!res.writableFinished) abort();
    };
    req.once("aborted", abort);
    res.once("close", onClose);
    let directory: string | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        upload(req, res, (error) => {
          signal.removeEventListener("abort", onAbort);
          if (error) {
            reject(
              error instanceof multer.MulterError
                ? error
                : Boom.badRequest("Malformed multipart upload", { cause: error }),
            );
          } else resolve();
        });
        if (req.aborted || res.destroyed) abort();
      });
      signal.throwIfAborted();
      const file = req.file;
      if (!file) throw Boom.badRequest("File is required");
      directory = await mkdtemp(path.join(tmpdir(), "kevbot-normalize-"));
      signal.throwIfAborted();
      const inputPath = path.join(directory, "input");
      const outputPath = path.join(directory, "normalized.mp3");
      await writeFile(inputPath, file.buffer, { signal });
      await normalizeAudioUpload(config, { path: inputPath, originalname: file.originalname }, outputPath, signal);
      signal.throwIfAborted();
      const output = await stat(outputPath);
      res.attachment(downloadFilename(file.originalname));
      res.type("audio/mpeg");
      res.setHeader("Content-Length", output.size);
      res.setHeader("Cache-Control", "no-store");
      // pipeline resolves only after streaming finishes, or after all streams close
      // on failure/disconnect. The directory must remain until then.
      await pipeline(createReadStream(outputPath), res, { signal });
    } catch (error) {
      if (!signal.aborted && !res.destroyed) throw error;
    } finally {
      req.removeListener("aborted", abort);
      res.removeListener("close", onClose);
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch((error) => {
          console.error("Failed to delete normalization temporary directory", error);
        });
      }
    }
  };
}
