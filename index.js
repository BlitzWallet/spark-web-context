import * as Spark from "./src/index.js";
import { loadKeys, sendTestingMessage } from "./src/tests.js";
import { decryptMessage, encryptMessage } from "./src/utils/encription.js";
import { generateECDHKey } from "./src/utils/encriptionKeys.js";

window.ecdhKeyPair = {};
window.devicePubkey = null;

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
  claimnSparkStaticDepositAddress: Spark.claimnSparkStaticDepositAddress,
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
    if (typeof event.data !== "string") return;
    let data = JSON.parse(event.data);

    if (data.isResponse) return;

    if (data?.action === "handshake:init" && data?.args?.pubN) {
      window.ecdhKeyPair = await generateECDHKey();
      const pubNObject = data?.args?.pubN;

      window.devicePubkey = pubNObject;

      const response = {
        id: data.id,
        success: true,
        type: "handshake:reply",
        pubW: Buffer.from(window.ecdhKeyPair.publicKey).toString("hex"),
        isResponse: true,
      };
      console.log("Session key established with native");
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
      return;
    }

    if (data.encrypted) {
      const decrypted = await decryptMessage(data.encrypted);
      const msg = JSON.parse(decrypted);
      data = msg;
    }

    if (data.action === "simulate_crash") {
      while (true) {
        window.location.reload();
      }
    }
    if (!window.sparkAPI[data.action]) {
      throw new Error(`Unknown Spark action: ${data.action}`);
    }

    const result = await window.sparkAPI[data.action](data.args);
    const response = {
      id: data.id,
      success: true,
      result: JSON.stringify(result),
      isResponse: true,
    };

    const encrypted = await encryptMessage(JSON.stringify(response));
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ encrypted, isResponse: true })
    );
  } catch (err) {
    console.error("Spark WebContext error:", err);
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ err: err.message, isResponse: true })
    );
  }
});

// CAN TEST METHODS HERE
// async function runTests() {
//   await loadKeys();

//   // await sendTestingMessage({
//   //   id: 1,
//   //   action: "initializeSparkWallet",
//   //   args: {
//   //     mnemonic:
//   //       "corn staff coin tuna senior reform liar grass forward where during blanket",
//   //   },
//   // });
//   // await sendTestingMessage({
//   //   id: 1,
//   //   action: "getSparkAddress",
//   //   args: {
//   //     mnemonic:
//   //       "corn staff coin tuna senior reform liar grass forward where during blanket",
//   //   },
//   // });
// }
// runTests();
