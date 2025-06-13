import { Document, NodeIO, vec3 } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  draco,
  flatten,
  join,
  prune,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { Static, Type } from "@sinclair/typebox";
// @ts-expect-error has no types
import draco3d from "draco3dgltf";
import { FastifyPluginAsync } from "fastify";
import {
  MeshoptDecoder,
  MeshoptEncoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import sharp from "sharp";
import proj4list from "proj4-list";
import { Matrix4 } from "three";

const uploadProjectObjectRequest = Type.Object({
  file: Type.Any(),
  epsgCode: Type.String(),
  fileName: Type.String(),
});
type UploadProjectObjectRequest = Static<typeof uploadProjectObjectRequest>;

const uploadProjectObjectResponse = Type.Object({
  buffer64: Type.String(),
  modelMatrix: Type.Array(Type.Number()),
});
type UploadProjectObjectResponse = Static<typeof uploadProjectObjectResponse>;

const projectObjectRouter: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post<{
    Body: UploadProjectObjectRequest;
    Response: UploadProjectObjectResponse;
  }>(
    "/upload/project-object",
    {
      schema: {
        // @ts-ignore
        consumes: ["multipart/form-data"],
        body: uploadProjectObjectRequest,
        response: {
          200: uploadProjectObjectResponse,
        },
      },
    },
    async function handler(request, reply) {
      const file = Buffer.from(request.body.file);
      const fileName = request.body.fileName;
      const epsgCode = request.body.epsgCode;

      const srcSRS = proj4list[epsgCode][1];
      // const srcSRS = "+proj=longlat +datum=WGS84 +no_defs +type=crs"

      if (!srcSRS)
        return reply.code(400).send({ message: "Epsg code not found!" });

      const extension = fileName.split(".").slice(-1)[0];

      const io = new NodeIO()
        .registerExtensions([...ALL_EXTENSIONS])
        .registerDependencies({
          "draco3d.decoder": await draco3d.createDecoderModule(),
          "draco3d.encoder": await draco3d.createEncoderModule(),
          "meshopt.decoder": MeshoptDecoder,
          "meshopt.encoder": MeshoptEncoder,
        });

      let document: Document | null = null;

      switch (extension) {
        case "glb": {
          document = await io.readBinary(file);
          break;
        }
        case "ifc": {
          const { convertIfcBuffer } = await import("../../lib/IfcConvert.js");
          document = await io.readBinary(await convertIfcBuffer(file, "glb"));
          break;
        }
        case "fbx":
        case "obj":
        case "dae":
        case "xml":
        case "blend":
        case "stl":
        case "dxf":
        case "3ds":
        case "gltf":
        case "ter":
          const { convertWithAssimpJs } = await import(
            "../../lib/AssimpJsConvert.js"
          );
          document = await io.readBinary(
            await convertWithAssimpJs(extension, file)
          );
          break;
        default:
          return reply.code(400).send({
            status: `Filetype ${extension} is unsupported!`,
            code: 400,
          });
      }

      let modelMatrix = new Matrix4();

      await document.transform(
        dedup(),
        flatten(),
        prune(),
        weld({}),
        join({}),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: 0.0,
          error: 0.001,
          cleanup: true,
          lockBorder: false,
        }),
        draco({}),
        textureCompress({
          encoder: sharp,
          effort: 95,
          quality: 99,
          targetFormat: "png",
        }),
        (document) => {
          let offset: null | vec3 = null;

          for (const node of document.getRoot().listNodes()) {
            const translation = node.getTranslation();

            if (!offset) offset = [...translation];

            node.setTranslation([
              translation[0] - offset[0],
              translation[1] - offset[1],
              translation[2] - offset[2],
            ]);
          }
        }
      );

      return reply.send({
        buffer64: Buffer.from(await io.writeBinary(document)).toString(
          "base64"
        ),
        modelMatrix: modelMatrix.toArray(),
      });
    }
  );
};

export default projectObjectRouter;
