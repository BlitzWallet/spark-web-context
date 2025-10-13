# Spark Web Context for React Native

This library provides a background thread solution for using Spark in React Native. Since Spark operations can be computationally intensive, they sometimes block the main JavaScript thread. By offloading these operations to an enclosed JS process running inside a WebView, we move them off the main thread, creating a smoother and more responsive experience for users.

Security overview

For security, all communication between React Native and the WebView is encrypted. When the WebView first loads, the React Native application reads the bundled HTML Webpack file from the app’s assets. If the hash of this file does not match the expected hash stored with the app, the WebView is discarded, and the application falls back to using legacy on-device Spark functions.

If the hash matches—indicating the bundle has not been tampered with—the React Native application injects a per-session random nonce into the HTML bundle. The modified HTML is then saved to the app’s cache directory and loaded into the WebView.

Next, the React Native app generates a random private and public key pair (unique for the session) and initiates a handshake with the WebView. The WebView, in turn, generates its own key pair, creates a combined key (locked to the sessions random nonce), and responds with a handshake reply containing its public key and the random nonce encrypted with the combined key.

The React Native app then generates it's combined key (locked to the expected nonce) decrypts the nonce and verifies that it matches the one originally injected into the HTML. If the validation succeeds, this confirms that the HTML bundle is authentic, the WebView is legitimate, and all subsequent communication is secure.

Each event exchanged between the React Native app and the WebView includes a unique event ID, sequance number, and timestamp. The WebView tracks these IDs internally to prevent duplicate or replayed events from being processed. Because every session uses a newly generated encryption key, messages from previous sessions cannot be decrypted—ensuring message uniqueness across sessions and preventing replay attacks. During the same session the sequance number and timestamp prevent replay attacks.

The WebView environment itself is heavily locked down to reduce its attack surface. Features such as DOM storage, caching, and third-party cookies are disabled, and file access is tightly restricted. The WebView runs in incognito mode with debugging disabled, enforces a strict originWhitelist of local file URLs, and blocks all external or unverified requests via the onShouldStartLoadWithRequest callback. Additionally, if the WebView process terminates, it is automatically reloaded with all session keys and pending requests cleared, ensuring no residual data or state persists across reloads.

All variables within the HTML Webpack bundle are enclosed in closure functions, keeping them out of the global window scope, and nothing is permanently stored in the webview.

We send postMessage function calls with the appropriate arguments from the React Native layer and listen for success or error messages from the WebView context. This allows React Native apps to interact with Spark wallets, payments, and transactions seamlessly.

Webview Content Security Policy (CSP) Overview

To prevent injection and cross-site scripting (XSS) vectors from compromising the WebView content, a Content Security Policy (CSP) is applied. The CSP is designed to tightly control which sources can be loaded, how scripts may execute, and how connections can be established, while allowing the per-session nonce mechanism that protects inline scripts.

Key principles:

- Default policy denies everything by default and explicitly whitelists only what is necessary.
- Inline scripts must be accompanied by a valid nonce or prehashed value during build, ensuring only trusted, injected code runs.
- Script execution must be constrained to the app’s own context while permitting the required dynamic capabilities (e.g., 'unsafe-eval' and 'wasm-unsafe-eval' are allowed in this setup to support certain WebView and WebAssembly scenarios).
- External connections are restricted to secure origins (HTTPS) and WebSocket Secure (WSS) endpoints.
- All other potential attack surfaces (e.g., object sources, framing) are disabled.
- The nonce is dynamically injected per session to align with the per-session injection of the nonce into the HTML bundle.

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
