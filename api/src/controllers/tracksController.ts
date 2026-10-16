import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { normalizeAudioUpload } from "../services/audioService";
import { i32IdSchema } from "../schemas/sharedSchemas";
import { StatusCodes } from "http-status-codes";
import * as Boom from "@hapi/boom";
import { getAuthenticatedUser } from "../utils/getAuthenticatedUser";
import { Config } from "../config/config";
import { TracksService } from "../services/tracksService";
import { tracksSchemasFactory } from "../schemas/tracksSchemas";

export function tracksControllerFactory(config: Config, tracksService: TracksService) {
  const tracksSchemas = tracksSchemasFactory(config);

  const getTracks = async (req: Request, res: Response) => {
    const query = tracksSchemas.getTracksQuerySchema.parse(req.query);
    const tracks = await tracksService.getTracks(query);
    res.status(StatusCodes.OK).json(tracks);
  };

  const getTrackById = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const track = await tracksService.getTrackById(id);
    res.status(StatusCodes.OK).json(track);
  };

  const getTrackDownloadById = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const track = await tracksService.getTrackById(id);
    const file = await tracksService.getTrackFile(track);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${track.name}.mp3"`);
    file
      .createReadStream()
      .on("error", () => {
        throw Boom.internal("Error downloading the file");
      })
      .pipe(res);
  };

  const getTrackStreamById = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const track = await tracksService.getTrackById(id);
    const file = await tracksService.getTrackFile(track);

    const [metadata] = await file.getMetadata();
    if (metadata.size === undefined) {
      throw Boom.internal("Track fileSize is undefined");
    }
    const fileSize = Number(metadata.size);

    const setCommonHeadersHelper = (res: Response) => {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `inline; filename="${track.name}.mp3"`);
      res.setHeader("Accept-Ranges", "bytes");
    };

    const range = req.headers.range;
    if (!range) {
      setCommonHeadersHelper(res);
      res.setHeader("Content-Length", fileSize);
      res.status(StatusCodes.OK);
      file.createReadStream().pipe(res);
      return;
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    if (start >= fileSize || end >= fileSize || start >= end || start < 0 || end <= 0) {
      throw Boom.rangeNotSatisfiable(`Requested range not satisfiable ${start}-${end}`);
    }

    setCommonHeadersHelper(res);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", chunkSize);
    res.status(StatusCodes.PARTIAL_CONTENT);
    file.createReadStream({ start, end }).pipe(res);
  };

  const patchTrack = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const { name } = tracksSchemas.patchTrackBodySchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const updatedTrack = await tracksService.patchTrack(id, name, user.id);
    res.status(StatusCodes.OK).json(updatedTrack);
  };

  const postTrack = async (req: Request, res: Response) => {
    const file = req.file;
    let normalizedPath: string | undefined;
    try {
      const user = getAuthenticatedUser(req);
      const { name } = tracksSchemas.postTrackBodySchema.parse(req.body);

      if (!file) {
        throw Boom.badRequest("File is required");
      }

      const parsedPath = path.parse(file.path);
      normalizedPath = `${parsedPath.dir}/${parsedPath.name}-normalized${parsedPath.ext}`;
      const duration = await normalizeAudioUpload(config, file, normalizedPath);
      const track = await tracksService.postTrack(file.path, normalizedPath, name, duration, user.id);
      res.status(StatusCodes.CREATED).json(track);
    } finally {
      await Promise.all(
        [file?.path, normalizedPath].map(async (filePath) => {
          if (filePath) {
            await fs.promises.rm(filePath, { force: true }).catch((error) => {
              console.error("Failed to delete file during track post clean up", error);
            });
          }
        }),
      );
    }
  };

  const deleteTrack = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    const updatedTrack = await tracksService.deleteTrack(id, user.id);
    res.status(StatusCodes.OK).json(updatedTrack);
  };

  const restoreTrack = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const { name } = tracksSchemas.restoreTrackBodySchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const updatedTrack = await tracksService.restoreTrack(id, user.id, name);
    res.status(StatusCodes.OK).json(updatedTrack);
  };

  return {
    getTracks,
    getTrackById,
    getTrackDownloadById,
    getTrackStreamById,
    patchTrack,
    postTrack,
    deleteTrack,
    restoreTrack,
  };
}
