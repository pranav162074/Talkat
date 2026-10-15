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

  // Uploads a profile picture, cropped to a 256x256 square centred on the face.
  // Using the user's id as the file name means a new upload replaces the old one,
  // so no orphaned pictures pile up in Cloudinary.
  export const uploadAvatar = (file, userId) =>
    new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'talkat/avatars',
            public_id: userId,
            overwrite: true,
            invalidate: true, // clears the CDN's cached copy of the old picture
            resource_type: 'image',
            transformation: [
              { width: 256, height: 256, crop: 'fill', gravity: 'face' },
              { quality: 'auto' },
            ],
          },
          (error, result) => (error ? reject(error) : resolve(result))
        )
        .end(file.buffer);
    });

  export const deleteAvatar = (userId) =>
    cloudinary.uploader.destroy(`talkat/avatars/${userId}`, {
      resource_type: 'image',
      invalidate: true,
  });