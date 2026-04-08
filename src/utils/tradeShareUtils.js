import { isDraftPickAsset } from '@/utils/draftPickTradeUtils';

export const TRADE_SHARE_VERSION = 1;
export const TRADE_SHARE_DEFAULT_POSITION_FILTER = 'ALL';
export const TRADE_SHARE_DEFAULT_SORT_OPTION = 'name-asc';

const normalizeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;

  if (padding === 2) return `${normalized}==`;
  if (padding === 3) return `${normalized}=`;
  if (padding === 1) return '';
  return normalized;
};

const encodeUtf8ToBase64Url = (value) => {
  const json = String(value || '');

  if (typeof window === 'undefined') {
    return globalThis.Buffer.from(json, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const decodeBase64UrlToUtf8 = (value) => {
  const normalized = normalizeBase64Url(value);
  if (!normalized) return null;

  if (typeof window === 'undefined') {
    return globalThis.Buffer.from(normalized, 'base64').toString('utf-8');
  }

  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const createEmptyTradeParticipant = (id, team = '') => ({
  id,
  team,
  searchTerm: '',
  positionFilter: TRADE_SHARE_DEFAULT_POSITION_FILTER,
  sortOption: TRADE_SHARE_DEFAULT_SORT_OPTION,
  selectedPlayers: [],
});

export const createDefaultTradeParticipants = (count = 2) => {
  const safeCount = Math.max(2, Number(count) || 2);
  return Array.from({ length: safeCount }, (_, index) => createEmptyTradeParticipant(index + 1));
};

const createParticipantPadding = (count, startId) => {
  const safeCount = Math.max(0, Number(count) || 0);
  return Array.from({ length: safeCount }, (_, index) => createEmptyTradeParticipant(startId + index));
};

const serializeTradeAsset = (asset) => {
  if (isDraftPickAsset(asset)) {
    return {
      k: 'pk',
      s: String(asset?.season || ''),
      r: Number(asset?.round) || 0,
      o: String(asset?.originalTeam || ''),
      d: asset?.toTeam ? String(asset.toTeam) : '',
    };
  }

  return {
    k: 'pl',
    i: String(asset?.id || ''),
    d: asset?.toTeam ? String(asset.toTeam) : '',
  };
};

export const buildTradeSharePayload = ({ participants, leagueId, currentSeason, showSummary = false }) => ({
  v: TRADE_SHARE_VERSION,
  l: leagueId ? String(leagueId) : '',
  y: Number(currentSeason) || new Date().getFullYear(),
  s: Boolean(showSummary),
  p: (participants || [])
    .filter((participant) => participant?.team)
    .map((participant) => ({
      t: String(participant.team),
      a: (participant.selectedPlayers || []).map(serializeTradeAsset),
    })),
});

export const encodeTradeSharePayload = (payload) => {
  try {
    return encodeUtf8ToBase64Url(JSON.stringify(payload));
  } catch {
    return '';
  }
};

export const decodeTradeSharePayload = (token) => {
  try {
    if (!token) return null;
    const json = decodeBase64UrlToUtf8(token);
    if (!json) return null;

    const parsed = JSON.parse(json);
    if (!parsed || Number(parsed.v) !== TRADE_SHARE_VERSION || !Array.isArray(parsed.p)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const buildInitialParticipantsFromSharePayload = (payload) => {
  if (!payload || !Array.isArray(payload.p)) {
    return createDefaultTradeParticipants();
  }

  const hydrated = payload.p.map((participant, index) => createEmptyTradeParticipant(index + 1, participant?.t || ''));
  return hydrated.length >= 2
    ? hydrated
    : [...hydrated, ...createParticipantPadding(2 - hydrated.length, hydrated.length + 1)];
};

const describeMissingPlayer = (assetRef, team) => ({
  type: 'player',
  team,
  message: `Could not rehydrate player ${assetRef?.i || 'unknown'} from ${team}.`,
});

const describeMissingPick = (assetRef, team) => ({
  type: 'pick',
  team,
  message: `Could not rehydrate ${assetRef?.s || '?'} round ${assetRef?.r || '?'} pick from ${assetRef?.o || 'unknown'} on ${team}.`,
});

export const hydrateParticipantsFromSharePayload = ({ payload, players, draftPickAssetsByTeam }) => {
  if (!payload || !Array.isArray(payload.p)) {
    return {
      participants: createDefaultTradeParticipants(),
      missingAssets: [],
    };
  }

  const missingAssets = [];
  const nextParticipants = payload.p.map((participant, index) => {
    const team = String(participant?.t || '');
    const selectedPlayers = (participant?.a || []).reduce((acc, assetRef) => {
      if (assetRef?.k === 'pl') {
        const match = (players || []).find((player) => String(player?.team || '') === team && String(player?.id || '') === String(assetRef?.i || ''));
        if (match) {
          acc.push({
            ...match,
            toTeam: assetRef?.d ? String(assetRef.d) : '',
          });
        } else {
          missingAssets.push(describeMissingPlayer(assetRef, team));
        }
        return acc;
      }

      if (assetRef?.k === 'pk') {
        const match = (draftPickAssetsByTeam?.[team] || []).find((pick) => (
          String(pick?.season || '') === String(assetRef?.s || '') &&
          Number(pick?.round) === Number(assetRef?.r) &&
          String(pick?.originalTeam || '') === String(assetRef?.o || '')
        ));

        if (match) {
          acc.push({
            ...match,
            toTeam: assetRef?.d ? String(assetRef.d) : '',
          });
        } else {
          missingAssets.push(describeMissingPick(assetRef, team));
        }
      }

      return acc;
    }, []);

    return {
      ...createEmptyTradeParticipant(index + 1, team),
      selectedPlayers,
    };
  });

  return {
    participants: nextParticipants.length >= 2
      ? nextParticipants
      : [...nextParticipants, ...createParticipantPadding(2 - nextParticipants.length, nextParticipants.length + 1)],
    missingAssets,
  };
};
