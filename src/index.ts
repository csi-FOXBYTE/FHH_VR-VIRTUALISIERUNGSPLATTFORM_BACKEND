import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import projectObjectRouter from "./routes/upload/projectObject.js";
import "dotenv";
import { registerAuth } from "./auth/index.js";
import jobsRouter from "./routes/jobs/jobs.js";

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

registerAuth(fastify);

fastify.register(projectObjectRouter, {});
fastify.register(jobsRouter, {});

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
    await fastify.listen({ host: "0.0.0.0", port: parseInt(process.env.PORT!) });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();
