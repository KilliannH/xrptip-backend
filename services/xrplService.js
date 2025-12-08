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
            // Extraire le destinationTag
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
                destinationTag: null,
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

            // ✅ Récupérer le créateur par destinationTag (recherche dans tous les tags valides)
            const creator = await this.findCreatorByDestinationTag(destinationTag);

            if (!creator) {
              console.error(`❌ Creator with destinationTag ${destinationTag} not found`);
              // Enregistrer comme non attribué
              const unassignedTip = new Tip({
                creator: null,
                creatorUsername: 'unknown',
                totalAmount: payment.amount,
                amount: payment.amount,
                senderAddress: payment.from,
                destinationTag: destinationTag,
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

            // Vérifier si le tip existe déjà
            const existingTip = await Tip.findOne({ transactionHash: payment.hash });
            
            if (existingTip) {
              console.log('⚠️ Tip already processed:', payment.hash);
              return;
            }

            // Calculer les montants
            const { calculateBackendFees } = await import('../config/platformWallet.js');
            const { creatorAmount, platformFee } = calculateBackendFees(payment.amount);

            // Créer le tip en DB
            const tip = new Tip({
              creator: creator._id,
              creatorUsername: creator.username,
              totalAmount: payment.amount,
              amount: creatorAmount,
              platformFee: platformFee,
              creatorAmount: creatorAmount,
              senderAddress: payment.from,
              destinationTag: destinationTag, // ✅ Enregistrer le tag utilisé
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

              // Mettre à jour le tip
              tip.redistributed = true;
              tip.redistributionTxHash = redistribution.txHash;
              await tip.save();

              // ✅ Mettre à jour les stats avec tous les destination tags valides
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

              console.log(`✅ Redistribution complete: ${redistribution.txHash}`);
            } catch (redistError) {
              console.error('❌ Redistribution failed:', redistError);
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
   * Vérifier et confirmer une transaction
   */
  async verifyAndConfirmTip(tipId, txHash) {
    try {
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

      const creator = await Creator.findById(tip.creator);
      if (!creator) {
        throw new Error('Creator not found');
      }

      // ✅ Récupérer tous les destination tags valides
      const validDestinationTags = creator.getAllValidDestinationTags();

      // Vérifier la transaction sur XRPL
      const verification = await xrplClient.verifyPayment(
        txHash,
        creator.xrpAddress,
        tip.amount
      );

      if (!verification.valid) {
        tip.status = 'failed';
        await tip.save();

        return {
          success: false,
          message: verification.reason,
          details: verification
        };
      }

      // ✅ Vérifier le destination tag
      const txDestinationTag = verification.transaction.destinationTag;
      if (txDestinationTag && !validDestinationTags.includes(txDestinationTag)) {
        tip.status = 'failed';
        await tip.save();

        return {
          success: false,
          message: `Invalid destination tag. Expected one of: ${validDestinationTags.join(', ')}, Got: ${txDestinationTag}`,
          details: verification
        };
      }

      // Transaction valide - confirmer le tip
      await tip.confirm(
        verification.transaction.hash,
        verification.transaction.ledgerIndex
      );

      // ✅ Enregistrer le destination tag utilisé
      tip.destinationTag = txDestinationTag;
      await tip.save();

      // ✅ Mettre à jour les stats avec tous les tags valides
      const allTips = await Tip.find({
        creator: creator._id,
        destinationTag: { $in: validDestinationTags },
        status: 'confirmed'
      }).lean();

      creator.stats.totalTips = allTips.length;
      creator.stats.totalAmount = allTips.reduce((sum, t) => sum + t.amount, 0);
      creator.stats.uniqueSupporters = [...new Set(allTips.map(t => t.senderAddress))].length;
      await creator.save();

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
   * Synchroniser l'historique des transactions pour un créateur
   */
  async syncCreatorTransactions(creator, options = {}) {
    try {
      console.log(`🔄 Syncing transactions for ${creator.username}...`);
      console.log(`📍 XRP Address: ${creator.xrpAddress}`);

      // ✅ Récupérer TOUS les destination tags valides
      const validDestinationTags = creator.getAllValidDestinationTags();
      console.log(`✅ Valid destination tags: ${validDestinationTags.join(', ')}`);

      // Récupérer les transactions
      const transactions = await xrplClient.getAccountTransactions(
        creator.xrpAddress,
        {
          limit: options.limit || 50,
          forward: false
        }
      );

      let newTips = 0;
      let updatedTips = 0;
      let skippedWrongTag = 0;

      console.log(`📊 Found ${transactions.length} transactions to process`);

      for (const txData of transactions) {
        try {
          if (!txData || (!txData.tx && !txData.tx_json)) {
            continue;
          }

          const tx = txData.tx_json || txData.tx;
          
          // Ignorer si ce n'est pas un paiement entrant réussi
          if (tx.TransactionType !== 'Payment' || 
              tx.Destination !== creator.xrpAddress ||
              txData.meta?.TransactionResult !== 'tesSUCCESS') {
            continue;
          }

          const txHash = txData.hash;
          const amountDrops = tx.DeliverMax || tx.Amount;
          const amount = xrplClient.dropsToXrp(amountDrops);
          const senderAddress = tx.Account;
          const destinationTag = tx.DestinationTag;

          // ✅ Vérifier le destination tag
          if (destinationTag !== undefined && !validDestinationTags.includes(destinationTag)) {
            console.log(`⚠️ Skipping tx with wrong destination tag: ${destinationTag} (valid: ${validDestinationTags.join(', ')})`);
            skippedWrongTag++;
            continue;
          }

          console.log(`💰 Processing payment: ${amount} XRP from ${senderAddress} (tag: ${destinationTag})`);

          // Vérifier si ce tip existe déjà
          const existingTip = await Tip.findOne({ transactionHash: txHash });

          if (!existingTip) {
            // Créer un nouveau tip
            const tip = new Tip({
              creator: creator._id,
              creatorUsername: creator.username,
              amount,
              senderAddress,
              destinationTag: destinationTag, // ✅ Enregistrer le tag
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
            existingTip.destinationTag = destinationTag; // ✅ Mettre à jour le tag
            await existingTip.save();
            updatedTips++;
            console.log(`🔄 Updated existing tip: ${txHash}`);
          }
        } catch (txError) {
          console.error('❌ Error processing transaction:', txError);
          continue;
        }
      }

      // ✅ Mettre à jour les stats avec tous les tags valides
      const allTips = await Tip.find({
        creator: creator._id,
        destinationTag: { $in: validDestinationTags },
        status: 'confirmed'
      }).lean();

      creator.stats.totalTips = allTips.length;
      creator.stats.totalAmount = allTips.reduce((sum, t) => sum + t.amount, 0);
      creator.stats.uniqueSupporters = [...new Set(allTips.map(t => t.senderAddress))].length;
      await creator.save();

      console.log(`✅ Sync complete: ${newTips} new, ${updatedTips} updated, ${skippedWrongTag} skipped (wrong tag)`);

      return {
        newTips,
        updatedTips,
        skippedWrongTag,
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
      const transactions = await xrplClient.getAccountTransactions(address, {
        limit: 20
      });

      const now = Date.now();

      for (const txData of transactions) {
        const tx = txData.tx || txData.tx_json;
        
        if (!tx || tx.TransactionType !== 'Payment' || 
            tx.Destination !== address ||
            txData.meta?.TransactionResult !== 'tesSUCCESS') {
          continue;
        }

        const txAmount = xrplClient.dropsToXrp(tx.DeliverMax || tx.Amount);
        const txTime = xrplClient.rippleTimeToDate(tx.date).getTime();
        const txFrom = tx.Account;

        if (Math.abs(txAmount - amount) < 0.000001 && 
            txFrom === fromAddress &&
            (now - txTime) < timeWindow) {
          return {
            found: true,
            transaction: {
              hash: txData.hash,
              amount: txAmount,
              from: txFrom,
              destinationTag: tx.DestinationTag,
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

const xrplService = new XRPLService();

export default xrplService;