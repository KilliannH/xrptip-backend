import mongoose from 'mongoose';

const creatorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
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
  walletType: {
    type: String,
    enum: ['personal', 'exchange'],
    default: 'personal'
  },
  destinationTag: {
    type: Number,
    default: null,
    min: 0,
    max: 4294967295
  },
  userDestinationTag: {
    type: Number,
    default: null,
    min: 0,
    max: 4294967295,
    validate: {
      validator: function(v) {
        if (v === null || v === undefined) return true;
        return Number.isInteger(v) && v >= 0 && v <= 4294967295;
      },
      message: 'Invalid destination tag'
    }
  },
  // ✅ Historique des wallets
  walletHistory: [{
    xrpAddress: String,
    walletType: String,
    destinationTag: Number,
    userDestinationTag: Number,
    activeFrom: {
      type: Date,
      default: Date.now
    },
    activeTo: {
      type: Date,
      default: null
    }
  }],
  theme: {
    type: {
      name: {
        type: String,
        enum: ['blue', 'red', 'green', 'yellow', 'orange', 'white', 'gray', 'purple', 'pink', 'cyan', 'custom'],
        default: 'blue'
      },
      customColor: {
        type: String,
        default: null,
        validate: {
          validator: function(v) {
            if (!v) return true;
            // Valider format hex color
            return /^#[0-9A-F]{6}$/i.test(v);
          },
          message: 'Invalid hex color format (use #RRGGBB)'
        }
      }
    },
    default: () => ({ name: 'blue', customColor: null })
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
    youtube: {
      type: String,
      default: '',
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/(www\.)?youtube\.com\/(c\/|channel\/|@)?[a-zA-Z0-9_-]+\/?$/.test(v);
        },
        message: 'Invalid YouTube URL'
      }
    },
    tiktok: {
      type: String,
      default: '',
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+\/?$/.test(v);
        },
        message: 'Invalid TikTok URL'
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
  timestamps: true
});

// Index for faster queries
creatorSchema.index({ username: 1 }, { unique: true });
creatorSchema.index({ createdAt: -1 });
creatorSchema.index({ destinationTag: 1 });

// Virtual for profile URL
creatorSchema.virtual('profileUrl').get(function() {
  return `/u/${this.username}`;
});

// ✅ Méthode pour obtenir tous les destination tags valides (historique + actuel)
creatorSchema.methods.getAllValidDestinationTags = function() {
  const tags = [];
  
  // Tag actuel
  const currentTag = this.walletType === 'exchange' 
    ? this.userDestinationTag 
    : this.destinationTag;
  
  if (currentTag !== null && currentTag !== undefined) {
    tags.push(currentTag);
  }

  // Tags historiques
  if (this.walletHistory && this.walletHistory.length > 0) {
    this.walletHistory.forEach(wallet => {
      const historicalTag = wallet.walletType === 'exchange'
        ? wallet.userDestinationTag
        : wallet.destinationTag;
      
      if (historicalTag !== null && historicalTag !== undefined && !tags.includes(historicalTag)) {
        tags.push(historicalTag);
      }
    });
  }

  return tags;
};

// ✅ Méthode pour obtenir le destination tag actuel
creatorSchema.methods.getCurrentDestinationTag = function() {
  return this.walletType === 'exchange' 
    ? this.userDestinationTag 
    : this.destinationTag;
};

// ✅ Pre-save hook pour gérer l'historique et générer le destinationTag
creatorSchema.pre('save', async function(next) {
  // Générer destinationTag pour nouveaux créateurs (wallet personal)
  if (this.isNew && this.walletType === 'personal' && !this.destinationTag) {
    const idHex = this._id.toString().slice(-8);
    this.destinationTag = parseInt(idHex, 16) % 4294967295;
  }

  // Si le wallet a changé (pas un nouveau document)
  if (!this.isNew && (this.isModified('xrpAddress') || this.isModified('walletType') || this.isModified('userDestinationTag'))) {
    // Récupérer l'ancien état du document
    const oldCreator = await this.constructor.findById(this._id);
    
    if (oldCreator) {
      // Fermer tous les wallets actifs dans l'historique
      if (this.walletHistory) {
        this.walletHistory.forEach(wallet => {
          if (wallet.activeTo === null) {
            wallet.activeTo = new Date();
          }
        });
      } else {
        this.walletHistory = [];
      }

      // Ajouter l'ancien wallet à l'historique
      this.walletHistory.push({
        xrpAddress: oldCreator.xrpAddress,
        walletType: oldCreator.walletType,
        destinationTag: oldCreator.destinationTag,
        userDestinationTag: oldCreator.userDestinationTag,
        activeFrom: oldCreator.updatedAt || oldCreator.createdAt,
        activeTo: new Date()
      });

      console.log(`📝 Wallet changed for ${this.username}: Added to history`);
    }
  }

  next();
});

// Method to safely return public profile data
creatorSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id,
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    xrpAddress: this.xrpAddress,
    destinationTag: this.getCurrentDestinationTag(),
    avatarUrl: this.avatarUrl,
    bannerUrl: this.bannerUrl,
    theme: this.theme,
    links: this.links,
    stats: this.stats,
    createdAt: this.createdAt
  };
};

const Creator = mongoose.model('Creator', creatorSchema);

export default Creator;