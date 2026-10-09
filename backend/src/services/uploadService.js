import crypto from 'crypto';
import path from 'path';
import cloudinary from '../config/cloudinary.js';

export const getMessageType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'IMAGE';
  if (mimetype.startsWith('video/')) return 'VIDEO';
  return 'FILE';
};

// Streams an in-memory file buffer to Cloudinary and returns its public URL
export const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const type = getMessageType(file.mimetype);
    const resourceType = type === 'IMAGE' ? 'image' : type === 'VIDEO' ? 'video' : 'raw';
    const id = crypto.randomUUID();

    // Raw files keep their extension in the public id so downloads open correctly
    const publicId = resourceType === 'raw' ? `${id}${path.extname(file.originalname)}` : id;

    cloudinary.uploader
      .upload_stream(
        { folder: 'talkat/attachments', resource_type: resourceType, public_id: publicId },
        (error, result) => (error ? reject(error) : resolve(result))
      )
      .end(file.buffer);
  });