import { validationResult } from 'express-validator';
import Creator from '../models/Creator.js';

// @desc    Get my creator profile
// @route   GET /api/creators/me/profile
// @access  Private
export const getMyCreatorProfile = async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).populate('creator');

    if (!user.creator) {
      return res.status(404).json({
        success: false,
        message: 'Vous n\'avez pas encore de profil créateur'
      });
    }

    res.json({
      success: true,
      data: user.creator.toPublicJSON()
    });
  } catch (error) {
    console.error('Error getting my creator profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching creator profile'
    });
  }
};

// @desc    Get all creators
// @route   GET /api/creators
// @access  Public
export const getAllCreators = async (req, res) => {
  try {
    const creators = await Creator.find({ isActive: true })
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    // Retourner les données publiques
    const publicCreators = creators.map(creator => ({
      _id: creator._id,
      username: creator.username,
      displayName: creator.displayName,
      bio: creator.bio,
      xrpAddress: creator.xrpAddress,
      destinationTag: creator.walletType === 'exchange' 
        ? creator.userDestinationTag 
        : creator.destinationTag,
      avatarUrl: creator.avatarUrl,
      bannerUrl: creator.bannerUrl,
      links: creator.links,
      stats: creator.stats,
      createdAt: creator.createdAt
    }));

    res.json(publicCreators);
  } catch (error) {
    console.error('Get all creators error:', error);
    res.status(500).json({ 
      message: 'Error fetching creators',
      error: error.message 
    });
  }
};

// @desc    Get creator by username
// @route   GET /api/creators/:username
// @access  Public
export const getCreatorByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const creator = await Creator.findOne({
      username: username.toLowerCase(),
      isActive: true
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    res.json({
      success: true,
      data: creator.toPublicJSON()
    });
  } catch (error) {
    console.error('Error getting creator:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching creator'
    });
  }
};

// @desc    Check username availability
// @route   GET /api/creators/check-username/:username
// @access  Public
export const checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.params;

    const existing = await Creator.findOne({
      username: username.toLowerCase()
    });

    res.json({
      success: true,
      available: !existing,
      username: username.toLowerCase()
    });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking username availability'
    });
  }
};

// @desc    Create new creator
// @route   POST /api/creators
// @access  Private
export const createCreator = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { username, displayName, bio, xrpAddress, avatarUrl, bannerUrl, links } = req.body;

    // Vérifier si l'utilisateur a déjà un profil créateur
    const User = (await import('../models/User.js')).default;
    const userWithCreator = await User.findById(req.user.id).populate('creator');

    if (userWithCreator.creator) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà un profil créateur',
        existingCreator: {
          username: userWithCreator.creator.username,
          url: `/u/${userWithCreator.creator.username}`
        }
      });
    }

    // Check if username already exists
    const existing = await Creator.findOne({
      username: username.toLowerCase()
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Username already taken'
      });
    }

    const idHex = userWithCreator._id.toString().slice(-8);
    const destinationTag = parseInt(idHex, 16) % 4294967295;

    // Create new creator
    const creator = new Creator({
      username: username.toLowerCase(),
      displayName,
      destinationTag: destinationTag,
      bio,
      xrpAddress,
      avatarUrl: avatarUrl || '',
      bannerUrl: bannerUrl || '',
      links: {
        twitter: links?.twitter || '',
        twitch: links?.twitch || '',
        tiktok: links?.tiktok || '',
        youtube: links?.youtube || ''
      }
    });

    await creator.save();

    // Lier le créateur à l'utilisateur
    userWithCreator.creator = creator._id;
    userWithCreator.role = 'creator';
    await userWithCreator.save();

    res.status(201).json({
      success: true,
      message: 'Creator profile created successfully',
      data: creator.toPublicJSON()
    });
  } catch (error) {
    console.error('Error creating creator:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating creator profile'
    });
  }
};

// @desc    Update creator
// @route   PUT /api/creators/:username
// @access  Private
export const updateCreator = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { username } = req.params;
    const { displayName, bio, xrpAddress, avatarUrl, bannerUrl, links } = req.body;

    const creator = await Creator.findOne({
      username: username.toLowerCase()
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // Vérifier que l'utilisateur est le propriétaire du profil créateur
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    if (!user.creator || user.creator.toString() !== creator._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modifier ce profil'
      });
    }

    // Update fields
    creator.displayName = displayName;
    creator.bio = bio;
    creator.xrpAddress = xrpAddress;
    creator.avatarUrl = avatarUrl || '';
    creator.bannerUrl = bannerUrl || '';
    creator.links = {
      twitter: links?.twitter || '',
      twitch: links?.twitch || '',
      tiktok: links?.tiktok || '',
      youtube: links?.youtube || ''
    };

    await creator.save();

    res.json({
      success: true,
      message: 'Creator profile updated successfully',
      data: creator.toPublicJSON()
    });
  } catch (error) {
    console.error('Error updating creator:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating creator profile'
    });
  }
};

// @desc    Delete creator
// @route   DELETE /api/creators/:username
// @access  Private (TODO: Add authentication)
export const deleteCreator = async (req, res) => {
  try {
    const { username } = req.params;

    const creator = await Creator.findOne({
      username: username.toLowerCase()
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // Soft delete
    creator.isActive = false;
    await creator.save();

    res.json({
      success: true,
      message: 'Creator profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting creator:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting creator profile'
    });
  }
};