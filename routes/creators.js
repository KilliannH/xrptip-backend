import express from 'express';
import { body } from 'express-validator';
import {
  createCreator,
  getCreatorByUsername,
  updateCreator,
  getAllCreators,
  deleteCreator,
  checkUsernameAvailability,
  getMyCreatorProfile
} from '../controllers/creatorController.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const creatorValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens and underscores'),
  body('displayName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be 1-50 characters'),
  body('bio')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Bio must be 1-200 characters'),
  body('xrpAddress')
    .trim()
    .matches(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
    .withMessage('Invalid XRP address format'),
  body('links.twitter')
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage('Invalid Twitter URL'),
  body('links.twitch')
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage('Invalid Twitch URL')
];

// Routes
router.get('/', getAllCreators);
router.get('/me/profile', protect, getMyCreatorProfile);
router.get('/check-username/:username', checkUsernameAvailability);
router.get('/:username', getCreatorByUsername);
router.post('/', protect, creatorValidation, createCreator);
router.put('/:username', protect, creatorValidation, updateCreator);
router.delete('/:username', protect, deleteCreator);

export default router;