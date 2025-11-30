import multer from 'multer';
import multerS3 from 'multer-s3';
import { s3Client, S3_CONFIG } from '../config/s3.js';
import path from 'path';
import crypto from 'crypto';

// Types d'images autorisés
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Filtre pour valider les fichiers
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WebP.'), false);
  }
};

// Configuration Multer avec S3
export const uploadToS3 = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: S3_CONFIG.bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
        uploadedBy: req.user?.id || 'anonymous',
        uploadedAt: new Date().toISOString()
      });
    },
    key: (req, file, cb) => {
      // Générer un nom de fichier unique
      const folder = file.fieldname; // 'avatar' ou 'banner'
      const uniqueSuffix = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname);
      const filename = `${folder}/${uniqueSuffix}${ext}`;
      cb(null, filename);
    }
  }),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// Middleware pour gérer les erreurs d'upload
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (max 5MB)'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erreur d'upload: ${err.message}`
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};