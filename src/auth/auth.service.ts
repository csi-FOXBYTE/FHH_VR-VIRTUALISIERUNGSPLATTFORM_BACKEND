import {
  ContextService,
  RequestStore,
  Service,
} from "@tganzhorn/fastify-modular";
import { authOptions } from "./authOptions.js";
import { getSession } from "./index.js";

@Service([ContextService])
export class AuthService extends RequestStore<{
  session: Awaited<ReturnType<typeof getSession>> | null;
}> {
  constructor(private contextService: ContextService) {
    super({ session: null });
  }

  async getSession() {
    if (!this.requestStore.session) {
      this.requestStore.session = await getSession(
        this.contextService.ctx.request,
        authOptions
      );
    }

    return this.requestStore.session!;
  }
}
