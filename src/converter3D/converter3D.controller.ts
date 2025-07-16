import { createController, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import proj4list from "proj4-list";
import {
  downloadProjectModelRequestDTIO,
  getProjectModelStatusRequestDTO,
  getProjectModelStatusResponseDTO,
  upload3DTileRequestDTO,
  uploadProjectModelRequestDTO,
  uploadProjectModelResponseDTO,
  uploadTerrainRequestDTO,
} from "./converter3D.dto.js";
import { getConverter3DService } from "./converter3D.service.js";
import { authMiddleware } from "../auth/auth.middleware.js";

const converter3DController = createController()
  .use(authMiddleware)
  .rootPath("/converter3D");

converter3DController
  .addRoute("POST", "/uploadProjectModel")
  .body(uploadProjectModelRequestDTO)
  .output(uploadProjectModelResponseDTO)
  .handler(
    async ({ request, services }) => {
      const converter3DService = await getConverter3DService(services);

      let fileName = "";
      let epsgCode = "";

      for await (const part of request.parts()) {
        if (part.fieldname === "fileName" && part.type === "field")
          fileName = part.value as string;
        if (part.fieldname === "epsgCode" && part.type === "field")
          epsgCode = part.value as string;
        if (part.type === "file") {
          const srcSRS = proj4list[epsgCode][1];

          if (!srcSRS) {
            throw new GenericRouteError("BAD_REQUEST", "Epsg code not found!");
          }

          return converter3DService.uploadProjectModel(
            part.file,
            fileName,
            srcSRS
          );
        }
      }

      throw new GenericRouteError(
        "BAD_REQUEST",
        "Didn't get all required parameters!"
      );
    },
    {
      validatorCompiler: () => () => ({ value: true }),
      schema: {
        consumes: ["multipart/form-data"],
      },
    }
  );

converter3DController
  .addRoute("POST", "/getProjectModelStatus")
  .body(getProjectModelStatusRequestDTO)
  .output(getProjectModelStatusResponseDTO)
  .handler(async ({ body, services }) => {
    const converter3DService = await getConverter3DService(services);

    return await converter3DService.getProjectModelStatus(
      body.jobId,
      body.secret
    );
  });

converter3DController
  .addRoute("POST", "/downloadProjectModel")
  .body(downloadProjectModelRequestDTIO)
  .handler(async ({ reply, body, services }) => {
    const converter3DService = await getConverter3DService(services);

    const stream = await converter3DService.downloadProjectModel(
      body.jobId,
      body.secret
    );

    reply
      .header("content-type", "application/octet-stream")
      .header("content-disposition", 'attachment; filename="big-file.glb"');

    return stream! as unknown as void;
  });

converter3DController
  .addRoute("POST", "/uploadTerrain")
  .body(uploadTerrainRequestDTO)
  .handler(
    async ({ request, services }) => {
      const converter3DService = await getConverter3DService(services);

      let srcSRS: null | string = null;
      let name: null | string = null;
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "srcSRS")
          srcSRS = part.value as string;
        if (part.type === "field" && part.fieldname === "name")
          name = part.value as string;
        if (part.type === "file") {
          if (!srcSRS)
            throw new GenericRouteError("BAD_REQUEST", "No src srs provided!");
          if (!name)
            throw new GenericRouteError("BAD_REQUEST", "No name provided!");
          return await converter3DService.uploadTerrain(
            part.file,
            name,
            srcSRS
          );
        }
      }

      throw new GenericRouteError("BAD_REQUEST", "No file supplied!");
    },
    {
      schema: {
        consumes: ["multipart/form-data"],
      },
      validatorCompiler: () => () => ({ value: true }),
    }
  );

converter3DController
  .addRoute("POST", "/upload3DTile")
  .body(upload3DTileRequestDTO)
  .handler(
    async ({ request, services }) => {
      const converter3DService = await getConverter3DService(services);

      let srcSRS: null | string = null;
      let name: null | string = null;
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "srcSRS")
          srcSRS = part.value as string;
        if (part.type === "field" && part.fieldname === "name")
          name = part.value as string;
        if (part.type === "file") {
          if (!srcSRS)
            throw new GenericRouteError("BAD_REQUEST", "No src srs provided!");
          if (!name)
            throw new GenericRouteError("BAD_REQUEST", "No name provided!");
          return await converter3DService.upload3DTile(part.file, name, srcSRS);
        }
      }

      throw new GenericRouteError("BAD_REQUEST", "No file supplied!");
    },
    {
      schema: {
        consumes: ["multipart/form-data"],
      },
      validatorCompiler: () => () => ({ value: true }),
    }
  );

/*
AUTOGENERATED!
*/

export { converter3DController };
