import { SparkWallet } from '@buildonspark/spark-sdk'
// import { FlashnetClient } from '@flashnet/sdk'
import sha256Hash from './utils/hash.js'
import { encryptMessage } from './utils/encription.js'
import { FlashnetAPI } from './flashnet.js'

const SPARK_TO_SPARK_FEE = 0

// Encapsulate sparkWallet in a closure
const createSparkWalletAPI = ({ sharedKey, ReactNativeWebView }) => {
  const sparkWallet = {}
  const flashnetClients = {}
  const initializingWallets = {}

  const optimizationState = {
    isLeafOptimizationRunning: false,
    isTokenOptimizationRunning: false,
    controller: null,
    timeout: null,
  }

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

  const getFlashnetClient = (hash) => {
    const client = flashnetClients[hash]
    if (!client) {
      throw new Error('Flashnet client not initialized')
    }
    return client
  }

  const initializeSparkWallet = async ({ mnemonic }) => {
    try {
      const hash = getMnemonicHash(mnemonic)

      // Early return if already initialized
      if (sparkWallet[hash]) {
        return { isConnected: true }
      }

      if (initializingWallets[hash]) {
        await initializingWallets[hash]
        return { isConnected: true }
      }

      initializingWallets[hash] = (async () => {
        try {
          const wallet = await initializeWallet(mnemonic)
          sparkWallet[hash] = wallet
          return wallet
        } catch (err) {
          delete initializingWallets[hash]
          delete sparkWallet[hash]
          throw err
        }
      })()

      await initializingWallets[hash]
      delete initializingWallets[hash]
      mnemonic = null
      return { isConnected: true }
    } catch (err) {
      console.log('Initialize spark wallet error function', err)
      const hash = getMnemonicHash(mnemonic)
      delete initializingWallets[hash]
      delete sparkWallet[hash]
      return { isConnected: false, error: err.message }
    }
  }

  const initializeWallet = async (mnemonic) => {
    const { wallet } = await SparkWallet.initialize({
      mnemonicOrSeed: mnemonic,
      options: {
        network: 'MAINNET',
        optimizationOptions: {
          multiplicity: 2,
        },
      },
    })

    console.log('did initialize wallet')
    return wallet
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
  // SPARK FUNCTIONS
  // All mnemonic instances in the coming functions should actually be a hash of the mnemonic. The only time you send the mnemonic is during initialization.
  // -------------------------------

  const initializeFlashnet = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const flashnetAPI = FlashnetAPI(wallet)
      await flashnetAPI.initializeFlashnetClient()
      flashnetClients[mnemonic] = flashnetAPI

      return { didWork: true }
    } catch (err) {
      console.log('Error initializing flashnet', err)
      return { didWork: false, err: err.message }
    }
  }

  const removeWalletEventListener = ({ mnemonic }) => {
    const wallet = getWallet(mnemonic)

    if (wallet?.listenerCount('transfer:claimed')) {
      wallet.removeAllListeners('transfer:claimed')
    }
  }

  const addWalletEventListener = ({ mnemonic }) => {
    const wallet = getWallet(mnemonic)

    if (wallet?.listenerCount('transfer:claimed')) return

    wallet.on('transfer:claimed', handleTransfer)
  }

  const getSparkIdentityPubKey = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      return await wallet.getIdentityPublicKey()
    } catch (err) {
      console.log('Get spark identity public key error', err)
    }
  }

  const setPrivacyEnabled = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)

      const walletSetings = await wallet.getWalletSettings()

      if (!walletSetings?.privateEnabled) {
        await wallet.setPrivacyEnabled(true)
      }

      return { didWork: true }
    } catch (err) {
      console.log('Get spark balance error', err)
      return { didWork: false }
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
          balance: tokensData.availableToSendBalance.toString(),
        }
        delete currentTokensObj[tokensIdentifier].availableToSendBalance
        delete currentTokensObj[tokensIdentifier].ownedBalance
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
      const wallet = getWallet(mnemonic)
      return await wallet.getStaticDepositAddress()
    } catch (err) {
      console.log('Get reusable Bitcoin mainchain address error', err)
    }
  }

  const queryAllStaticDepositAddresses = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      return await wallet.queryStaticDepositAddresses()
    } catch (err) {
      console.log('Query reusable Bitcoin mainchain addresses error', err)
    }
  }

  const getSparkStaticBitcoinL1AddressQuote = async ({ txid, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const quote = await wallet.getClaimStaticDepositQuote(txid)
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
      const wallet = getWallet(mnemonic)
      return await wallet.refundStaticDeposit({
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.claimStaticDeposit({
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.getSparkAddress()
      return { didWork: true, response }
    } catch (err) {
      console.log('Get spark address error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkPayment = async ({ receiverSparkAddress, amountSats, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.transfer({
        receiverSparkAddress: receiverSparkAddress.toLowerCase(),
        amountSats,
      })
      delete response.leaves
      return { didWork: true, response }
    } catch (err) {
      console.log('Send spark payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const sendSparkTokens = async ({ tokenIdentifier, tokenAmount, receiverSparkAddress, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.transferTokens({
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.getLightningSendFeeEstimate({
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
      const wallet = getWallet(mnemonic)
      const paymentResponse = await wallet.payLightningInvoice({
        invoice: invoice.toLowerCase(),
        maxFeeSats: maxFeeSats,
        amountSatsToSend: amountSat,
        preferSpark: true,
      })
      delete paymentResponse.leaves
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.withdraw({
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

  const receiveSparkLightningPayment = async ({ amountSats, memo, expirySeconds, includeSparkAddress, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.createLightningInvoice({
        amountSats,
        memo,
        expirySeconds,
        includeSparkAddress,
      })
      return { didWork: true, response }
    } catch (err) {
      console.log('Receive spark lightning payment error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkLightningPaymentStatus = async ({ lightningInvoiceId, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getLightningReceiveRequest(lightningInvoiceId)
      return response
    } catch (err) {
      console.log('Get spark lightning payment status error', err)
    }
  }

  const getSparkBitcoinPaymentRequest = async ({ paymentId, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getCoopExitRequest(paymentId)
      return response
    } catch (err) {
      console.log('Get spark bitcoin payment request error', err)
    }
  }

  const getUtxosForDepositAddress = async ({ depositAddress, mnemonic, limit, offset, excludeClaimed }) => {
    try {
      const wallet = getWallet(mnemonic)
      const utxos = await wallet.getUtxosForDepositAddress(depositAddress, limit, offset, excludeClaimed)
      return { didWork: true, utxos }
    } catch (err) {
      console.log('Get spark bitcoin payment request error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getSparkBitcoinPaymentFeeEstimate = async ({ withdrawalAddress, amountSats, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getWithdrawalFeeQuote({
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.getSwapFeeEstimate(amountSats)
      return response
    } catch (err) {
      console.log('Get spark payment fee estimate error', err)
      return 0
    }
  }

  const getSparkLightningSendRequest = async ({ id, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getLightningSendRequest(id)
      return response
    } catch (err) {
      console.log('Get spark lightning send request error', err)
    }
  }

  const getSparkTransactions = async ({ transferCount, offsetIndex, mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getTransfers(transferCount, offsetIndex)
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
      const wallet = getWallet(mnemonic)
      const response = await wallet.queryTokenTransactions({
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

  const getSingleTxDetails = async ({ mnemonic, id }) => {
    try {
      const wallet = getWallet(mnemonic)
      const response = await wallet.getTransfer(id)
      if (!response) throw new Error('No tx found')
      delete response.leaves
      return response
    } catch (err) {
      console.log('error getting single tx details', err)
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

  const createSatsInvoice = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)
      const invoice = await wallet.createSatsInvoice({})
      return { didWork: true, invoice }
    } catch (err) {
      console.log('Create sats invoice error', err)
      return { didWork: false, error: err.message }
    }
  }

  const createTokensInvoice = async ({ mnemonic, tokenIdentifier }) => {
    try {
      const wallet = getWallet(mnemonic)
      const invoice = await wallet.createTokensInvoice({ tokenIdentifier })
      return { didWork: true, invoice }
    } catch (err) {
      console.log('Create tokens invoice error', err)
      return { didWork: false, error: err.message }
    }
  }

  // -------------------------------
  // FLASHNET FUNCTIONS
  // -------------------------------

  const findBestPool = async ({ mnemonic, tokenAAddress, tokenBAddress, options }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.findBestPool({ tokenAAddress, tokenBAddress, options })
    } catch (err) {
      console.log('Find best pool error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getPoolDetails = async ({ mnemonic, poolId }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.getPoolDetails({ poolId })
    } catch (err) {
      console.log('Get pool details error', err)
      return { didWork: false, error: err.message }
    }
  }

  const listAllPools = async ({ mnemonic, filters }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.listAllPools({ filters })
    } catch (err) {
      console.log('List all pools error', err)
      return { didWork: false, error: err.message }
    }
  }

  const minFlashnetSwapAmounts = async ({ mnemonic, assetHex }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.minFlashnetSwapAmounts({ assetHex })
    } catch (err) {
      console.log('Get min swap amounts error', err)
      return { didWork: false, error: err.message }
    }
  }

  const simulateSwap = async ({
    mnemonic,
    poolId,
    assetInAddress,
    assetOutAddress,
    amountIn,
    integratorFeeRateBps,
  }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.simulateSwap({ poolId, assetInAddress, assetOutAddress, amountIn, integratorFeeRateBps })
    } catch (err) {
      console.log('Simulate swap error', err)
      return { didWork: false, error: err.message }
    }
  }

  const executeSwap = async ({
    mnemonic,
    poolId,
    assetInAddress,
    assetOutAddress,
    amountIn,
    minAmountOut,
    maxSlippageBps,
    integratorFeeRateBps,
  }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.executeSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn,
        minAmountOut,
        maxSlippageBps,
        integratorFeeRateBps,
      })
    } catch (err) {
      console.log('Execute swap error', err)
      return { didWork: false, error: err.message }
    }
  }

  const swapBitcoinToToken = async ({ mnemonic, tokenAddress, amountSats, poolId, maxSlippageBps }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.swapBitcoinToToken({ tokenAddress, amountSats, poolId, maxSlippageBps })
    } catch (err) {
      console.log('Swap Bitcoin to token error', err)
      return { didWork: false, error: err.message }
    }
  }

  const swapTokenToBitcoin = async ({ mnemonic, tokenAddress, tokenAmount, poolId, maxSlippageBps }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.swapTokenToBitcoin({ tokenAddress, tokenAmount, poolId, maxSlippageBps })
    } catch (err) {
      console.log('Swap token to Bitcoin error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getLightningPaymentQuote = async ({
    mnemonic,
    invoice,
    tokenAddress,
    integratorFeeRateBps,
    maxSlippageBps,
  }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.getLightningPaymentQuote({ invoice, tokenAddress, integratorFeeRateBps, maxSlippageBps })
    } catch (err) {
      console.log('Get Lightning payment quote error', err)
      return { didWork: false, error: err.message }
    }
  }

  const payLightningWithToken = async ({
    mnemonic,
    invoice,
    tokenAddress,
    maxSlippageBps,
    maxLightningFeeSats,
    rollbackOnFailure,
    useExistingBtcBalance,
    integratorFeeRateBps,
  }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.payLightningWithToken({
        invoice,
        tokenAddress,
        maxSlippageBps,
        maxLightningFeeSats,
        rollbackOnFailure,
        useExistingBtcBalance,
        integratorFeeRateBps,
      })
    } catch (err) {
      console.log('Pay Lightning with token error', err)
      return { didWork: false, error: err.message }
    }
  }

  const getUserSwapHistory = async ({ mnemonic, limit, offset }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.getUserSwapHistory(limit, offset)
    } catch (err) {
      console.log('Get user swap history error', err)
      return { didWork: false, error: err.message, swaps: [] }
    }
  }

  const requestClawback = async ({ mnemonic, sparkTransferId, poolId }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.requestClawback({ sparkTransferId, poolId })
    } catch (err) {
      console.log('Request clawback error', err)
      return { didWork: false, error: err.message }
    }
  }

  const requestBatchClawback = async ({ mnemonic, transferIds, poolId }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.requestClawback({ transferIds, poolId })
    } catch (err) {
      console.log('Request clawback error', err)
      return { didWork: false, error: err.message }
    }
  }

  const checkClawbackEligibility = async ({ mnemonic, sparkTransferId }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.checkClawbackEligibility({ sparkTransferId })
    } catch (err) {
      console.log('Check clawback eligibility error', err)
      return { didWork: false, error: err.message, response: false }
    }
  }

  const checkClawbackStatus = async ({ mnemonic, internalRequestId }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.checkClawbackStatus({ internalRequestId })
    } catch (err) {
      console.log('Check clawback status error', err)
      return { didWork: false, error: err.message }
    }
  }

  const listClawbackableTransfers = async ({ mnemonic, limit }) => {
    try {
      const client = getFlashnetClient(mnemonic)
      return await client.listClawbackableTransfers({ limit })
    } catch (err) {
      console.log('List clawbackable transfers error', err)
      return { didWork: false, error: err.message }
    }
  }

  // Wallet Opimization methods
  const abortOptimization = async () => {
    try {
      console.log('Aborting webview optimization...')

      if (optimizationState.controller) {
        optimizationState.controller.abort()
        optimizationState.controller = null
      }

      optimizationState.isLeafOptimizationRunning = false
      optimizationState.isTokenOptimizationRunning = false

      return { didWork: true, cancelled: true }
    } catch (err) {
      console.log('Abort optimization error', err)
      return { didWork: false, error: err.message }
    }
  }

  const isOptimizationRunning = () => {
    return optimizationState.isLeafOptimizationRunning || optimizationState.isTokenOptimizationRunning
  }

  const checkIfOptimizationNeeded = async ({ mnemonic }) => {
    try {
      const wallet = getWallet(mnemonic)

      const [isLeafOptInProgress, isTokenOptInProgress] = await Promise.all([
        wallet.isOptimizationInProgress(),
        wallet.isTokenOptimizationInProgress(),
      ])
      // Return true if optimization is NOT in progress (meaning it's available to run)
      return { didWork: true, needed: !(isLeafOptInProgress || isTokenOptInProgress) }
    } catch (err) {
      console.log('Get spark balance error', err)
      return { didWork: false, needed: false }
    }
  }

  const runLeafOptimization = async ({ mnemonic }) => {
    try {
      optimizationState.isLeafOptimizationRunning = true

      console.log('Starting leaf optimization...')

      const wallet = getWallet(mnemonic)
      if (!wallet) {
        throw new Error('Wallet not initialized')
      }
      for await (const progress of wallet.optimizeLeaves()) {
        // Store controller for abortion
        optimizationState.controller = progress.controller
        console.log(`Optimization progress: ${progress.step}/${progress.total}`)
        // Check if we should abort
        if (!optimizationState.isLeafOptimizationRunning) {
          console.log('Optimization aborted by external signal')
          progress.controller.abort()
          break
        }
      }

      console.log('Leaf optimization complete')
      return { didWork: true }
    } catch (error) {
      console.error('Error during leaf optimization:', error)
      return { didWork: false, error: error.message }
    } finally {
      optimizationState.isLeafOptimizationRunning = false
      optimizationState.controller = null
    }
  }

  const runTokenOptimization = async ({ mnemonic }) => {
    try {
      optimizationState.isTokenOptimizationRunning = true

      const wallet = getWallet(mnemonic)
      if (!wallet) {
        throw new Error('Wallet not initialized')
      }
      await wallet.optimizeTokenOutputs()

      console.log('Token optimization complete')
      return { didWork: true }
    } catch (error) {
      console.error('Error during token optimization:', error)
      return { didWork: false, error: error.message }
    } finally {
      optimizationState.isTokenOptimizationRunning = false
    }
  }

  return {
    // Spark functions
    initializeSparkWallet,
    removeWalletEventListener,
    addWalletEventListener,
    getSparkIdentityPubKey,
    getSparkBalance,
    getSparkStaticBitcoinL1Address,
    queryAllStaticDepositAddresses,
    getUtxosForDepositAddress,
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
    getSingleTxDetails,
    setPrivacyEnabled,
    createSatsInvoice,
    createTokensInvoice,

    // Flashnet functions
    initializeFlashnet,
    findBestPool,
    getPoolDetails,
    listAllPools,
    minFlashnetSwapAmounts,
    simulateSwap,
    executeSwap,
    swapBitcoinToToken,
    swapTokenToBitcoin,
    getLightningPaymentQuote,
    payLightningWithToken,
    getUserSwapHistory,
    requestClawback,
    requestBatchClawback,
    checkClawbackEligibility,
    checkClawbackStatus,
    listClawbackableTransfers,

    // Optimization functions
    abortOptimization,
    isOptimizationRunning,
    checkIfOptimizationNeeded,
    runLeafOptimization,
    runTokenOptimization,
  }
}

export const SparkAPI = createSparkWalletAPI
