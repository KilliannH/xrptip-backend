import dotenv from 'dotenv';
dotenv.config();
// Configuration du wallet intermédiaire de la plateforme
export const PLATFORM_WALLET_CONFIG = {
  // Wallet intermédiaire qui reçoit tous les tips
  address: process.env.PLATFORM_WALLET_ADDRESS || 'rPlatformWalletHere123456789',
  
  // Secret du wallet (⚠️ GARDER ABSOLUMENT SECRET)
  secret: process.env.PLATFORM_WALLET_SECRET || '',
  
  // Configuration des frais (doit matcher le frontend)
  fees: {
    percentage: 0.05, // 5%
    minAmountForFees: 1, // XRP
    minFee: 0.1, // XRP
    maxFee: null
  },
  
  // Réserve minimum à garder sur le wallet (pour les frais de transaction XRPL)
  minReserve: 10 // XRP
};

/**
 * Calculer les frais (côté backend)
 * @param {number} totalAmount - Montant total reçu
 * @returns {object} { creatorAmount, platformFee }
 */
export const calculateBackendFees = (totalAmount) => {
  const config = PLATFORM_WALLET_CONFIG.fees;
  
  // Si montant trop petit, pas de frais
  if (totalAmount < config.minAmountForFees) {
    return {
      creatorAmount: totalAmount,
      platformFee: 0
    };
  }

  // Calculer les frais à partir du montant total
  // Si total = 10.5 XRP, on veut récupérer : créateur = 10 XRP, frais = 0.5 XRP
  // Formule : creatorAmount = total / (1 + percentage)
  const creatorAmount = totalAmount / (1 + config.percentage);
  let platformFee = totalAmount - creatorAmount;
  
  // Appliquer frais minimum
  if (platformFee < config.minFee && totalAmount >= config.minAmountForFees) {
    platformFee = config.minFee;
  }
  
  // Appliquer frais maximum
  if (config.maxFee !== null && platformFee > config.maxFee) {
    platformFee = config.maxFee;
  }

  // Arrondir
  const finalCreatorAmount = Math.round((totalAmount - platformFee) * 100) / 100;
  const finalPlatformFee = Math.round(platformFee * 100) / 100;

  return {
    creatorAmount: finalCreatorAmount,
    platformFee: finalPlatformFee
  };
};