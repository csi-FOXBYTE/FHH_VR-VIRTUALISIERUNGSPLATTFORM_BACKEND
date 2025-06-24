import {
  Body,
  Controller,
  Parameter,
  Post,
  Rep,
  Req,
  Schema,
  Sse,
} from "@tganzhorn/fastify-modular";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  EventsCreateRequestDTO,
  eventsCreateRequestDTO,
  EventsHostRequestDTO,
  eventsHostRequestDTO,
  eventsResponseDTO,
  eventsStatusResponseDTO,
  EventsUpdateRequestDTO,
  eventsUpdateRequestDTO,
} from "./events.dto.js";
import { EventsService } from "./events.service.js";

@Controller("/events", [EventsService])
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Sse("/")
  @Schema({
    response: {
      200: {
        description: "SSE stream",
        content: {
          "text/event-stream": {
            schema: eventsResponseDTO,
          },
        },
      },
    },
  })
  async list(@Rep() reply: FastifyReply, @Req() request: FastifyRequest) {
    const events = this.eventsService.list().subscribe({
      next(sseChunk) {
        reply.raw.write(sseChunk);
      },
      error(err) {
        reply.raw.write(`error: ${JSON.stringify(err)}`);
        reply.raw.end();
      },
      complete() {
        reply.raw.end();
      },
    });

    request.raw.once("close", () => {
      events.unsubscribe();
      reply.raw.end();
    });
  }

  @Post("/create")
  @Schema({
    body: eventsCreateRequestDTO,
    response: {
      204: {
        description: "Created event.",
      },
    },
  })
  async create(@Body() body: EventsCreateRequestDTO) {
    await this.eventsService.createEvent(body);
  }

  @Post("/update")
  @Schema({
    body: eventsUpdateRequestDTO,
    response: {
      204: {
        description: "Updated event.",
      },
    },
  })
  async update(@Body() body: EventsUpdateRequestDTO) {
    await this.eventsService.updateEvent(body);
  }

  @Sse("/:id/status")
  @Schema({
    response: {
      200: eventsStatusResponseDTO,
    },
  })
  async status(
    @Rep() reply: FastifyReply,
    @Req() request: FastifyRequest,
    @Parameter("id") id: string
  ) {
    const events = this.eventsService.status(id).subscribe({
      next(sseChunk) {
        reply.raw.write(sseChunk);
      },
      error(err) {
        reply.raw.write(`error: ${JSON.stringify(err)}`);
        reply.raw.end();
      },
      complete() {
        reply.raw.end();
      },
    });

    request.raw.once("close", () => {
      events.unsubscribe();
      reply.raw.end();
    });
  }

  @Post("/:id/heartbeat")
  @Schema({
    response: {
      204: {
        description: "Received heartbeat for event.",
      },
    },
  })
  async heartbeat(@Parameter("id") id: string) {
    await this.eventsService.setHeartbeat(id);

    return "";
  }

  @Post("/:id/host")
  @Schema({
    body: eventsHostRequestDTO,
    response: {
      204: {
        description: "Event sucessfully hosted",
      },
      400: {
        description: "Something went wrong.",
      },
    },
  })
  async host(@Body() body: EventsHostRequestDTO, @Parameter("id") id: string) {
    await this.eventsService.hostSession(id, body.joinCode);
  }

  @Post("/:id/end")
  @Schema({
    response: {
      204: {
        description: "Event successfully ended.",
      },
    },
  })
  async end(@Parameter("id") id: string) {
    await this.eventsService.endSession(id);
  }

  @Post("/:id/rehost")
  @Schema({
    body: eventsHostRequestDTO,
    response: {
      204: {
        description: "Event successfully rehosted.",
      },
    },
  })
  async rehost(
    @Body() body: EventsHostRequestDTO,
    @Parameter("id") id: string
  ) {
    await this.eventsService.rehostSession(id, body.joinCode);
  }
}
