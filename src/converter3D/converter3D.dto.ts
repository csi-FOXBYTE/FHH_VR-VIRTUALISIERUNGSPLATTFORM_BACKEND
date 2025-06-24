import { Type, Static } from "@sinclair/typebox";

export const uploadProjectObjectRequestDTO = Type.Object({
  file: Type.Any(),
  epsgCode: Type.String(),
  fileName: Type.String(),
});
export type UploadProjectObjectRequestDTO = Static<
  typeof uploadProjectObjectRequestDTO
>;

export const uploadProjectObjectResponseDTO = Type.Object({
  buffer64: Type.String(),
  modelMatrix: Type.Array(Type.Number()),
});
export type UploadProjectObjectResponseDTO = Static<
  typeof uploadProjectObjectResponseDTO
>;
