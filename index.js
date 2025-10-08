import * as Spark from "./src/index";
import {
  decryptMessage,
  deriveSessionKey,
  encryptMessage,
  exportPublicKey,
  generateECDHKey,
  importPublicKey,
} from "./src/utils/encription";

window.sessionKey = null;
window.ecdhKeyPair = {};

// ✅ Mock WebView for browser testing
if (!window.ReactNativeWebView) {
  console.log("🧩 Mocking ReactNativeWebView for local testing...");
  window.ReactNativeWebView = {
    postMessage: (msg) => {
      console.log("[Mock postMessage] -> RN:", msg);
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent("message", { data: msg }));
      }, 500);
    },
  };
}

// ✅ Expose callable Spark functions to React Native
window.sparkAPI = {
  initializeSparkWallet: Spark.initializeSparkWallet,
  getSparkBalance: Spark.getSparkBalance,
  getSparkAddress: Spark.getSparkAddress,
  getSparkIdentityPubKey: Spark.getSparkIdentityPubKey,
  getSparkStaticBitcoinL1Address: Spark.getSparkStaticBitcoinL1Address,
  queryAllStaticDepositAddresses: Spark.queryAllStaticDepositAddresses,
  getSparkStaticBitcoinL1AddressQuote:
    Spark.getSparkStaticBitcoinL1AddressQuote,
  sendSparkPayment: Spark.sendSparkPayment,
  sendSparkTokens: Spark.sendSparkTokens,
  sendSparkLightningPayment: Spark.sendSparkLightningPayment,
  sendSparkBitcoinPayment: Spark.sendSparkBitcoinPayment,
  receiveSparkLightningPayment: Spark.receiveSparkLightningPayment,
  getSparkLightningPaymentStatus: Spark.getSparkLightningPaymentStatus,
  getSparkTransactions: Spark.getSparkTransactions,
  getSparkPaymentStatus: Spark.getSparkPaymentStatus,
  getSparkLightningPaymentFeeEstimate:
    Spark.getSparkLightningPaymentFeeEstimate,
  getSparkBitcoinPaymentRequest: Spark.getSparkBitcoinPaymentRequest,
  getSparkBitcoinPaymentFeeEstimate: Spark.getSparkBitcoinPaymentFeeEstimate,
  getSparkPaymentFeeEstimate: Spark.getSparkPaymentFeeEstimate,
  getSparkLightningSendRequest: Spark.getSparkLightningSendRequest,
  getSparkTokenTransactions: Spark.getSparkTokenTransactions,
};

// ✅ Allow React Native to trigger functions by posting a message
window.addEventListener("message", async (event) => {
  try {
    let data = JSON.parse(event.data);

    if (data.isResponse) return;
    const { action, args, id } = data;

    if (action === "handshake:init" && args.pubN) {
      window.ecdhKeyPair = await generateECDHKey();
      const pubW = await exportPublicKey(window.ecdhKeyPair.publicKey);
      const nativePub = await importPublicKey(args.pubN);
      window.sessionKey = await deriveSessionKey(
        window.ecdhKeyPair.privateKey,
        nativePub
      );
      const response = {
        id,
        success: true,
        type: "handshake:reply",
        pubW,
        isResponse: true,
      };
      console.log("🔐 Session key established with native");
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
      return;
    }

    if (data.encrypted && window.sessionKey) {
      const decrypted = await decryptMessage(data.encrypted);
      const msg = JSON.parse(decrypted);
      data = msg;
      console.log("📩 Decrypted from native:", msg);
    }

    if (!window.sparkAPI[action]) {
      throw new Error(`Unknown Spark action: ${action}`);
    }

    const result = await window.sparkAPI[action](args);
    const response = {
      id,
      success: true,
      result: JSON.stringify(result),
      isResponse: true,
    };

    if (window.sessionKey) {
      const encrypted = await encryptMessage(JSON.stringify(response));
      window.ReactNativeWebView.postMessage(JSON.stringify({ encrypted }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
    }
  } catch (err) {
    console.error("Spark WebContext error:", err);
  }
});
