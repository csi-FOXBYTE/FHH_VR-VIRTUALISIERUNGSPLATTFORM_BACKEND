import { FastifyPluginAsync } from "fastify";
import prisma from "../../prisma/index.js";

const jobsRouter: FastifyPluginAsync = async (fastify, opts) => {
  fastify.get("/jobs/:jobId", async function handler(request, reply) {
    const jobId = (request.params as any).jobId;

    const job = await prisma.task.findFirst({
      where: {
        id: jobId,
      },
      select: {
        payload: true,
        status: true,
      },
    });

    if (!job) return reply.send({ status: "NOT_FOUND" });

    return reply.send(request.params);
  });
};

export default jobsRouter;
