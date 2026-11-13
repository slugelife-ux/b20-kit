/**
 * b20-kit — zero-dependency SDK for Coinbase tokenized stocks (B20) on Base.
 * Works in browsers and Node 18+ (global fetch). Read-only: no keys, no signing.
 *
 * What it fixes (all verified onchain 2026-11-13, chain 8453):
 *  1. B20 tokens are precompiles: eth_getCode returns 0xef, so generic
 *     tooling that checks "is this a contract" breaks. Here, reads just work.
 *  2. One token != one share: the redemption ratio is uiMultiplier (WAD, 1e18).
 *     Correct share count = balanceOfUI, which the kit reads directly.
 *  3. No SDK existed on npm/PyPI for these tokens.
 */

const WAD = 10n ** 18n;
const SEL_BALANCE_OF = '0x70a08231';
const SEL_BALANCE_OF_UI = '0x437a9958';
const SEL_UI_MULTIPLIER = '0xa60bf13d';    // ERC-8056 alias (mainnet answers this)
const SEL_MULTIPLIER = '0x1b3ed722';       // canonical B20 name (some builds answer only this)
const SEL_LATEST_ROUND = '0xfeaf968c';
const padAddr = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

const word = (hex, i) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
const asInt = (w) => BigInt.asIntN(256, w);

async function rpcCall(rpc, method, params) {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

/** Chainlink Coinbase feed proxies on Base (multiplier-adjusted token NAV, 8 decimals). */
export const CHAINLINK_FEEDS = {
  AAPL: '0x787f13dEa48Db0897CbCDD985de77809D837F988',
  AMZN: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295',
  GOOGL: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2',
  META: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D',
  MSFT: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c',
  MSTR: '0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a',
  NVDA: '0x04689a41629776563E6822F76f2e57D148d28513',
  SNDK: '0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA',
  SPCX: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68',
  TSLA: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4',
};

/**
 * @param {object} opts
 * @param {string} opts.rpc  JSON-RPC endpoint (default: public Base mainnet)
 */
export function createClient(opts = {}) {
  const rpc = opts.rpc || 'https://mainnet.base.org';
  const call = (to, data) => rpcCall(rpc, 'eth_call', [{ to, data }, 'latest']);

  /** All tokenized-stock records from the issuer's public API (paginated, no key). */
  async function listTokens() {
    const out = [];
    let pageToken = null;
    for (let i = 0; i < 12; i++) {
      const url = 'https://api.coinbase.com/v1/tokenized-stocks?page_size=500'
        + (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '');
      const r = await fetch(url, { headers: { 'User-Agent': 'b20-kit/0.1' } });
      const d = await r.json();
      out.push(...d.tokens);
      pageToken = d.next_page_token;
      if (!pageToken) break;
    }
    return out; // address-keyed, symbol like "NVDAc"; tokens are identified by ADDRESS
  }

  /** Current redemption ratio as a human number (1.0 = 1 token per share). WAD-decoded. */
  async function multiplier(token) {
    try {
      const hex = await call(token, SEL_UI_MULTIPLIER);
      return Number(BigInt(hex)) / 1e18;
    } catch {
      const hex = await call(token, SEL_MULTIPLIER); // canonical-name fallback
      return Number(BigInt(hex)) / 1e18;
    }
  }

  /** Share-equivalent balance: the token's own balanceOfUI (applies the multiplier). */
  async function sharesOf(holder, token) {
    const hex = await call(token, SEL_BALANCE_OF_UI + padAddr(holder));
    return BigInt(hex); // raw 1e8-units (B20 tokenized stocks use 8 decimals)
  }

  async function balanceOf(holder, token) {
    const hex = await call(token, SEL_BALANCE_OF + padAddr(holder));
    return BigInt(hex);
  }

  /** AggregatorV3 read for any feed address (Chainlink's or b20-feeds' proxies). */
  async function readFeed(feedAddress) {
    const hex = await call(feedAddress, SEL_LATEST_ROUND);
    return {
      roundId: word(hex, 0),
      answer: asInt(word(hex, 1)),        // 8 decimals, multiplier-adjusted token NAV
      startedAt: Number(word(hex, 2)),
      updatedAt: Number(word(hex, 3)),
      answeredInRound: word(hex, 4),
    };
  }

  /**
   * Position for one holding. USD is computed ONLY where a feed exists;
   * unpriced tokens are counted, never guessed.
   * @param {string} symbol  base symbol without the trailing c (e.g. "NVDA")
   */
  async function position(holder, token, symbol) {
    const [raw, m, feedAddr] = await Promise.all([
      balanceOf(holder, token),
      multiplier(token),
      Promise.resolve(CHAINLINK_FEEDS[symbol] || null),
    ]);
    const shares = await sharesOf(holder, token);
    const pos = {
      symbol: symbol + 'c',
      token,
      raw,                     // BigInt, 1e8 units
      shares,                  // BigInt, balanceOfUI
      multiplier: m,
      feed: null,
      usd: null,
    };
    if (feedAddr) {
      const f = await readFeed(feedAddr);
      pos.feed = f;
      pos.usd = Number(raw * f.answer) / 1e16; // raw(1e8) x answer(1e8) -> usd
    }
    return pos;
  }

  /** Whole portfolio (every minted token the holder has a balance in). */
  async function portfolio(holder, tokens) {
    const list = tokens || (await listTokens()).filter((t) => t.total_supply);
    const out = [];
    for (const t of list) {
      const raw = await balanceOf(holder, t.contract_address);
      if (raw > 0n) out.push(await position(holder, t.contract_address, t.symbol.replace(/c$/, '')));
    }
    return out;
  }

  return { rpc, listTokens, multiplier, sharesOf, balanceOf, readFeed, position, portfolio };
}

export const MAINNET = { chainId: 8453, rpc: 'https://mainnet.base.org' };
