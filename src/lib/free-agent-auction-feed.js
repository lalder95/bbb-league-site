import clientPromise from '@/lib/mongodb';
import {
  getMediaFeedSyncState,
  updateMediaFeedSyncState,
  upsertMediaFeedItem,
} from '@/lib/db-helpers';
import { generateAuctionReaction } from '@/lib/free-agent-auction-reactions';
import {
  getDraftTimeZone,
  getPlayerEndTime,
  resolveBlindAuctionOutcome,
} from '@/utils/freeAgentAuctionUtils';
import { createRng } from '@/utils/mockDraftVoice';

async function getActiveAuctionDraft() {
  const client = await clientPromise;
  const db = client.db('bbb-league');
  return db.collection('drafts').find({ state: 'ACTIVE' }).sort({ startDate: -1 }).limit(1).next();
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') return null;
  const reaction = String(note.reaction || '').trim();
  if (!reaction) return null;

  return {
    name: String(note.name || '').trim(),
    role: String(note.role || '').trim(),
    persona: String(note.persona || '').trim(),
    reaction,
  };
}

function selectBidReaction(draftId, bid, bidIndex) {
  const notes = (Array.isArray(bid?.reactions) ? bid.reactions : []).map(normalizeNote).filter(Boolean);
  if (notes.length === 0) return [];
  if (notes.length === 1) return [notes[0]];

  const rng = createRng({
    seed: `${draftId}|${bidIndex}|${bid?.playerId || ''}|${bid?.timestamp || ''}`,
    salt: 'free-agent-auction-bid-selection',
  });
  return [notes[rng.int(0, notes.length - 1)]];
}

function toDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function buildBidNotes({ bid, playerName }) {
  return `Bid placed • ${bid.username || 'Unknown'} bid $${Number(bid.salary || 0).toFixed(1)}/year for ${Number(bid.years || 0)} years on ${playerName}`;
}

function buildWinnerNotes({ result, playerName }) {
  return `Auction final • ${result.username || 'Unknown'} won ${playerName} for $${Number(result.salary || 0).toFixed(1)}/year for ${Number(result.years || 0)} years`;
}

function buildBlindRevealNotes({ playerName, blindOutcome }) {
  if (blindOutcome?.isTie) {
    const leaderNames = blindOutcome.leaders.map((leader) => leader.username || 'Unknown').join(', ');
    return `Blind reveal • ${playerName} finished tied at ${Number(blindOutcome.topScore || 0).toFixed(1)} contract points between ${leaderNames}`;
  }

  const winner = blindOutcome?.leaders?.[0];
  return `Blind reveal • ${winner?.username || 'Unknown'} won ${playerName} for $${Number(winner?.salary || 0).toFixed(1)}/year for ${Number(winner?.years || 0)} years`;
}

