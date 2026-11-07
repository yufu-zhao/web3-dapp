export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  disconnect?(): Promise<void>;
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
  provider: Eip1193Provider;
  walletType: "injected" | "walletconnect";
  walletName?: string;
}
