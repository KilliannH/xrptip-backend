import express from 'express';
import { body, param } from 'express-validator';
import {
  verifyTransaction,
  syncCreatorTransactions,
  getCreatorBalance,
  validateXRPAddress
} from '../controllers/xrplController.js';

const router = express.Router();

// Vérifier une transaction
router.post(
  '/verify-transaction',
  [
    body('tipId').notEmpty().withMessage('Tip ID is required'),
    body('txHash')
      .notEmpty()
      .withMessage('Transaction hash is required')
      .isLength({ min: 64, max: 64 })
      .withMessage('Invalid transaction hash format')
  ],
  verifyTransaction
);

// Synchroniser les transactions d'un créateur
router.post(
  '/sync/:username',
  param('username').notEmpty().withMessage('Username is required'),
  syncCreatorTransactions
);

// Obtenir le solde XRP d'un créateur
router.get(
  '/balance/:username',
  param('username').notEmpty().withMessage('Username is required'),
  getCreatorBalance
);

// Valider une adresse XRP
router.post(
  '/validate-address',
  body('address').notEmpty().withMessage('Address is required'),
  validateXRPAddress
);

export default router;