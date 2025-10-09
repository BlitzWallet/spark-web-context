import { SparkWallet } from '@buildonspark/spark-sdk'

import {
  LightningSendRequestStatus,
  SparkCoopExitRequestStatus,
  LightningReceiveRequestStatus,
  SparkLeavesSwapRequestStatus,
  SparkUserRequestStatus,
  ClaimStaticDepositStatus,
} from '@buildonspark/spark-sdk/types'
import sha256Hash from './utils/hash.js'
import { encryptMessage } from './utils/encription.js'

const SPARK_TO_SPARK_FEE = 0
export let sparkWallet = {}

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

export const initializeSparkWallet = async ({ mnemonic }) => {
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
    const encrypted = await encryptMessage(JSON.stringify(message))
    window.ReactNativeWebView.postMessage(JSON.stringify({ encrypted }))
  } catch (err) {
    console.error('Encryption error during handleTransfer:', err)
  }
}

// -------------------------------
// All mnemonic instances in the coming functions should actualy be a hash of the mnemoinc. The only time you send the mnmoinc is during initialization.
// -------------------------------

export const removeWalletEventListener = ({ mnemonic }) => {
  const wallet = getWallet(mnemonic)

  if (wallet?.listenerCount('transfer:claimed')) {
    wallet.removeAllListeners('transfer:claimed')
  }
}
export const addWalletEventListener = ({ mnemonic }) => {
  const wallet = getWallet(mnemonic)
  wallet.on('transfer:claimed', handleTransfer)
}

export const getSparkIdentityPubKey = async ({ mnemonic }) => {
  try {
    return await getWallet(mnemonic).getIdentityPublicKey()
  } catch (err) {
    console.log('Get spark balance error', err)
  }
}

