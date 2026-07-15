/**
 * Live Polymarket micro-order harness — YOU run this, it places a REAL order.
 *
 * Usage (PowerShell):
 *   $env:TOKEN_ID="<clob token id>"; $env:PRICE="0.50"; $env:USD="1"; npx tsx scripts/polymarket-microorder.ts
 *
 * Prerequisites (the new resolvePolymarketWallet throws without these — by design):
 *   1. A funded wallet private key in the vault (~/.must-b/.trader_keys).
 *   2. DEPOSIT_WALLET_ADDRESS set in ~/.must-b/config.json (your Polymarket deposit wallet).
 *      Optionally POLYMARKET_SIGNATURE_TYPE (1/2/3); defaults to 3 = POLY_1271.
 *
 * It prints the [PROXY] + [PREFLIGHT] logs and the raw CLOB response (incl. orderID).
 * An order is only "solved" once this prints a real orderID AND it fills on-chain.
 */
import {
  PolymarketL2Client,
  ensurePolymarketL2Creds,
  resolvePolymarketWallet,
  getEngineLogs,
} from '../src/core/trading-engine.js';
import { TraderVault } from '../src/core/trader_vault.js';

async function main() {
  const tokenId = process.env.TOKEN_ID;
  const price = Number(process.env.PRICE || '0.5');
  const usd = Number(process.env.USD || '1');
  if (!tokenId) throw new Error('Set TOKEN_ID env var (the CLOB token id you want to buy).');

  // Resolve the active wallet private key from the vault.
  let privateKey = '';
  const activeAddress = TraderVault.getActiveAddress();
  const wallets = TraderVault.getWallets();
  const active = activeAddress
    ? wallets.find((w) => w.address.toLowerCase() === activeAddress.toLowerCase())
    : undefined;
  privateKey = (active?.privateKey || TraderVault.getKeys('polymarket')?.walletPrivateKey || '').trim();
  if (!privateKey) throw new Error('No wallet private key found in the vault.');

  const { privateKeyToAccount } = await import('viem/accounts');
  const pkHex = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const eoa = privateKeyToAccount(pkHex).address;

  // Proves the config-driven funder + signatureType resolution (no HTTP guessing).
  const resolved = await resolvePolymarketWallet(eoa);
  console.log('[PROXY]', JSON.stringify(resolved));

  const creds = await ensurePolymarketL2Creds(privateKey);
  if (!creds?.apiKey) throw new Error('Could not obtain L2 API credentials.');

  const client = new PolymarketL2Client(creds.apiKey, creds.apiSecret, creds.apiPassphrase);
  const size = usd / price; // shares
  console.log(`[ORDER] tokenID=${tokenId} price=${price} usd=$${usd} size=${size}`);

  const resp = await client.executeOrder(privateKey, {
    tokenId,
    price,
    size,
    side: 'BUY',
    walletAddr: eoa,
  });

  console.log('[RESPONSE]', JSON.stringify(resp, null, 2));
  console.log('--- engine logs ---');
  console.log(getEngineLogs().join('\n'));
}

main().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
