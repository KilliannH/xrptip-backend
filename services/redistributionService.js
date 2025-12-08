import xrpl from 'xrpl';
import { PLATFORM_WALLET_CONFIG, calculateBackendFees } from '../config/platformWallet.js';
import Tip from '../models/Tip.js';
import Creator from '../models/Creator.js';

class RedistributionService {
  constructor() {
    this.client = null;
    this.wallet = null;
  }

  /**
   * Initialiser le client XRPL et le wallet
   */
  async initialize() {
    try {
      const network = process.env.XRPL_NETWORK === 'mainnet' 
        ? 'wss://xrplcluster.com'
        : 'wss://s.altnet.rippletest.net:51233';
      
      this.client = new xrpl.Client(network);
      await this.client.connect();

      if (!PLATFORM_WALLET_CONFIG.secret) {
        throw new Error('PLATFORM_WALLET_SECRET manquant dans .env');
      }

      this.wallet = xrpl.Wallet.fromSeed(PLATFORM_WALLET_CONFIG.secret);
      
      console.log('✅ RedistributionService initialisé');
      console.log(`📍 Platform Wallet: ${this.wallet.address}`);
      console.log(`🌐 Network: ${process.env.XRPL_NETWORK || 'testnet'}`);

      return true;
    } catch (error) {
      console.error('❌ Erreur initialisation RedistributionService:', error);
      return false;
    }
  }

  /**
   * ✅ Trouver un créateur par destination tag (supporte l'historique)
   */
  async findCreatorByDestinationTag(destinationTag) {
    try {
      // Chercher d'abord dans les destination tags actuels
      let creator = await Creator.findOne({
        $or: [
          { destinationTag: destinationTag, walletType: 'personal' },
          { userDestinationTag: destinationTag, walletType: 'exchange' }
        ]
      });

      if (creator) {
        return creator;
      }

      // Si pas trouvé, chercher dans l'historique
      creator = await Creator.findOne({
        'walletHistory': {
          $elemMatch: {
            $or: [
              { destinationTag: destinationTag, walletType: 'personal' },
              { userDestinationTag: destinationTag, walletType: 'exchange' }
            ]
          }
        }
      });

      return creator;
    } catch (error) {
      console.error('Error finding creator by destination tag:', error);
      return null;
    }
  }

  /**
   * Redistribuer un tip reçu sur le wallet de la plateforme
   */
  async redistributeTip(transaction, creatorAddress, totalAmount) {
    try {
      if (!this.client || !this.wallet) {
        throw new Error('RedistributionService pas initialisé');
      }

      const { creatorAmount, platformFee } = calculateBackendFees(totalAmount);

      console.log('💰 Redistribution:', {
        total: totalAmount,
        creatorAmount,
        platformFee,
        creatorAddress,
        destinationTag: transaction.destinationTag // ✅ Logger le tag
      });

      // Vérifier le solde
      const accountInfo = await this.client.request({
        command: 'account_info',
        account: this.wallet.address,
        ledger_index: 'validated'
      });

      const availableBalance = Number(accountInfo.result.account_data.Balance) / 1000000;
      const requiredAmount = creatorAmount + 0.000012;
      const afterBalance = availableBalance - requiredAmount;

      if (afterBalance < PLATFORM_WALLET_CONFIG.minReserve) {
        throw new Error(`Réserve insuffisante. Balance: ${availableBalance}, Requis: ${requiredAmount + PLATFORM_WALLET_CONFIG.minReserve}`);
      }

      // Préparer la transaction
      const payment = {
        TransactionType: 'Payment',
        Account: this.wallet.address,
        Destination: creatorAddress,
        Amount: xrpl.xrpToDrops(creatorAmount.toString()),
        DestinationTag: transaction.DestinationTag || undefined,
        Memos: [{
          Memo: {
            MemoData: Buffer.from(`xrpTip redistribution - Original tag: ${transaction.destinationTag || 'none'}`).toString('hex'),
            MemoType: Buffer.from('text/plain').toString('hex')
          }
        }]
      };

      // Signer et soumettre
      const prepared = await this.client.autofill(payment);
      const signed = this.wallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Transaction échouée: ${result.result.meta.TransactionResult}`);
      }

      console.log('✅ Redistribution réussie:', {
        hash: result.result.hash,
        creatorAmount: `${creatorAmount} XRP`,
        platformFee: `${platformFee} XRP`
      });

      return {
        success: true,
        txHash: result.result.hash,
        creatorAmount,
        platformFee,
        ledgerIndex: result.result.ledger_index
      };

    } catch (error) {
      console.error('❌ Erreur redistribution:', error);
      throw error;
    }
  }

  /**
   * ✅ Vérifier et redistribuer une transaction détectée
   */
  async processIncomingTransaction(txHash) {
    try {
      const txResponse = await this.client.request({
        command: 'tx',
        transaction: txHash,
        binary: false
      });

      const tx = txResponse.result;

      if (tx.TransactionType !== 'Payment') {
        console.log('⚠️ Transaction ignorée (pas un Payment)');
        return null;
      }

      if (tx.Destination !== this.wallet.address) {
        console.log('⚠️ Transaction ignorée (pas pour nous)');
        return null;
      }

      const amount = Number(tx.Amount) / 1000000;
      const destinationTag = tx.DestinationTag;

      if (!destinationTag) {
        console.error('❌ Pas de DestinationTag - impossible de savoir pour quel créateur');
        return null;
      }

      // ✅ Chercher le créateur par destination tag (supporte l'historique)
      const creator = await this.findCreatorByDestinationTag(destinationTag);

      if (!creator) {
        console.error(`❌ Créateur avec tag ${destinationTag} non trouvé`);
        return null;
      }

      // Vérifier qu'on n'a pas déjà traité cette transaction
      const existingTip = await Tip.findOne({ transactionHash: txHash });
      if (existingTip && existingTip.redistributed) {
        console.log('⚠️ Transaction déjà redistribuée');
        return null;
      }

      // Redistribuer au créateur
      const redistribution = await this.redistributeTip(tx, creator.xrpAddress, amount);

      // Mettre à jour le tip dans la DB
      if (existingTip) {
        existingTip.redistributed = true;
        existingTip.redistributionTxHash = redistribution.txHash;
        existingTip.platformFee = redistribution.platformFee;
        existingTip.creatorAmount = redistribution.creatorAmount;
        existingTip.destinationTag = destinationTag; // ✅ Enregistrer le tag
        await existingTip.save();
      }

      // ✅ Mettre à jour les stats avec tous les tags valides
      const validDestinationTags = creator.getAllValidDestinationTags();
      const allTips = await Tip.find({
        creator: creator._id,
        destinationTag: { $in: validDestinationTags },
        status: 'confirmed'
      }).lean();

      creator.stats.totalTips = allTips.length;
      creator.stats.totalAmount = allTips.reduce((sum, t) => sum + t.amount, 0);
      creator.stats.uniqueSupporters = [...new Set(allTips.map(t => t.senderAddress))].length;
      await creator.save();

      return redistribution;

    } catch (error) {
      console.error('❌ Erreur processIncomingTransaction:', error);
      throw error;
    }
  }

  /**
   * Déconnecter le client
   */
  async disconnect() {
    if (this.client && this.client.isConnected()) {
      await this.client.disconnect();
      console.log('✅ RedistributionService déconnecté');
    }
  }
}

const redistributionService = new RedistributionService();

export default redistributionService;