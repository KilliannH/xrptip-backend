import xrplClient from './xrplClient.js';
import Tip from '../models/Tip.js';
import Creator from '../models/Creator.js';
import redistributionService from './redistributionService.js';
import { PLATFORM_WALLET_CONFIG } from '../config/platformWallet.js';

/**
 * Service pour gérer les transactions XRPL
 */
class XRPLService {
  constructor() {
    this.platformWalletSubscription = null;
  }

  /**
   * Initialiser le service et connecter au réseau XRPL
   */
  async initialize() {
    try {
      await xrplClient.connect();
      console.log('✅ XRPL Service initialized');

      // Initialiser le service de redistribution
      await redistributionService.initialize();

      // Commencer à surveiller le wallet de la plateforme
      await this.monitorPlatformWallet();
    } catch (error) {
      console.error('❌ Failed to initialize XRPL Service:', error);
      throw error;
    }
  }

  /**
   * Surveiller les paiements entrants vers le wallet de la plateforme
   */
  async monitorPlatformWallet() {
    try {
      const platformAddress = PLATFORM_WALLET_CONFIG.address;
      
      if (!platformAddress || platformAddress === 'rPlatformWalletHere123456789') {
        console.warn('⚠️ Platform wallet not configured - skipping monitoring');
        return;
      }

      console.log(`👀 Monitoring platform wallet: ${platformAddress}`);

      // S'abonner aux paiements vers le wallet plateforme
      this.platformWalletSubscription = await xrplClient.subscribeToPayments(
        platformAddress,
        async (payment) => {
          console.log('💰 Platform wallet received payment:', payment);

          try {
            // Extraire le destinationTag (ID numérique du créateur)
            const destinationTag = payment.destinationTag;

            if (!destinationTag) {
              console.error('❌ No DestinationTag - cannot identify creator');
              // Enregistrer quand même le tip comme "non attribué"
              const unassignedTip = new Tip({
                creator: null,
                creatorUsername: 'unknown',
                totalAmount: payment.amount,
                amount: payment.amount,
                senderAddress: payment.from,
                status: 'confirmed',
                transactionHash: payment.hash,
                ledgerIndex: payment.ledgerIndex,
                confirmedAt: new Date(),
                redistributed: false,
                platformFee: 0,
                creatorAmount: 0
              });
              await unassignedTip.save();
              return;
            }

            // Récupérer le créateur par destinationTag
            const creator = await Creator.findOne({ destinationTag: destinationTag });

            if (!creator) {
              console.error(`❌ Creator with destinationTag ${destinationTag} not found`);
              return;
            }

            // Vérifier si le tip existe déjà
            const existingTip = await Tip.findOne({ transactionHash: payment.hash });
            
            if (existingTip) {
              console.log('⚠️ Tip already processed:', payment.hash);
              return;
            }

            // Calculer les montants (backend calcule à partir du total reçu)
            const { calculateBackendFees } = await import('../config/platformWallet.js');
            const { creatorAmount, platformFee } = calculateBackendFees(payment.amount);

            // Créer le tip en DB
            const tip = new Tip({
              creator: creator._id,
              creatorUsername: creator.username,
              totalAmount: payment.amount,
              amount: creatorAmount, // Montant pour le créateur
              platformFee: platformFee,
              creatorAmount: creatorAmount,
              senderAddress: payment.from,
              status: 'confirmed',
              transactionHash: payment.hash,
              ledgerIndex: payment.ledgerIndex,
              confirmedAt: new Date(),
              redistributed: false
            });

            await tip.save();

            console.log(`✅ Tip recorded: ${payment.amount} XRP (creator: ${creatorAmount}, fee: ${platformFee})`);

            // Déclencher la redistribution automatique
            try {
              const redistribution = await redistributionService.redistributeTip(
                payment,
                creator.xrpAddress,
                payment.amount
              );

              // Mettre à jour le tip avec les infos de redistribution
              tip.redistributed = true;
              tip.redistributionTxHash = redistribution.txHash;
              await tip.save();

              // Mettre à jour les stats du créateur
              const stats = await Tip.getCreatorStats(creator._id);
              creator.stats = stats;
              await creator.save();

              console.log(`✅ Redistribution complete: ${redistribution.txHash}`);
            } catch (redistError) {
              console.error('❌ Redistribution failed:', redistError);
              // Le tip reste en DB avec redistributed: false
              // Peut être retraité manuellement plus tard
            }

          } catch (error) {
            console.error('❌ Error processing platform wallet payment:', error);
          }
        }
      );

      console.log('✅ Platform wallet monitoring active');

    } catch (error) {
      console.error('❌ Error monitoring platform wallet:', error);
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
      console.log(`📍 XRP Address: ${creator.xrpAddress}`);

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

      console.log(`📊 Found ${transactions.length} transactions to process`);

      for (const txData of transactions) {
        try {
          // La structure de réponse utilise tx_json au lieu de tx
          if (!txData || (!txData.tx && !txData.tx_json)) {
            console.warn('⚠️ Invalid transaction data - no tx or tx_json field');
            continue;
          }

          // Utiliser tx_json si disponible, sinon tx (compatibilité)
          const tx = txData.tx_json || txData.tx;
          
          // Ignorer si ce n'est pas un paiement entrant
          if (tx.TransactionType !== 'Payment' || 
              tx.Destination !== creator.xrpAddress ||
              txData.meta?.TransactionResult !== 'tesSUCCESS') {
            console.log(`⏭️ Skipping tx: Type=${tx.TransactionType}, Dest=${tx.Destination}, Result=${txData.meta?.TransactionResult}`);
            continue;
          }

          const txHash = txData.hash; // Le hash est au niveau racine de txData
          
          // Utiliser DeliverMax ou Amount pour le montant
          const amountDrops = tx.DeliverMax || tx.Amount;
          const amount = xrplClient.dropsToXrp(amountDrops);
          const senderAddress = tx.Account;

          console.log(`💰 Processing payment: ${amount} XRP from ${senderAddress}`);

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
              ledgerIndex: txData.ledger_index,
              confirmedAt: xrplClient.rippleTimeToDate(tx.date)
            });

            await tip.save();
            newTips++;
            console.log(`✅ Created new tip: ${txHash}`);
          } else if (existingTip.status === 'pending') {
            // Confirmer un tip existant
            await existingTip.confirm(txHash, txData.ledger_index);
            updatedTips++;
            console.log(`🔄 Updated existing tip: ${txHash}`);
          } else {
            console.log(`⏭️ Tip already exists and confirmed: ${txHash}`);
          }
        } catch (txError) {
          console.error('❌ Error processing transaction:', txError);
          // Continue avec la prochaine transaction
          continue;
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

  /**
   * Arrêter tous les monitorings
   */
  async shutdown() {
    if (this.platformWalletSubscription) {
      await this.platformWalletSubscription();
      console.log('✅ Platform wallet monitoring stopped');
    }
    
    await redistributionService.disconnect();
  }
}

// Singleton instance
const xrplService = new XRPLService();

export default xrplService;