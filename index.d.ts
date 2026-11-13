/**
 * b20-kit type definitions.
 */
export interface TokenRecord {
  contract_address: string;
  symbol: string;   // e.g. "NVDAc"
  name: string;
  decimals: number;
  isin?: string;
  adgm_isin?: string;
  multiplier?: number;
  total_supply?: number;
  first_mint_date?: string;
  nav_price?: string;
  nav_price_updated_at?: string;
  icon_url?: string;
  description?: string;
}

export interface FeedRound {
  roundId: bigint;
  answer: bigint;   // 8 decimals, multiplier-adjusted token NAV
  startedAt: number;
  updatedAt: number;
  answeredInRound: bigint;
}

export interface Position {
  symbol: string;
  token: string;
  raw: bigint;         // token balance, 1e8 units
  shares: bigint;      // balanceOfUI, 1e8 units
  multiplier: number;  // 1.0 = 1 token per share
  feed: FeedRound | null;
  usd: number | null;  // only when a feed exists; never guessed
}

export interface Client {
  rpc: string;
  listTokens(): Promise<TokenRecord[]>;
  multiplier(token: string): Promise<number>;
  sharesOf(holder: string, token: string): Promise<bigint>;
  balanceOf(holder: string, token: string): Promise<bigint>;
  readFeed(feedAddress: string): Promise<FeedRound>;
  position(holder: string, token: string, symbol: string): Promise<Position>;
  portfolio(holder: string, tokens?: TokenRecord[]): Promise<Position[]>;
}

export declare const CHAINLINK_FEEDS: Record<string, string>;
export declare const MAINNET: { chainId: number; rpc: string };
export declare function createClient(opts?: { rpc?: string }): Client;
