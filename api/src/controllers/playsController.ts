import { Request, Response } from "express";
import * as playsSchemas from "../schemas/playsSchemas";
import { StatusCodes } from "http-status-codes";
import { PlaysService } from "../services/playsService";
import * as Boom from "@hapi/boom";

export function playsControllerFactory(playsService: PlaysService) {
  const reportPlayback = async (req: Request, res: Response) => {
    if (req.auth && req.auth.userId === undefined) {
      throw Boom.forbidden("Playback reports require a browser user, delegated bot actor, or anonymous request");
    }
    const event = playsSchemas.playbackEventBodySchema.parse(req.body);
    const result = await playsService.reportPlayback(event, req.auth?.userId ?? null);
    res.status(result.duplicate ? StatusCodes.OK : StatusCodes.CREATED).json(result);
  };

  return {
    reportPlayback,
  };
}
