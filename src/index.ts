import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import "dotenv";
import { getSession, registerAuth } from "./auth/index.js";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import json from "../package.json" with { type: "json" };
import { registerControllers } from "@tganzhorn/fastify-modular";
import { EventsController } from "./events/events.controller.js";
import { Converter3DController } from "./converter3D/converter3D.controller.js";
import { authOptions } from "./auth/authOptions.js";

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyMultipart, {
  attachFieldsToBody: "keyValues",
  limits: {
    fileSize: 1_000_000_000,
    files: 1,
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

registerAuth(fastify);

registerControllers(fastify, { createCustomContext: async (request, reply, routerContext) => {
  const session = await getSession(request, authOptions);

  console.log({session});

  return { request, reply, routerCtx: routerContext, session };
},  controllers: [EventsController, Converter3DController]});

fastify.route({
  method: "GET",
  url: "/ping",
  handler: (_, reply) => {
    reply.send("OK");
  },
});

(async () => {
  try {
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
