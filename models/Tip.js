import mongoose from 'mongoose';

const tipSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Creator',
    required: true
  },
  creatorUsername: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.000001, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    default: 'XRP',
    enum: ['XRP']
  },
  transactionHash: {
    type: String,
    sparse: true, // Allow null for pending transactions
    trim: true
  },
  senderAddress: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(v);
      },
      message: 'Invalid XRP address format'
    }
  },
  message: {
    type: String,
    maxlength: [200, 'Message must be less than 200 characters'],
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending'
  },
  ledgerIndex: {
    type: Number
  },
  confirmedAt: {
    type: Date
  },
  // Redistribution fields (wallet intermédiaire)
  redistributed: {
    type: Boolean,
    default: false
  },
  redistributionTxHash: {
    type: String,
    trim: true
  },
  platformFee: {
    type: Number,
    default: 0,
    min: 0
  },
  creatorAmount: {
    type: Number, // Montant effectif reçu par le créateur (amount - platformFee)
    min: 0
  },
  totalAmount: {
    type: Number, // Montant total reçu sur le wallet plateforme (amount + platformFee)
    min: 0
  }
}, {
  timestamps: true
});

// Indexes for queries
tipSchema.index({ creator: 1, createdAt: -1 });
tipSchema.index({ creatorUsername: 1, createdAt: -1 });
tipSchema.index({ transactionHash: 1 }, { unique: true, sparse: true });
tipSchema.index({ status: 1, createdAt: -1 });

// Method to mark tip as confirmed
tipSchema.methods.confirm = function(transactionHash, ledgerIndex) {
  this.status = 'confirmed';
  this.transactionHash = transactionHash;
  this.ledgerIndex = ledgerIndex;
  this.confirmedAt = new Date();
  return this.save();
};

// Static method to get creator stats
tipSchema.statics.getCreatorStats = async function(creatorId) {
  const stats = await this.aggregate([
    {
      $match: {
        creator: new mongoose.Types.ObjectId(creatorId),
        status: 'confirmed'
      }
    },
    {
      $group: {
        _id: null,
        totalTips: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        uniqueSupporters: { $addToSet: '$senderAddress' }
      }
    },
    {
      $project: {
        _id: 0,
        totalTips: 1,
        totalAmount: 1,
        uniqueSupporters: { $size: '$uniqueSupporters' }
      }
    }
  ]);

  return stats[0] || {
    totalTips: 0,
    totalAmount: 0,
    uniqueSupporters: 0
  };
};

const Tip = mongoose.model('Tip', tipSchema);

export default Tip;