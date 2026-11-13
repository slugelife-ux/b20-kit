# b20-kit

Zero-dependency SDK for Coinbase tokenized stocks (B20) on Base — multiplier-correct portfolio reads and token discovery, for JavaScript and Python. Free forever, no API key, works against any Base RPC.

**Status: planned. Build not started.** This repo is the landing zone: the problems it solves are documented below with onchain facts, the API surface is decided.

## The problems (all verified onchain, 2026-11-13, Base mainnet 8453)

1. **B20 tokens have no contract bytecode.** They live at `0xb2…` addresses where `eth_getCode` returns `0xef` (one byte). Every generic tool that asks "is this a contract?" or tries to verify source answers wrong. ERC-20 calls (`symbol`, `balanceOf`, `totalSupply`) still work — the kit wraps them correctly.
2. **One token ≠ one share.** The redemption ratio is the onchain `uiMultiplier()` (WAD-scaled 1e18, ERC-8056 scheduled updates). After a dividend the multiplier becomes e.g. 1.02 and raw balances stay frozen. Tools that compute `balance × spot` are silently wrong; the correct read is `balanceOfUI(address)`, which applies the multiplier. The issuer's own docs warn about this in bold.
3. **No SDK exists.** npm and PyPI have nothing for B20 (`base-std` is Solidity interfaces only). Tokenized-stock apps today hand-roll all of this.
4. **Metadata is mutable and tokens are address-indexed**, not symbol-indexed. Discovery is the `B20Created` factory event plus the issuer's public records API (no key, paginated).

## Planned API

```js
import { B20Kit } from 'b20-kit'            // zero deps, node + browser

const kit = new B20Kit({ rpc: 'https://mainnet.base.org' })

const tokens = await kit.listTokens()                 // 348 records, address-keyed
const shares = await kit.sharesOf(holder, token)      // balanceOfUI, cross-checked
const pos = await kit.portfolio(holder)               // [{ symbol, raw, shares, navUsd, multiplier }]
const m = await kit.multiplier(token)                 // 1.02 — human number, WAD decoded
const pending = await kit.pendingMultiplier(token)    // ERC-8056 scheduled update + effectiveAt
```

```python
from b20_kit import B20Kit
kit = B20Kit(rpc="https://mainnet.base.org")
kit.portfolio(address)
```

Plays the same role the `tailfeed` SDK plays on the sister chain: the free, obvious way to read these tokens correctly, so builders land on the feeds naturally.

## Rules kept

- Read-only. Never a seed phrase, key, or signing path.
- "Coinbase tokenized stocks (B20)" — the issuer's own naming, always.
- Not affiliated with Coinbase or Base.

## License

MIT
