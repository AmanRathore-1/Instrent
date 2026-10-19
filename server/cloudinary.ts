import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from './config/env.js';

export type UploadResourceType = 'image' | 'video';

type CloudinaryPhoto = {
  publicId: string;
  url: string;
};

export type SignedCloudinaryUpload = {
  apiKey: string;
  cloudName: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: UploadResourceType;
  allowedFormats: string[];
};

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to the root .env file.',
    );
    this.name = 'CloudinaryNotConfiguredError';
  }
}

export class CloudinaryUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudinaryUploadError';
  }
}

const getCloudinaryConfig = () => {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryNotConfiguredError();
  }
  return { cloudName, apiKey, apiSecret };
};

const configureCloudinary = () => {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });
  return config;
};

export const uploadRoomPhoto = (buffer: Buffer): Promise<CloudinaryPhoto> => {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'rentreel/rooms',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          reject(new CloudinaryUploadError(`Cloudinary upload failed: ${error.message}`));
          return;
        }
        if (!result?.secure_url || !result.public_id) {
          reject(new CloudinaryUploadError('Cloudinary upload returned no image URL.'));
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );
    stream.end(buffer);
  });
};

export const deleteRoomPhotos = async (publicIds: string[]) => {
  if (publicIds.length === 0) return;
  configureCloudinary();
  const results = await Promise.all(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image' })),
  );
  const failed = results.find((result) => result.result !== 'ok' && result.result !== 'not found');
  if (failed) {
    throw new CloudinaryUploadError(`Cloudinary cleanup failed: ${failed.result}`);
  }
};

export const createSignedUpload = (
  ownerId: string,
  resourceType: UploadResourceType,
  mimeType: string,
): SignedCloudinaryUpload => {
  const { cloudName, apiKey, apiSecret } = configureCloudinary();
  const format = mimeType === 'image/jpeg'
    ? 'jpg'
    : mimeType === 'video/quicktime'
      ? 'mov'
      : mimeType.slice(mimeType.indexOf('/') + 1).toLowerCase();
  const allowedFormats = resourceType === 'image'
    ? ['jpg', 'png', 'webp', 'avif']
    : ['mp4', 'webm', 'mov'];
  if (!allowedFormats.includes(format)) {
    throw new CloudinaryUploadError('Unsupported media format.');
  }
  const folder = `rentreel/${resourceType === 'image' ? 'rooms' : 'reels'}/${ownerId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${folder}/${randomUUID()}`;
  const signature = cloudinary.utils.api_sign_request({
    timestamp,
    folder,
    public_id: publicId,
    allowed_formats: allowedFormats.join(','),
  }, apiSecret);
  return { apiKey, cloudName, timestamp, signature, folder, publicId, resourceType, allowedFormats };
};

export const verifyUploadedAsset = async (
  publicId: string,
  resourceType: UploadResourceType,
  ownerId: string,
  maxBytes: number,
) => {
  configureCloudinary();
  const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType }) as {
    public_id?: string;
    secure_url?: string;
    bytes?: number;
    format?: string;
    resource_type?: string;
  };
  if (
    resource.public_id !== publicId ||
    resource.resource_type !== resourceType ||
    !resource.secure_url ||
    !publicId.startsWith(`rentreel/${resourceType === 'image' ? 'rooms' : 'reels'}/${ownerId}/`) ||
    typeof resource.bytes !== 'number' ||
    resource.bytes <= 0 ||
    resource.bytes > maxBytes
  ) {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    throw new CloudinaryUploadError('The uploaded asset is invalid or exceeds the allowed size.');
  }
  return { publicId, url: resource.secure_url, bytes: resource.bytes, format: resource.format || '' };
};

export const deleteCloudinaryAssets = async (
  assets: Array<{ publicId: string; resourceType: UploadResourceType }>,
) => {
  await Promise.all(assets.map(async ({ publicId, resourceType }) => {
    configureCloudinary();
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new CloudinaryUploadError(`Cloudinary cleanup failed: ${result.result}`);
    }
  }));
};

export const createVideoThumbnailUrl = (publicId: string) => {
  configureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ width: 720, height: 1280, crop: 'fill', quality: 'auto' }],
  });
};

export const isCloudinaryRoomPhotoUrl = (value: string) => {
  const { cloudName } = getCloudinaryConfig();
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'res.cloudinary.com' &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`);
  } catch {
    return false;
  }
};
