import xrplClient from './xrplClient.js';
import Tip from '../models/Tip.js';
import Creator from '../models/Creator.js';

/**
 * Service pour gérer les transactions XRPL
 */
class XRPLService {
  /**
   * Initialiser le service et connecter au réseau XRPL
   */
  async initialize() {
    try {
      await xrplClient.connect();
      console.log('✅ XRPL Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize XRPL Service:', error);
      throw error;
    }
  }

  /**
   * Vérifier et confirmer une transaction
   */
  async verifyAndConfirmTip(tipId, txHash) {
    try {
      // Récupérer le tip depuis la base de données
      const tip = await Tip.findById(tipId).populate('creator');
      
      if (!tip) {
        throw new Error('Tip not found');
      }

      if (tip.status === 'confirmed') {
        return {
          success: false,
          message: 'Tip already confirmed'
        };
      }

      // Vérifier la transaction sur XRPL
      const verification = await xrplClient.verifyPayment(
        txHash,
        tip.creator.xrpAddress,
        tip.amount
      );

      if (!verification.valid) {
        // Transaction invalide
        tip.status = 'failed';
        await tip.save();

        return {
          success: false,
          message: verification.reason,
          details: verification
        };
      }

      // Transaction valide - confirmer le tip
      await tip.confirm(
        verification.transaction.hash,
        verification.transaction.ledgerIndex
      );

      // Mettre à jour les stats du créateur
      const creator = await Creator.findById(tip.creator);
      if (creator) {
        const stats = await Tip.getCreatorStats(creator._id);
        creator.stats = stats;
        await creator.save();
      }

      return {
        success: true,
        message: 'Tip confirmed successfully',
        transaction: verification.transaction
      };
    } catch (error) {
      console.error('Error verifying tip:', error);
      throw error;
    }
  }

  /**
   * Surveiller les paiements entrants pour un créateur
   */
  async monitorCreatorPayments(creatorId) {
    try {
      const creator = await Creator.findById(creatorId);
      
      if (!creator) {
        throw new Error('Creator not found');
      }

      console.log(`👀 Monitoring payments for ${creator.username} (${creator.xrpAddress})`);

      // S'abonner aux paiements
      const unsubscribe = await xrplClient.subscribeToPayments(
        creator.xrpAddress,
        async (payment) => {
          console.log('💰 New payment received:', payment);

          // Créer un nouveau tip confirmé
          const tip = new Tip({
            creator: creator._id,
            creatorUsername: creator.username,
            amount: payment.amount,
            senderAddress: payment.from,
            status: 'confirmed',
            transactionHash: payment.hash,
            ledgerIndex: payment.ledgerIndex,
            confirmedAt: new Date()
          });

          await tip.save();

          // Mettre à jour les stats
          const stats = await Tip.getCreatorStats(creator._id);
          creator.stats = stats;
          await creator.save();

          console.log(`✅ Tip recorded for ${creator.username}: ${payment.amount} XRP`);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error monitoring payments:', error);
      throw error;
    }
  }

  /**
   * Synchroniser l'historique des transactions pour un créateur
   */
  async syncCreatorTransactions(creatorId, options = {}) {
    try {
      const creator = await Creator.findById(creatorId);
      
      if (!creator) {
        throw new Error('Creator not found');
      }

      console.log(`🔄 Syncing transactions for ${creator.username}...`);

      // Récupérer les transactions
      const transactions = await xrplClient.getAccountTransactions(
        creator.xrpAddress,
        {
          limit: options.limit || 50,
          forward: false // Plus récentes en premier
        }
      );

      let newTips = 0;
      let updatedTips = 0;

      for (const txData of transactions) {
        const tx = txData.tx;
        
        // Ignorer si ce n'est pas un paiement entrant
        if (tx.TransactionType !== 'Payment' || 
            tx.Destination !== creator.xrpAddress ||
            txData.meta?.TransactionResult !== 'tesSUCCESS') {
          continue;
        }

        const txHash = tx.hash;
        const amount = xrplClient.dropsToXrp(tx.Amount);
        const senderAddress = tx.Account;

        // Vérifier si ce tip existe déjà
        const existingTip = await Tip.findOne({ transactionHash: txHash });

        if (!existingTip) {
          // Créer un nouveau tip
          const tip = new Tip({
            creator: creator._id,
            creatorUsername: creator.username,
            amount,
            senderAddress,
            status: 'confirmed',
            transactionHash: txHash,
            ledgerIndex: txData.tx.ledger_index,
            confirmedAt: xrplClient.rippleTimeToDate(tx.date)
          });

          await tip.save();
          newTips++;
        } else if (existingTip.status === 'pending') {
          // Confirmer un tip existant
          await existingTip.confirm(txHash, txData.tx.ledger_index);
          updatedTips++;
        }
      }

      // Mettre à jour les stats
      const stats = await Tip.getCreatorStats(creator._id);
      creator.stats = stats;
      await creator.save();

      console.log(`✅ Sync complete: ${newTips} new tips, ${updatedTips} updated`);

      return {
        newTips,
        updatedTips,
        totalProcessed: transactions.length
      };
    } catch (error) {
      console.error('Error syncing transactions:', error);
      throw error;
    }
  }

  /**
   * Vérifier si une adresse XRP a reçu un paiement récent
   */
  async checkRecentPayment(address, fromAddress, amount, timeWindow = 300000) {
    try {
      // Récupérer les transactions récentes
      const transactions = await xrplClient.getAccountTransactions(address, {
        limit: 20
      });

      const now = Date.now();

      for (const txData of transactions) {
        const tx = txData.tx;
        
        if (tx.TransactionType !== 'Payment' || 
            tx.Destination !== address ||
            txData.meta?.TransactionResult !== 'tesSUCCESS') {
          continue;
        }

        const txAmount = xrplClient.dropsToXrp(tx.Amount);
        const txTime = xrplClient.rippleTimeToDate(tx.date).getTime();
        const txFrom = tx.Account;

        // Vérifier si ça correspond
        if (Math.abs(txAmount - amount) < 0.000001 && 
            txFrom === fromAddress &&
            (now - txTime) < timeWindow) {
          return {
            found: true,
            transaction: {
              hash: tx.hash,
              amount: txAmount,
              from: txFrom,
              date: xrplClient.rippleTimeToDate(tx.date)
            }
          };
        }
      }

      return { found: false };
    } catch (error) {
      console.error('Error checking recent payment:', error);
      throw error;
    }
  }

  /**
   * Obtenir le solde XRP d'une adresse
   */
  async getBalance(address) {
    try {
      const accountInfo = await xrplClient.getAccountInfo(address);
      return xrplClient.dropsToXrp(accountInfo.account_data.Balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Valider une adresse XRP
   */
  validateAddress(address) {
    return xrplClient.isValidAddress(address);
  }
}

// Singleton instance
const xrplService = new XRPLService();

export default xrplService;