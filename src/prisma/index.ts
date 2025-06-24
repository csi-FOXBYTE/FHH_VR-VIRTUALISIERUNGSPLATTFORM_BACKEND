import { PrismaClient } from "@prisma/client";
import realtimeExtension from "./extensions/realtimeExtension.js";
import { versioningExtension } from "./extensions/versioningExtension.js";

export const prisma = new PrismaClient()
  .$extends(realtimeExtension({ intervalMs: 5_000 }))
  .$extends(versioningExtension());
