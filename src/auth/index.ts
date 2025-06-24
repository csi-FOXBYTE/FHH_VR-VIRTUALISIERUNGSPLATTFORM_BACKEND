import { Auth, AuthConfig, setEnvDefaults } from "@auth/core";
import { FastifyInstance, FastifyRequest } from "fastify";
import { authOptions } from "./authOptions.js";
import { AuthAction } from "@auth/core/types";

function createActionURL(
  action: AuthAction,
  protocol: string,
  headers: Headers,
  envObject: any,
  config: Pick<AuthConfig, "basePath" | "logger">
): URL {
  const basePath = config?.basePath;
  const envUrl = envObject.AUTH_URL ?? envObject.NEXTAUTH_URL;

  let url: URL;
  if (envUrl) {
    url = new URL(envUrl);
    if (basePath && basePath !== "/" && url.pathname !== "/") {
      if (url.pathname !== basePath) {
        console.warn("env-url-basepath-mismatch");
      }
      url.pathname = "/";
    }
  } else {
    const detectedHost = headers.get("x-forwarded-host") ?? headers.get("host");
    const detectedProtocol =
      headers.get("x-forwarded-proto") ?? protocol ?? "https";
    const _protocol = detectedProtocol.endsWith(":")
      ? detectedProtocol
      : detectedProtocol + ":";

    url = new URL(`${_protocol}//${detectedHost}`);
  }

  // remove trailing slash
  const sanitizedUrl = url.toString().replace(/\/$/, "");

  if (basePath) {
    // remove leading and trailing slash
    const sanitizedBasePath = basePath?.replace(/(^\/|\/$)/g, "") ?? "";
    return new URL(`${sanitizedUrl}/${sanitizedBasePath}/${action}`);
  }
  return new URL(`${sanitizedUrl}/${action}`);
}

export async function getSession(req: FastifyRequest, config: AuthConfig) {
  setEnvDefaults(process.env, config);

  const url = createActionURL(
    "session",
    req.protocol,
    // @ts-expect-error
    new Headers(req.headers),
    process.env,
    config
  );

  const response = await Auth(
    new Request(url, {
      headers: {
        cookie: req.headers.cookie ?? "",
        authorization: req.headers.authorization ?? "",
      },
    }),
    config
  );

  const { status = 200 } = response;

  const data = (await response.json()) as {
    user: { name: string; email: string; image: string };
    expires: string;
  };

  if (!data || !Object.keys(data).length) return null;
  if (status === 200) return data;
  // @ts-expect-error this is completely fine
  throw new Error(data.message);
}

function fastifyToStandardRequest(fastifyReq: FastifyRequest) {
  // 1) Reconstruct “full URL”. FastifyRequest.raw is the underlying Node IncomingMessage,
  //    but `fastifyReq.url` is just the path+query. To make a proper full URL, you need
  //    protocol + host header + path.
  //
  //    If you know your server runs on HTTPS, you can hardcode “https://” here. Otherwise:
  const protocol = fastifyReq.protocol; // e.g. 'http' or 'https'
  const host = fastifyReq.headers.host; // e.g. 'example.com:3000'
  const fullUrl = `${protocol}://${host}${fastifyReq.url}`;

  // 2) Copy all headers. WHATWG Request expects a Headers-like object.
  //    Fastify already normalizes headers to lowercase strings or arrays.
  const headers = new Headers();
  for (const [key, value] of Object.entries(fastifyReq.headers)) {
    if (value === undefined) continue;
    // If the header’s value is an array (unlikely with Fastify’s `req.headers`, but just in case):
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }

  // 3) Pick the method:
  const method = fastifyReq.method; // e.g. 'GET', 'POST', etc.

  // 4) Decide on the body. If you haven’t consumed it yet, you can hand over the raw stream:
  //    fastifyReq.raw is a Node.js IncomingMessage, which is a Readable. The WHATWG `Request`
  //    constructor in Node’s built-in fetch API (or node-fetch/undici) will accept a Readable
  //    as the body. If you’ve already done `await fastifyReq.body` (and parsed JSON, form-data, etc.),
  //    you can re‐stringify it manually.
  //
  //    Here’s the “stream” approach:
  // Note: .once check is just a naive way to see if raw is a stream. In practice, fastifyReq.raw is always a Readable.

  // 5) Build the standard Request:
  return new Request(fullUrl, {
    method,
    headers,
    // Only include body for HTTP methods that allow a payload:
    ...(method !== "GET" && method !== "HEAD" ? {} : {}),
  });
}

export const registerAuth = async (fastify: FastifyInstance) => {
  setEnvDefaults(process.env, authOptions);
  fastify.addHook("preHandler", async function (req, rep) {
    if (req.url.startsWith("/api/auth")) return;

    const session = await getSession(req, authOptions);

    if (!session) return rep.code(401).send({ message: "ACCESS_DENIED" });
  });
  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (req, rep) => {
      const { status, headers, body } = await Auth(
        fastifyToStandardRequest(req),
        authOptions
      );

      rep.code(status);

      for (const [k, v] of Object.entries(headers || {})) {
        rep.header(k, v as string | string[]);
      }

      return rep.send(body);
    },
  });
};
