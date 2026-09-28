export type UploadPurpose = "video" | "material";

export type PresignedUploadResult = {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
};

export type PresignedDownloadResult = {
  downloadUrl: string;
  expiresIn: number;
};

export type StoredObjectStat = {
  objectKey: string;
  size: number;
  contentType: string | null;
};

export const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const MATERIAL_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
] as const;
