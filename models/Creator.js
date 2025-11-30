import mongoose from 'mongoose';

const creatorSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username must be less than 30 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens and underscores']
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: [50, 'Display name must be less than 50 characters']
  },
  bio: {
    type: String,
    required: [true, 'Bio is required'],
    trim: true,
    maxlength: [200, 'Bio must be less than 200 characters']
  },
  xrpAddress: {
    type: String,
    required: [true, 'XRP address is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(v);
      },
      message: 'Invalid XRP address format'
    }
  },
  destinationTag: {
    type: Number,
    required: true,
    unique: true,
    min: 0,
    max: 4294967295 // Max uint32
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  bannerUrl: {
    type: String,
    default: ''
  },
  links: {
    twitter: {
      type: String,
      default: '',
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/.test(v);
        },
        message: 'Invalid Twitter/X URL'
      }
    },
    twitch: {
      type: String,
      default: '',
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+\/?$/.test(v);
        },
        message: 'Invalid Twitch URL'
      }
    }
  },
  stats: {
    totalTips: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    uniqueSupporters: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Index for faster queries
creatorSchema.index({ username: 1 }, { unique: true });
creatorSchema.index({ createdAt: -1 });

// Virtual for profile URL
creatorSchema.virtual('profileUrl').get(function() {
  return `/u/${this.username}`;
});

// Pre-save hook pour générer le destinationTag automatiquement
creatorSchema.pre('save', async function(next) {
  // Générer destinationTag seulement si c'est un nouveau document
  if (this.isNew && !this.destinationTag) {
    // Convertir les 8 derniers caractères de l'ObjectId en nombre
    const idHex = this._id.toString().slice(-8);
    this.destinationTag = parseInt(idHex, 16) % 4294967295;
  }
  next();
});

// Method to safely return public profile data
creatorSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id, // Inclure l'ID pour le frontend
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    xrpAddress: this.xrpAddress,
    destinationTag: this.destinationTag, // Inclure pour le QR code
    avatarUrl: this.avatarUrl,
    bannerUrl: this.bannerUrl,
    links: this.links,
    stats: this.stats,
    createdAt: this.createdAt
  };
};

const Creator = mongoose.model('Creator', creatorSchema);

export default Creator;