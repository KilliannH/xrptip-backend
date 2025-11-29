import express from 'express';
import { body } from 'express-validator';
import {
  createTip,
  getTipsByCreator,
  confirmTip,
  getTipStats
} from '../controllers/tipController.js';

const router = express.Router();

// Validation middleware
const tipValidation = [
  body('creatorUsername')
    .trim()
    .notEmpty()
    .withMessage('Creator username is required'),
  body('amount')
    .isFloat({ min: 0.000001 })
    .withMessage('Amount must be greater than 0'),
  body('senderAddress')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
    .withMessage('Invalid XRP address format'),
  body('message')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Message must be less than 200 characters')
];

// Routes
router.post('/', tipValidation, createTip);
router.get('/creator/:username', getTipsByCreator);
router.get('/stats/:username', getTipStats);
router.put('/:tipId/confirm', confirmTip);

export default router;