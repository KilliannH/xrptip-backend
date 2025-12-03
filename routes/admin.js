import express from 'express';
import {
  getAdminStats,
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  getPlatformActivity
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Middleware pour toutes les routes admin
const adminOnly = [protect, authorize('admin')];

// Stats routes
router.get('/stats', adminOnly, getAdminStats);
router.get('/activity', adminOnly, getPlatformActivity);

// Users routes
router.get('/users', adminOnly, getAllUsers);
router.get('/users/:id', adminOnly, getUserById);
router.put('/users/:id/role', adminOnly, updateUserRole);
router.delete('/users/:id', adminOnly, deleteUser);

export default router;