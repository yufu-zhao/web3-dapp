export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
  provider: Eip1193Provider;
  walletType: "appkit";
  walletName?: string;
}
