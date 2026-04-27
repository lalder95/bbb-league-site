'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import Tesseract from 'tesseract.js';

const OVERWRITE_WARNING = 'Applying an import replaces the current teams and selected assets in the trade builder.';
const IMPORT_STEPS = ['scan', 'map', 'verify', 'apply'];

const joinClasses = (...classes) => classes.filter(Boolean).join(' ');

const makeMatchKey = (user, ocrName) => `${user}::${ocrName}`;

const normalizeAlpha = (value) => (value || '').toLowerCase().replace(/[^a-z]/g, '');

const getLastName = (value) => {
  const parts = (value || '').split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
};

const getSimilarity = (left, right) => {
  const normalizedLeft = normalizeAlpha(left);
  const normalizedRight = normalizeAlpha(right);
  if (!normalizedLeft || !normalizedRight) return 0;

  const grams = (text) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2)));
  const leftSet = grams(normalizedLeft);
  const rightSet = grams(normalizedRight);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size || 1;
  return intersection / union;
};

const buildImportedParticipants = ({ parsed, mapping, matches, allPlayers }) => {
  if (!parsed) return [];

  const tokenOf = (asset) => normalizeAlpha(`${asset.ocrName}|${asset.pos || ''}`);
  const receiversByToken = new Map();

  parsed.parties.forEach((party) => {
    party.receives.forEach((asset) => {
      const token = tokenOf(asset);
      if (!receiversByToken.has(token)) receiversByToken.set(token, new Set());
      receiversByToken.get(token).add(party.name);
    });
  });

  const partiesOutgoing = new Map();
  const pushedIds = new Set();

  parsed.parties.forEach((party) => {
    const partyTeam = mapping[party.name];
    const addOutgoing = (asset) => {
      const matchId = matches[makeMatchKey(party.name, asset.ocrName)];
      const ref = allPlayers.find((player) => player.id === matchId);
      if (!ref) return;

      const ownerTeam = ref.team;
      const isOwner = ownerTeam && partyTeam && ownerTeam === partyTeam;
      if (!isOwner) return;
      if (pushedIds.has(ref.id)) return;
      pushedIds.add(ref.id);

      const token = tokenOf(asset);
      const receivers = Array.from(receiversByToken.get(token) || []);
      let toTeam = '';

      if (receivers.length) {
        const receiverPartyName = receivers.find((name) => name !== party.name) || receivers[0];
        toTeam = mapping[receiverPartyName] || '';
      }

      if (!toTeam || toTeam === partyTeam) {
        if (parsed.parties.length === 2) {
          const other = parsed.parties.find((candidate) => candidate.name !== party.name);
          const otherTeam = other ? (mapping[other.name] || '') : '';
          toTeam = otherTeam && otherTeam !== partyTeam ? otherTeam : '';
        } else {
          toTeam = '';
        }
      }

      if (!partiesOutgoing.has(party.name)) partiesOutgoing.set(party.name, []);
      partiesOutgoing.get(party.name).push({ ...ref, toTeam });
    };

    party.sends.forEach(addOutgoing);
    party.receives.forEach(addOutgoing);
  });

  return parsed.parties.map((party, index) => ({
    id: index + 1,
    team: mapping[party.name],
    searchTerm: '',
    selectedPlayers: partiesOutgoing.get(party.name) || [],
  }));
};

