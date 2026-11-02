/**
 * EcoRoute Fleet - Cryptographic Hash Chain Engine
 * Implements SHA-256 tamper-evident chaining as specified in Section 6.7
 */

import crypto from 'crypto';
import { HashChainBlock } from '../types';

export const GENESIS_HASH = '0'.repeat(64);

export function computeBlockHash(
  prevHash: string,
  recordData: HashChainBlock['recordData']
): string {
  // Deterministic canonical array serialization
  const payloadArray = [
    recordData.truckId,
    recordData.tripId,
    recordData.seq,
    recordData.ts,
    recordData.speedKmh,
    recordData.rpm,
    recordData.fuelRateLph,
    recordData.engineLoadPct,
    recordData.coolantC,
    recordData.cargoKg,
    recordData.idle,
    recordData.fuelMl,
    recordData.co2G,
  ];

  const canonicalString = prevHash + '\n' + JSON.stringify(payloadArray);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export interface VerificationResult {
  verified: boolean;
  totalRecords: number;
  firstBadSeq?: number;
  errorReason?: string;
  checkedAt: string;
}

export function verifyChain(blocks: HashChainBlock[]): VerificationResult {
  const sorted = [...blocks].sort((a, b) => a.seq - b.seq);
  const now = new Date().toISOString();

  if (sorted.length === 0) {
    return { verified: true, totalRecords: 0, checkedAt: now };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];

    // 1. Check sequence number contiguity
    if (i > 0 && block.seq !== sorted[i - 1].seq + 1) {
      return {
        verified: false,
        totalRecords: sorted.length,
        firstBadSeq: block.seq,
        errorReason: `Missing sequence gap between ${sorted[i - 1].seq} and ${block.seq}`,
        checkedAt: now,
      };
    }

    // 2. Check previous hash linkage
    if (block.prevHash !== expectedPrevHash) {
      return {
        verified: false,
        totalRecords: sorted.length,
        firstBadSeq: block.seq,
        errorReason: `Previous hash mismatch at sequence #${block.seq}. Expected ${expectedPrevHash.slice(0, 8)}... but got ${block.prevHash.slice(0, 8)}...`,
        checkedAt: now,
      };
    }

    // 3. Recompute hash
    const recomputed = computeBlockHash(block.prevHash, block.recordData);
    if (recomputed !== block.hash) {
      return {
        verified: false,
        totalRecords: sorted.length,
        firstBadSeq: block.seq,
        errorReason: `Hash mismatch at sequence #${block.seq}. Record payload has been tampered with!`,
        checkedAt: now,
      };
    }

    expectedPrevHash = block.hash;
  }

  return {
    verified: true,
    totalRecords: sorted.length,
    checkedAt: now,
  };
}
