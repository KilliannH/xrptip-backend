import express from 'express';
import { protect } from '../middleware/auth.js';
import { uploadToS3, handleUploadError } from '../middleware/upload.js';
import { uploadAvatar, uploadBanner, deleteImage } from '../controllers/uploadController.js';

const router = express.Router();

// Upload avatar
router.post(
  '/avatar',
  protect,
  uploadToS3.single('avatar'),
  handleUploadError,
  uploadAvatar
);

// Upload banner
router.post(
  '/banner',
  protect,
  uploadToS3.single('banner'),
  handleUploadError,
  uploadBanner
);

// Delete image
router.delete('/:key', protect, deleteImage);

export default router;