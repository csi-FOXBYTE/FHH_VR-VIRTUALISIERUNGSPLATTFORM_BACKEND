import { PrismaClient } from "@prisma/client";
import realtimeExtension from "./extensions/realtimeExtension.js";

export const prisma = new PrismaClient()
  .$extends(realtimeExtension({ intervalMs: 5_000 }))
