import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/env';

export interface AnchorResult {
  anchored: boolean;
  txHash: string | null;
  chain: string;
}

/**
 * Optional testnet anchor. Disabled unless ANCHOR_ENABLED=true.
 * The hash is written as the data of a zero-value self-transfer. No contract is deployed.
 */
@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);

  constructor(private readonly config: AppConfig) {}

  async anchor(hash: string): Promise<AnchorResult> {
    if (!this.config.anchorEnabled) {
      return { anchored: false, txHash: null, chain: this.config.anchorChain };
    }
    if (!this.config.anchorRpcUrl || !this.config.anchorPrivateKey) {
      this.logger.warn('anchor enabled without a wallet; skipped');
      return { anchored: false, txHash: null, chain: this.config.anchorChain };
    }
    const { JsonRpcProvider, Wallet } = await import('ethers');
    const provider = new JsonRpcProvider(this.config.anchorRpcUrl);
    const wallet = new Wallet(this.config.anchorPrivateKey, provider);
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      data: `0x${hash}`,
    });
    this.logger.log({ chain: this.config.anchorChain, txHash: tx.hash }, 'anchored chain hash');
    return { anchored: true, txHash: tx.hash, chain: this.config.anchorChain };
  }
}
