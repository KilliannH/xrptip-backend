import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware pour protéger les routes (authentification requise)
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    // Récupérer le token depuis le header Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé - Token manquant'
      });
    }

    try {
      // Vérifier le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Récupérer l'utilisateur depuis la base de données
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Non autorisé - Utilisateur non trouvé'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé'
        });
      }

      // Ajouter l'utilisateur à la requête
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé - Token invalide'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Middleware pour vérifier le rôle de l'utilisateur
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé - Privilèges insuffisants'
      });
    }

    next();
  };
};

/**
 * Middleware pour vérifier que l'utilisateur est le propriétaire de la ressource
 */
export const isOwner = (resourceUserIdField = 'user') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    // Vérifier si l'utilisateur est admin
    if (req.user.role === 'admin') {
      return next();
    }

    // Vérifier si l'utilisateur est le propriétaire
    const resourceUserId = req[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé - Vous n\'êtes pas le propriétaire'
      });
    }

    next();
  };
};

/**
 * Middleware optionnel - ajoute l'utilisateur si authentifié, sinon continue
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Token invalide, on continue sans utilisateur
      }
    }

    next();
  } catch (error) {
    next();
  }
};