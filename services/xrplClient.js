import { Client } from 'xrpl';

class XRPLClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Connecter au réseau XRPL
   */
  async connect() {
    if (this.isConnected && this.client) {
      return this.client;
    }

    try {
      const network = process.env.XRPL_NETWORK === 'mainnet'
        ? 'wss://xrplcluster.com'
        : 'wss://s.altnet.rippletest.net:51233';

      console.log(`🔗 Connexion au réseau XRPL: ${process.env.XRPL_NETWORK || 'testnet'}`);
      
      this.client = new Client(network);
      await this.client.connect();
      
      this.isConnected = true;
      console.log('✅ Connecté au réseau XRPL');
      
      return this.client;
    } catch (error) {
      console.error('❌ Erreur de connexion XRPL:', error);
      throw error;
    }
  }

  /**
   * Déconnecter du réseau XRPL
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('🔌 Déconnecté du réseau XRPL');
    }
  }

  /**
   * Obtenir le client XRPL
   */
  async getClient() {
    if (!this.isConnected) {
      await this.connect();
    }
    return this.client;
  }

  /**
   * Vérifier si une adresse XRP est valide
   */
  isValidAddress(address) {
    try {
      const { Client } = require('xrpl');
      return Client.isValidClassicAddress(address);
    } catch (error) {
      return false;
    }
  }

  /**
   * Récupérer les informations d'un compte
   */
  async getAccountInfo(address) {
    try {
      const client = await this.getClient();
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      });
      return response.result;
    } catch (error) {
      console.error('Erreur lors de la récupération du compte:', error);
      throw error;
    }
  }

  /**
   * Vérifier une transaction par hash
   */
  async getTransaction(txHash) {
    try {
      const client = await this.getClient();
      const response = await client.request({
        command: 'tx',
        transaction: txHash,
        binary: false
      });
      return response.result;
    } catch (error) {
      console.error('Erreur lors de la récupération de la transaction:', error);
      throw error;
    }
  }

  /**
   * Vérifier si une transaction est un paiement vers une adresse spécifique
   */
  async verifyPayment(txHash, expectedDestination, expectedAmount = null) {
    try {
      const tx = await this.getTransaction(txHash);

      if (tx.TransactionType !== 'Payment') {
        return {
          valid: false,
          reason: 'Not a payment transaction'
        };
      }

      if (tx.meta?.TransactionResult !== 'tesSUCCESS') {
        return {
          valid: false,
          reason: 'Transaction failed',
          result: tx.meta?.TransactionResult
        };
      }

      if (tx.Destination !== expectedDestination) {
        return {
          valid: false,
          reason: 'Wrong destination address',
          expected: expectedDestination,
          actual: tx.Destination
        };
      }

      const amountInXRP = tx.Amount ? parseFloat(tx.Amount) / 1000000 : 0;

      if (expectedAmount !== null) {
        const tolerance = 0.000001;
        if (Math.abs(amountInXRP - expectedAmount) > tolerance) {
          return {
            valid: false,
            reason: 'Wrong amount',
            expected: expectedAmount,
            actual: amountInXRP
          };
        }
      }

      return {
        valid: true,
        transaction: {
          hash: tx.hash,
          from: tx.Account,
          to: tx.Destination,
          amount: amountInXRP,
          destinationTag: tx.DestinationTag, // ✅ Inclure le destination tag
          ledgerIndex: tx.ledger_index,
          date: tx.date,
          fee: parseFloat(tx.Fee) / 1000000,
          memos: tx.Memos || []
        }
      };
    } catch (error) {
      console.error('Erreur lors de la vérification du paiement:', error);
      return {
        valid: false,
        reason: 'Error verifying transaction',
        error: error.message
      };
    }
  }

  /**
   * Récupérer l'historique des transactions d'un compte
   */
  async getAccountTransactions(address, options = {}) {
    try {
      const client = await this.getClient();
      
      console.log(`📥 Fetching transactions for ${address}`);
      
      const response = await client.request({
        command: 'account_tx',
        account: address,
        limit: options.limit || 20,
        ledger_index_min: options.ledger_index_min || -1,
        ledger_index_max: options.ledger_index_max || -1,
        forward: options.forward || false
      });
      
      console.log(`✅ Received ${response.result.transactions?.length || 0} transactions`);
      
      if (!response.result.transactions) {
        console.warn('⚠️ No transactions array in response');
        return [];
      }
      
      return response.result.transactions;
    } catch (error) {
      console.error('❌ Error fetching transactions:', error.message);
      
      if (error.data?.error === 'actNotFound') {
        console.log('ℹ️ Account not found on ledger (not activated yet)');
        return [];
      }
      
      throw error;
    }
  }

  /**
   * Surveiller les paiements entrants vers une adresse
   */
  async subscribeToPayments(address, callback) {
    try {
      const client = await this.getClient();

      await client.request({
        command: 'subscribe',
        accounts: [address]
      });

      const listener = (data) => {
        if (!data || data.type !== 'transaction' || !data.validated) {
          return;
        }

        const tx = data.tx_json || data.transaction;
        
        if (!tx) {
          console.warn('⚠️ Transaction data missing in XRPL message');
          return;
        }

        if (tx.TransactionType === 'Payment' && tx.Destination === address) {
          const amountDrops = tx.DeliverMax || tx.Amount;
          
          const payment = {
            hash: data.hash || tx.hash,
            from: tx.Account,
            to: tx.Destination,
            amount: parseFloat(amountDrops) / 1000000,
            ledgerIndex: data.ledger_index,
            destinationTag: tx.DestinationTag || null, // ✅ Inclure le destination tag
            memos: tx.Memos || []
          };

          callback(payment);
        }
      };

      client.on('transaction', listener);

      return async () => {
        client.off('transaction', listener);
        await client.request({
          command: 'unsubscribe',
          accounts: [address]
        });
      };
    } catch (error) {
      console.error('Erreur lors de l\'abonnement aux paiements:', error);
      throw error;
    }
  }

  /**
   * Convertir un timestamp XRPL en Date JavaScript
   */
  rippleTimeToDate(rippleTime) {
    const RIPPLE_EPOCH = 946684800;
    return new Date((rippleTime + RIPPLE_EPOCH) * 1000);
  }

  /**
   * Convertir des drops en XRP
   */
  dropsToXrp(drops) {
    return parseFloat(drops) / 1000000;
  }

  /**
   * Convertir des XRP en drops
   */
  xrpToDrops(xrp) {
    return Math.floor(parseFloat(xrp) * 1000000);
  }
}

const xrplClient = new XRPLClient();

export default xrplClient;