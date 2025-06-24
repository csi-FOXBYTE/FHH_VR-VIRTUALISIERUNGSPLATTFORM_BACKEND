import MicrosoftEntraId from "@auth/core/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../prisma/index.js";
import { AuthConfig } from "@auth/core";

export const authOptions: AuthConfig = {
  providers: [
    MicrosoftEntraId({
      clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET,
      clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID,
      issuer: process.env.MICROSOFT_ENTRA_ISSUER,
      authorization: {
        params: "openid urn:fhhvr/vrvis-prod",
      },
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 259200,
  },
  adapter: PrismaAdapter(prisma),
};
