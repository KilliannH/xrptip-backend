import jwt from 'jsonwebtoken';

/**
 * Générer un token JWT
 */
export const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Générer un refresh token
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

/**
 * Vérifier un token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Token invalide');
  }
};

/**
 * Décoder un token sans vérification
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Envoyer un token dans un cookie
 */
export const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  // Générer le token
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Options pour le cookie
  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    sameSite: 'strict'
  };

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      message,
      token,
      refreshToken,
      user: user.toPublicJSON()
    });
};

/**
 * Hash une chaîne avec SHA256
 */
export const hashString = (str) => {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
};