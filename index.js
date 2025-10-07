import * as Spark from "./src/index"; // import all your Spark wallet functions

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
  getSparkIdentityPubKey: Spark.getSparkIdentityPubKey,
  getSparkStaticBitcoinL1Address: Spark.getSparkStaticBitcoinL1Address,
  sendSparkPayment: Spark.sendSparkPayment,
  sendSparkTokens: Spark.sendSparkTokens,
  sendSparkLightningPayment: Spark.sendSparkLightningPayment,
  sendSparkBitcoinPayment: Spark.sendSparkBitcoinPayment,
  receiveSparkLightningPayment: Spark.receiveSparkLightningPayment,
  getSparkLightningPaymentStatus: Spark.getSparkLightningPaymentStatus,
  getSparkTransactions: Spark.getSparkTransactions,
  getSparkPaymentStatus: Spark.getSparkPaymentStatus,
};

// ✅ Allow React Native to trigger functions by posting a message
window.addEventListener("message", async (event) => {
  try {
    // Ignore messages coming from our mock postMessage
    console.log(event, "event");
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch (err) {
      console.log("Blocking, not from blitz");
    }
    if (!parsed) return;
    const data = parsed;
    if (data.isResponse) return;
    console.log(data, typeof data);
    const { action, args, id } = data;
    console.log("📨 Received:", action, args);

    if (!window.sparkAPI[action]) {
      throw new Error(`Unknown Spark action: ${action}`);
    }

    const result = await window.sparkAPI[action](args);

    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        id,
        success: true,
        result: JSON.stringify(result),
        isResponse: true,
      })
    );
  } catch (err) {
    console.error("Spark WebContext error:", err);
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ success: false, error: err.message })
    );
  }
});
