import User from '../models/User.js';
import Creator from '../models/Creator.js';
import Tip from '../models/Tip.js';

const calculateDestinationTag = (userId) => {
  const idHex = userId.toString().slice(-8);
  return parseInt(idHex, 16) % 4294967295;
};

// @desc    Get admin statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getAdminStats = async (req, res) => {
  try {
    // Total users
    const totalUsers = await User.countDocuments();
    
    // Verified users
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    
    // Total creators
    const totalCreators = await Creator.countDocuments();
    
    // New users in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersLast7Days = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Optional: Additional stats
    const totalTips = await Tip.countDocuments();
    const confirmedTips = await Tip.countDocuments({ status: 'confirmed' });
    
    // Total XRP volume
    const tipsAggregate = await Tip.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalXRPVolume = tipsAggregate[0]?.total || 0;

    res.json({
      totalUsers,
      verifiedUsers,
      totalCreators,
      newUsersLast7Days,
      totalTips,
      confirmedTips,
      totalXRPVolume
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ 
      message: 'Error fetching admin stats',
      error: error.message 
    });
  }
};

// @desc    Get all users list
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationCode -verificationCodeExpires')
      .sort({ createdAt: -1 })
      .lean();

    // Récupérer tous les créateurs
    const creators = await Creator.find()
      .select('username xrpAddress destinationTag')
      .lean();

    // Créer une map destinationTag -> creator data
    const creatorMap = new Map();
    creators.forEach(creator => {
      creatorMap.set(creator.destinationTag, {
        username: creator.username,
        xrpAddress: creator.xrpAddress
      });
    });

    // Enrichir les users avec les données creator
    const enrichedUsers = users.map(user => {
      const destinationTag = calculateDestinationTag(user._id);
      const creatorData = creatorMap.get(destinationTag);

      return {
        ...user,
        username: creatorData?.username || null,
        xrpAddress: creatorData?.xrpAddress || null,
        destinationTag: creatorData ? destinationTag : null,
        role: creatorData 
          ? (user.role === 'admin' ? 'admin' : 'creator')
          : user.role
      };
    });

    res.json(enrichedUsers);
  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({ 
      message: 'Error fetching users list',
      error: error.message 
    });
  }
};

// @desc    Get user details by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get creator profile if exists
    const creator = await Creator.findOne({ user: user._id }).lean();

    // Get tips stats if creator
    let tipsStats = null;
    if (creator) {
      const tips = await Tip.find({ creator: creator._id, status: 'confirmed' });
      const totalAmount = tips.reduce((sum, tip) => sum + tip.amount, 0);
      
      tipsStats = {
        totalTips: tips.length,
        totalAmount,
        lastTip: tips[0]?.createdAt || null
      };
    }

    res.json({
      ...user,
      creator,
      tipsStats
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ 
      message: 'Error fetching user details',
      error: error.message 
    });
  }
};

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'creator', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ 
      message: 'Error updating user role',
      error: error.message 
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete associated creator profile if exists
    await Creator.findOneAndDelete({ user: user._id });

    // Delete user
    await user.deleteOne();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      message: 'Error deleting user',
      error: error.message 
    });
  }
};

// @desc    Get platform activity (recent actions)
// @route   GET /api/admin/activity
// @access  Private/Admin
export const getPlatformActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    // Recent users
    const recentUsers = await User.find()
      .select('email createdAt isEmailVerified')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Recent creators
    const recentCreators = await Creator.find()
      .select('username displayName createdAt')
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Recent tips
    const recentTips = await Tip.find()
      .select('amount status createdAt')
      .populate('creator', 'username')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      recentUsers,
      recentCreators,
      recentTips
    });
  } catch (error) {
    console.error('Platform activity error:', error);
    res.status(500).json({ 
      message: 'Error fetching platform activity',
      error: error.message 
    });
  }
};