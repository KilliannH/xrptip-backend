import { S3_CONFIG } from '../config/s3.js';

// @desc    Upload avatar image
// @route   POST /api/upload/avatar
// @access  Private
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni'
      });
    }

    // URL publique de l'image uploadée
    const imageUrl = req.file.location || `${S3_CONFIG.baseUrl}/${req.file.key}`;

    res.json({
      success: true,
      message: 'Avatar uploadé avec succès',
      data: {
        url: imageUrl,
        key: req.file.key,
        size: req.file.size,
        contentType: req.file.contentType
      }
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'upload de l\'avatar',
      error: error.message
    });
  }
};

// @desc    Upload banner image
// @route   POST /api/upload/banner
// @access  Private
export const uploadBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni'
      });
    }

    // URL publique de l'image uploadée
    const imageUrl = req.file.location || `${S3_CONFIG.baseUrl}/${req.file.key}`;

    res.json({
      success: true,
      message: 'Bannière uploadée avec succès',
      data: {
        url: imageUrl,
        key: req.file.key,
        size: req.file.size,
        contentType: req.file.contentType
      }
    });
  } catch (error) {
    console.error('Error uploading banner:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'upload de la bannière',
      error: error.message
    });
  }
};

// @desc    Delete an image from S3
// @route   DELETE /api/upload/:key
// @access  Private
export const deleteImage = async (req, res) => {
  try {
    const { key } = req.params;

    // TODO: Implémenter la suppression S3
    // import { DeleteObjectCommand } from '@aws-sdk/client-s3';
    // await s3Client.send(new DeleteObjectCommand({
    //   Bucket: S3_CONFIG.bucket,
    //   Key: key
    // }));

    res.json({
      success: true,
      message: 'Image supprimée avec succès'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'image',
      error: error.message
    });
  }
};