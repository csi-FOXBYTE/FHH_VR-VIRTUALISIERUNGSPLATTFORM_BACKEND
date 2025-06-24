import {
  Body,
  Controller,
  Post,
  Rep,
  Schema,
} from "@tganzhorn/fastify-modular";
import { FastifyReply } from "fastify";
import proj4list from "proj4-list";
import {
  UploadProjectObjectRequestDTO,
  uploadProjectObjectRequestDTO,
  uploadProjectObjectResponseDTO,
} from "./converter3D.dto.js";
import { Converter3DService } from "./converter3D.service.js";

@Controller("/converter3D", [Converter3DService])
export class Converter3DController {
  constructor(private converter3DService: Converter3DService) {}

  @Post("/convert")
  @Schema({
    // @ts-ignore
    consumes: ["multipart/form-data"],
    body: uploadProjectObjectRequestDTO,
    response: {
      200: uploadProjectObjectResponseDTO,
    },
  })
  async convert(
    @Body() body: UploadProjectObjectRequestDTO,
    @Rep() reply: FastifyReply,
  ) {
    const file = Buffer.from(body.file);
    const fileName = body.fileName;
    const epsgCode = body.epsgCode;

    const srcSRS = proj4list[epsgCode][1];
    // const srcSRS = "+proj=longlat +datum=WGS84 +no_defs +type=crs"

    if (!srcSRS)
      return reply.code(400).send({ message: "Epsg code not found!" });

    const { modelMatrix, serializedDocument } =
      await this.converter3DService.convert(file, fileName);

    return {
      buffer64: serializedDocument,
      modelMatrix: modelMatrix.toArray(),
    };
  }
}
