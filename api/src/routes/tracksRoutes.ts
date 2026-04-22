import express from "express";
import { Config } from "../config/config";
import { TracksService } from "../services/tracksService";
import { AuthMiddleware } from "../middlewares/auth";
import { tracksControllerFactory } from "../controllers/tracksController";
import multer from "multer";
import path from "path";
import fs from "fs";

function uploadFactory(maxFileSizeInBytes: number) {
  const uploadDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });
  const upload = multer({
    storage: storage,
    limits: { fileSize: maxFileSizeInBytes },
  });
  return upload;
}

export function tracksRoutesFactory(config: Config, auth: AuthMiddleware, tracksService: TracksService) {
  const router = express.Router();
  const tracksController = tracksControllerFactory(config, tracksService);
  const upload = uploadFactory(config.maxFileSizeInBytes);
  router.get("/", tracksController.getTracks);
  router.get("/:id", tracksController.getTrackById);
  router.get("/:id/download", tracksController.getTrackDownloadById);
  router.get("/:id/stream", tracksController.getTrackStreamById);
  router.patch("/:id", auth.requireAuth, tracksController.patchTrack);
  router.post("/", auth.requireAuth, upload.single("file"), tracksController.postTrack);
  router.delete("/:id", auth.requireAuth, tracksController.deleteTrack);
  router.patch("/:id/restore", auth.requireAuth, tracksController.restoreTrack);
  return router;
}