class ErrorCatcher extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err){
    return { hasError: true, message: err?.message || String(err) };
  }
  componentDidCatch(err){
    if (this.props.onError) {
      try { this.props.onError(err); } catch {}
    }
  }
  render(){
    if (this.state.hasError) {
      return (
        <div className="text-red-400 text-sm p-2 border border-red-500/30 rounded bg-red-950/30">
          OCR panel error: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * SleeperImportModal
 * Allows uploading a Sleeper trade screenshot, runs OCR, parses into parties (usernames) with Receives/Sends,
 * lets the user map screenshot usernames to BBB teams and verify player matches, then applies the import by
 * populating participants with outgoing players and destinations.
 */
export default function SleeperImportModal({
  isOpen,
  onClose,
  onApply,
  allPlayers,   // Array of active BBB players/contracts used for matching
  teamOptions = [],  // BBB team names
  teamAvatars = {},
}) {
  const [imageUrl, setImageUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [parsed, setParsed] = useState(null); // { parties: [{name, receives:[{ocrName,pos}], sends:[{ocrName,pos}]}], rawLines }
  const [mapping, setMapping] = useState({}); // screenshotUser -> BBB team
  const [matches, setMatches] = useState({}); // key(user::ocrName) -> playerId
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const onPickFile = (f) => {
    if (!f) return;
    setImageUrl(URL.createObjectURL(f));
    setBusy(false);
    setError('');
    setOcrText('');
    setParsed(null);
    setMapping({});
    setMatches({});
    setCurrentStep(0);
  };

  // Downscale large images to reduce memory pressure for OCR
  const downscaleImage = async (srcUrl, maxDim = 1600) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = srcUrl;
    });
  };

  // Prefer self-hosted assets; fallback to CDN
  const TESS_BASE = '/tesseract';
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist';
  const CORE_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4';

  const pickCorePath = () => {
    const simd = typeof window !== 'undefined' && window.crossOriginIsolated;
    // Try local first, CDN fallback (SIMD when isolated)
    return simd
      ? [`${TESS_BASE}/tesseract-core-simd.wasm.js`, `${CORE_CDN}/tesseract-core-simd.wasm.js`]
      : [`${TESS_BASE}/tesseract-core.wasm.js`, `${CORE_CDN}/tesseract-core.wasm.js`];
  };

  const workerPaths = [
    `${TESS_BASE}/tesseract.worker.min.js`,
    `${CDN_BASE}/worker.min.js`,
  ];

  const langPaths = [
    `${TESS_BASE}/lang-data`,
    `${CDN_BASE}/lang-data`,
  ];

  const ocrControllerRef = useRef(null); // holds { cancel: () => void } during an active OCR run

  const runOCR = async () => {
    if (!imageUrl) return;
    setBusy(true);
    setError('');
    try {
      // Reduce image size to keep memory use reasonable on mobile/production
      const dataUrl = await downscaleImage(imageUrl, 1600);

      // Create worker with local-first paths and cancellation support
      const corePaths = pickCorePath();
      let worker;
      let lastErr;
      for (const wp of workerPaths) {
        for (const cp of corePaths) {
          for (const lp of langPaths) {
            try {
              worker = await Tesseract.createWorker(
                'eng',
                undefined,
                {
                  workerPath: wp,
                  corePath: cp,
                  langPath: lp,
                  workerBlobURL: true,
                  cacheMethod: 'none',
                  gzip: true,
                }
              );
              lastErr = undefined;
              break;
            } catch (e) {
              lastErr = e;
              worker = null;
            }
          }
          if (worker) break;
        }
        if (worker) break;
      }
      if (!worker) throw lastErr || new Error('Failed to initialize OCR worker');

      try {
        // In tesseract.js v6, createWorker resolves after language is loaded and initialized.
        // Do NOT call worker.loadLanguage/initialize here; they're not exposed in v6.
        // Expose a cancel handle that terminates the worker (supported cancellation path)
        ocrControllerRef.current = { cancel: async () => { try { await worker.terminate(); } catch {} } };

        const recognizePromise = worker.recognize(dataUrl);
        const res = await Promise.race([
          recognizePromise,
          new Promise((_, reject) => setTimeout(async () => {
            try { await worker.terminate(); } catch {}
            reject(new Error('OCR timed out after 45s'));
          }, 45000)),
        ]);
        const text = res?.data?.text || '';
        setOcrText(text);
        const p = parseSleeper(text);
        setParsed(p);

        // Auto-map usernames to BBB team if exact match exists
        const autoMap = {};
        p.parties.forEach(pt => {
          if (teamOptions.includes(pt.name)) autoMap[pt.name] = pt.name;
        });
        setMapping(autoMap);

        // Auto-match players by fuzzy search
        const pre = {};
        p.parties.forEach(pt => {
          [...pt.receives, ...pt.sends].forEach(x => {
            const key = makeKey(pt.name, x.ocrName);
            const m = bestMatch(x, allPlayers);
            if (m) pre[key] = m.id;
          });
        });
        setMatches(pre);
      } finally {
        ocrControllerRef.current = null;
        try { await worker.terminate(); } catch {}
      }
    } catch (e) {
      const msg = e && (e.message || String(e));
      // Surface the underlying error message for debugging visibility
      setError(`OCR failed. ${msg ? `(${msg}) ` : ''}${msg?.includes('wasm') ? 'WASM load issue. ' : ''}${msg?.includes('timed out') ? ' Took too long.' : ''}Try another screenshot, crop tighter, or reduce resolution.`);
    } finally {
      setBusy(false);
    }
  };

  function parseSleeper(text) {
    const raw = (text || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/\s+/g, ' '));

  const U = s => (s || '').toUpperCase();
    const contains = (s, t) => U(s).includes(t);
    const parties = [];

    let i = 0; const n = raw.length;
    while (i < n) {
      if (contains(raw[i], 'RECEIVES')) { // handles 'RECEIVES' or 'RECEIVES SENDS'
        // Username above within a short window
        let name = guessUsernameNear(raw, i) || 'Unknown';

        const { receives, sends, nextIndex } = readTwoColumnPlayers(raw, i + 1);
        parties.push({ name, receives, sends });
        i = nextIndex; continue;
      }
      i++;
    }

    // De-dup if repeated blocks
    const out = [];
    const seen = new Set();
    for (const p of parties) {
      const key = `${p.name}|${p.receives.map(x=>x.ocrName).join(',')}|${p.sends.map(x=>x.ocrName).join(',')}`;
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
    // Resolve common two-party ambiguities (e.g., a trailing right-only name OCR'd as single on left)
    const rectified = resolveAmbiguities(out);
    return { parties: rectified, rawLines: raw };
  }

  // Read rows that are likely "name(s)" followed by a line of details with positions.
  // Handles two-column OCR where a row has "<leftName> <rightName>" and next line has "<leftPos> <rightPos>".
  function readTwoColumnPlayers(lines, start) {
    const receives = [];
    const sends = [];
    let i = start;

    // Name pattern (initial dot Lastname). Allow lower/upper initial and last name.
    const nameRe = /[A-Za-z]\.\s?[A-Za-z][A-Za-z'\-]+/g; // e.g., "D. Maye", "I. TeSlaa"

    while (i < lines.length) {
    const line = lines[i];
      if (/RECEIVES/i.test(line)) break; // next block reached
      const detail = lines[i + 1] || '';
    const normLine = normalizeForNames(line);
    const names = (normLine.match(nameRe) || []).map(s => s.trim());
      if (names.length === 0) { i++; continue; }

      const poss = extractPositions(detail);
      // Align left/right by index
      const count = Math.min(names.length, Math.max(1, poss.length));

      if (count >= 1) {
        const left = { ocrName: names[0], pos: poss[0] || null };
        receives.push(left);
      }
      if (names.length >= 2) {
        const right = { ocrName: names[1], pos: poss[1] || null };
        sends.push(right);
      }

      i += 2; // consumed name+detail rows
    }
    return { receives, sends, nextIndex: i };
  }

  function normalizeForNames(s) {
    return (s || '')
      .replace(/[|]/g, 'I')   // pipe mistaken for I
      .replace(/\u2014|\u2013/g, '-') // em/en dash to hyphen
      .replace(/\u00b7/g, '.') // middle dot to dot
      .replace(/1\./g, 'I.')  // 1. -> I.
      .replace(/[^A-Za-z\.\-\s']+/g, ' '); // drop other noise
  }

  function guessUsernameNear(lines, receivesIndex) {
    const stopAt = Math.max(0, receivesIndex - 8);
    const badTokens = new Set(['RECEIVES','SENDS','TRADE','OFFER','PENDING','SENT','MODIFY','HIDE','USERNAMES','FOR','SCREENSHOTS','SLEEPER','X','&']);
    for (let j = receivesIndex - 1; j >= stopAt; j--) {
      const s = (lines[j] || '').trim();
      if (!s) continue;
      // try extracting a username-like token from the line
      const tokens = s.split(/\s+/).filter(Boolean);
      // prefer tokens near the middle/end ("lalder SENT OFFER" -> pick first, "w EthanL21 X PENDING" -> pick middle)
      const candidates = tokens.filter(t => {
        const up = t.toUpperCase();
        if (badTokens.has(up)) return false;
        // simple username heuristic: letters/underscores/digits, at least 3 chars
        return /^[A-Za-z][A-Za-z0-9_]{2,24}$/.test(t);
      });
      if (candidates.length > 0) return candidates.find(c => /\d/.test(c)) || candidates[0];
      // if entire line looks like a plain display name (no headers), accept it
      if (!/(RECEIVES|SENDS|TRADE|OFFER|PENDING|SENT|MODIFY|HIDE|USERNAMES)/i.test(s) && s.length <= 30) return s;
    }
    return '';
  }

  function normalizeForPos(s) {
    return (s || '')
      .toUpperCase()
      .replace(/0/g, 'O')
      .replace(/1/g, 'I')
      .replace(/5/g, 'B')
      .replace(/8/g, 'B')
      .replace(/7/g, 'T')
      .replace(/[^A-Z]/g, ' ');
  }

  function tokenKey(p) { return `${normalizeAlpha(p.ocrName)}|${(p.pos || '').toUpperCase()}`; }

  function resolveAmbiguities(parties) {
    if (!Array.isArray(parties) || parties.length !== 2) return parties;
    const [P, Q] = parties.map(p => ({
      ...p,
      receives: [...p.receives],
      sends: [...p.sends],
    }));

    const setOf = (arr) => new Set(arr.map(tokenKey));
    const Precv = setOf(P.receives), Psends = setOf(P.sends);
    const Qrecv = setOf(Q.receives), Qsends = setOf(Q.sends);

    // Conflicts: tokens that show up as receives in both parties and nowhere in sends
    const conflicts = [...Precv].filter(t => Qrecv.has(t) && !Psends.has(t) && !Qsends.has(t));
    if (conflicts.length === 0) return [P, Q];

    const sharedPR = [...Psends].filter(t => Qrecv.has(t)).length; // P sends things Q receives
    const sharedQR = [...Qsends].filter(t => Precv.has(t)).length; // Q sends things P receives

    const flipInParty = (party, token) => {
      const i = party.receives.findIndex(x => tokenKey(x) === token);
      if (i >= 0) {
        const item = party.receives.splice(i, 1)[0];
        party.sends.push(item);
      }
    };

    for (const t of conflicts) {
      if (sharedPR > sharedQR) {
        flipInParty(P, t);
      } else if (sharedQR > sharedPR) {
        flipInParty(Q, t);
      } else {
        // Balance: move from the party whose receives are longer
        if (P.receives.length > Q.receives.length) flipInParty(P, t);
        else if (Q.receives.length > P.receives.length) flipInParty(Q, t);
        else {
          // Default: flip in the party that currently has fewer sends (make pair symmetric)
          if (P.sends.length <= Q.sends.length) flipInParty(P, t); else flipInParty(Q, t);
        }
      }
    }

    return [P, Q];
  }

  function extractPositions(s) {
    const up = normalizeForPos(s);
    const tokens = up.split(/\s+/).filter(Boolean);
    const out = [];
    for (const t of tokens) {
      if (t === 'QB' || t === 'RB' || t === 'WR' || t === 'TE' || t === 'DST' || t === 'DEF') out.push(t);
      else if (t === 'TT') out.push('TE');
    }
    // Keep only first two (left/right) to align with two columns
    return out.slice(0, 2);
  }

  function makeKey(user, ocrName) { return `${user}::${ocrName}`; }

  function bestMatch(ocrPlayer, all) {
    const ln = getLastName(ocrPlayer.ocrName);
    const firstInit = (ocrPlayer.ocrName[0]||'').toUpperCase();
    const pos = ocrPlayer.pos;
    const cands = all.filter(p => (!pos || p.position?.toUpperCase() === pos) && normalizeAlpha(p.playerName).includes(normalizeAlpha(ln)));
    let best = null, bestScore = 0;
    for (const p of cands) {
      let s = 0;
      if (normalizeAlpha(getLastName(p.playerName)) === normalizeAlpha(ln)) s += 0.6;
      if ((p.playerName[0]||'').toUpperCase() === firstInit) s += 0.1;
      s += 0.3 * getSimilarity(p.playerName, ocrPlayer.ocrName);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return bestScore >= 0.55 ? best : null;
  }

  // Compute unmatched rows for UX hints
  const unmatched = useMemo(() => {
    if (!parsed) return 0;
    let cnt = 0;
    parsed.parties.forEach(pt => {
      [...pt.receives, ...pt.sends].forEach(x => { if (!matches[makeKey(pt.name, x.ocrName)]) cnt++; });
    });
    return cnt;
  }, [parsed, matches]);

  const parties = Array.isArray(parsed?.parties) ? parsed.parties : [];

  const totalDetectedPlayers = useMemo(() => (
    parties.reduce((sum, party) => sum + party.receives.length + party.sends.length, 0)
  ), [parties]);

  const mappedCount = useMemo(() => (
    parties.filter((party) => mapping[party.name]).length
  ), [parties, mapping]);

  const mappedTeams = useMemo(() => (
    parties.map((party) => mapping[party.name]).filter(Boolean)
  ), [parties, mapping]);

  const hasDuplicateMappedTeams = new Set(mappedTeams).size !== mappedTeams.length;
  const matchedCount = Math.max(0, totalDetectedPlayers - unmatched);
  const readyToApply = parties.length > 0 && mappedCount === parties.length && !hasDuplicateMappedTeams;

  useEffect(() => {
    if (parsed && currentStep === 0 && !busy) {
      setCurrentStep(1);
    }
  }, [parsed, currentStep, busy]);

  const previewParticipants = useMemo(() => {
    if (!readyToApply) return [];
    return buildImportedParticipants({ parsed, mapping, matches, allPlayers });
  }, [readyToApply, parsed, mapping, matches, allPlayers]);

  const previewAssetCount = useMemo(() => (
    previewParticipants.reduce((sum, participant) => sum + participant.selectedPlayers.length, 0)
  ), [previewParticipants]);

  // Reclassify the display using contract ownership when mapping+matches are available
  const displayParties = useMemo(() => {
    if (!parsed) return null;
    const findRef = (id) => allPlayers.find(ap => ap.id === id);
    return parsed.parties.map(pt => {
      const partyTeam = mapping[pt.name] || '';
      const items = [];
      const add = (arr, defaultSide) => {
        arr.forEach(x => {
          const id = matches[makeKey(pt.name, x.ocrName)];
          const ref = id ? findRef(id) : null;
          let side = defaultSide;
          if (ref && partyTeam) side = (ref.team === partyTeam) ? 'sends' : 'receives';
          items.push({ ...x, _side: side });
        });
      };
      add(pt.receives, 'receives');
      add(pt.sends, 'sends');
      const receives = items.filter(i => i._side === 'receives').map(({ _side, ...rest }) => rest);
      const sends = items.filter(i => i._side === 'sends').map(({ _side, ...rest }) => rest);
      return { ...pt, receives, sends };
    });
  }, [parsed, mapping, matches, allPlayers]);

  const displayRows = Array.isArray(displayParties) ? displayParties : parties;

  const stageConfigs = [
    {
      key: 'scan',
      step: '01',
      title: 'Scan Screenshot',
      description: 'Upload a Sleeper trade screenshot, then run the existing OCR pipeline against it.',
      status: busy ? 'Processing' : imageUrl ? 'Ready to scan' : 'Waiting for image',
      statusTone: busy ? 'warning' : imageUrl ? 'success' : 'default',
      nextLabel: 'Next: Map Teams',
      canAdvance: Boolean(parsed) && !busy,
    },
    {
      key: 'map',
      step: '02',
      title: 'Map Teams',
      description: 'Link each screenshot user to the correct BBB team before importing anything into the calculator.',
      status: !parsed ? 'Scan required' : hasDuplicateMappedTeams ? 'Resolve duplicates' : mappedCount === parties.length ? 'Ready' : 'Needs mapping',
      statusTone: !parsed ? 'default' : hasDuplicateMappedTeams ? 'warning' : mappedCount === parties.length ? 'success' : 'warning',
      nextLabel: 'Next: Verify Players',
      canAdvance: Boolean(parsed) && mappedCount === parties.length && !hasDuplicateMappedTeams,
    },
    {
      key: 'verify',
      step: '03',
      title: 'Verify Players',
      description: 'Review the detected sends and receives. Adjust any match before importing so the right contracts move to the right teams.',
      status: !parsed ? 'Scan required' : unmatched > 0 ? `${unmatched} still need review` : 'All matched',
      statusTone: !parsed ? 'default' : unmatched > 0 ? 'warning' : 'success',
      nextLabel: 'Next: Review Import',
      canAdvance: Boolean(parsed),
    },
    {
      key: 'apply',
      step: '04',
      title: 'Apply Import',
      description: 'Commit the parsed trade into the calculator after the review looks correct.',
      status: !parsed ? 'Scan required' : readyToApply ? 'Ready to apply' : 'Review required',
      statusTone: !parsed ? 'default' : readyToApply ? 'success' : 'warning',
      nextLabel: previewAssetCount > 0 ? `Apply ${previewAssetCount} Asset${previewAssetCount === 1 ? '' : 's'} to Trade` : 'Apply to Trade',
      canAdvance: readyToApply && !busy,
    },
  ];

  const activeStage = stageConfigs[currentStep] || stageConfigs[0];

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    if (currentStep >= stageConfigs.length - 1) {
      apply();
      return;
    }
    if (!activeStage.canAdvance) return;
    setCurrentStep((prev) => Math.min(stageConfigs.length - 1, prev + 1));
  };

  // Build participants using Sends lists and destination from Receives mapping
  const apply = () => {
    if (!parsed) return;
    // Verify mapping complete and unique
    const mappedTeamsForValidation = parsed.parties.map(pt => mapping[pt.name] || '');
    if (mappedTeamsForValidation.some(t => !t)) { setError('Map all screenshot users to BBB teams.'); return; }
    const uniqueCheck = new Set(mappedTeamsForValidation);
    if (uniqueCheck.size !== mappedTeamsForValidation.length) { setError('Each screenshot user must map to a distinct BBB team.'); return; }

    const participants = buildImportedParticipants({ parsed, mapping, matches, allPlayers });

    onApply(participants);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#020817]/85 p-3 backdrop-blur-sm md:p-5" onClick={onClose}>
      <div
        className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,75,31,0.16),_transparent_28%),linear-gradient(180deg,_rgba(10,25,41,0.98),_rgba(3,16,27,0.98))] text-white shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        onClick={e=>e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[#071521]/90 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full border border-[#FF4B1F]/30 bg-[#FF4B1F]/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#FFD0C2]">
                Sleeper Screenshot Import
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white md:text-3xl">Scan, map, verify, then rebuild the trade</h2>
              <p className="mt-2 max-w-3xl text-sm text-white/70 md:text-[15px]">
                OCR stays the same. This flow just makes the import easier to review before it replaces the current trade participants.
              </p>
            </div>

            <div className="flex items-center gap-3 lg:pt-1">
              <StageStatePill ready={readyToApply} busy={busy} parsed={Boolean(parsed)} />
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close modal">✕</button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <SummaryStat label="Detected Users" value={parties.length} helper="Screenshot parties found" />
            <SummaryStat label="Detected Players" value={totalDetectedPlayers} helper="Receives plus sends" />
            <SummaryStat label="Teams Mapped" value={`${mappedCount}/${parties.length || 0}`} helper="Each user maps to one BBB team" tone={hasDuplicateMappedTeams ? 'warning' : 'default'} />
            <SummaryStat label="Matched Assets" value={`${matchedCount}/${totalDetectedPlayers || 0}`} helper="Manual edits still apply" tone={unmatched > 0 ? 'warning' : 'success'} />
            <SummaryStat label="Import Preview" value={previewAssetCount} helper="Matched outgoing assets ready to add" tone={readyToApply ? 'success' : 'default'} className="col-span-2 xl:col-span-1" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {stageConfigs.map((stage, index) => {
              const isActive = index === currentStep;
              const isComplete = index < currentStep;
              return (
                <div
                  key={stage.key}
                  className={joinClasses(
                    'rounded-2xl border px-3 py-3 transition-colors',
                    isActive ? 'border-[#FF4B1F]/40 bg-[#FF4B1F]/12' : isComplete ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-white/10 bg-black/20'
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Step {stage.step}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{stage.title}</div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4">
            <StageCard
              step={activeStage.step}
              title={activeStage.title}
              description={activeStage.description}
              status={activeStage.status}
              statusTone={activeStage.statusTone}
            >
              {currentStep === 0 && (
                <label htmlFor="sleeper-upload" className="block text-sm font-semibold text-white/85">Upload screenshot</label>
              )}
              {currentStep === 0 && (
                <p className="mt-1 text-xs text-white/55">Crop tightly around the trade card when possible. Large images are downscaled automatically before OCR runs.</p>
              )}
              {currentStep === 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <input id="sleeper-upload" type="file" accept="image/*" onChange={e=>onPickFile(e.target.files?.[0])} className="block w-full text-sm text-white/75 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2.5 file:font-semibold file:text-white hover:file:bg-white/15" />
                </div>
              )}

              {currentStep === 0 && (
                <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/25">
                  {imageUrl ? (
                    <div className="aspect-[4/3] w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%),linear-gradient(180deg,_rgba(255,255,255,0.03),_rgba(0,0,0,0.15))] p-3">
                      <div className="flex h-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                        <img src={imageUrl} alt="Sleeper trade screenshot preview" className="h-full w-full object-contain" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-white/45">
                      Add a screenshot to unlock scanning, mapping, and verification.
                    </div>
                  )}
                </div>
              )}

              {currentStep === 0 && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button onClick={runOCR} disabled={!imageUrl || busy} className={joinClasses('inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-all sm:w-auto', !imageUrl || busy ? 'cursor-not-allowed border border-white/10 bg-white/10 text-white/45' : 'border border-[#FF4B1F]/35 bg-[#FF4B1F] text-white shadow-[0_16px_36px_rgba(255,75,31,0.28)] hover:bg-[#ff5f38]')}>
                    {busy ? 'Processing…' : 'Scan Screenshot'}
                  </button>
                  {busy ? (
                    <div className="flex items-center gap-3 text-sm text-white/70">
                      <div className="h-4 w-4 rounded-full border-2 border-[#FF4B1F]/40 border-t-[#FF4B1F] animate-spin" />
                      <button onClick={async () => { try { await ocrControllerRef.current?.cancel?.(); } catch {}; setBusy(false); setError('OCR cancelled.'); }} className="font-semibold text-[#FFB199] transition-colors hover:text-white">Cancel OCR</button>
                    </div>
                  ) : (
                    <div className="text-xs text-white/55">Mapping and verification refresh automatically after a successful scan.</div>
                  )}
                </div>
              )}

              {currentStep === 0 && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white/80">Advanced</div>
                      <div className="mt-1 text-xs text-white/55">Reveal raw OCR output only when you need to debug a scan.</div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">
                      {showAdvanced ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-[#03101b] p-3 text-xs text-white/70">
                      {ocrText ? (
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap">{ocrText}</pre>
                      ) : (
                        <div className="text-white/45">No OCR text yet. Run a scan to inspect the raw output.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentStep === 1 && (
                !parsed ? (
                  <EmptyStageMessage message="Upload and scan a screenshot to detect trade parties." />
                ) : (
                  <>
                    <div className="space-y-3">
                      {parties.map((party, index) => (
                        <MappingRow
                          key={`${party.name}-${index}`}
                          party={party}
                          teamAvatars={teamAvatars}
                          teamOptions={teamOptions}
                          mappingValue={mapping[party.name] || ''}
                          onChange={(value) => setMapping((prev) => ({ ...prev, [party.name]: value }))}
                        />
                      ))}
                    </div>
                    {hasDuplicateMappedTeams && (
                      <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Each screenshot user must map to a distinct BBB team before import can be applied.
                      </div>
                    )}
                  </>
                )
              )}

              {currentStep === 2 && (
                !parsed ? (
                  <EmptyStageMessage message="Detected players appear here after OCR finishes." />
                ) : (
                  <>
                    <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                      Unmatched rows will not import until you choose a player manually. Matched rows can still be adjusted.
                    </div>
                    <ErrorCatcher onError={(e) => setError(`UI error: ${e?.message || e}`)}>
                      <div className="space-y-3">
                        {displayRows.map((party, index) => (
                          <PartyVerificationCard
                            key={`${party.name}-${index}`}
                            party={party}
                            mappedTeam={mapping[party.name] || ''}
                            unmatchedCount={[...party.receives, ...party.sends].filter((asset) => !matches[makeKey(party.name, asset.ocrName)]).length}
                            allPlayers={allPlayers}
                            matches={matches}
                            setMatches={setMatches}
                          />
                        ))}
                      </div>
                    </ErrorCatcher>
                  </>
                )
              )}

              {currentStep === 3 && (
                !parsed ? (
                  <EmptyStageMessage message="The final import summary unlocks after a scan." />
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MiniSummary label="Users mapped" value={`${mappedCount}/${parties.length || 0}`} tone={mappedCount === parties.length && !hasDuplicateMappedTeams ? 'success' : 'warning'} />
                      <MiniSummary label="Matched assets" value={`${matchedCount}/${totalDetectedPlayers || 0}`} tone={unmatched === 0 ? 'success' : 'warning'} />
                      <MiniSummary label="Import preview" value={previewAssetCount} tone={readyToApply ? 'success' : 'default'} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      <div className="font-semibold">Overwrite warning</div>
                      <div className="mt-1 text-amber-100/85">{OVERWRITE_WARNING}</div>
                    </div>

                    <div className="mt-4 text-xs text-white/55">
                      {readyToApply
                        ? `${previewAssetCount} matched asset${previewAssetCount === 1 ? '' : 's'} will be added to the rebuilt trade.`
                        : 'Complete team mapping and resolve duplicates before applying the import.'}
                    </div>
                  </>
                )
              )}
            </StageCard>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#06131e]/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-white/55">
              {currentStep === 0 && 'Start by scanning a screenshot, then move through the remaining steps one at a time.'}
              {currentStep === 1 && 'Map every screenshot user to a different BBB team before moving on.'}
              {currentStep === 2 && 'Review the suggested player matches. Unmatched rows will not import unless you assign them.'}
              {currentStep === 3 && OVERWRITE_WARNING}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 0}
                className={joinClasses('inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition-colors', currentStep === 0 ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/35' : 'border-white/15 bg-black/20 text-white hover:bg-black/30')}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!activeStage.canAdvance}
                className={joinClasses('inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-bold transition-colors', !activeStage.canAdvance ? 'cursor-not-allowed border-white/10 bg-white/10 text-white/35' : currentStep === stageConfigs.length - 1 ? 'border-emerald-400/35 bg-emerald-500/85 text-white hover:bg-emerald-500' : 'border-[#FF4B1F]/35 bg-[#FF4B1F] text-white hover:bg-[#ff5f38]')}
              >
                {activeStage.nextLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerListEditor({ partyName, list = [], allPlayers, matches, setMatches }) {
  const getKey = (ocrName) => makeMatchKey(partyName, ocrName);
  const onChoose = (ocrName, id) => setMatches(prev => ({ ...prev, [getKey(ocrName)]: id || undefined }));
  return (
    <div className="space-y-2">
      {list.length === 0 && <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-xs text-white/40">None detected</div>}
      {list.map((p, i) => {
        const key = getKey(p.ocrName);
        const selectedId = matches[key] || '';
        const selectedPlayer = selectedId ? allPlayers.find((player) => player.id === selectedId) : null;
        return (
          <div key={`${p.ocrName}-${i}`} className={joinClasses('rounded-2xl border px-3 py-3', selectedPlayer ? 'border-emerald-400/20 bg-emerald-500/8' : 'border-white/10 bg-black/20')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white" title={`${p.ocrName} (${p.pos || '—'})`}>
                  {p.ocrName}
                </div>
                <div className="mt-1 text-xs text-white/50">Position {p.pos || '—'}</div>
              </div>
              <span className={joinClasses('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]', selectedPlayer ? 'border border-emerald-400/20 bg-emerald-500/15 text-emerald-100' : 'border border-amber-400/20 bg-amber-500/10 text-amber-100')}>
                {selectedPlayer ? 'Matched' : 'Needs review'}
              </span>
            </div>
            <div className="mt-3 text-xs text-white/60">
              {selectedPlayer ? `${selectedPlayer.playerName} • ${selectedPlayer.team}` : 'No contract matched yet'}
            </div>
            <select
              value={selectedId}
              onChange={e => onChoose(p.ocrName, e.target.value)}
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#0a1929] px-3 py-2 text-sm text-white"
            >
              <option value="">Auto/None</option>
              {allPlayers
                .filter(ap => !p.pos || ap.position?.toUpperCase() === p.pos)
                .slice(0, 500)
                .map((ap, i) => (
                  <option key={`${ap.id}-${i}`} value={ap.id}>{ap.playerName} • {ap.team}</option>
                ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function StageCard({ step, title, description, status, statusTone = 'default', disabled = false, children }) {
  return (
    <section className={joinClasses('rounded-[24px] border p-4 md:p-5', disabled ? 'border-white/8 bg-white/[0.03]' : 'border-white/10 bg-black/20 shadow-[0_12px_36px_rgba(0,0,0,0.2)]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Step {step}</div>
          <h3 className="mt-1 text-lg font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm text-white/60">{description}</p>
        </div>
        <StatusChip label={status} tone={statusTone} />
      </div>
      <div className={joinClasses('mt-4', disabled && 'opacity-70')}>
        {children}
      </div>
    </section>
  );
}

function StageStatePill({ ready, busy, parsed }) {
  const tone = busy ? 'warning' : ready ? 'success' : parsed ? 'default' : 'default';
  const label = busy ? 'Scanning' : ready ? 'Ready To Apply' : parsed ? 'Reviewing Import' : 'Waiting For Scan';
  return <StatusChip label={label} tone={tone} />;
}

function StatusChip({ label, tone = 'default' }) {
  const toneClasses = {
    default: 'border-white/10 bg-white/5 text-white/70',
    success: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
    warning: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
  };

  return (
    <span className={joinClasses('inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]', toneClasses[tone] || toneClasses.default)}>
      {label}
    </span>
  );
}

function SummaryStat({ label, value, helper, tone = 'default', className = '' }) {
  const valueTone = {
    default: 'text-white',
    success: 'text-emerald-100',
    warning: 'text-amber-100',
  };

  return (
    <div className={joinClasses('rounded-2xl border border-white/10 bg-black/20 px-4 py-3', className)}>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className={joinClasses('mt-2 text-2xl font-black leading-none', valueTone[tone] || valueTone.default)}>{value}</div>
      <div className="mt-2 text-xs text-white/50">{helper}</div>
    </div>
  );
}

function MiniSummary({ label, value, tone = 'default' }) {
  return (
    <div className={joinClasses('rounded-2xl border px-4 py-3', tone === 'success' ? 'border-emerald-400/20 bg-emerald-500/10' : tone === 'warning' ? 'border-amber-400/20 bg-amber-500/10' : 'border-white/10 bg-black/20')}>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function EmptyStageMessage({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-white/50">
      {message}
    </div>
  );
}

function MappingRow({ party, teamAvatars, teamOptions, mappingValue, onChange }) {
  const avatarKey = (party.name || '').trim();

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] md:items-center">
      <div className="flex items-center gap-3 min-w-0">
        {teamAvatars[avatarKey] ? (
          <img src={`https://sleepercdn.com/avatars/thumbs/${teamAvatars[avatarKey]}`} alt="" className="h-10 w-10 rounded-full border border-white/10" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-xs font-bold text-white/65">
            {(party.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{party.name}</div>
          <div className="mt-1 text-xs text-white/50">Map this screenshot user to one BBB team.</div>
        </div>
      </div>
      <select
        value={mappingValue}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0a1929] px-3 py-2.5 text-sm text-white"
      >
        <option value="">Select BBB team</option>
        {(Array.isArray(teamOptions) ? teamOptions : []).map((team) => <option key={team} value={team}>{team}</option>)}
      </select>
    </div>
  );
}

function PartyVerificationCard({ party, mappedTeam, unmatchedCount, allPlayers, matches, setMatches }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-[#04111d] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-lg font-bold text-[#FFB199]">{party.name}</div>
          <div className="mt-1 text-sm text-white/55">
            {mappedTeam ? `Mapped to ${mappedTeam}` : 'Team not mapped yet'}
          </div>
        </div>
        <StatusChip label={unmatchedCount > 0 ? `${unmatchedCount} unresolved` : 'Verified'} tone={unmatchedCount > 0 ? 'warning' : 'success'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/45">Receives</div>
          <PlayerListEditor partyName={party.name} list={party.receives} allPlayers={allPlayers} matches={matches} setMatches={setMatches} />
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/45">Sends</div>
          <PlayerListEditor partyName={party.name} list={party.sends} allPlayers={allPlayers} matches={matches} setMatches={setMatches} />
        </div>
      </div>
    </div>
  );
}
