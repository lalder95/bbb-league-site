import { promises as fs } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { createRng } from '@/utils/mockDraftVoice';
import {
  getMediaFeedSyncState,
  updateMediaFeedSyncState,
  upsertMediaFeedItem,
  getTradeBlockListings,
  getTradeBlockOffers,
  getTradeBlockSettings,
} from '@/lib/db-helpers';

const FANS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/fans.txt');
const JOURNALISTS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/journalists.txt');
const OPENAI_MODEL = 'gpt-4.1-nano';

function normalizeCharacterLine(line, role) {
  const match = line.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (!match) return null;
  return { name: match[1].trim(), persona: match[2].trim(), role };
}

async function readCharacters(filePath, role) {
  const text = await fs.readFile(filePath, 'utf8').catch(() => '');
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('**') && !line.startsWith('#'))
    .map((line) => line.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim())
    .map((line) => normalizeCharacterLine(line, role))
    .filter(Boolean);
}

async function loadCharacterPool() {
  const [fans, journalists] = await Promise.all([
    readCharacters(FANS_FILE_PATH, 'fan'),
    readCharacters(JOURNALISTS_FILE_PATH, 'journalist'),
  ]);
  return { fans, journalists, all: [...journalists, ...fans] };
}

function getAdamGlazport(pool) {
  return pool.journalists.find((c) => c.name.toLowerCase().includes('adam')) || pool.journalists[0];
}

function pickRandomFromPool(pool, seed, salt = 'trade-block-character') {
  if (!pool || pool.length === 0) return { name: 'bAnker', role: 'journalist', persona: 'league desk' };
  const rng = createRng({ seed, salt });
  return pool[rng.int(0, pool.length - 1)];
}

function assetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? ` ${asset.season}` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  return `${season}${round}${bucket} Pick`.trim();
}

function getMediaIntensity(ktcValue, settings) {
  const v = Number(ktcValue || 0);
  const low = Number(settings?.mediaIntensityLow || 2000);
  const mid = Number(settings?.mediaIntensityMid || 4000);
  const high = Number(settings?.mediaIntensityHigh || 6000);
  if (v >= high) return 'star';
  if (v >= mid) return 'high';
  if (v >= low) return 'mid';
  return 'low';
}

function buildFallbackReaction(eventType, params) {
  const asset = assetLabel(params.asset);
  if (eventType === 'listing_created') {
    return `${params.posterUsername} is putting ${asset} on the trade block, signaling they're open for business.`;
  }
  if (eventType === 'first_offer') {
    return `I'm told at least one team has reached out to ${params.posterUsername} about ${asset}. No deal is in place at this time.`;
  }
  if (eventType === 'offer_buzz') {
    return `The phone lines are active around ${asset}. Multiple teams are circling.`;
  }
  if (eventType === 'pending_selected_straight') {
    return `Breaking: ${params.posterUsername} and ${params.offererUsername} are in the final stages of a deal involving ${asset}. The trade is expected to be completed at any moment.`;
  }
  if (eventType === 'pending_selected_auction') {
    return `Breaking: ${params.posterUsername} and ${params.offererUsername} are in the final stages of a deal involving ${asset}. ${params.posterUsername} is waiting to sign off in hopes another suitor may emerge.`;
  }
  return `Trade activity detected around ${asset}.`;
}

