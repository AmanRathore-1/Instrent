import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from './config/env.js';

export type UploadResourceType = 'image' | 'video';

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
  constructor(missingVariables: string[]) {
    super(
      `Cloudinary uploads are unavailable. Add ${missingVariables.join(', ')} to the root .env file using Cloudinary Console > Dashboard > API Keys.`,
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
  const missingVariables = [
    !cloudName ? 'CLOUDINARY_CLOUD_NAME' : null,
    !apiKey ? 'CLOUDINARY_API_KEY' : null,
    !apiSecret ? 'CLOUDINARY_API_SECRET' : null,
  ].filter((variable): variable is string => variable !== null);
  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryNotConfiguredError(missingVariables);
  }
  return { cloudName, apiKey, apiSecret };
}

const configureCloudinary = () => {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });
  return config;
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
  const publicId = randomUUID();
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
  expectedAssetName?: string,
) => {
  configureCloudinary();
  let resource: {
    public_id?: string;
    asset_folder?: string;
    secure_url?: string;
    bytes?: number;
    format?: string;
    resource_type?: string;
  };
  try {
    resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
  } catch (error) {
    if (error && typeof error === 'object' && 'http_code' in error && error.http_code === 404) {
      throw new CloudinaryUploadError('Cloudinary could not find the uploaded file. Please upload it again.');
    }
    throw error;
  }
  const expectedFolder = `rentreel/${resourceType === 'image' ? 'rooms' : 'reels'}/${ownerId}`;
  const belongsToOwner = resource.asset_folder === expectedFolder;
  const verifiedPublicId = resource.public_id;
  const secureUrl = resource.secure_url;
  const bytes = resource.bytes;
  const format = resource.format;
  if (
    !verifiedPublicId ||
    verifiedPublicId !== publicId ||
    resource.resource_type !== resourceType ||
    !belongsToOwner ||
    !secureUrl ||
    typeof bytes !== 'number' ||
    bytes <= 0 ||
    bytes > maxBytes ||
    (expectedAssetName !== undefined && verifiedPublicId.split('/').pop() !== expectedAssetName)
  ) {
    if (belongsToOwner) {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    }
    throw new CloudinaryUploadError('The uploaded file is invalid or exceeds the allowed size.');
  }
  return { publicId: verifiedPublicId, url: secureUrl, bytes, format: format || '' };
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
