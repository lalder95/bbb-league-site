'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function PushNotificationManager() {
  const [platform, setPlatform] = useState(null); // 'ios' | 'android' | 'desktop'
  const [isStandalone, setIsStandalone] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports platform as 'MacIntel' with many touch points
    const isIOS =
      /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    setPlatform(isIOS ? 'ios' : isAndroid ? 'android' : 'desktop');

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true;
    setIsStandalone(standalone);

    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsPushSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      navigator.serviceWorker.ready
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription();
          if (!sub) return; // no local sub — show the button

          // Verify the local subscription is also registered on the server.
          // If the server has no record of it, re-POST it now (we already have permission).
          try {
            const res = await fetch('/api/notifications/subscribe');
            if (res.ok) {
              const { devices } = await res.json();
              const knownOnServer = (devices || []).some((d) => d.endpoint === sub.endpoint);
              if (!knownOnServer) {
                // Re-register silently
                await fetch('/api/notifications/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(sub.toJSON()),
                });
              }
            }
          } catch {
            // Network error — still show as enabled locally
          }
          setHasSubscription(true);
        })
        .catch(() => {});
    }
  }, []);

  const handleSubscribe = async () => {
    setSubscribing(true);
    setSubscribeError('');
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const keyRes = await fetch('/api/notifications/vapid-key');
      if (!keyRes.ok) throw new Error('Push is not configured on the server.');
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error('No VAPID key available.');

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });

      setHasSubscription(true);
    } catch (err) {
      setSubscribeError(err.message || 'Failed to enable notifications.');
    } finally {
      setSubscribing(false);
    }
  };

  // Not yet detected (first render before useEffect runs client-side)
  if (platform === null) return null;

  // iOS in a regular browser — must add to home screen first
  if (platform === 'ios' && !isStandalone) {
    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Push Notifications</h2>
          <p className="mt-0.5 text-xs text-white/40">
            iOS requires the app to be installed on your home screen before push notifications can be enabled.
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm font-medium text-white">Add to Home Screen &amp; Allow Notifications</p>
          <ol className="space-y-2.5 text-sm text-white/60">
            {[
              <>{`Tap the `}<span className="text-white font-medium">Share</span>{` button in Safari (the box with an arrow pointing up).`}</>,
              <>{`Scroll down and tap `}<span className="text-white font-medium">Add to Home Screen</span>.</>,
              <>{`Tap `}<span className="text-white font-medium">Add</span>{` to confirm.`}</>,
              <>{`Open the app from your Home Screen, come back to this page, and tap `}<span className="text-white font-medium">Allow Notifications</span>.</>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-[#FF4B1F]/20 text-[#FF4B1F] text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  // Push not supported (some browsers / older Android WebViews)
  if (!isPushSupported) {
    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
        <h2 className="text-base font-semibold text-white mb-1">Push Notifications</h2>
        <p className="text-sm text-white/50">Push notifications are not supported in this browser.</p>
      </div>
    );
  }

  // Already enabled
  if (permission === 'granted' && hasSubscription) {
    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5 flex items-center gap-3">
        <span className="text-green-400 text-lg leading-none">✓</span>
        <div>
          <h2 className="text-base font-semibold text-white">Push Notifications</h2>
          <p className="text-xs text-white/40 mt-0.5">Push notifications are enabled on this device.</p>
        </div>
      </div>
    );
  }

  // Blocked by user
  if (permission === 'denied') {
    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
        <h2 className="text-base font-semibold text-white mb-1">Push Notifications</h2>
        <p className="text-sm text-white/50">
          Notifications have been blocked. To re-enable them, open your{' '}
          {platform === 'android' ? 'Android system' : 'browser'} notification settings,
          allow notifications for this site, then reload the page.
        </p>
      </div>
    );
  }

  // Default / granted but no subscription yet
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
      <h2 className="text-base font-semibold text-white mb-1">Push Notifications</h2>
      <p className="text-xs text-white/40 mb-4">
        Receive instant push notifications on this device even when the app isn&apos;t open.
      </p>
      <button
        onClick={handleSubscribe}
        disabled={subscribing}
        className="px-5 py-2.5 rounded-full bg-[#FF4B1F] text-white text-sm font-semibold hover:bg-[#FF4B1F]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
      >
        {subscribing ? 'Enabling…' : 'Allow Notifications'}
      </button>
      {subscribeError && <p className="mt-3 text-xs text-red-400">{subscribeError}</p>}
    </div>
  );
}

const PREFS_CONFIG = [
  {
    key: 'contract_extension',
    label: 'Contract Extensions',
    description: 'When any team finalizes a player contract extension.',
  },
  {
    key: 'franchise_tag',
    label: 'Franchise Tags',
    description: 'When any team applies a franchise tag to a player.',
  },
  {
    key: 'rfa_tag',
    label: 'RFA Tags',
    description: 'When any team applies an RFA tag to a player.',
  },
  {
    key: 'holdout_decision',
    label: 'Holdout Decisions',
    description: 'When a team accepts or declines holdout terms.',
  },
  {
    key: 'trade_block_listing',
    label: 'Trade Block Listings',
    description: 'When any team posts a new listing on the trade block.',
  },
  {
    key: 'trade_block_offer_selected',
    label: 'Trade Offer Selected',
    description: 'When your trade block offer is selected by the listing owner.',
  },
  {
    key: 'auction_outbid',
    label: 'FA Auction Outbid',
    description: 'When another team outbids you on a player in the free agent auction.',
  },
];

