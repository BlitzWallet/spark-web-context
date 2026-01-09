import { FlashnetClient, getErrorMetadata, isFlashnetError } from '@flashnet/sdk'
const BLITZ_PUB_KEY = '031fa6899d8b8267af07cbb5ebbe2834f7e1c8fe9a282232570772ea5d34151ec6'
const FLASHNET_ERROR_CODE_REGEX = /\bFSAG-\d{4}(?:T\d+)?\b/

export const FlashnetAPI = (wallet) => {
  let flashnetClient = null

  const initializeFlashnetClient = async () => {
    try {
      flashnetClient = new FlashnetClient(wallet, { autoAuthenticate: true })
      await flashnetClient.initialize()
      console.log('Flashnet client initialized in webview')
      return { didWork: true }
    } catch (err) {
      console.error('Flashnet client initialization error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const getClient = () => {
    if (!flashnetClient) {
      throw new Error('Flashnet client not initialized')
    }
    return flashnetClient
  }

  // Pool Discovery & Querying
  const findBestPool = async ({ tokenAAddress, tokenBAddress, options = {} }) => {
    try {
      const client = getClient()
      const pools = await client.listPools({
        assetAAddress: tokenAAddress,
        assetBAddress: tokenBAddress,
        sort: 'TVL_DESC',
        minTvl: options.minTvl || 1000,
        limit: options.limit || 10,
      })

      if (!pools.pools || pools.pools.length === 0) {
        return {
          didWork: false,
          error: `No pools found for ${tokenAAddress}/${tokenBAddress}`,
        }
      }

      return {
        didWork: true,
        pool: pools.pools[0],
        totalAvailable: pools.totalCount,
      }
    } catch (err) {
      console.error('Find best pool error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const getPoolDetails = async ({ poolId }) => {
    try {
      const client = getClient()
      const pool = await client.getPool(poolId)

      return {
        didWork: true,
        pool,
        marketData: {
          tvl: pool.tvlAssetB,
          volume24h: pool.volume24hAssetB,
          priceChange24h: pool.priceChangePercent24h,
          currentPrice: pool.currentPriceAInB,
          reserves: {
            assetA: pool.assetAReserve,
            assetB: pool.assetBReserve,
          },
        },
      }
    } catch (err) {
      console.error('Get pool details error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const listAllPools = async ({ filters = {} }) => {
    try {
      const client = getClient()
      const response = await client.listPools({
        minTvl: filters.minTvl || 0,
        minVolume24h: filters.minVolume24h || 0,
        sort: filters.sort || 'TVL_DESC',
        limit: filters.limit || 50,
        offset: filters.offset || 0,
        hostNames: filters.hostNames,
        curveTypes: filters.curveTypes,
      })

      return {
        didWork: true,
        pools: response.pools,
        totalCount: response.totalCount,
      }
    } catch (err) {
      console.error('List pools error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const minFlashnetSwapAmounts = async ({ assetHex }) => {
    try {
      const client = getClient()
      const minMap = await client.getMinAmountsMap()
      // Convert bigInt to staralizable value
      const assetData = minMap.get(assetHex.toLowerCase())?.toString()

      return {
        didWork: true,
        assetData,
      }
    } catch (err) {
      console.error('Get min swap amounts error:', err)
      return { didWork: false, error: err.message }
    }
  }

  // Swap Simulation & Execution
  const simulateSwap = async ({ poolId, assetInAddress, assetOutAddress, amountIn }) => {
    try {
      const client = getClient()
      const simulation = await client.simulateSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: amountIn.toString(),
      })

      return {
        didWork: true,
        simulation: {
          expectedOutput: simulation.amountOut,
          executionPrice: simulation.executionPrice,
          priceImpact: simulation.priceImpactPct,
          poolId: simulation.poolId,
          feePaidAssetIn: simulation.feePaidAssetIn,
        },
      }
    } catch (err) {
      console.error('Simulate swap error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const executeSwap = async ({
    poolId,
    assetInAddress,
    assetOutAddress,
    amountIn,
    minAmountOut,
    maxSlippageBps = 500,
    integratorFeeRateBps = 100,
  }) => {
    try {
      const client = getClient()

      let calculatedMinOut = minAmountOut
      if (!calculatedMinOut) {
        const simulation = await client.simulateSwap({
          poolId,
          assetInAddress,
          assetOutAddress,
          amountIn: amountIn.toString(),
        })
        const output = BigInt(simulation.amountOut)
        const factor = 10_000n - BigInt(maxSlippageBps)
        calculatedMinOut = (output * factor) / 10_000n
      }

      const swap = await client.executeSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: amountIn.toString(),
        minAmountOut: calculatedMinOut.toString(),
        maxSlippageBps,
        integratorFeeRateBps,
        integratorPublicKey: BLITZ_PUB_KEY,
      })

      return {
        didWork: true,
        swap: {
          amountOut: swap.amountOut,
          executionPrice: swap.executionPrice,
          feeAmount: swap.feeAmount,
          flashnetRequestId: swap.flashnetRequestId,
          outboundTransferId: swap.outboundTransferId,
          poolId: swap.poolId,
        },
      }
    } catch (err) {
      console.error('Execute swap error:', err)
      return { didWork: false, error: err.message, formatted: formatError(err) }
    }
  }

  const swapBitcoinToToken = async ({ tokenAddress, amountSats, poolId, maxSlippageBps = 500 }) => {
    try {
      const BTC_ASSET_ADDRESS = '020202020202020202020202020202020202020202020202020202020202020202'

      let targetPoolId = poolId
      if (!targetPoolId) {
        const poolResult = await findBestPool({
          tokenAAddress: BTC_ASSET_ADDRESS,
          tokenBAddress: tokenAddress,
        })
        if (!poolResult.didWork) {
          return { didWork: false, error: 'No suitable pool found' }
        }
        targetPoolId = poolResult.pool.lpPublicKey
      }

      return await executeSwap({
        poolId: targetPoolId,
        assetInAddress: BTC_ASSET_ADDRESS,
        assetOutAddress: tokenAddress,
        amountIn: amountSats,
        maxSlippageBps,
      })
    } catch (err) {
      console.error('Swap BTC to token error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const swapTokenToBitcoin = async ({ tokenAddress, tokenAmount, poolId, maxSlippageBps = 500 }) => {
    try {
      const BTC_ASSET_ADDRESS = '020202020202020202020202020202020202020202020202020202020202020202'

      let targetPoolId = poolId
      if (!targetPoolId) {
        const poolResult = await findBestPool({
          tokenAAddress: tokenAddress,
          tokenBAddress: BTC_ASSET_ADDRESS,
        })
        if (!poolResult.didWork) {
          return { didWork: false, error: 'No suitable pool found' }
        }
        targetPoolId = poolResult.pool.lpPublicKey
      }

      return await executeSwap({
        poolId: targetPoolId,
        assetInAddress: tokenAddress,
        assetOutAddress: BTC_ASSET_ADDRESS,
        amountIn: tokenAmount,
        maxSlippageBps,
      })
    } catch (err) {
      console.error('Swap token to BTC error:', err)
      return { didWork: false, error: err.message }
    }
  }

  // Lightning Payments
  const getLightningPaymentQuote = async ({ invoice, tokenAddress }) => {
    try {
      const client = getClient()
      const quote = await client.getPayLightningWithTokenQuote(invoice, tokenAddress)

      return {
        didWork: true,
        quote: {
          invoiceAmountSats: quote.invoiceAmountSats,
          estimatedLightningFee: quote.estimatedLightningFee,
          btcAmountRequired: quote.btcAmountRequired,
          tokenAmountRequired: quote.tokenAmountRequired,
          estimatedAmmFee: quote.estimatedAmmFee,
          executionPrice: quote.executionPrice,
          priceImpact: quote.priceImpactPct,
          poolId: quote.poolId,
          fee: quote.btcAmountRequired - quote.invoiceAmountSats,
        },
      }
    } catch (err) {
      console.error('Get Lightning quote error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const payLightningWithToken = async ({
    invoice,
    tokenAddress,
    maxSlippageBps = 500,
    maxLightningFeeSats,
    rollbackOnFailure = true,
    useExistingBtcBalance = false,
    integratorFeeRateBps = 100,
  }) => {
    try {
      const client = getClient()
      const result = await client.payLightningWithToken({
        invoice,
        tokenAddress,
        maxSlippageBps,
        maxLightningFeeSats: maxLightningFeeSats || undefined,
        rollbackOnFailure,
        useExistingBtcBalance,
        integratorFeeRateBps,
        integratorPublicKey: BLITZ_PUB_KEY,
      })

      if (result.success) {
        return {
          didWork: true,
          result: {
            success: true,
            lightningPaymentId: result.lightningPaymentId,
            tokenAmountSpent: result.tokenAmountSpent,
            btcAmountReceived: result.btcAmountReceived,
            swapTransferId: result.swapTransferId,
            ammFeePaid: result.ammFeePaid,
            lightningFeePaid: result.lightningFeePaid,
            poolId: result.poolId,
          },
        }
      } else {
        return {
          didWork: false,
          error: result.error,
          result: {
            success: false,
            error: result.error,
            poolId: result.poolId,
            tokenAmountSpent: result.tokenAmountSpent,
            btcAmountReceived: result.btcAmountReceived,
          },
        }
      }
    } catch (err) {
      console.error('Pay Lightning with token error:', err)
      return { didWork: false, error: err.message }
    }
  }

  // Swap History
  const getUserSwapHistory = async () => {
    try {
      const client = getClient()
      const result = await client.getUserSwaps()

      return {
        didWork: true,
        swaps: result.swaps || [],
        totalCount: result.totalCount || 0,
      }
    } catch (err) {
      console.error('Get swap history error:', err)
      return { didWork: false, error: err.message, swaps: [] }
    }
  }

  // Manual Clawback & Recovery
  const requestClawback = async ({ sparkTransferId, poolId }) => {
    try {
      const client = getClient()
      const result = await client.clawback({
        sparkTransferId,
        lpIdentityPublicKey: poolId,
      })

      if (!result || result.error) {
        return {
          didWork: false,
          error: result?.error || 'Clawback request failed',
        }
      }

      if (result.accepted) {
        return {
          didWork: true,
          accepted: true,
          message: 'Clawback request accepted',
          internalRequestId: result.internalRequestId,
        }
      } else {
        return {
          didWork: false,
          accepted: false,
          error: result.error || 'Clawback request rejected by pool',
        }
      }
    } catch (err) {
      console.error('Request clawback error:', err)
      return { didWork: false, error: err.message }
    }
  }

  // Manual Clawback & Recovery
  const requestBatchClawback = async ({ transferIds, poolId }) => {
    try {
      const client = getClient()
      const result = await client.clawbackMultiple(transferIds, poolId)

      if (!result) {
        return {
          didWork: false,
          error: result?.error || 'Clawback request failed',
        }
      }

      if (result.length) {
        return {
          didWork: true,
          result,
        }
      } else {
        return {
          didWork: false,
          error: result.error || 'Clawback request rejected by pool',
        }
      }
    } catch (err) {
      console.error('Request clawback error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const checkClawbackEligibility = async ({ sparkTransferId }) => {
    try {
      const client = getClient()
      const eligibility = await client.checkClawbackEligibility({ sparkTransferId })

      if (eligibility.accepted) {
        return {
          didWork: true,
          error: null,
          response: true,
        }
      } else {
        return {
          didWork: true,
          error: eligibility.error,
          response: false,
        }
      }
    } catch (err) {
      console.error('Check clawback eligibility error:', err)
      return { didWork: false, error: err.message, response: false }
    }
  }

  const checkClawbackStatus = async ({ internalRequestId }) => {
    try {
      const client = getClient()
      const status = await client.checkClawbackStatus({ internalRequestId })

      return {
        didWork: true,
        status: status.status,
        transferId: status.transferId,
        isComplete: status.status === 'completed',
        isFailed: status.status === 'failed',
      }
    } catch (err) {
      console.error('Check clawback status error:', err)
      return { didWork: false, error: err.message }
    }
  }

  const listClawbackableTransfers = async ({ limit = 100 }) => {
    try {
      const client = getClient()
      const response = await client.listClawbackableTransfers({ limit })

      return {
        didWork: true,
        resposne: response,
      }
    } catch (err) {
      console.error('List clawbackable transfers error:', err)
      return { didWork: false, error: err.message }
    }
  }

  /**
   * Format error for logging
   */
  const formatError = (error, operation) => {
    if (isFlashnetError(error)) {
      return {
        operation,
        errorCode: error.errorCode,
        category: error.category,
        message: error.userMessage,
        actionHint: error.actionHint,
        requestId: error.requestId,
        isRetryable: error.isRetryable,
        recovery: error.recovery,
        transferIds: error.transferIds,
        clawbackAttempted: error.wasClawbackAttempted?.() || false,
        fundsRecovered: error.wereAllTransfersRecovered?.() || false,
      }
    }

    let parsedError
    if (typeof error === 'object') {
      parsedError = error.message
    } else {
      parsedError = error
    }

    const match = parsedError.match(FLASHNET_ERROR_CODE_REGEX)
    const errorCode = match?.[0] ?? null

    if (errorCode) {
      const metadata = getErrorMetadata(errorCode)

      return {
        operation,
        errorCode: errorCode,
        category: metadata.category,
        message: metadata.userMessage,
        actionHint: metadata.actionHint,
        isRetryable: metadata.isRetryable,
        recovery: metadata.recovery,
        transferIds: metadata.transferIds,
        clawbackAttempted: metadata.wasClawbackAttempted?.() || false,
        fundsRecovered: metadata.wereAllTransfersRecovered?.() || false,
      }
    }

    return {
      operation,
      message: error?.message || String(error),
    }
  }

  return {
    initializeFlashnetClient,
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
  }
}
