import { createController } from "@csi-foxbyte/fastify-toab";
import { authMiddleware } from "../auth/auth.middleware.js";
import { Type } from "@sinclair/typebox";
import {
  getUserService,
} from "../@internals/index.js";

const userController = createController().use(authMiddleware).rootPath("/user");

userController
  .addRoute("GET", "/info")
  .output(
    Type.Object({
      name: Type.String(),
      email: Type.String(),
    })
  )
  .handler(async ({ services, ctx }) => {
    const userService = await getUserService(services);

    return await userService.info(ctx.session.user.id);
  });

userController
  .addRoute("DELETE", "/")
  .output(Type.Boolean())
  .handler(async ({ ctx, services }) => {
    const userService = await getUserService(services);

    await userService.remove(ctx.session.user.id);

    return true;
  });

export default userController;
