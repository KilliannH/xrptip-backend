import { validationResult } from 'express-validator';
import Tip from '../models/Tip.js';
import Creator from '../models/Creator.js';

// @desc    Create a new tip
// @route   POST /api/tips
// @access  Public
export const createTip = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { creatorUsername, amount, senderAddress, message } = req.body;

    // Find the creator
    const creator = await Creator.findOne({ 
      username: creatorUsername.toLowerCase(),
      isActive: true 
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // Create tip record
    const tip = new Tip({
      creator: creator._id,
      creatorUsername: creator.username,
      amount,
      senderAddress: senderAddress || '',
      message: message || '',
      status: 'pending'
    });

    await tip.save();

    res.status(201).json({
      success: true,
      message: 'Tip created successfully',
      data: {
        id: tip._id,
        amount: tip.amount,
        creatorUsername: tip.creatorUsername,
        status: tip.status,
        createdAt: tip.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating tip:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating tip'
    });
  }
};

// @desc    Get tips for a creator
// @route   GET /api/tips/creator/:username
// @access  Public
export const getTipsByCreator = async (req, res) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'confirmed';

    // Find creator
    const creator = await Creator.findOne({ 
      username: username.toLowerCase() 
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // ✅ Utiliser TOUS les destination tags valides (historique inclus)
    const validDestinationTags = creator.getAllValidDestinationTags();

    // Get tips with correct destination tag filter
    const tips = await Tip.find({ 
      creator: creator._id,
      destinationTag: { $in: validDestinationTags },
      status 
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-creator -__v')
      .lean();

    const total = await Tip.countDocuments({ 
      creator: creator._id,
      destinationTag: { $in: validDestinationTags },
      status 
    });

    res.json({
      success: true,
      data: tips,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting tips:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tips',
      error: error.message
    });
  }
};

// @desc    Get tip statistics for a creator
// @route   GET /api/tips/stats/:username
// @access  Public
export const getTipStats = async (req, res) => {
  try {
    const { username } = req.params;

    // Find creator
    const creator = await Creator.findOne({ 
      username: username.toLowerCase() 
    });
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(creator.user);

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // ✅ Utiliser TOUS les destination tags valides
    const validDestinationTags = creator.getAllValidDestinationTags();

    // Get all-time stats
    const allTimeTips = await Tip.find({
      creator: creator._id,
      destinationTag: { $in: validDestinationTags },
      status: 'confirmed'
    }).lean();

    const allTimeStats = {
      totalTips: allTimeTips.length,
      totalAmount: allTimeTips.reduce((sum, tip) => sum + tip.amount, 0),
      uniqueSupporters: [...new Set(allTimeTips.map(t => t.senderAddress))].length
    };

    // Get monthly stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthlyStats = await Tip.aggregate([
      {
        $match: {
          creator: creator._id,
          destinationTag: { $in: validDestinationTags },
          status: 'confirmed',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalTips: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const monthly = monthlyStats[0] || {
      totalTips: 0,
      totalAmount: 0
    };

    // Update creator stats
    creator.user = user;
    creator.stats.totalTips = allTimeStats.totalTips;
    creator.stats.totalAmount = allTimeStats.totalAmount;
    creator.stats.uniqueSupporters = allTimeStats.uniqueSupporters;
    await creator.save();

    res.json({
      success: true,
      data: {
        allTime: allTimeStats,
        last30Days: {
          totalTips: monthly.totalTips,
          totalAmount: monthly.totalAmount
        }
      }
    });
  } catch (error) {
    console.error('Error getting tip stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tip statistics',
      error: error.message
    });
  }
};

// @desc    Confirm a tip (update with transaction hash)
// @route   PUT /api/tips/:tipId/confirm
// @access  Public (TODO: Should be webhook or authenticated)
export const confirmTip = async (req, res) => {
  try {
    const { tipId } = req.params;
    const { transactionHash, ledgerIndex } = req.body;

    if (!transactionHash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash is required'
      });
    }

    const tip = await Tip.findById(tipId);

    if (!tip) {
      return res.status(404).json({
        success: false,
        message: 'Tip not found'
      });
    }

    if (tip.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Tip already confirmed'
      });
    }

    // Confirm the tip
    await tip.confirm(transactionHash, ledgerIndex);

    // ✅ Update creator stats en utilisant tous les destination tags
    const creator = await Creator.findById(tip.creator);
    if (creator) {
      const validDestinationTags = creator.getAllValidDestinationTags();
      
      const allTips = await Tip.find({
        creator: creator._id,
        destinationTag: { $in: validDestinationTags },
        status: 'confirmed'
      }).lean();

      creator.stats.totalTips = allTips.length;
      creator.stats.totalAmount = allTips.reduce((sum, t) => sum + t.amount, 0);
      creator.stats.uniqueSupporters = [...new Set(allTips.map(t => t.senderAddress))].length;
      
      await creator.save();
    }

    res.json({
      success: true,
      message: 'Tip confirmed successfully',
      data: {
        id: tip._id,
        status: tip.status,
        transactionHash: tip.transactionHash,
        confirmedAt: tip.confirmedAt
      }
    });
  } catch (error) {
    console.error('Error confirming tip:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming tip'
    });
  }
};