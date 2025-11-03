'use client';

import React, { useMemo, useState } from 'react';
import Tesseract from 'tesseract.js';

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
  teamOptions,  // BBB team names
  teamAvatars = {},
}) {
  const [imageUrl, setImageUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [parsed, setParsed] = useState(null); // { parties: [{name, receives:[{ocrName,pos}], sends:[{ocrName,pos}]}], rawLines }
  const [mapping, setMapping] = useState({}); // screenshotUser -> BBB team
  const [matches, setMatches] = useState({}); // key(user::ocrName) -> playerId
  const [error, setError] = useState('');

  const POS = new Set(['QB','RB','WR','TE','K','DST','DEF']);

  const onPickFile = (f) => {
    if (!f) return;
    setImageUrl(URL.createObjectURL(f));
    setBusy(false);
    setError('');
    setOcrText('');
    setParsed(null);
    setMapping({});
    setMatches({});
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

  const timeout = (ms, message = 'OCR timed out') => new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

  const runOCR = async () => {
    if (!imageUrl) return;
    setBusy(true);
    setError('');
    try {
      // Reduce image size to keep memory use reasonable on mobile/production
      const dataUrl = await downscaleImage(imageUrl, 1600);
      const recognize = () => Tesseract.recognize(dataUrl, 'eng', {
        // Explicitly set paths for production so worker/core/lang are fetched from CDN reliably
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
        langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/lang-data',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .:-',
        logger: m => {
          // Optional: could surface progress to UI later
          // console.debug('OCR:', m);
        }
      });
      // Watchdog timeout to avoid infinite processing in production
      const res = await Promise.race([
        recognize(),
        timeout(45000, 'OCR timed out after 45s')
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
    } catch (e) {
      const msg = e && (e.message || String(e));
      setError(`OCR failed. ${msg?.includes('wasm') ? 'WASM load issue. ' : ''}${msg?.includes('timed out') ? ' Took too long.' : ''} Try another screenshot, crop tighter, or reduce resolution.`);
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

  function tokenKey(p) { return `${norm(p.ocrName)}|${(p.pos || '').toUpperCase()}`; }

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

  function norm(x) { return (x || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function lastName(s) { const parts = (s || '').split(' ').filter(Boolean); return parts[parts.length - 1] || ''; }
  function similarity(a,b){
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    const grams = (t)=> new Set(Array.from({length: Math.max(0, t.length-1)}, (_,i)=>t.slice(i,i+2)));
    const A = grams(a), B = grams(b);
    const inter = [...A].filter(x=>B.has(x)).length;
    const uni = new Set([...A,...B]).size || 1;
    return inter/uni;
  }
  function bestMatch(ocrPlayer, all) {
    const ln = lastName(ocrPlayer.ocrName);
    const firstInit = (ocrPlayer.ocrName[0]||'').toUpperCase();
    const pos = ocrPlayer.pos;
    const cands = all.filter(p => (!pos || p.position?.toUpperCase() === pos) && norm(p.playerName).includes(norm(ln)));
    let best = null, bestScore = 0;
    for (const p of cands) {
      let s = 0;
      if (norm(lastName(p.playerName)) === norm(ln)) s += 0.6;
      if ((p.playerName[0]||'').toUpperCase() === firstInit) s += 0.1;
      s += 0.3 * similarity(p.playerName, ocrPlayer.ocrName);
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

  // Build participants using Sends lists and destination from Receives mapping
  const apply = () => {
    if (!parsed) return;
    // Verify mapping complete and unique
    const mappedTeams = parsed.parties.map(pt => mapping[pt.name] || '');
    if (mappedTeams.some(t => !t)) { setError('Map all screenshot users to BBB teams.'); return; }
    const uniqueCheck = new Set(mappedTeams);
    if (uniqueCheck.size !== mappedTeams.length) { setError('Each screenshot user must map to a distinct BBB team.'); return; }

    // Build lookups: token -> receiving party names (from OCR)
    const tokenOf = (x) => norm(`${x.ocrName}|${x.pos || ''}`);
    const receiversByToken = new Map();
    parsed.parties.forEach(pt => {
      pt.receives.forEach(x => {
        const t = tokenOf(x);
        if (!receiversByToken.has(t)) receiversByToken.set(t, new Set());
        receiversByToken.get(t).add(pt.name);
      });
    });

    // Resolve outgoing per party using ownership from contracts (allPlayers.team)
    const partiesOutgoing = new Map(); // partyName -> array of player objects with toTeam
    const pushedIds = new Set(); // avoid duplicates across parties

    parsed.parties.forEach(pt => {
      const partyTeam = mapping[pt.name];
      const addOutgoing = (x) => {
        const matchId = matches[makeKey(pt.name, x.ocrName)];
        const ref = allPlayers.find(ap => ap.id === matchId);
        if (!ref) return;
        // Only push once globally, prioritize the true owner party
        const ownerTeam = ref.team;
        const isOwner = ownerTeam && partyTeam && ownerTeam === partyTeam;
        if (!isOwner) return; // only record outgoing for the owner
        if (pushedIds.has(ref.id)) return;
        pushedIds.add(ref.id);
        // Determine destination: prefer OCR receiver party; fallback to any other mapped party
        const token = tokenOf(x);
        const rcvs = Array.from(receiversByToken.get(token) || []);
        let toTeam = '';
        if (rcvs.length) {
          // prefer a receiver that isn't self
          const recvPartyName = rcvs.find(n => n !== pt.name) || rcvs[0];
          toTeam = mapping[recvPartyName] || '';
        }
        // avoid self-destination; if only two parties, force the other
        if (!toTeam || toTeam === partyTeam) {
          if (parsed.parties.length === 2) {
            const other = parsed.parties.find(p => p.name !== pt.name);
            const otherTeam = other ? (mapping[other.name] || '') : '';
            if (otherTeam && otherTeam !== partyTeam) toTeam = otherTeam;
            else toTeam = '';
          } else {
            toTeam = '';
          }
        }
        if (!partiesOutgoing.has(pt.name)) partiesOutgoing.set(pt.name, []);
        partiesOutgoing.get(pt.name).push({ ...ref, toTeam });
      };
      // Consider both sends and receives for classification: owner is the sender
      pt.sends.forEach(addOutgoing);
      pt.receives.forEach(addOutgoing);
    });

    const participants = parsed.parties.map((pt, idx) => ({
      id: idx + 1,
      team: mapping[pt.name],
      searchTerm: '',
      selectedPlayers: partiesOutgoing.get(pt.name) || [],
    }));

    onApply(participants);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-[min(980px,95vw)] max-h-[90vh] overflow-auto bg-[#0a1929] text-white border border-white/10 rounded-lg p-4" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-[#FF4B1F]">Import Sleeper Trade Screenshot</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <input type="file" accept="image/*" onChange={e=>onPickFile(e.target.files?.[0])} className="block w-full text-sm" />
            {imageUrl && <img src={imageUrl} alt="preview" className="w-full rounded border border-white/10" />}
            <div className="flex items-center gap-2">
              <button onClick={runOCR} disabled={!imageUrl || busy} className={`px-3 py-1.5 rounded ${busy? 'bg-white/10' : 'bg-[#FF4B1F]/80 hover:bg-[#FF4B1F]'}`}>
                {busy ? 'Processing…' : 'Scan Screenshot'}
              </button>
              {busy && (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-[#FF4B1F]/40 border-t-[#FF4B1F] animate-spin" />
                  <button onClick={() => { setBusy(false); setError('OCR cancelled.'); }} className="text-xs text-white/70 hover:text-white">Cancel</button>
                </>
              )}
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            {ocrText && (
              <details className="text-xs text-white/60">
                <summary>OCR text (debug)</summary>
                <pre className="whitespace-pre-wrap">{ocrText}</pre>
              </details>
            )}
          </div>

          <div className="space-y-4">
            {!parsed && <div className="text-white/60 text-sm">Upload an image and run OCR to parse the trade.</div>}

            {parsed && (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white/70">Map screenshot users to BBB teams</div>
                  {parsed.parties.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        {teamAvatars[pt.name] ? (
                          <img src={`https://sleepercdn.com/avatars/${teamAvatars[pt.name]}`} alt="" className="w-6 h-6 rounded-full" />
                        ) : <div className="w-6 h-6 rounded-full bg-white/10" />}
                        <span className="font-semibold">{pt.name}</span>
                      </div>
                      <span className="text-xs text-white/50">→</span>
                      <select
                        value={mapping[pt.name] || ''}
                        onChange={e=>setMapping(m=>({ ...m, [pt.name]: e.target.value }))}
                        className="bg-[#0a1929] text-white rounded px-2 py-1 border border-white/10"
                      >
                        <option value="">Select BBB team</option>
                        {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/10">
                  <div className="text-sm font-semibold text-white/70 mb-2">Detected players (click to adjust)</div>
                  <div className="space-y-3">
                    {(displayParties || parsed.parties).map((pt, idx) => (
                      <div key={idx} className="bg-black/30 rounded border border-white/10 p-2">
                        <div className="font-bold text-[#FF4B1F] mb-1">{pt.name}</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-white/60 mb-1">Receives</div>
                            <PlayerListEditor partyName={pt.name} list={pt.receives} allPlayers={allPlayers} matches={matches} setMatches={setMatches} />
                          </div>
                          <div>
                            <div className="text-xs text-white/60 mb-1">Sends</div>
                            <PlayerListEditor partyName={pt.name} list={pt.sends} allPlayers={allPlayers} matches={matches} setMatches={setMatches} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-white/60">Unmatched: {unmatched}. Unmatched players will be ignored.</div>
                  <button onClick={apply} className="px-3 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600">Apply to Trade</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerListEditor({ partyName, list, allPlayers, matches, setMatches }) {
  const makeKey = (ocrName) => `${partyName}::${ocrName}`;
  const onChoose = (ocrName, id) => setMatches(prev => ({ ...prev, [makeKey(ocrName)]: id || undefined }));
  return (
    <div className="space-y-1">
      {list.length === 0 && <div className="text-xs text-white/40">None</div>}
      {list.map((p, i) => {
        const key = makeKey(p.ocrName);
        const selectedId = matches[key] || '';
        return (
          <div key={`${p.ocrName}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
            <span className="truncate" title={`${p.ocrName} (${p.pos || '—'})`}>
              {p.ocrName} <span className="text-white/40">({p.pos || '—'})</span>
            </span>
            <select
              value={selectedId}
              onChange={e => onChoose(p.ocrName, e.target.value)}
              className="bg-[#0a1929] text-white rounded px-2 py-1 border border-white/10 w-56"
            >
              <option value="">Auto/None</option>
              {allPlayers
                .filter(ap => !p.pos || ap.position?.toUpperCase() === p.pos)
                .slice(0, 500)
                .map(ap => (
                  <option key={ap.id} value={ap.id}>{ap.playerName} • {ap.team}</option>
                ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