function ProfileCard({ session }) {
  const username = session?.user?.name || session?.user?.username || '';
  const role = session?.user?.role || 'user';
  const sleeperId = session?.user?.sleeperId || '';
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sleeperId) return;
    fetch(`https://api.sleeper.app/v1/user/${sleeperId}`)
      .then((r) => r.json())
      .then((u) => {
        if (u?.avatar) setAvatarSrc(`https://sleepercdn.com/avatars/${u.avatar}`);
      })
      .catch(() => {});
  }, [sleeperId]);

  const handleCopy = () => {
    if (!sleeperId) return;
    navigator.clipboard.writeText(sleeperId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5 flex items-center gap-4">
      <div className="flex-shrink-0 w-14 h-14 rounded-full border border-white/10 bg-white/10 overflow-hidden flex items-center justify-center text-xl font-bold text-white">
        {avatarSrc ? (
          <img src={avatarSrc} alt={username} className="w-full h-full object-cover" />
        ) : (
          <span>{username.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold text-white truncate">{username}</span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              role === 'admin'
                ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/15 text-[#FF8A6B]'
                : 'border-white/20 bg-white/5 text-white/50'
            }`}
          >
            {role}
          </span>
        </div>
        {sleeperId && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy Sleeper ID"
            className="mt-1 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <span className="font-mono">{`Sleeper ID: ${sleeperId}`}</span>
            <span>{copied ? '✓' : '⎘'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (next !== confirm) {
      setIsError(true);
      setMsg('New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setIsError(true);
      setMsg('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      setIsError(false);
      setMsg('Password updated successfully.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setIsError(true);
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]/40';

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white">Change Password</h2>
      </div>
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Current password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">New password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        {msg && (
          <p className={`text-xs ${isError ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-full bg-[#FF4B1F] text-white text-sm font-semibold hover:bg-[#FF4B1F]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
        >
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

function ConnectedDevices() {
  const [devices, setDevices] = useState(null);
  const [revoking, setRevoking] = useState(null); // endpoint being revoked
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/subscribe');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (endpoint) => {
    setRevoking(endpoint);
    try {
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setDevices((prev) => prev.filter((d) => d.endpoint !== endpoint));
    } catch {
      setError('Failed to revoke device.');
    } finally {
      setRevoking(null);
    }
  };

  function getServiceName(endpoint) {
    try {
      const { hostname } = new URL(endpoint);
      if (hostname.includes('googleapis')) return 'Chrome / Android';
      if (hostname.includes('push.apple')) return 'Safari / iOS';
      if (hostname.includes('mozilla')) return 'Firefox';
      if (hostname.includes('windows')) return 'Edge / Windows';
      return hostname;
    } catch {
      return 'Unknown';
    }
  }

  function relativeTime(dateVal) {
    if (!dateVal) return '';
    const diff = Date.now() - new Date(dateVal).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateVal).toLocaleDateString();
  }

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white">Connected Devices</h2>
        <p className="mt-0.5 text-xs text-white/40">Devices registered to receive push notifications.</p>
      </div>
      <div className="px-6 py-5">
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        {devices === null ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-xs text-white/40">No devices registered yet. Enable push notifications above.</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.endpoint} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{getServiceName(d.endpoint)}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Added {relativeTime(d.createdAt)}
                    {d.updatedAt && d.updatedAt !== d.createdAt ? ` · Active ${relativeTime(d.updatedAt)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(d.endpoint)}
                  disabled={revoking === d.endpoint}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:border-red-400/50 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {revoking === d.endpoint ? 'Removing…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Toggle({ id, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/60 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[#FF4B1F]' : 'bg-white/20'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/account');
  }, [status, router]);

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/account/notification-preferences');
      if (!res.ok) throw new Error('Failed to load preferences');
      const data = await res.json();
      setPrefs(data.preferences);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') loadPrefs();
  }, [status, loadPrefs]);

  const handleToggle = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaveMsg('');
    setSaving(true);
    try {
      const res = await fetch('/api/account/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      setSaveMsg('Saved');
    } catch (err) {
      // Revert optimistic update
      setPrefs((prev) => ({ ...prev, [key]: !value }));
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || !prefs) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white/60 text-sm">Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-red-400 text-sm">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] py-12 px-4">
      <div className="max-w-xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">My Account</h1>
        </div>

        {/* Profile */}
        <ProfileCard session={session} />

        {/* Push notification device setup */}
        <PushNotificationManager />

        {/* Notification Preferences */}
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white">Notification Preferences</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Choose which events trigger in-app and push notifications for you.
            </p>
          </div>

          <ul className="divide-y divide-white/10">
            {PREFS_CONFIG.map(({ key, label, description }) => (
              <li key={key} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <label htmlFor={`pref-${key}`} className="text-sm font-medium text-white cursor-pointer">
                    {label}
                  </label>
                  <p className="text-xs text-white/40 mt-0.5">{description}</p>
                </div>
                <Toggle
                  id={`pref-${key}`}
                  checked={prefs[key] !== false}
                  onChange={(val) => handleToggle(key, val)}
                  disabled={saving}
                />
              </li>
            ))}
          </ul>

          {saveMsg && (
            <div className={`px-6 py-3 text-xs border-t border-white/10 ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMsg}
            </div>
          )}
        </div>

        {/* Connected Devices */}
        <ConnectedDevices />

        {/* Change Password */}
        <ChangePassword />
      </div>
    </div>
  );
}
