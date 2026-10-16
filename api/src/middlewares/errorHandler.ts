import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ZodError } from "zod";
import * as Boom from "@hapi/boom";
import { fromError } from "zod-validation-error";
import { getReasonPhrase, StatusCodes } from "http-status-codes";

export const errorHandlerFactory =
  (maxFileSizeInBytes: number) => (err: any, req: Request, res: Response, next: NextFunction) => {
    // TODO: improve this lazy and overly verbose error logging
    if (process.env.NODE_ENV !== "test") {
      console.error(err);
    }

    if (err instanceof multer.MulterError) {
      let message = "An error occurred during file upload.";
      let statusCode = StatusCodes.BAD_REQUEST;

      switch (err.code) {
        case "LIMIT_FILE_SIZE":
          message = `File size is too large. Maximum allowed size is ${(maxFileSizeInBytes / 1000000).toFixed(1)}MB.`;
          statusCode = StatusCodes.REQUEST_TOO_LONG;
          break;
        case "LIMIT_FILE_COUNT":
          message = "Too many files uploaded.";
          break;
        case "LIMIT_UNEXPECTED_FILE":
          message = "Unexpected field in form data.";
          break;
      }
      res.status(statusCode).json({
        statusCode: statusCode,
        error: getReasonPhrase(statusCode),
        message: message,
      });
      return;
    }

    if (err instanceof ZodError) {
      const validationError = fromError(err);
      res.status(StatusCodes.BAD_REQUEST).json({
        statusCode: StatusCodes.BAD_REQUEST,
        error: "Bad Request",
        message: validationError.toString().replaceAll(`"`, `'`),
      });
      return;
    }

    if (Boom.isBoom(err)) {
      res.status(err.output.statusCode).json(err.output.payload);
      return;
    }

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "An internal server error occurred",
    });
    return;
  };