export const getSparkBalance = async ({ mnemonic }) => {
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

export const getSparkStaticBitcoinL1Address = async ({ mnemonic }) => {
  try {
    return await getWallet(mnemonic).getStaticDepositAddress()
  } catch (err) {
    console.log('Get reusable Bitcoin mainchain address error', err)
  }
}

export const queryAllStaticDepositAddresses = async ({ mnemonic }) => {
  try {
    return await getWallet(mnemonic).queryStaticDepositAddresses()
  } catch (err) {
    console.log('refund reusable Bitcoin mainchain address error', err)
  }
}

export const getSparkStaticBitcoinL1AddressQuote = async ({ txid, mnemonic }) => {
  try {
    const quote = await getWallet(mnemonic).getClaimStaticDepositQuote(txid)
    return { didwork: true, quote }
  } catch (err) {
    console.log('Get reusable Bitcoin mainchain address quote error', err)
    return { didwork: false, error: err.message }
  }
}

export const refundSparkStaticBitcoinL1AddressQuote = async ({
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
    console.log('refund reusable Bitcoin mainchain address error', err)
  }
}

export const claimnSparkStaticDepositAddress = async ({
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
    console.log('claim static deposit address error', err)
    return { didWork: false, error: err.message }
  }
}

export const getSparkAddress = async ({ mnemonic }) => {
  try {
    const response = await getWallet(mnemonic).getSparkAddress()
    return { didWork: true, response }
  } catch (err) {
    console.log('Get spark address error', err)
    return { didWork: false, error: err.message }
  }
}

export const sendSparkPayment = async ({ receiverSparkAddress, amountSats, mnemonic }) => {
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

export const sendSparkTokens = async ({ tokenIdentifier, tokenAmount, receiverSparkAddress, mnemonic }) => {
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

export const getSparkLightningPaymentFeeEstimate = async ({ invoice, amountSat, mnemonic }) => {
  try {
    const response = await getWallet(mnemonic).getLightningSendFeeEstimate({
      encodedInvoice: invoice.toLowerCase(),
      amountSats: amountSat,
    })
    return { didWork: true, response }
  } catch (err) {
    console.log('Get lightning payment fee error', err)
    return { didWork: false, error: err.message }
  }
}

export const getSparkBitcoinPaymentRequest = async ({ paymentId, mnemonic }) => {
  try {
    return await getWallet(mnemonic).getCoopExitRequest(paymentId)
  } catch (err) {
    console.log('Get bitcoin payment fee estimate error', err)
  }
}

export const getSparkBitcoinPaymentFeeEstimate = async ({ amountSats, withdrawalAddress, mnemonic }) => {
  try {
    const response = await getWallet(mnemonic).getWithdrawalFeeQuote({
      amountSats,
      withdrawalAddress: withdrawalAddress,
    })
    return { didWork: true, response }
  } catch (err) {
    console.log('Get bitcoin payment fee estimate error', err)
    return { didWork: false, error: err.message }
  }
}

export const getSparkPaymentFeeEstimate = async ({ amountSats, mnemonic }) => {
  try {
    const feeResponse = await getWallet(mnemonic).getSwapFeeEstimate(amountSats)
    return feeResponse.feeEstimate.originalValue || SPARK_TO_SPARK_FEE
  } catch (err) {
    console.log('Get bitcoin payment fee estimate error', err)
    return SPARK_TO_SPARK_FEE
  }
}

export const receiveSparkLightningPayment = async ({ amountSats, memo, mnemonic }) => {
  try {
    const response = await getWallet(mnemonic).createLightningInvoice({
      amountSats,
      memo,
      expirySeconds: 60 * 60 * 12, // 12 hour invoice expiry
    })
    return { didWork: true, response }
  } catch (err) {
    console.log('Receive lightning payment error', err)
    return { didWork: false, error: err.message }
  }
}

export const getSparkLightningSendRequest = async ({ id, mnemonic }) => {
  try {
    return await getWallet(mnemonic).getLightningSendRequest(id)
  } catch (err) {
    console.log('Get spark lightning send request error', err)
  }
}

export const getSparkLightningPaymentStatus = async ({ lightningInvoiceId, mnemonic }) => {
  try {
    return await getWallet(mnemonic).getLightningReceiveRequest(lightningInvoiceId)
  } catch (err) {
    console.log('Get lightning payment status error', err)
  }
}

export const sendSparkLightningPayment = async ({ invoice, maxFeeSats, amountSats, mnemonic }) => {
  try {
    const paymentResponse = await getWallet(mnemonic).payLightningInvoice({
      invoice: invoice.toLowerCase(),
      maxFeeSats: maxFeeSats,
      amountSatsToSend: amountSats,
    })
    return { didWork: true, paymentResponse }
  } catch (err) {
    console.log('Send lightning payment error', err)
    return { didWork: false, error: err.message }
  }
}

export const sendSparkBitcoinPayment = async ({
  onchainAddress,
  exitSpeed,
  amountSats,
  feeQuote,
  deductFeeFromWithdrawalAmount = false,
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
    console.log('Send Bitcoin payment error', err)
    return { didWork: false, error: err.message }
  }
}

export const getSparkTransactions = async ({ transferCount = 100, offsetIndex, mnemonic }) => {
  try {
    const response = await getWallet(mnemonic).getTransfers(transferCount, offsetIndex)
    const transfers = response.transfers.map((tx) => {
      delete tx.leaves
      return tx
    })
    return { transfers, offset: response.offset }
  } catch (err) {
    console.log('get spark transactions error', err)
    return { transfers: [] }
  }
}

export const getSparkTokenTransactions = async ({
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

    // 🧠 Filter only NEW transactions compared to last saved one
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
    console.log('get spark transactions error', err)
    return []
  }
}

export const sparkPaymentType = (tx) => {
  try {
    const isLightningPayment = tx.type === 'PREIMAGE_SWAP'
    const isBitcoinPayment = tx.type == 'COOPERATIVE_EXIT' || tx.type === 'UTXO_SWAP'
    const isSparkPayment = tx.type === 'TRANSFER'

    return isLightningPayment ? 'lightning' : isBitcoinPayment ? 'bitcoin' : 'spark'
  } catch (err) {
    console.log('Error finding which payment method was used', err)
  }
}

export const getSparkPaymentStatus = (status) => {
  return status === 'TRANSFER_STATUS_COMPLETED' ||
    status === LightningSendRequestStatus.TRANSFER_COMPLETED ||
    status === SparkCoopExitRequestStatus.SUCCEEDED ||
    status === LightningReceiveRequestStatus.TRANSFER_COMPLETED ||
    status === LightningSendRequestStatus.PREIMAGE_PROVIDED ||
    status === SparkLeavesSwapRequestStatus.SUCCEEDED ||
    status === SparkUserRequestStatus.SUCCEEDED ||
    status === ClaimStaticDepositStatus.TRANSFER_COMPLETED
    ? 'completed'
    : status === 'TRANSFER_STATUS_RETURNED' ||
      status === 'TRANSFER_STATUS_EXPIRED' ||
      status === 'TRANSFER_STATUS_SENDER_INITIATED' ||
      status === LightningSendRequestStatus.LIGHTNING_PAYMENT_FAILED ||
      status === SparkCoopExitRequestStatus.FAILED ||
      status === SparkCoopExitRequestStatus.EXPIRED ||
      status === LightningReceiveRequestStatus.TRANSFER_FAILED ||
      status === LightningReceiveRequestStatus.PAYMENT_PREIMAGE_RECOVERING_FAILED ||
      status === LightningReceiveRequestStatus.REFUND_SIGNING_COMMITMENTS_QUERYING_FAILED ||
      status === LightningReceiveRequestStatus.REFUND_SIGNING_FAILED ||
      status === SparkLeavesSwapRequestStatus.FAILED ||
      status === SparkLeavesSwapRequestStatus.EXPIRED ||
      status === SparkUserRequestStatus.FAILED ||
      status === ClaimStaticDepositStatus.TRANSFER_CREATION_FAILED ||
      status === ClaimStaticDepositStatus.REFUND_SIGNING_FAILED ||
      status === ClaimStaticDepositStatus.UTXO_SWAPPING_FAILED ||
      status === LightningReceiveRequestStatus.FUTURE_VALUE
    ? 'failed'
    : 'pending'
}

export const useIsSparkPaymentPending = (tx, transactionPaymentType) => {
  try {
    return (
      (transactionPaymentType === 'bitcoin' && tx.status === 'TRANSFER_STATUS_SENDER_KEY_TWEAK_PENDING') ||
      (transactionPaymentType === 'spark' && false) ||
      (transactionPaymentType === 'lightning' && tx.status === 'LIGHTNING_PAYMENT_INITIATED')
    )
  } catch (err) {
    console.log('Error finding is payment method is pending', err)
    return ''
  }
}

export const useIsSparkPaymentFailed = (tx, transactionPaymentType) => {
  try {
    return (
      (transactionPaymentType === 'bitcoin' && tx.status === 'TRANSFER_STATUS_RETURNED') ||
      (transactionPaymentType === 'spark' && tx.status === 'TRANSFER_STATUS_RETURNED') ||
      (transactionPaymentType === 'lightning' && tx.status === 'LIGHTNING_PAYMENT_INITIATED')
    )
  } catch (err) {
    console.log('Error finding is payment method is pending', err)
    return ''
  }
}

export const findTransactionTxFromTxHistory = async ({ sparkTxId, previousOffset = 0, previousTxs = [], mnemonic }) => {
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
