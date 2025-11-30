import xrpl from 'xrpl';
import { PLATFORM_WALLET_CONFIG, calculateBackendFees } from '../config/platformWallet.js';
import Tip from '../models/Tip.js';

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
      // Créer client XRPL
      const network = process.env.XRPL_NETWORK === 'mainnet' 
        ? 'wss://xrplcluster.com'
        : 'wss://s.altnet.rippletest.net:51233';
      
      this.client = new xrpl.Client(network);
      await this.client.connect();

      // Créer wallet à partir du secret
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
   * Redistribuer un tip reçu sur le wallet de la plateforme
   * @param {object} transaction - Transaction XRPL reçue
   * @param {string} creatorAddress - Adresse du créateur
   * @param {number} totalAmount - Montant total reçu
   * @returns {object} Résultat de la redistribution
   */
  async redistributeTip(transaction, creatorAddress, totalAmount) {
    try {
      if (!this.client || !this.wallet) {
        throw new Error('RedistributionService pas initialisé');
      }

      // Calculer les frais
      const { creatorAmount, platformFee } = calculateBackendFees(totalAmount);

      console.log('💰 Redistribution:', {
        total: totalAmount,
        creatorAmount,
        platformFee,
        creatorAddress
      });

      // Vérifier qu'on a assez de fonds (après réserve minimum)
      const accountInfo = await this.client.request({
        command: 'account_info',
        account: this.wallet.address,
        ledger_index: 'validated'
      });

      const availableBalance = Number(accountInfo.result.account_data.Balance) / 1000000;
      const requiredAmount = creatorAmount + 0.000012; // + frais transaction XRPL
      const afterBalance = availableBalance - requiredAmount;

      if (afterBalance < PLATFORM_WALLET_CONFIG.minReserve) {
        throw new Error(`Réserve insuffisante. Balance: ${availableBalance}, Requis: ${requiredAmount + PLATFORM_WALLET_CONFIG.minReserve}`);
      }

      // Préparer la transaction de paiement au créateur
      const payment = {
        TransactionType: 'Payment',
        Account: this.wallet.address,
        Destination: creatorAddress,
        Amount: xrpl.xrpToDrops(creatorAmount.toString()),
        DestinationTag: transaction.DestinationTag || undefined,
        Memos: [{
          Memo: {
            MemoData: Buffer.from('xrpTip platform redistribution').toString('hex'),
            MemoType: Buffer.from('text/plain').toString('hex')
          }
        }]
      };

      // Signer et soumettre la transaction
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
   * Vérifier et redistribuer une transaction détectée
   * @param {string} txHash - Hash de la transaction
   */
  async processIncomingTransaction(txHash) {
    try {
      // Récupérer les détails de la transaction
      const txResponse = await this.client.request({
        command: 'tx',
        transaction: txHash,
        binary: false
      });

      const tx = txResponse.result;

      // Vérifier que c'est un paiement vers notre wallet
      if (tx.TransactionType !== 'Payment') {
        console.log('⚠️ Transaction ignorée (pas un Payment)');
        return null;
      }

      if (tx.Destination !== this.wallet.address) {
        console.log('⚠️ Transaction ignorée (pas pour nous)');
        return null;
      }

      // Récupérer le montant
      const amount = Number(tx.Amount) / 1000000; // Convertir drops en XRP

      // Récupérer le DestinationTag (contient le username du créateur)
      const creatorUsername = tx.DestinationTag;

      if (!creatorUsername) {
        console.error('❌ Pas de DestinationTag - impossible de savoir pour quel créateur');
        return null;
      }

      // Récupérer l'adresse du créateur depuis la DB
      const Creator = (await import('../models/Creator.js')).default;
      const creator = await Creator.findOne({ username: creatorUsername });

      if (!creator) {
        console.error(`❌ Créateur ${creatorUsername} non trouvé`);
        return null;
      }

      // Vérifier qu'on n'a pas déjà traité cette transaction
      const existingTip = await Tip.findOne({ txHash });
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
        await existingTip.save();
      }

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

// Singleton
const redistributionService = new RedistributionService();

export default redistributionService;