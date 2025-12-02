import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Ne pas inclure le mot de passe dans les requêtes par défaut
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Creator',
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'creator', 'admin'],
    default: 'user'
  },
  resetPasswordToken: { type: String},
  resetPasswordExpires: { type: Date},
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: {
    type: String,
    select: false // Ne pas inclure dans les queries par défaut
  },
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index pour les recherches
userSchema.index({ email: 1 });
userSchema.index({ creator: 1 });

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function(next) {
  // Ne hasher que si le mot de passe a été modifié
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Méthode pour obtenir les données publiques de l'utilisateur
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    email: this.email,
    role: this.role,
    creator: this.creator,
    isEmailVerified: this.isEmailVerified,
    createdAt: this.createdAt
  };
};

// Méthode pour générer un code de vérification d'email (6 chiffres)
userSchema.methods.generateEmailVerificationCode = function() {
  // Générer un code à 6 chiffres
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.emailVerificationCode = code;
  this.emailVerificationExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  return code;
};

// Méthode pour générer un token de reset de mot de passe
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 heure
  
  return token;
};

const User = mongoose.model('User', userSchema);

export default User;