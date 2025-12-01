import { validationResult } from 'express-validator';
import User from '../models/User.js';
import Creator from '../models/Creator.js';
import { sendTokenResponse, hashString } from '../utils/auth.js';
import emailService from '../services/emailService.js';

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
      role: 'user',
      isEmailVerified: false
    });

    // Générer le code de vérification
    const verificationCode = user.generateEmailVerificationCode();
    await user.save();

    // Envoyer l'email de vérification
    try {
      await emailService.sendVerificationCode(email, verificationCode, email.split('@')[0]);
      console.log(`✅ Code de vérification envoyé à ${email}: ${verificationCode}`);
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
      // On continue quand même l'inscription
    }

    // Retourner succès SANS token JWT
    // L'utilisateur doit d'abord vérifier son email
    res.status(201).json({
      success: true,
      message: 'Inscription réussie. Veuillez vérifier votre email.',
      data: {
        email: user.email,
        requiresVerification: true
      }
    });
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

    // Vérifier si l'email est vérifié
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Veuillez vérifier votre email avant de vous connecter',
        requiresVerification: true,
        email: user.email
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

// @desc    Vérifier l'email avec le code
// @route   POST /api/auth/verify-email
// @access  Public
export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email et code requis'
      });
    }

    // Trouver l'utilisateur avec le code
    const user = await User.findOne({ 
      email,
      emailVerificationCode: code,
      emailVerificationExpires: { $gt: Date.now() }
    }).select('+emailVerificationCode');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Code invalide ou expiré'
      });
    }

    // Vérifier l'email
    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Envoyer email de bienvenue
    try {
      await emailService.sendWelcomeEmail(user.email, user.email.split('@')[0]);
    } catch (emailError) {
      console.error('❌ Erreur envoi email bienvenue:', emailError);
    }

    // Envoyer le token JWT
    sendTokenResponse(user, 200, res, 'Email vérifié avec succès');
  } catch (error) {
    console.error('Erreur lors de la vérification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de l\'email'
    });
  }
};

// @desc    Renvoyer le code de vérification
// @route   POST /api/auth/resend-verification
// @access  Public
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Ne pas révéler si l'email existe
      return res.json({
        success: true,
        message: 'Si cet email existe, un nouveau code a été envoyé'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email déjà vérifié'
      });
    }

    // Générer un nouveau code
    const verificationCode = user.generateEmailVerificationCode();
    await user.save();

    // Envoyer l'email
    try {
      await emailService.sendVerificationCode(email, verificationCode, email.split('@')[0]);
      console.log(`✅ Nouveau code envoyé à ${email}: ${verificationCode}`);
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      });
    }

    res.json({
      success: true,
      message: 'Nouveau code de vérification envoyé'
    });
  } catch (error) {
    console.error('Erreur lors du renvoi:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du renvoi du code'
    });
  }
};