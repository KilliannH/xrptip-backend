import { validationResult } from 'express-validator';
import Creator from '../models/Creator.js';

// @desc    Get all creators
// @route   GET /api/creators
// @access  Public
export const getAllCreators = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const creators = await Creator.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    const total = await Creator.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: creators.map(c => c.toPublicJSON()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting creators:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching creators'
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
// @access  Public (TODO: Add authentication)
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

    const { username, displayName, bio, xrpAddress, avatarUrl, links } = req.body;

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

    // Create new creator
    const creator = new Creator({
      username: username.toLowerCase(),
      displayName,
      bio,
      xrpAddress,
      avatarUrl: avatarUrl || '',
      links: {
        twitter: links?.twitter || '',
        twitch: links?.twitch || ''
      }
    });

    await creator.save();

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
// @access  Private (TODO: Add authentication)
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
    const { displayName, bio, xrpAddress, avatarUrl, links } = req.body;

    const creator = await Creator.findOne({ 
      username: username.toLowerCase() 
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // Update fields
    creator.displayName = displayName;
    creator.bio = bio;
    creator.xrpAddress = xrpAddress;
    creator.avatarUrl = avatarUrl || '';
    creator.links = {
      twitter: links?.twitter || '',
      twitch: links?.twitch || ''
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