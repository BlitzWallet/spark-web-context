# Spark Web Context for React Native

This library provides a proxi multi-threading option for using Spark in react-native. Because Spark operations are computationaly intensive, it sometimmes blocks the main JS thread. By moving the Spark operations to a Webview, we can move the operations off the main thread creating a smoother expirnce for our users.

For security reasons we use encripted communication between react-native and the Webview. When first loading, the webview and react-native companion application do a handshake sending eachother thier public keys. From then on all communication is encirpted with the combined key. The webview is also fully containerized allowing no outside calls other than to Spark, with no information being saved, all informtion is temporary.

We inject function calls with the appropriate arguments from the React Native layer and listen for success or error messages from the WebView context. This allows React Native apps to interact with Spark wallets, payments, and transactions seamlessly.

## Features

- Full Spark Wallet implementation
- Encrypted communication between React Native and WebView
- Fully testable in a browser without React Native

## Installation

```bash
npm install spark-web-context@https://github.com/blitzwallet/spark-web-context.git
# or
yarn add spark-web-context@https://github.com/blitzwallet/spark-web-context.git

```

## Example Usage

```
import { WebView, WebViewMessageEvent } from "react-native-webview";

const html = require("spark-web-context");

// Example handler for messages from the Spark WebView
const handleSparkMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data);
  <!-- Must decrypt message -->
  if (data.err) {
    console.error("Spark error:", data.err);
  } else {
    console.log("Spark result:", data.result);
  }
};

export const SparkWebView = () => {
  return (
    <WebView
      source={html}
      originWhitelist={["*"]}
      onMessage={handleSparkMessage}
    />
  );
};
```

# How it Works

Expose Spark API
All Spark wallet functions are exposed on window.sparkAPI and can be called from React Native by posting messages to the WebView.

Secure Communication
Messages are encrypted/decrypted using ECDH key exchange. React Native initiates a handshake to establish a session key.

WebView Event Listener
The WebView listens for messages, decrypts them if necessary, executes the requested Spark action, and sends the result encrypted back to React Native.

Mocking for Browser Testing
The WebView can be mocked in a browser for local testing, allowing you to call Spark functions without a React Native environment.

# Exposed Spark Functions

- initializeSparkWallet
- getSparkBalance
- getSparkAddress
- getSparkIdentityPubKey
- getSparkStaticBitcoinL1Address
- QueryAllStaticDepositAddresses
- getSparkStaticBitcoinL1AddressQuote
- sendSparkPayment
- sendSparkTokens
- sendSparkLightningPayment
- sendSparkBitcoinPayment
- receiveSparkLightningPayment
- getSparkLightningPaymentStatus
- getSparkTransactions
- getSparkPaymentStatus
- getSparkLightningPaymentFeeEstimate
- getSparkBitcoinPaymentRequest
- getSparkBitcoinPaymentFeeEstimate
- getSparkPaymentFeeEstimate
- getSparkLightningSendRequest
- getSparkTokenTransactions

## Contribute

We rely on GitHub for bug tracking. Before reporting a new bug, please take a moment to search the <a href='https://github.com/BlitzWallet/spark-web-context/issues'>existing issues</a> to see if your problem has already been addressed. If you can't find an existing report, feel free to create a new issue.

Moreover, we encourage contributions to the project by submitting pull requests to improve the codebase or introduce new features. All pull requests will be thoroughly reviewed by members of the Blitz team. Your contributions are invaluable to us!

## License

Blitz is released under the terms of the Apache 2.0 license. See LICENSE for more information.
