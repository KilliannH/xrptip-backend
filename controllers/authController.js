import { validationResult } from 'express-validator';
import User from '../models/User.js';
import Creator from '../models/Creator.js';
import { sendTokenResponse, hashString } from '../utils/auth.js';

// @desc    Inscription d'un nouvel utilisateur
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Cet email est déjà utilisé'
      });
    }

    // Créer l'utilisateur
    const user = new User({
      email,
      password,
      role: 'user'
    });

    await user.save();

    // Générer un token de vérification d'email (optionnel)
    // const verificationToken = user.generateEmailVerificationToken();
    // await user.save();
    // TODO: Envoyer l'email de vérification

    // Envoyer la réponse avec le token
    sendTokenResponse(user, 201, res, 'Inscription réussie');
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription',
      error: error.message
    });
  }
};

// @desc    Connexion
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Trouver l'utilisateur (inclure le password cette fois)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Votre compte a été désactivé'
      });
    }

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // Envoyer la réponse avec le token
    sendTokenResponse(user, 200, res, 'Connexion réussie');
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion',
      error: error.message
    });
  }
};

// @desc    Obtenir l'utilisateur actuellement connecté
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('creator');

    res.json({
      success: true,
      data: user.toPublicJSON()
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Déconnexion
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 1000),
    httpOnly: true
  });

  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
};

// @desc    Mettre à jour le mot de passe
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir le mot de passe actuel et le nouveau'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe doit contenir au moins 8 caractères'
      });
    }

    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findById(req.user.id).select('+password');

    // Vérifier le mot de passe actuel
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    sendTokenResponse(user, 200, res, 'Mot de passe mis à jour');
  } catch (error) {
    console.error('Erreur lors de la mise à jour du mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du mot de passe'
    });
  }
};

// @desc    Demander la réinitialisation du mot de passe
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer le token de reset
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // TODO: Envoyer l'email avec le lien de reset
    // const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    res.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
      // En développement seulement :
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error) {
    console.error('Erreur lors de la demande de reset:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la demande de réinitialisation'
    });
  }
};

// @desc    Réinitialiser le mot de passe
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const resetToken = req.params.resetToken;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères'
      });
    }

    // Hash le token pour comparer avec celui en DB
    const hashedToken = hashString(resetToken);

    // Trouver l'utilisateur avec le token valide
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendTokenResponse(user, 200, res, 'Mot de passe réinitialisé avec succès');
  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du mot de passe'
    });
  }
};

// @desc    Lier un profil créateur à l'utilisateur
// @route   PUT /api/auth/link-creator/:creatorId
// @access  Private
export const linkCreator = async (req, res) => {
  try {
    const { creatorId } = req.params;

    // Vérifier que le créateur existe
    const creator = await Creator.findById(creatorId);

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Créateur non trouvé'
      });
    }

    // Vérifier que le créateur n'est pas déjà lié à un autre utilisateur
    const existingUser = await User.findOne({ creator: creatorId });

    if (existingUser && existingUser._id.toString() !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: 'Ce profil créateur est déjà lié à un autre compte'
      });
    }

    // Lier le créateur à l'utilisateur
    const user = await User.findById(req.user.id);
    user.creator = creatorId;
    user.role = 'creator';
    await user.save();

    res.json({
      success: true,
      message: 'Profil créateur lié avec succès',
      data: user.toPublicJSON()
    });
  } catch (error) {
    console.error('Erreur lors du lien du créateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du lien du profil créateur'
    });
  }
};