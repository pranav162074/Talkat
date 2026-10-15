import prisma from '../config/prisma.js';
import { toPublicUser } from '../utils/publicUser.js';
import { uploadAvatar, deleteAvatar } from '../services/uploadService.js';

// @route PATCH /api/users/me
// The body was already validated, and only the fields that were sent are present
export const updateProfile = async (req, res, next) => {
  try {
    const { name, bio, tagline } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (bio !== undefined) data.bio = bio === '' ? null : bio; // an empty bio clears it
    if (tagline !== undefined) data.tagline = tagline;

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/users/me/avatar  (multipart form, field: avatar)
export const updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No picture uploaded' });

    let uploaded;
    try {
      uploaded = await uploadAvatar(req.file, req.user.id);
    } catch (error) {
      console.error('Avatar upload failed:', error.message);
      return res.status(502).json({ message: 'Could not upload the picture, try again' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: uploaded.secure_url },
    });
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
};

// @route DELETE /api/users/me/avatar
export const removeAvatar = async (req, res, next) => {
  try {
    // If Cloudinary fails (or the picture came from Google and isn't there),
    // we still clear the field, so the user is never stuck with a picture
    try {
      await deleteAvatar(req.user.id);
    } catch (error) {
      console.error('Avatar delete failed:', error.message);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: null },
    });
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
};