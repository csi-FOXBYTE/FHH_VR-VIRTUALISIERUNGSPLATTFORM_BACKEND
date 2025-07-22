import fastifyToab from "@csi-foxbyte/fastify-toab";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyUnderPressure from "@fastify/under-pressure";
import "dotenv";
import Fastify from "fastify";
import json from "../package.json" with { type: "json" };
import { injectPinoLogger, loggerOptions } from "./lib/pino.js";
import { getRegistries } from "./registries.js";
import { createBullBoard } from '@bull-board/api';
import {BullMQAdapter} from "@bull-board/api/bullMQAdapter.js";
import { FastifyAdapter } from '@bull-board/fastify';

injectPinoLogger();

const fastify = Fastify({
  logger: loggerOptions,
});

process.on("unhandledRejection", (reason) => {
  fastify.log.error({ err: reason, type: "UNHANDLED_REJECTION" });
});

fastify.register(fastifyHelmet, {});
// fastify.register(fastifyRateLimit, {
//   max: 200,
//   timeWindow: "1 minute",
// });
fastify.register(fastifyUnderPressure, {});
fastify.register(fastifyCors, {});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 50_000_000_000, // 50 gb
    files: 10,
  },
});



fastify.register(fastifySwagger, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "FHH VR - Backend API",
      description: "This is the backend api for the FHHVR Project.",
      version: json.version,
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [],
  },
});

fastify.register(fastifySwaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
  staticCSP: true,
  transformSpecificationClone: true,
});

const registries = await getRegistries();

fastify.register(fastifyToab, {
  async getRegistries() {
    return registries;
  },
})

fastify.route({
  method: "GET",
  url: "/ping",
  handler: (_, reply) => {
    reply.send("OK");
  },
});

(async () => {
  try {
    const serverAdapter = new FastifyAdapter();

    createBullBoard({
      queues: Array.from(registries.workerRegistry.queues.values()).map(queue => new BullMQAdapter(queue)),
      serverAdapter,
    })

    serverAdapter.setBasePath("/bullMQ")

    fastify.register(serverAdapter.registerPlugin(), { prefix: "/bullMQ"});

    await fastify.ready();

    fastify.swagger();

    await fastify.listen({
      host: "0.0.0.0",
      port: parseInt(process.env.PORT!),
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();

