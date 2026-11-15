/**
 * EcoRoute Fleet - Cryptographic Hash Chain & Anchor Signing Engine
 * Implements SHA-256 tamper-evident chaining and HMAC-SHA256 anchor checkpoints
 */

import crypto from 'crypto';
import { ChainAnchor, HashChainBlock } from '../types';

export const GENESIS_HASH = '0'.repeat(64);

const ANCHOR_SECRET =
  process.env.ECOROUTE_ANCHOR_SECRET ||
  process.env.AUTH_SECRET ||
  'ecoroute-fleet-anchor-signing-key-2026';

export const HASH_CHAIN_CONTRACT = {
  algorithm: 'SHA-256',
  genesisPrevHash: GENESIS_HASH,
  canonicalFormat: 'prevHash + "\\n" + JSON.stringify([truckId, tripId, seq, ts, speedKmh, rpm, fuelRateLph, engineLoadPct, coolantC, cargoKg, idle, fuelMl, co2G])',
  fieldsOrder: [
    'truckId',
    'tripId',
    'seq',
    'ts',
    'speedKmh',
    'rpm',
    'fuelRateLph',
    'engineLoadPct',
    'coolantC',
    'cargoKg',
    'idle',
    'fuelMl',
    'co2G',
  ],
  anchorSigning: 'HMAC-SHA256(truckId + ":" + headSeq + ":" + headHash + ":" + blockCount + ":" + anchoredAt)',
};

export function computeBlockHash(
  prevHash: string,
  recordData: HashChainBlock['recordData']
): string {
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

export function signChainAnchor(
  truckId: string,
  headSeq: number,
  headHash: string,
  blockCount: number,
  anchoredAt: string
): ChainAnchor {
  const message = `${truckId}:${headSeq}:${headHash}:${blockCount}:${anchoredAt}`;
  const anchorSignature = crypto
    .createHmac('sha256', ANCHOR_SECRET)
    .update(message)
    .digest('hex');

  return {
    truckId,
    headSeq,
    headHash,
    blockCount,
    anchoredAt,
    anchorSignature,
  };
}

export function verifyChainAnchor(anchor: ChainAnchor): boolean {
  const message = `${anchor.truckId}:${anchor.headSeq}:${anchor.headHash}:${anchor.blockCount}:${anchor.anchoredAt}`;
  const expected = crypto
    .createHmac('sha256', ANCHOR_SECRET)
    .update(message)
    .digest('hex');

  if (expected.length !== anchor.anchorSignature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(anchor.anchorSignature));
}

export function appendTelemetryBlock(
  existingBlocksForTruck: HashChainBlock[],
  recordInput: Omit<HashChainBlock['recordData'], 'seq'>,
  eventId?: string
): { block: HashChainBlock; anchor: ChainAnchor } {
  const sorted = [...existingBlocksForTruck].sort((a, b) => a.seq - b.seq);
  const lastBlock = sorted[sorted.length - 1];
  const prevHash = lastBlock ? lastBlock.hash : GENESIS_HASH;
  const seq = lastBlock ? lastBlock.seq + 1 : 1;

  const recordData: HashChainBlock['recordData'] = {
    ...recordInput,
    seq,
  };

  const hash = computeBlockHash(prevHash, recordData);
  const block: HashChainBlock = {
    seq,
    prevHash,
    hash,
    status: 'Verified',
    timestamp: recordInput.ts,
    eventId,
    recordData,
  };

  const anchor = signChainAnchor(
    recordInput.truckId,
    seq,
    hash,
    sorted.length + 1,
    new Date().toISOString()
  );

  return { block, anchor };
}

export interface VerificationResult {
  verified: boolean;
  totalRecords: number;
  chainsChecked: number;
  anchorsVerified: boolean;
  firstBadTruckId?: string;
  firstBadSeq?: number;
  errorReason?: string;
  checkedAt: string;
}

export function verifySingleTruckChain(blocks: HashChainBlock[], anchor?: ChainAnchor): VerificationResult {
  const sorted = [...blocks].sort((a, b) => a.seq - b.seq);
  const now = new Date().toISOString();

  if (sorted.length === 0) {
    return { verified: true, totalRecords: 0, chainsChecked: 1, anchorsVerified: true, checkedAt: now };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];

    if (i > 0 && block.seq !== sorted[i - 1].seq + 1) {
      return {
        verified: false,
        totalRecords: sorted.length,
        chainsChecked: 1,
        anchorsVerified: false,
        firstBadTruckId: block.recordData.truckId,
        firstBadSeq: block.seq,
        errorReason: `Sequence gap for ${block.recordData.truckId} between #${sorted[i - 1].seq} and #${block.seq}.`,
        checkedAt: now,
      };
    }

    if (block.prevHash !== expectedPrevHash) {
      return {
        verified: false,
        totalRecords: sorted.length,
        chainsChecked: 1,
        anchorsVerified: false,
        firstBadTruckId: block.recordData.truckId,
        firstBadSeq: block.seq,
        errorReason: `Previous hash mismatch at ${block.recordData.truckId} sequence #${block.seq}.`,
        checkedAt: now,
      };
    }

    const recomputed = computeBlockHash(block.prevHash, block.recordData);
    if (recomputed !== block.hash) {
      return {
        verified: false,
        totalRecords: sorted.length,
        chainsChecked: 1,
        anchorsVerified: false,
        firstBadTruckId: block.recordData.truckId,
        firstBadSeq: block.seq,
        errorReason: `Hash mismatch at ${block.recordData.truckId} sequence #${block.seq}. Record payload has been tampered with.`,
        checkedAt: now,
      };
    }

    expectedPrevHash = block.hash;
  }

  if (anchor) {
    const head = sorted[sorted.length - 1];
    const sigOk = verifyChainAnchor(anchor);
    if (!sigOk || anchor.headHash !== head.hash || anchor.headSeq !== head.seq || anchor.blockCount !== sorted.length) {
      return {
        verified: false,
        totalRecords: sorted.length,
        chainsChecked: 1,
        anchorsVerified: false,
        firstBadTruckId: head.recordData.truckId,
        firstBadSeq: head.seq,
        errorReason: `Anchor verification failed for ${head.recordData.truckId} at head sequence #${head.seq}.`,
        checkedAt: now,
      };
    }
  }

  return {
    verified: true,
    totalRecords: sorted.length,
    chainsChecked: 1,
    anchorsVerified: true,
    checkedAt: now,
  };
}

export function verifyChain(blocks: HashChainBlock[], anchors: ChainAnchor[] = []): VerificationResult {
  const now = new Date().toISOString();
  if (blocks.length === 0) {
    return { verified: true, totalRecords: 0, chainsChecked: 0, anchorsVerified: true, checkedAt: now };
  }

  const byTruck = new Map<string, HashChainBlock[]>();
  for (const b of blocks) {
    const tid = b.recordData.truckId || 'UNKNOWN';
    if (!byTruck.has(tid)) byTruck.set(tid, []);
    byTruck.get(tid)!.push(b);
  }

  for (const [truckId, truckBlocks] of byTruck.entries()) {
    const anchor = anchors.find((a) => a.truckId === truckId);
    const res = verifySingleTruckChain(truckBlocks, anchor);
    if (!res.verified) {
      return {
        ...res,
        totalRecords: blocks.length,
        chainsChecked: byTruck.size,
      };
    }
  }

  return {
    verified: true,
    totalRecords: blocks.length,
    chainsChecked: byTruck.size,
    anchorsVerified: true,
    checkedAt: now,
  };
}
