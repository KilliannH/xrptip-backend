/**
 * Script de test pour vérifier la configuration du wallet plateforme
 * 
 * Usage: node testPlatformWallet.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { PLATFORM_WALLET_CONFIG } from './config/platformWallet.js';
import { Wallet, Client } from 'xrpl';

async function testPlatformWallet() {
  console.log('🧪 Test de la configuration du wallet plateforme\n');

  // 1. Vérifier la configuration
  console.log('📋 Configuration actuelle:');
  console.log('  Address:', PLATFORM_WALLET_CONFIG.address);
  console.log('  Secret:', PLATFORM_WALLET_CONFIG.secret ? '✅ Défini' : '❌ Manquant');
  console.log('  Fee %:', PLATFORM_WALLET_CONFIG.fees.percentage * 100 + '%');
  console.log('  Min Reserve:', PLATFORM_WALLET_CONFIG.minReserve, 'XRP\n');

  // 2. Vérifier que l'adresse n'est pas la valeur par défaut
  if (PLATFORM_WALLET_CONFIG.address === 'rPlatformWalletHere123456789') {
    console.error('❌ ERREUR: L\'adresse du wallet plateforme n\'est pas configurée !');
    console.log('   Veuillez définir PLATFORM_WALLET_ADDRESS dans .env\n');
    return false;
  }

  // 3. Vérifier le secret
  if (!PLATFORM_WALLET_CONFIG.secret) {
    console.error('❌ ERREUR: Le secret du wallet plateforme n\'est pas configuré !');
    console.log('   Veuillez définir PLATFORM_WALLET_SECRET dans .env\n');
    return false;
  }

  // 4. Vérifier que le secret correspond à l'adresse
  try {
    const wallet = Wallet.fromSeed(PLATFORM_WALLET_CONFIG.secret);
    console.log('🔑 Wallet généré depuis le secret:');
    console.log('  Address:', wallet.address);
    
    if (wallet.address !== PLATFORM_WALLET_CONFIG.address) {
      console.error('\n❌ ERREUR: Le secret ne correspond pas à l\'adresse !');
      console.log('  Adresse attendue:', PLATFORM_WALLET_CONFIG.address);
      console.log('  Adresse du secret:', wallet.address);
      console.log('  → Vérifiez vos variables d\'environnement\n');
      return false;
    }
    
    console.log('  ✅ Le secret correspond à l\'adresse\n');
  } catch (error) {
    console.error('❌ ERREUR: Secret invalide -', error.message, '\n');
    return false;
  }

  // 5. Vérifier la connexion au réseau XRPL
  const network = process.env.XRPL_NETWORK === 'mainnet' 
    ? 'wss://xrplcluster.com'
    : 'wss://s.altnet.rippletest.net:51233';
  
  console.log('🌐 Connexion au réseau XRPL:', process.env.XRPL_NETWORK || 'testnet');
  
  const client = new Client(network);
  
  try {
    await client.connect();
    console.log('  ✅ Connecté\n');
    
    // 6. Vérifier que le compte existe et a des fonds
    console.log('💰 Vérification du compte:');
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: PLATFORM_WALLET_CONFIG.address,
        ledger_index: 'validated'
      });
      
      const balance = Number(accountInfo.result.account_data.Balance) / 1000000;
      console.log('  Balance:', balance, 'XRP');
      
      if (balance < PLATFORM_WALLET_CONFIG.minReserve) {
        console.warn(`  ⚠️  ATTENTION: Balance (${balance} XRP) < Réserve minimum (${PLATFORM_WALLET_CONFIG.minReserve} XRP)`);
        console.log('     Le wallet ne pourra pas redistribuer les tips !');
        console.log('     Envoyez au moins', PLATFORM_WALLET_CONFIG.minReserve, 'XRP à cette adresse\n');
      } else {
        console.log('  ✅ Balance suffisante\n');
      }
      
      // Compte activé
      console.log('  ✅ Compte activé sur XRPL\n');
      
    } catch (accountError) {
      if (accountError.data?.error === 'actNotFound') {
        console.error('  ❌ ERREUR: Compte non activé sur XRPL !');
        console.log('     Pour activer le compte, envoyez au moins 10 XRP à:');
        console.log('     ', PLATFORM_WALLET_CONFIG.address);
        
        if (process.env.XRPL_NETWORK !== 'mainnet') {
          console.log('\n     💡 Testnet Faucet: https://xrpl.org/xrp-testnet-faucet.html\n');
        }
        
        await client.disconnect();
        return false;
      }
      throw accountError;
    }
    
    await client.disconnect();
    console.log('✅ Déconnecté du réseau XRPL\n');
    
  } catch (error) {
    console.error('❌ ERREUR de connexion XRPL:', error.message, '\n');
    if (client.isConnected()) {
      await client.disconnect();
    }
    return false;
  }

  // 7. Test de calcul des frais
  console.log('🧮 Test de calcul des frais:');
  const { calculateBackendFees } = await import('./config/platformWallet.js');
  
  const testAmounts = [0.5, 1, 5, 10, 50, 100];
  
  console.log('  Montant reçu | Créateur | Frais (5%) | Frais réel');
  console.log('  ' + '-'.repeat(55));
  
  for (const amount of testAmounts) {
    const { creatorAmount, platformFee } = calculateBackendFees(amount);
    console.log(`  ${amount.toString().padEnd(12)} | ${creatorAmount.toFixed(2).padEnd(8)} | ${(amount * 0.05).toFixed(2).padEnd(10)} | ${platformFee.toFixed(2)}`);
  }
  console.log();

  // 8. Résumé final
  console.log('━'.repeat(60));
  console.log('✅ CONFIGURATION VALIDE !');
  console.log('━'.repeat(60));
  console.log('Le wallet plateforme est prêt à :');
  console.log('  1. Recevoir les tips des users');
  console.log('  2. Redistribuer automatiquement aux créateurs');
  console.log('  3. Collecter les frais de plateforme');
  console.log('\n💡 Vous pouvez maintenant démarrer le backend avec: npm run dev\n');
  
  return true;
}

// Exécuter le test
testPlatformWallet()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Erreur inattendue:', error);
    process.exit(1);
  });