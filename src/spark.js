import { SparkWallet } from '@buildonspark/spark-sdk'
import sha256Hash from './utils/hash.js'
import { encryptMessage } from './utils/encription.js'

const SPARK_TO_SPARK_FEE = 0

// Encapsulate sparkWallet in a closure
const createSparkWalletAPI = ({ sharedKey, ReactNativeWebView }) => {
  const sparkWallet = {}

  const getMnemonicHash = (mnemonic) => {
    const hash = sha256Hash(mnemonic)
    return hash
  }

  // Centralizes wallet lookup and error handling, reducing code duplication
  const getWallet = (hash) => {
    const wallet = sparkWallet[hash]

    if (!wallet) {
      throw new Error('sparkWallet not initialized')
    }

    return wallet
  }

  const initializeSparkWallet = async ({ mnemonic }) => {
    try {
      const hash = getMnemonicHash(mnemonic)

      // Early return if already initialized
      if (sparkWallet[hash]) {
        return { isConnected: true }
      }

      const { wallet } = await SparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: 'MAINNET' },
      })
      mnemonic = null

      sparkWallet[hash] = wallet
      return { isConnected: true }
    } catch (err) {
      console.log('Initialize spark wallet error function', err)
      return { isConnected: false, error: err.message }
    }
  }

  // --- Updated handleTransfer with encryption support ---
  const handleTransfer = async (transferId, balance) => {
    const message = {
      incomingPayment: true,
      result: JSON.stringify({
        transferId,
        balance: balance.toString(),
      }),
      isResponse: true,
    }

    try {
      const encrypted = await encryptMessage(sharedKey, JSON.stringify(message))
      ReactNativeWebView.postMessage(JSON.stringify({ encrypted }))
    } catch (err) {
      console.log('Encryption error during handleTransfer:', err)
    }
  }

  // -------------------------------
  // All mnemonic instances in the coming functions should actually be a hash of the mnemonic. The only time you send the mnemonic is during initialization.
  // -------------------------------

  const removeWalletEventListener = ({ mnemonic }) => {
    const wallet = getWallet(mnemonic)

    if (wallet?.listenerCount('transfer:claimed')) {
      wallet.removeAllListeners('transfer:claimed')
    }
  }

  const addWalletEventListener = ({ mnemonic }) => {
    const wallet = getWallet(mnemonic)
    wallet.on('transfer:claimed', handleTransfer)
  }

  const getSparkIdentityPubKey = async ({ mnemonic }) => {
    try {
      return await getWallet(mnemonic).getIdentityPublicKey()
    } catch (err) {
      console.log('Get spark identity public key error', err)
    }
  }

  const getSparkBalance = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)

      const balance = await wallet.getBalance()

      let currentTokensObj = {}
      for (const [tokensIdentifier, tokensData] of balance.tokenBalances) {
        currentTokensObj[tokensIdentifier] = {
          ...tokensData,
          tokenMetadata: {
            ...tokensData.tokenMetadata,
            maxSupply: tokensData.tokenMetadata.maxSupply.toString(),
          },
          balance: tokensData.balance.toString(),
        }
      }

      return {
        tokensObject: currentTokensObj,
        balance: balance.balance.toString(),
        didWork: true,
      }
    } catch (err) {
      console.log('Get spark balance error', err)
      return { didWork: false }
    }
  }

  const getSparkStaticBitcoinL1Address = async ({ mnemonic }) => {
    try {
      return await getWallet(mnemonic).getStaticDepositAddress()
    } catch (err) {
      console.log('Get reusable Bitcoin mainchain address error', err)
    }
  }

  const queryAllStaticDepositAddresses = async ({ mnemonic }) => {
    try {
      return await getWallet(mnemonic).queryStaticDepositAddresses()
    } catch (err) {
      console.log('Query reusable Bitcoin mainchain addresses error', err)
    }
  }

  const getSparkStaticBitcoinL1AddressQuote = async ({ txid, mnemonic }) => {
    try {
      const quote = await getWallet(mnemonic).getClaimStaticDepositQuote(txid)
      return { didWork: true, quote }
    } catch (err) {
      console.log('Get reusable Bitcoin mainchain address quote error', err)
      return { didWork: false, error: err.message }
    }
  }

  const refundSparkStaticBitcoinL1AddressQuote = async ({
    depositTransactionId,
    destinationAddress,
    fee,
    mnemonic,
  }) => {
    try {
      return await getWallet(mnemonic).refundStaticDeposit({
        depositTransactionId,
        destinationAddress,
        fee,
      })
    } catch (err) {
      console.log('Refund reusable Bitcoin mainchain address error', err)
    }
  }

  const claimnSparkStaticDepositAddress = async ({
    creditAmountSats,
    outputIndex,
    sspSignature,
    transactionId,
    mnemonic,
  }) => {
    try {
      const response = await getWallet(mnemonic).claimStaticDeposit({
        creditAmountSats,
        sspSignature,
        transactionId,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Claim static deposit address error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkAddress = async ({ mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getSparkAddress()
      return { didWork: true, response }
    } catch (err) {
      console.log('Get spark address error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkPayment = async ({ receiverSparkAddress, amountSats, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).transfer({
        receiverSparkAddress: receiverSparkAddress.toLowerCase(),
        amountSats,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Send spark payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkTokens = async ({ tokenIdentifier, tokenAmount, receiverSparkAddress, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).transferTokens({
        tokenIdentifier,
        tokenAmount: BigInt(tokenAmount),
        receiverSparkAddress,
      })

      return { didWork: true, response }
    } catch (err) {
      console.log('Send spark token error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkLightningPaymentFeeEstimate = async ({ invoice, amountSat, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getLightningSendFeeEstimate({
        encodedInvoice: invoice.toLowerCase(),
        amountSats: amountSat,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Get spark lightning payment fee estimate error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkLightningPayment = async ({ invoice, amountSat, mnemonic, maxFeeSats }) => {
    try {
      const paymentResponse = await getWallet(mnemonic).payLightningInvoice({
        invoice: invoice.toLowerCase(),
        maxFeeSats: maxFeeSats,
        amountSatsToSend: amountSat,
      })
      return { didWork: true, paymentResponse }
    } catch (err) {
      console.log('Send spark lightning payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkBitcoinPayment = async ({
    onchainAddress,
    exitSpeed,
    amountSats,
    feeQuote,
    deductFeeFromWithdrawalAmount,
    mnemonic,
  }) => {
    try {
      const response = await getWallet(mnemonic).withdraw({
        onchainAddress: onchainAddress,
        exitSpeed,
        amountSats,
        feeQuote,
        deductFeeFromWithdrawalAmount,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Send spark bitcoin payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const receiveSparkLightningPayment = async ({ amountSats, memo, expirySeconds, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).createLightningInvoice({
        amountSats,
        memo,
        expirySeconds,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Receive spark lightning payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkLightningPaymentStatus = async ({ lightningInvoiceId, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getLightningReceiveRequest(lightningInvoiceId)
      return response
    } catch (err) {
      console.log('Get spark lightning payment status error', err)
    }
  }

  const getSparkBitcoinPaymentRequest = async ({ paymentId, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getCoopExitRequest(paymentId)
      return response
    } catch (err) {
      console.log('Get spark bitcoin payment request error', err)
    }
  }

  const getSparkBitcoinPaymentFeeEstimate = async ({ withdrawalAddress, amountSats, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getWithdrawalFeeQuote({
        amountSats,
        withdrawalAddress: withdrawalAddress,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Get spark bitcoin payment fee estimate error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkPaymentFeeEstimate = async ({ amountSats, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getSwapFeeEstimate(amountSats)
      return response
    } catch (err) {
      console.log('Get spark payment fee estimate error', err)
      return 0
    }
  }

  const getSparkLightningSendRequest = async ({ id, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getLightningSendRequest(id)
      return response
    } catch (err) {
      console.log('Get spark lightning send request error', err)
    }
  }

  const getSparkTransactions = async ({ transferCount, offsetIndex, mnemonic }) => {
    try {
      const response = await getWallet(mnemonic).getTransfers(transferCount, offsetIndex)
      const transfers = response.transfers.map((tx) => {
        delete tx.leaves
        return tx
      })
      return { transfers, offset: response.offset }
    } catch (err) {
      console.log('Get spark transactions error', err)
      return { transfers: [] }
    }
  }

  const getSparkTokenTransactions = async ({
    ownerPublicKeys,
    issuerPublicKeys,
    tokenTransactionHashes,
    tokenIdentifiers,
    outputIds,
    mnemonic,
    lastSavedTransactionId,
  }) => {
    try {
      const response = await getWallet(mnemonic).queryTokenTransactions({
        ownerPublicKeys,
        issuerPublicKeys,
        tokenTransactionHashes,
        tokenIdentifiers,
        outputIds,
      })

      // Extract simplified transactions
      const tokenTransactionsWithStatus = response.tokenTransactionsWithStatus.map((tx) => {
        const t = tx.tokenTransaction
        const firstOutput = t.tokenOutputs?.[0]
        return {
          tokenTransactionHash: tx.tokenTransactionHash,
          tokenTransaction: {
            clientCreatedTimestamp: t.clientCreatedTimestamp,
            tokenOutputs: firstOutput
              ? [
                  {
                    ownerPublicKey: firstOutput.ownerPublicKey,
                    tokenIdentifier: firstOutput.tokenIdentifier,
                    tokenAmount: firstOutput.tokenAmount,
                  },
                ]
              : [],
          },
        }
      })

      // Filter only NEW transactions compared to last saved one
      let filteredTransactions = tokenTransactionsWithStatus
      if (lastSavedTransactionId) {
        const lastIndex = tokenTransactionsWithStatus.findIndex(
          (tx) => Buffer.from(Object.values(tx.tokenTransactionHash)).toString('hex') === lastSavedTransactionId
        )

        if (lastIndex !== -1) {
          filteredTransactions = tokenTransactionsWithStatus.slice(0, lastIndex)
        }
      }

      return {
        tokenTransactionsWithStatus: filteredTransactions,
        offset: response.offset,
      }
    } catch (err) {
      console.log('Get spark transactions error', err)
      return []
    }
  }

  const findTransactionTxFromTxHistory = async ({ sparkTxId, previousOffset = 0, previousTxs = [], mnemonic }) => {
    try {
      // Early return with cached transaction
      const cachedTx = previousTxs.find((tx) => tx.id === sparkTxId)
      if (cachedTx) {
        console.log('Using cache tx history')
        return {
          didWork: true,
          offset: previousOffset,
          foundTransfers: previousTxs,
          bitcoinTransfer: cachedTx,
        }
      }

      const wallet = getWallet(mnemonic)
      let offset = previousOffset
      let foundTransfers = []
      let bitcoinTransfer = undefined
      const maxAttempts = 20

      while (offset < maxAttempts) {
        const transfers = await wallet.getTransfers(100, 100 * offset)
        foundTransfers = transfers.transfers

        if (!foundTransfers.length) {
          break
        }

        const includesTx = foundTransfers.find((tx) => tx.id === sparkTxId)
        if (includesTx) {
          bitcoinTransfer = includesTx
          break
        }

        if (transfers.offset === -1) {
          console.log('Reached end of transactions (offset: -1)')
          break
        }

        offset += 1
      }

      return { didWork: true, offset, foundTransfers, bitcoinTransfer }
    } catch (err) {
      console.log('Error finding bitcoin tx from history', err)
      return { didWork: false, error: err.message }
    }
  }

  return {
    initializeSparkWallet,
    removeWalletEventListener,
    addWalletEventListener,
    getSparkIdentityPubKey,
    getSparkBalance,
    getSparkStaticBitcoinL1Address,
    queryAllStaticDepositAddresses,
    getSparkStaticBitcoinL1AddressQuote,
    refundSparkStaticBitcoinL1AddressQuote,
    claimnSparkStaticDepositAddress,
    getSparkAddress,
    sendSparkPayment,
    sendSparkTokens,
    getSparkLightningPaymentFeeEstimate,
    sendSparkLightningPayment,
    sendSparkBitcoinPayment,
    receiveSparkLightningPayment,
    getSparkLightningPaymentStatus,
    getSparkBitcoinPaymentRequest,
    getSparkBitcoinPaymentFeeEstimate,
    getSparkPaymentFeeEstimate,
    getSparkLightningSendRequest,
    getSparkTransactions,
    getSparkTokenTransactions,
    findTransactionTxFromTxHistory,
  }
}

export const SparkAPI = createSparkWalletAPI
