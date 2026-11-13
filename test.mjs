// Live test against Base mainnet (read-only, no keys).
// Uses the holder found and cross-verified by tools/b20_position_check.py.
import { createClient, CHAINLINK_FEEDS } from './index.js';

const RPC = 'https://base-rpc.publicnode.com'; // log/call-friendly free endpoint
const NVDA_HOLDER = '0xf668e21993f0acd7ab00bb1cfbaed0df28a3c8ec'; // verified 2026-11-13

const kit = createClient({ rpc: RPC });
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

const tokens = await kit.listTokens();
check('listTokens returns the full registry', tokens.length >= 340, `count=${tokens.length}`);
const nvda = tokens.find((t) => t.symbol === 'NVDAc');
check('NVDAc record present with address', !!nvda && nvda.contract_address.startsWith('0x'), nvda?.contract_address);

const m = await kit.multiplier(nvda.contract_address);
check('multiplier decodes WAD correctly', Math.abs(m - Number(nvda.multiplier)) < 1e-9,
  `onchain=${m.toFixed(9)} api=${nvda.multiplier}`);

const shares = await kit.sharesOf(NVDA_HOLDER, nvda.contract_address);
const rawBal = await kit.balanceOf(NVDA_HOLDER, nvda.contract_address);
const mWad = BigInt(Math.round(m * 1e18));
const computed = (rawBal * mWad) / 10n ** 18n; // issuer formula, truncating
check('sharesOf (balanceOfUI) equals balance x multiplier / 1e18',
  shares === computed, `balanceOfUI=${(Number(shares) / 1e8).toFixed(6)} computed=${(Number(computed) / 1e8).toFixed(6)} (holder trades live; self-consistent check)`);

const feed = await kit.readFeed(CHAINLINK_FEEDS.NVDA);
check('readFeed returns a live AggregatorV3 round',
  feed.answer > 100n * 10n ** 8n && feed.answer < 300n * 10n ** 8n && feed.updatedAt > 0,
  `answer=$${Number(feed.answer) / 1e8} updated=${Math.round((Date.now() / 1000 - feed.updatedAt) / 60)}m ago`);

const pos = await kit.position(NVDA_HOLDER, nvda.contract_address, 'NVDA');
// Independent arithmetic: usd should equal shares x (token NAV / multiplier)
// i.e. the per-SHARE price. If the SDK double-applied the multiplier this
// would be off by the multiplier factor.
const perShare = (Number(pos.feed.answer) / 1e8) / pos.multiplier;
const usdExpected = (Number(pos.shares) / 1e8) * perShare;
check('position: shares math + priced USD, no double multiplier',
  pos.usd !== null && Math.abs(pos.usd - usdExpected) / usdExpected < 0.005,
  `usd=$${pos.usd?.toLocaleString()} vs shares*per-share=$${usdExpected.toFixed(0)}`);

const tail = tokens.find((t) => t.symbol === 'AMDc');
const tailPos = await kit.position(NVDA_HOLDER, tail.contract_address, 'AMD');
check('unpriced tail token is counted, never priced', tailPos.usd === null, `raw=${tailPos.raw}`);

console.log(failures === 0 ? '\nALL LIVE CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
