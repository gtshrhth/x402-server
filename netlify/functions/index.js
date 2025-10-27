const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// === 配置代币 ===
const TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";
const CHAIN_ID = 8453;
const REQUIRED_AMOUNT = ethers.parseUnits("1.0", 18);

const usedNonces = new Set();

// === 402 中间件 ===
app.use('/premium', async (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('402 ')) {
    return send402(res);
  }

  try {
    const payload = JSON.parse(Buffer.from(auth.slice(4), 'base64').toString());
    const { address, token, amount, chainId, nonce, expiresAt, signature } = payload;

    if (!address || !token || !amount || !chainId || !nonce || !expiresAt || !signature) {
      return res.status(400).json({ error: "Bad payload" });
    }

    if (Date.now() / 1000 > expiresAt) return res.status(410).json({ error: "Expired" });
    if (usedNonces.has(nonce)) return res.status(409).json({ error: "Already used" });
    if (chainId !== CHAIN_ID || token.toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) {
      return res.status(402).json({ error: "Wrong token or chain" });
    }
    if (BigInt(amount) < BigInt(REQUIRED_AMOUNT)) return send402(res, "Not enough");

    const message = JSON.stringify({ address, token, amount, chainId, nonce, expiresAt });
    const signer = ethers.verifyMessage(message, signature);
    if (signer.toLowerCase() !== address.toLowerCase()) {
      return res.status(403).json({ error: "Bad signature" });
    }

    usedNonces.add(nonce);
    setTimeout(() => usedNonces.delete(nonce), 600000);
    next();
  } catch (e) {
    res.status(400).json({ error: "Invalid header" });
  }
});

function send402(res, msg = "Payment required") {
  const nonce = Date.now().toString();
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  res.status(402).json({
    paymentRequired: true,
    message: msg,
    paymentRequirements: [{
      scheme: "exact",
      amount: REQUIRED_AMOUNT.toString(),
      token: { chainId: CHAIN_ID, address: TOKEN_ADDRESS }
    }],
    paymentAlternatives: [],
    nonce,
    expiresAt
  });
}

app.get('/premium/secret', (req, res) => {
  res.json({ message: "恭喜！你已用 X402 支付 1 个代币成功！" });
});

app.get('/', (req, res) => {
  res.json({ status: "X402 Server OK", test: "Go to /premium/secret" });
});

// 导出为 Netlify Function
module.exports.handler = serverless(app);