export async function syncActiveFreeAgentAuctionFeed() {
  const draft = await getActiveAuctionDraft();
  if (!draft) {
    return { ok: true, status: 'no-active-free-agent-auction', created: 0, inspected: 0 };
  }

  const draftId = String(draft._id || draft.draftId || 'active-auction');
  const syncKey = `free-agent-auction:${draftId}`;
  const syncStateResult = await getMediaFeedSyncState(syncKey);
  const syncState = syncStateResult?.success === false ? null : syncStateResult?.state;
  const isFirstSync = !syncState;
  const lastProcessedBidIndex = Number(syncState?.lastProcessedBidIndex || 0);
  const processedOutcomeKeys = new Set(Array.isArray(syncState?.processedOutcomeKeys) ? syncState.processedOutcomeKeys : []);
  const players = Array.isArray(draft?.players) ? draft.players : [];
  const results = Array.isArray(draft?.results) ? draft.results : [];
  const bidLog = Array.isArray(draft?.bidLog) ? draft.bidLog : [];
  const draftTimeZone = getDraftTimeZone(draft);
  const now = new Date();

  let created = 0;
  let inspected = 0;
  let processedBidCount = lastProcessedBidIndex;

  if (!draft?.blind) {
    for (let bidIndex = lastProcessedBidIndex; bidIndex < bidLog.length; bidIndex += 1) {
      const bid = bidLog[bidIndex];
      const player = players.find((entry) => String(entry.playerId) === String(bid?.playerId));
      const playerName = player?.playerName || 'Unknown Player';
      let aiNotes = selectBidReaction(draftId, bid, bidIndex);

      if (aiNotes.length === 0) {
        aiNotes = await generateAuctionReaction({
          eventType: 'bid',
          seed: `${syncKey}|bid|${bidIndex}`,
          teamName: bid?.username || 'Unknown',
          playerName,
          salary: Number(bid?.salary || 0),
          years: Number(bid?.years || 0),
          contractPoints: Number(bid?.contractPoints || 0),
        });
      }

      const item = {
        source: 'free-agent-auction',
        sourceKey: `free-agent-auction:${draftId}:bid:${bidIndex + 1}`,
        draftId,
        auctionType: 'non-blind',
        eventType: 'bid',
        playerId: String(bid?.playerId || player?.playerId || '').trim() || null,
        playerName,
        userId: String(bid?.username || '').trim() || null,
        team: bid?.username || 'Unknown',
        notes: buildBidNotes({ bid, playerName }),
        timestamp: toDate(bid?.timestamp),
        ai_notes: aiNotes,
        meta: {
          salary: Number(bid?.salary || 0),
          years: Number(bid?.years || 0),
          contractPoints: Number(bid?.contractPoints || 0),
        },
      };

      const result = await upsertMediaFeedItem(item);
      if (result?.inserted) {
        created += 1;
      }
      inspected += 1;
      processedBidCount = bidIndex + 1;
    }
  }

  for (const player of players) {
    const storedResult = results.find((entry) => String(entry.playerId) === String(player.playerId));
    const blindOutcome = draft?.blind ? resolveBlindAuctionOutcome(player.playerId, bidLog) : null;
    const contractPoints = draft?.blind
      ? Number(blindOutcome?.topScore || 0)
      : Number(storedResult?.contractPoints || 0);
    const endTime = getPlayerEndTime(
      draft?.startDate,
      player?.startDelay,
      draft?.nomDuration,
      contractPoints,
      bidLog,
      player?.playerId,
      Boolean(draft?.blind),
      draftTimeZone,
      draft?.endDate
    );

    if (Number.isNaN(endTime.getTime()) || endTime > now) {
      continue;
    }

    if (draft?.blind) {
      if (!blindOutcome?.leaders?.length) {
        continue;
      }

      const sourceKey = `free-agent-auction:${draftId}:reveal:${player.playerId}`;
      if (processedOutcomeKeys.has(sourceKey)) {
        continue;
      }

      const winner = blindOutcome.leaders[0] || null;
      const aiNotes = await generateAuctionReaction({
        eventType: 'blind-reveal',
        seed: sourceKey,
        teamName: blindOutcome.isTie ? null : winner?.username || 'Unknown',
        playerName: player?.playerName || 'Unknown Player',
        salary: Number(winner?.salary || 0),
        years: Number(winner?.years || 0),
        topScore: Number(blindOutcome?.topScore || 0),
        isTie: Boolean(blindOutcome?.isTie),
        leaderNames: blindOutcome.leaders.map((leader) => leader.username || 'Unknown'),
      });

      const item = {
        source: 'free-agent-auction',
        sourceKey,
        draftId,
        auctionType: 'blind',
        eventType: 'reveal',
        playerId: String(player?.playerId || '').trim() || null,
        playerName: player?.playerName || 'Unknown Player',
        userId: blindOutcome.isTie ? null : String(winner?.username || '').trim() || null,
        team: blindOutcome.isTie ? '' : winner?.username || '',
        notes: buildBlindRevealNotes({ playerName: player?.playerName || 'Unknown Player', blindOutcome }),
        timestamp: endTime,
        ai_notes: aiNotes,
        meta: {
          topScore: Number(blindOutcome?.topScore || 0),
          isTie: Boolean(blindOutcome?.isTie),
          leaders: blindOutcome.leaders.map((leader) => ({
            username: leader.username || 'Unknown',
            salary: Number(leader.salary || 0),
            years: Number(leader.years || 0),
            contractPoints: Number(leader.contractPoints || 0),
          })),
        },
      };

      const result = await upsertMediaFeedItem(item);
      if (result?.inserted) {
        created += 1;
      }
      inspected += 1;
      processedOutcomeKeys.add(sourceKey);
      continue;
    }

    if (!storedResult) {
      continue;
    }

    const sourceKey = `free-agent-auction:${draftId}:winner:${player.playerId}`;
    if (processedOutcomeKeys.has(sourceKey)) {
      continue;
    }

    const aiNotes = await generateAuctionReaction({
      eventType: 'winner',
      seed: sourceKey,
      teamName: storedResult?.username || 'Unknown',
      playerName: player?.playerName || 'Unknown Player',
      salary: Number(storedResult?.salary || 0),
      years: Number(storedResult?.years || 0),
      contractPoints: Number(storedResult?.contractPoints || 0),
    });

    const item = {
      source: 'free-agent-auction',
      sourceKey,
      draftId,
      auctionType: 'non-blind',
      eventType: 'winner',
      playerId: String(player?.playerId || '').trim() || null,
      playerName: player?.playerName || 'Unknown Player',
      userId: String(storedResult?.username || '').trim() || null,
      team: storedResult?.username || '',
      notes: buildWinnerNotes({ result: storedResult, playerName: player?.playerName || 'Unknown Player' }),
      timestamp: endTime,
      ai_notes: aiNotes,
      meta: {
        salary: Number(storedResult?.salary || 0),
        years: Number(storedResult?.years || 0),
        contractPoints: Number(storedResult?.contractPoints || 0),
      },
    };

    const result = await upsertMediaFeedItem(item);
    if (result?.inserted) {
      created += 1;
    }
    inspected += 1;
    processedOutcomeKeys.add(sourceKey);
  }

  await updateMediaFeedSyncState(syncKey, {
    draftId,
    blind: Boolean(draft?.blind),
    lastProcessedBidIndex: draft?.blind ? 0 : processedBidCount,
    processedOutcomeKeys: Array.from(processedOutcomeKeys),
    initializedWithBackfill: true,
  });

  return {
    ok: true,
    status: isFirstSync
      ? (created > 0 ? 'backfilled-free-agent-auction-events' : 'initialized-free-agent-auction')
      : (created > 0 ? 'processed-free-agent-auction-events' : 'up-to-date'),
    created,
    inspected,
    draftId,
    lastProcessedBidIndex: draft?.blind ? 0 : processedBidCount,
  };
}