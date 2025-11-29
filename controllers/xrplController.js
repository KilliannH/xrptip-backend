import { validationResult } from 'express-validator';
import xrplService from '../services/xrplService.js';
import Creator from '../models/Creator.js';

// @desc    Vérifier une transaction XRPL
// @route   POST /api/xrpl/verify-transaction
// @access  Public
export const verifyTransaction = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { tipId, txHash } = req.body;

    const result = await xrplService.verifyAndConfirmTip(tipId, txHash);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        details: result.details
      });
    }

    res.json({
      success: true,
      message: result.message,
      transaction: result.transaction
    });
  } catch (error) {
    console.error('Error verifying transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying transaction',
      error: error.message
    });
  }
};

// @desc    Synchroniser les transactions d'un créateur
// @route   POST /api/xrpl/sync/:username
// @access  Private (TODO: Add auth)
export const syncCreatorTransactions = async (req, res) => {
  try {
    const { username } = req.params;
    const { limit } = req.query;

    const creator = await Creator.findOne({ 
      username: username.toLowerCase() 
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    const result = await xrplService.syncCreatorTransactions(creator._id, {
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      message: 'Transactions synced successfully',
      data: result
    });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing transactions',
      error: error.message
    });
  }
};

// @desc    Obtenir le solde XRP d'un créateur
// @route   GET /api/xrpl/balance/:username
// @access  Public
export const getCreatorBalance = async (req, res) => {
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

    const balance = await xrplService.getBalance(creator.xrpAddress);

    res.json({
      success: true,
      data: {
        username: creator.username,
        address: creator.xrpAddress,
        balance: balance,
        currency: 'XRP'
      }
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    
    // Gérer le cas où le compte n'existe pas encore
    if (error.message && error.message.includes('actNotFound')) {
      return res.json({
        success: true,
        data: {
          balance: 0,
          currency: 'XRP',
          note: 'Account not activated yet'
        }
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error getting balance',
      error: error.message
    });
  }
};

// @desc    Valider une adresse XRP
// @route   POST /api/xrpl/validate-address
// @access  Public
export const validateXRPAddress = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { address } = req.body;

    const isValid = xrplService.validateAddress(address);

    res.json({
      success: true,
      data: {
        address,
        valid: isValid
      }
    });
  } catch (error) {
    console.error('Error validating address:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating address',
      error: error.message
    });
  }
};