async function generateTradeBlockReaction({ eventType, seed, params, character, forceJournalist = false }) {
  const charPool = character ? [character] : null;
  const fallback = buildFallbackReaction(eventType, params);

  if (!process.env.OPENAI_API_KEY) {
    const pool = await loadCharacterPool();
    const char = forceJournalist ? getAdamGlazport(pool) : pickRandomFromPool(pool.all, seed);
    return [{ ...(char || pool.all[0]), reaction: fallback }];
  }

  const pool = await loadCharacterPool();
  const char = character || (forceJournalist ? getAdamGlazport(pool) : pickRandomFromPool(pool.all, seed));

  const asset = assetLabel(params.asset);
  let instruction = '';
  if (eventType === 'listing_created') {
    instruction = `Write a short fantasy-football news line. ${params.posterUsername} just listed ${asset} on the trade block. Phrase it as a team "listening to offers" or "making the asset available." Keep it factual and brief (1-2 sentences).`;
  } else if (eventType === 'first_offer') {
    instruction = `Write a short fantasy-football rumor. At least one team has made an offer for ${asset} from ${params.posterUsername}. Keep it vague and speculative — no deal is done. (1-2 sentences)`;
  } else if (eventType === 'offer_buzz') {
    instruction = `Write a short fantasy-football rumor suggesting increased trade activity around ${asset}. Don't confirm a deal. Stay vague and use rumor language. (1 sentence)`;
  } else if (eventType === 'pending_selected_straight') {
    instruction = `Write a breaking-news style fantasy-football trade alert. ${params.posterUsername} and ${params.offererUsername} are finalizing a straight trade involving ${asset}. The deal is expected to be completed at any moment. (1-2 sentences)`;
  } else if (eventType === 'pending_selected_auction') {
    instruction = `Write a breaking-news style fantasy-football trade alert. ${params.posterUsername} and ${params.offererUsername} are in advanced talks involving ${asset}. ${params.posterUsername} has selected an offer but the auction window is still open for competing offers. (1-2 sentences)`;
  }

  const systemPrompt = `You are ${char.name}, a ${char.role} in a fantasy football media simulator. Persona: ${char.persona}. Return valid JSON only in the shape {"reaction":"..."}. Keep the reaction to 1-2 sentences, fantasy-focused, and in character. Do not mention real NFL cities, divisions, or coaches.`;
  const userPrompt = `${instruction}\n\nContext:\n- Asset: ${asset}\n- Poster: ${params.posterUsername}\n- Offerer: ${params.offererUsername || 'unknown'}\n- Asset KTC value: ~${params.ktcValue || 0}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
      const reaction = String(parsed?.reaction || '').trim();
      if (reaction) return [{ ...char, reaction }];
    } catch {
      // retry
    }
  }
  return [{ ...char, reaction: fallback }];
}

function getDelayedTimestamp(minMinutes = 5, maxMinutes = 720) {
  const delayMs = (Math.random() * (maxMinutes - minMinutes) + minMinutes) * 60 * 1000;
  return new Date(Date.now() + delayMs);
}

export async function syncTradeBlockFeed() {
  try {
    const settings = await getTradeBlockSettings();
    if (settings?.mediaFeedEnabled === false) {
      return { ok: true, status: 'media-feed-disabled', created: 0 };
    }

    const listings = await getTradeBlockListings({
      status: ['open', 'offers_received', 'pending_offer_selected', 'countdown_active', 'pending_admin', 'completed'],
    });
    if (!Array.isArray(listings) || listings.length === 0) {
      return { ok: true, status: 'no-active-listings', created: 0 };
    }

    const syncKey = 'trade-block';
    const syncStateResult = await getMediaFeedSyncState(syncKey);
    const syncState = syncStateResult?.success === false ? null : syncStateResult?.state;
    const processedKeys = new Set(Array.isArray(syncState?.processedKeys) ? syncState.processedKeys : []);

    let created = 0;
    const newProcessedKeys = new Set(processedKeys);

    for (const listing of listings) {
      const lid = listing.listingId;
      const asset = listing.asset || {};
      const ktcValue = Number(asset.ktcValue || asset.pickKtcValue || 0);
      const intensity = getMediaIntensity(ktcValue, settings);
      const offers = await getTradeBlockOffers(lid);
      const validOffers = Array.isArray(offers) ? offers.filter((o) => o.status !== 'withdrawn') : [];

      // 1. Listing created post (Adam Glazerport, one per listing)
      const listingCreatedKey = `trade-block:${lid}:listing_created`;
      if (!processedKeys.has(listingCreatedKey)) {
        const notes = await generateTradeBlockReaction({
          eventType: 'listing_created',
          seed: listingCreatedKey,
          params: { posterUsername: listing.posterUsername, asset, ktcValue },
          forceJournalist: true,
        });
        await upsertMediaFeedItem({
          source: 'trade-block',
          sourceKey: listingCreatedKey,
          eventType: 'listing_created',
          listingId: lid,
          playerName: assetLabel(asset),
          team: listing.posterUsername,
          userId: null,
          notes: `Trade block listing • ${listing.posterUsername} listed ${assetLabel(asset)}`,
          timestamp: listing.createdAt || new Date(),
          ai_notes: notes,
          meta: { postingType: listing.postingType, ktcValue, intensity },
        });
        newProcessedKeys.add(listingCreatedKey);
        created++;
      }

      // 2. First offer received
      if (validOffers.length >= 1) {
        const firstOfferKey = `trade-block:${lid}:first_offer`;
        if (!processedKeys.has(firstOfferKey)) {
          const firstOffer = validOffers[0];
          // Delayed post (5 min–6 hr)
          const publishAt = getDelayedTimestamp(5, 360);
          const notes = await generateTradeBlockReaction({
            eventType: 'first_offer',
            seed: firstOfferKey,
            params: { posterUsername: listing.posterUsername, asset, ktcValue },
          });
          await upsertMediaFeedItem({
            source: 'trade-block',
            sourceKey: firstOfferKey,
            eventType: 'first_offer',
            listingId: lid,
            playerName: assetLabel(asset),
            team: listing.posterUsername,
            userId: null,
            notes: `First offer received on ${assetLabel(asset)}`,
            timestamp: publishAt,
            ai_notes: notes,
            meta: { ktcValue, intensity, offerId: firstOffer?.offerId },
          });
          newProcessedKeys.add(firstOfferKey);
          created++;
        }
      }

      // 3. Additional offer buzz (mid/high/star intensity only, at most one per 3 new offers)
      if (['mid', 'high', 'star'].includes(intensity) && validOffers.length > 1) {
        const buzzIndex = Math.floor((validOffers.length - 1) / 3);
        const offerBuzzKey = `trade-block:${lid}:offer_buzz:${buzzIndex}`;
        if (!processedKeys.has(offerBuzzKey)) {
          const publishAt = getDelayedTimestamp(30, 720);
          const notes = await generateTradeBlockReaction({
            eventType: 'offer_buzz',
            seed: offerBuzzKey,
            params: { posterUsername: listing.posterUsername, asset, ktcValue },
          });
          await upsertMediaFeedItem({
            source: 'trade-block',
            sourceKey: offerBuzzKey,
            eventType: 'offer_buzz',
            listingId: lid,
            playerName: assetLabel(asset),
            team: listing.posterUsername,
            userId: null,
            notes: `Multiple offers circling ${assetLabel(asset)}`,
            timestamp: publishAt,
            ai_notes: notes,
            meta: { ktcValue, intensity, offerCount: validOffers.length },
          });
          newProcessedKeys.add(offerBuzzKey);
          created++;
        }
      }

      // 4. Pending offer selected (breaking news)
      if (listing.pendingOfferId && ['countdown_active', 'pending_offer_selected', 'pending_admin'].includes(listing.status)) {
        const pendingKey = `trade-block:${lid}:pending_selected:${listing.pendingOfferId}`;
        if (!processedKeys.has(pendingKey)) {
          const pendingOffer = validOffers.find((o) => o.offerId === listing.pendingOfferId);
          const offererUsername = pendingOffer?.offererUsername || 'Unknown';
          const eventType = listing.postingType === 'auction' ? 'pending_selected_auction' : 'pending_selected_straight';
          const notes = await generateTradeBlockReaction({
            eventType,
            seed: pendingKey,
            params: { posterUsername: listing.posterUsername, offererUsername, asset, ktcValue },
            forceJournalist: true,
          });
          await upsertMediaFeedItem({
            source: 'trade-block',
            sourceKey: pendingKey,
            eventType,
            listingId: lid,
            playerName: assetLabel(asset),
            team: listing.posterUsername,
            userId: null,
            notes: `Deal advancing: ${listing.posterUsername} + ${offererUsername} on ${assetLabel(asset)}`,
            timestamp: new Date(),
            ai_notes: notes,
            meta: { ktcValue, intensity, offererUsername, postingType: listing.postingType },
          });
          newProcessedKeys.add(pendingKey);
          created++;
        }
      }
    }

    await updateMediaFeedSyncState(syncKey, {
      processedKeys: Array.from(newProcessedKeys),
    });

    return { ok: true, created, inspected: listings.length };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
