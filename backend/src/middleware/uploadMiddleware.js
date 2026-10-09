import multer from 'multer';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// An allow-list, so executables, HTML and SVG (which can carry scripts) are rejected
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
  storage: multer.memoryStorage(), // the file is streamed on to Cloudinary, never saved on disk
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      const error = new Error('This file type is not allowed');
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

// Wraps multer so its errors become clean 400/413 responses
export const uploadSingleFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        message: tooBig ? 'File is too large (max 10 MB)' : 'Invalid upload',
      });
    }
    next(err);
  });
};