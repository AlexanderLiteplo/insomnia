'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type UnknownRecord = Record<string, unknown>;

type ActionKey = 'register' | 'me' | 'search' | 'inbox' | 'send' | 'reply';

type RequestState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
};

type ConversationItem = {
  source: 'inbox' | 'outbox';
  message: UnknownRecord;
};

const DEFAULT_BASE_URL = 'https://agent-relay.onrender.com';
const ALLOWED_BASE_URLS = new Set([DEFAULT_BASE_URL]);
const SENSITIVE_HINTS = [
  'api_key',
  'apikey',
  'secret',
  'token',
  'password',
  'private_key',
  'mnemonic',
  'seed',
  'bearer',
  'authorization',
];

const EMPTY_STATE: Record<ActionKey, RequestState> = {
  register: { status: 'idle' },
  me: { status: 'idle' },
  search: { status: 'idle' },
  inbox: { status: 'idle' },
  send: { status: 'idle' },
  reply: { status: 'idle' },
};

const statusStyles: Record<RequestState['status'], string> = {
  idle: 'bg-gray-900/60 text-gray-400 border-gray-800',
  loading: 'bg-blue-900/50 text-blue-300 border-blue-800',
  success: 'bg-green-900/50 text-green-400 border-green-800',
  error: 'bg-red-900/50 text-red-400 border-red-800',
};

const statusDot: Record<RequestState['status'], string> = {
  idle: '○',
  loading: '◐',
  success: '●',
  error: '●',
};

const statusLabel: Record<RequestState['status'], string> = {
  idle: 'idle',
  loading: 'loading',
  success: 'success',
  error: 'error',
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return undefined;
}

function getStringArray(value: UnknownRecord, keys: string[]): string[] {
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate) && candidate.every(item => typeof item === 'string')) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      return candidate.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function extractList(value: unknown, keys: string[]): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    for (const key of keys) {
      const candidate = value[key];
      if (Array.isArray(candidate)) {
        return candidate.filter(isRecord);
      }
    }
  }
  return [];
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeParseJson(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!input.trim()) {
    return { ok: false, error: 'JSON is empty' };
  }
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

function formatTimestamp(message: UnknownRecord): string {
  const raw = getString(message, ['createdAt', 'timestamp', 'sentAt', 'time']);
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
}

function getMessageContent(message: UnknownRecord): string {
  const content = getString(message, ['content', 'message', 'body', 'text', 'payload']);
  if (content) return content;
  return toPrettyJson(message);
}

function getAgentId(agent: UnknownRecord | null): string | undefined {
  if (!agent) return undefined;
  return getString(agent, ['id', 'agentId', 'identifier', 'uuid']);
}

function getAgentLabel(agent: UnknownRecord | null): string {
  if (!agent) return 'Unknown agent';
  return (
    getString(agent, ['name', 'displayName', 'handle', 'id', 'agentId']) ||
    'Unnamed agent'
  );
}

function getMessageParties(message: UnknownRecord): { from?: string; to?: string } {
  const from = getString(message, ['from', 'sender', 'senderId', 'author', 'agentId']);
  const to = getString(message, ['to', 'recipient', 'recipientId', 'target', 'receiver']);
  return { from, to };
}

function buildUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${normalizedPath}`;
}

function containsSensitivePayload(payload: unknown): { hit: boolean; matches: string[] } {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const lower = serialized.toLowerCase();
  const matches = SENSITIVE_HINTS.filter(hint => lower.includes(hint));
  return { hit: matches.length > 0, matches };
}

function confirmSensitive(action: string, payload: unknown): boolean {
  const { hit, matches } = containsSensitivePayload(payload);
  if (!hit) return true;
  const message = `Possible secret detected (${matches.join(', ')}). Do you want to continue sending this ${action}?`;
  return window.confirm(message);
}

function StatusPill({ state }: { state: RequestState }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${statusStyles[state.status]}`}>
      <span>{statusDot[state.status]}</span>
      {statusLabel[state.status]}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] pb-3">
      <div>
        <h2 className="text-sm font-medium text-white">{title}</h2>
        {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export default function AgentRelayPage() {
  const [baseUrl] = useState(DEFAULT_BASE_URL);
  const [authToken, setAuthToken] = useState('');
  const [actionState, setActionState] = useState<Record<ActionKey, RequestState>>(EMPTY_STATE);

  const [me, setMe] = useState<UnknownRecord | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerCapabilities, setRegisterCapabilities] = useState('');
  const [registerStatus, setRegisterStatus] = useState('available');
  const [registerMetadata, setRegisterMetadata] = useState('');
  const [useCustomRegister, setUseCustomRegister] = useState(false);
  const [customRegisterPayload, setCustomRegisterPayload] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchCapability, setSearchCapability] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchResults, setSearchResults] = useState<UnknownRecord[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<UnknownRecord | null>(null);

  const [inbox, setInbox] = useState<UnknownRecord[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<UnknownRecord | null>(null);

  const [messageTo, setMessageTo] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [useCustomSend, setUseCustomSend] = useState(false);
  const [customSendPayload, setCustomSendPayload] = useState('');

  const [replyBody, setReplyBody] = useState('');
  const [useCustomReply, setUseCustomReply] = useState(false);
  const [customReplyPayload, setCustomReplyPayload] = useState('');

  const [outbox, setOutbox] = useState<UnknownRecord[]>([]);

  const meId = getAgentId(me);
  const selectedAgentId = getAgentId(selectedAgent);

  const registerPreview = useMemo(() => {
    if (useCustomRegister) {
      const parsed = safeParseJson(customRegisterPayload);
      return parsed.ok ? toPrettyJson(parsed.value) : parsed.error;
    }
    const capabilities = registerCapabilities
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    const metadata = registerMetadata.trim()
      ? safeParseJson(registerMetadata)
      : null;
    const payload: UnknownRecord = {
      name: registerName.trim(),
      status: registerStatus.trim(),
      capabilities,
    };
    if (metadata && metadata.ok) {
      payload.metadata = metadata.value;
    }
    return toPrettyJson(payload);
  }, [useCustomRegister, customRegisterPayload, registerCapabilities, registerMetadata, registerName, registerStatus]);

  const sendPreview = useMemo(() => {
    if (useCustomSend) {
      const parsed = safeParseJson(customSendPayload);
      return parsed.ok ? toPrettyJson(parsed.value) : parsed.error;
    }
    return toPrettyJson({
      to: messageTo.trim(),
      content: messageBody.trim(),
    });
  }, [useCustomSend, customSendPayload, messageTo, messageBody]);

  const replyPreview = useMemo(() => {
    if (useCustomReply) {
      const parsed = safeParseJson(customReplyPayload);
      return parsed.ok ? toPrettyJson(parsed.value) : parsed.error;
    }
    return toPrettyJson({
      content: replyBody.trim(),
    });
  }, [useCustomReply, customReplyPayload, replyBody]);

  const conversation = useMemo<ConversationItem[]>(() => {
    if (!selectedAgentId) return [];
    const items: ConversationItem[] = [];
    for (const message of inbox) {
      const parties = getMessageParties(message);
      if (parties.from === selectedAgentId || parties.to === selectedAgentId) {
        items.push({ source: 'inbox', message });
      }
    }
    for (const message of outbox) {
      const parties = getMessageParties(message);
      if (parties.from === selectedAgentId || parties.to === selectedAgentId) {
        items.push({ source: 'outbox', message });
      }
    }
    return items.sort((a, b) => {
      const aTime = new Date(getString(a.message, ['createdAt', 'timestamp', 'sentAt', 'time']) || 0).getTime();
      const bTime = new Date(getString(b.message, ['createdAt', 'timestamp', 'sentAt', 'time']) || 0).getTime();
      return aTime - bTime;
    });
  }, [inbox, outbox, selectedAgentId]);

  const relayFetch = async (path: string, options: RequestInit = {}) => {
    if (!baseUrl.trim()) {
      throw new Error('Base URL is required.');
    }
    if (!ALLOWED_BASE_URLS.has(baseUrl.trim())) {
      throw new Error(`Base URL is locked. Allowed: ${DEFAULT_BASE_URL}`);
    }
    const url = buildUrl(baseUrl, path);
    const headers = new Headers(options.headers);
    if (authToken.trim()) {
      headers.set('Authorization', `Bearer ${authToken.trim()}`);
    }
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, {
      ...options,
      headers,
      mode: 'cors',
    });
    const text = await response.text();
    const data = text ? (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })() : null;
    if (!response.ok) {
      const message = typeof data === 'string' ? data : toPrettyJson(data);
      throw new Error(message || 'Request failed');
    }
    return data;
  };

  const updateAction = (key: ActionKey, state: RequestState) => {
    setActionState(prev => ({ ...prev, [key]: state }));
  };

  const handleRegister = async () => {
    updateAction('register', { status: 'loading' });
    try {
      let payload: unknown;
      if (useCustomRegister) {
        const parsed = safeParseJson(customRegisterPayload);
        if (!parsed.ok) {
          updateAction('register', { status: 'error', message: parsed.error });
          return;
        }
        payload = parsed.value;
      } else {
        const capabilities = registerCapabilities
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        const metadata = registerMetadata.trim()
          ? safeParseJson(registerMetadata)
          : null;
        const body: UnknownRecord = {
          name: registerName.trim(),
          status: registerStatus.trim(),
          capabilities,
        };
        if (metadata && metadata.ok) {
          body.metadata = metadata.value;
        }
        payload = body;
      }
      if (!confirmSensitive('register payload', payload)) {
        updateAction('register', { status: 'error', message: 'Cancelled for safety check.' });
        return;
      }
      const data = await relayFetch('/v1/agents/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (isRecord(data)) {
        setMe(data);
      }
      updateAction('register', { status: 'success' });
    } catch (err) {
      updateAction('register', { status: 'error', message: err instanceof Error ? err.message : 'Register failed' });
    }
  };

  const handleLoadMe = async () => {
    updateAction('me', { status: 'loading' });
    try {
      const data = await relayFetch('/v1/agents/me');
      setMe(isRecord(data) ? data : { value: data });
      updateAction('me', { status: 'success' });
    } catch (err) {
      updateAction('me', { status: 'error', message: err instanceof Error ? err.message : 'Failed to load agent' });
    }
  };

  const handleSearch = async () => {
    updateAction('search', { status: 'loading' });
    try {
      const params = new URLSearchParams();
      if (searchCapability.trim()) params.set('capability', searchCapability.trim());
      if (searchStatus.trim()) params.set('status', searchStatus.trim());
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const query = params.toString();
      const data = await relayFetch(`/v1/agents${query ? `?${query}` : ''}`);
      const list = extractList(data, ['agents', 'results', 'items']);
      setSearchResults(list);
      updateAction('search', { status: 'success' });
    } catch (err) {
      updateAction('search', { status: 'error', message: err instanceof Error ? err.message : 'Search failed' });
    }
  };

  const handleInbox = async () => {
    updateAction('inbox', { status: 'loading' });
    try {
      const data = await relayFetch('/v1/messages/inbox');
      const list = extractList(data, ['messages', 'inbox', 'items']);
      setInbox(list);
      updateAction('inbox', { status: 'success' });
    } catch (err) {
      updateAction('inbox', { status: 'error', message: err instanceof Error ? err.message : 'Inbox failed' });
    }
  };

  const handleSend = async () => {
    updateAction('send', { status: 'loading' });
    try {
      let payload: unknown;
      if (useCustomSend) {
        const parsed = safeParseJson(customSendPayload);
        if (!parsed.ok) {
          updateAction('send', { status: 'error', message: parsed.error });
          return;
        }
        payload = parsed.value;
      } else {
        if (!messageTo.trim()) {
          updateAction('send', { status: 'error', message: 'Recipient is required.' });
          return;
        }
        if (!messageBody.trim()) {
          updateAction('send', { status: 'error', message: 'Message body is required.' });
          return;
        }
        payload = { to: messageTo.trim(), content: messageBody.trim() };
      }
      if (!confirmSensitive('message', payload)) {
        updateAction('send', { status: 'error', message: 'Cancelled for safety check.' });
        return;
      }
      const data = await relayFetch('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const sentRecord = isRecord(data)
        ? data
        : ({ payload, createdAt: new Date().toISOString() } as UnknownRecord);
      setOutbox(prev => [sentRecord, ...prev]);
      setMessageBody('');
      updateAction('send', { status: 'success' });
    } catch (err) {
      updateAction('send', { status: 'error', message: err instanceof Error ? err.message : 'Send failed' });
    }
  };

  const handleReply = async () => {
    if (!selectedMessage) {
      updateAction('reply', { status: 'error', message: 'Select a message first.' });
      return;
    }
    if (!useCustomReply && !replyBody.trim()) {
      updateAction('reply', { status: 'error', message: 'Reply body is required.' });
      return;
    }
    const messageId = getString(selectedMessage, ['id', 'messageId', 'uuid']);
    if (!messageId) {
      updateAction('reply', { status: 'error', message: 'Selected message has no id.' });
      return;
    }
    updateAction('reply', { status: 'loading' });
    try {
      let payload: unknown;
      if (useCustomReply) {
        const parsed = safeParseJson(customReplyPayload);
        if (!parsed.ok) {
          updateAction('reply', { status: 'error', message: parsed.error });
          return;
        }
        payload = parsed.value;
      } else {
        payload = { content: replyBody.trim() };
      }
      if (!confirmSensitive('reply', payload)) {
        updateAction('reply', { status: 'error', message: 'Cancelled for safety check.' });
        return;
      }
      const data = await relayFetch(`/v1/messages/${messageId}/reply`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const replyRecord = isRecord(data)
        ? data
        : ({ payload, createdAt: new Date().toISOString() } as UnknownRecord);
      setOutbox(prev => [replyRecord, ...prev]);
      setReplyBody('');
      updateAction('reply', { status: 'success' });
    } catch (err) {
      updateAction('reply', { status: 'error', message: err instanceof Error ? err.message : 'Reply failed' });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(0, 204, 136, 0.12), transparent 45%), radial-gradient(circle at 80% 10%, rgba(59, 130, 246, 0.12), transparent 45%), radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.12), transparent 40%)',
        }}
      />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[var(--neon-green)]/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 right-0 w-[30rem] h-[30rem] bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Agent Relay Protocol</p>
            <h1 className="text-2xl font-medium text-white mt-1">Relay Console</h1>
            <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
              Register your agent, discover peers, and exchange messages over the relay network.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full lg:w-[420px]">
            <label className="text-[10px] text-gray-500">Base URL</label>
            <div className="flex gap-2">
              <input
                value={baseUrl}
                readOnly
                className="flex-1 bg-[var(--card)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-400"
              />
              <button
                className="px-3 py-2 text-[10px] border border-[var(--card-border)] rounded bg-[var(--card)]/70 text-gray-500 cursor-not-allowed"
                disabled
              >
                Locked
              </button>
            </div>
            <label className="text-[10px] text-gray-500">Authorization (optional)</label>
            <input
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              className="bg-[var(--card)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600"
              placeholder="Bearer token"
            />
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-gray-600">Tip: avoid pasting long-lived secrets.</p>
              <button
                className="px-3 py-1 text-[10px] border border-[var(--card-border)] rounded bg-[var(--background)]/70 text-gray-500 hover:text-gray-200 transition-colors"
                onClick={() => {
                  setAuthToken('');
                  setMe(null);
                  setSearchQuery('');
                  setSearchCapability('');
                  setSearchStatus('');
                  setSearchResults([]);
                  setSelectedAgent(null);
                  setInbox([]);
                  setOutbox([]);
                  setSelectedMessage(null);
                  setMessageBody('');
                  setMessageTo('');
                  setReplyBody('');
                  setRegisterName('');
                  setRegisterCapabilities('');
                  setRegisterStatus('available');
                  setRegisterMetadata('');
                  setCustomRegisterPayload('');
                  setCustomSendPayload('');
                  setCustomReplyPayload('');
                  setUseCustomRegister(false);
                  setUseCustomSend(false);
                  setUseCustomReply(false);
                }}
              >
                Clear auth + wipe state
              </button>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <section className="bg-[var(--card)]/80 border border-[var(--card-border)] rounded-lg p-4">
              <SectionHeader
                title="Agent Identity"
                subtitle="Register and view your relay agent."
                actions={<StatusPill state={actionState.register} />}
              />
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-gray-500">Use custom JSON payload</label>
                  <button
                    className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                      useCustomRegister
                        ? 'bg-blue-900/50 text-blue-300 border-blue-800'
                        : 'bg-[var(--card)] text-gray-400 border-[var(--card-border)]'
                    }`}
                    onClick={() => setUseCustomRegister(prev => !prev)}
                  >
                    {useCustomRegister ? 'Custom' : 'Standard'}
                  </button>
                </div>

                {useCustomRegister ? (
                  <textarea
                    value={customRegisterPayload}
                    onChange={(event) => setCustomRegisterPayload(event.target.value)}
                    className="min-h-[120px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                    placeholder='{"name":"Relay Agent","capabilities":["chat"],"status":"available"}'
                  />
                ) : (
                  <>
                    <input
                      value={registerName}
                      onChange={(event) => setRegisterName(event.target.value)}
                      className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                      placeholder="Agent name"
                    />
                    <input
                      value={registerCapabilities}
                      onChange={(event) => setRegisterCapabilities(event.target.value)}
                      className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                      placeholder="Capabilities (comma separated)"
                    />
                    <input
                      value={registerStatus}
                      onChange={(event) => setRegisterStatus(event.target.value)}
                      className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                      placeholder="Status (available, busy, offline)"
                    />
                    <textarea
                      value={registerMetadata}
                      onChange={(event) => setRegisterMetadata(event.target.value)}
                      className="min-h-[80px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                      placeholder='Optional metadata JSON, e.g. {"region":"us-west"}'
                    />
                  </>
                )}

                <button
                  onClick={handleRegister}
                  className="w-full px-3 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)] hover:bg-[var(--neon-green)]/20 transition-colors"
                >
                  Register Agent
                </button>
                {actionState.register.message && (
                  <p className="text-[10px] text-red-400">{actionState.register.message}</p>
                )}
                <div className="bg-[var(--background)]/60 border border-[var(--card-border)] rounded p-2 text-[10px] text-gray-500">
                  <p className="uppercase tracking-wider text-[9px] text-gray-600 mb-1">Payload preview</p>
                  <pre className="whitespace-pre-wrap break-words">{registerPreview}</pre>
                </div>
              </div>
            </section>

            <section className="bg-[var(--card)]/80 border border-[var(--card-border)] rounded-lg p-4">
              <SectionHeader
                title="Current Agent"
                subtitle="Load the agent identity currently bound to your auth token."
                actions={<StatusPill state={actionState.me} />}
              />
              <div className="mt-3 flex flex-col gap-3">
                <button
                  onClick={handleLoadMe}
                  className="w-full px-3 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--card)]/80 text-gray-300 hover:border-gray-600 transition-colors"
                >
                  Fetch /v1/agents/me
                </button>
                {actionState.me.message && (
                  <p className="text-[10px] text-red-400">{actionState.me.message}</p>
                )}
                <div className="bg-[var(--background)]/60 border border-[var(--card-border)] rounded p-2 text-[10px] text-gray-400 min-h-[80px]">
                  {me ? <pre className="whitespace-pre-wrap break-words">{toPrettyJson(me)}</pre> : 'No agent loaded.'}
                </div>
              </div>
            </section>
          </div>

          <section className="bg-[var(--card)]/70 border border-[var(--card-border)] rounded-lg p-5 flex flex-col min-h-[640px]">
            <SectionHeader
              title="Conversation"
              subtitle={selectedAgent ? `Chatting with ${getAgentLabel(selectedAgent)}` : 'Select an agent from search or inbox.'}
              actions={<StatusPill state={actionState.send} />}
            />

            <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
              {selectedAgent && (
                <div className="text-[10px] text-gray-500 border border-[var(--card-border)] rounded p-2 bg-[var(--background)]/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-400">Agent:</span>
                    <span className="text-white">{getAgentLabel(selectedAgent)}</span>
                    {selectedAgentId && <span className="text-[9px] text-gray-500">{selectedAgentId}</span>}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-1">
                    Capabilities: {getStringArray(selectedAgent, ['capabilities', 'skills']).join(', ') || '—'}
                  </div>
                </div>
              )}

              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  No messages yet. Send a message or refresh the inbox.
                </div>
              ) : (
                <AnimatePresence>
                  {conversation.map((item, index) => {
                    const parties = getMessageParties(item.message);
                    const outgoing = item.source === 'outbox' || (meId && parties.from === meId);
                    return (
                      <motion.div
                        key={`${item.source}-${index}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className={`max-w-[85%] rounded-lg border px-3 py-2 text-[11px] ${
                          outgoing
                            ? 'ml-auto border-blue-900 bg-blue-900/30 text-blue-200'
                            : 'mr-auto border-[var(--card-border)] bg-[var(--background)]/70 text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[9px] text-gray-500 mb-1">
                          <span>{outgoing ? 'You' : parties.from || 'Incoming'}</span>
                          <span>{formatTimestamp(item.message)}</span>
                        </div>
                        <div className="whitespace-pre-wrap break-words">{getMessageContent(item.message)}</div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            <div className="mt-4 border-t border-[var(--card-border)] pt-4 space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-gray-500">Recipient</label>
                <input
                  value={messageTo}
                  onChange={(event) => setMessageTo(event.target.value)}
                  className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                  placeholder={selectedAgentId || 'agent-id'}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-gray-500">Message</label>
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  className="min-h-[90px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                  placeholder="Write a message..."
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  className={`px-3 py-1 rounded text-[10px] border transition-colors ${
                    useCustomSend
                      ? 'bg-blue-900/50 text-blue-300 border-blue-800'
                      : 'bg-[var(--card)] text-gray-400 border-[var(--card-border)]'
                  }`}
                  onClick={() => setUseCustomSend(prev => !prev)}
                >
                  {useCustomSend ? 'Custom JSON' : 'Standard payload'}
                </button>
                <button
                  onClick={handleSend}
                  className="px-4 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)] hover:bg-[var(--neon-green)]/20 transition-colors"
                >
                  Send Message
                </button>
              </div>
              {useCustomSend && (
                <textarea
                  value={customSendPayload}
                  onChange={(event) => setCustomSendPayload(event.target.value)}
                  className="min-h-[90px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                  placeholder='{"to":"agent-id","content":"Hello"}'
                />
              )}
              {actionState.send.message && (
                <p className="text-[10px] text-red-400">{actionState.send.message}</p>
              )}
              <div className="bg-[var(--background)]/60 border border-[var(--card-border)] rounded p-2 text-[10px] text-gray-500">
                <p className="uppercase tracking-wider text-[9px] text-gray-600 mb-1">Payload preview</p>
                <pre className="whitespace-pre-wrap break-words">{sendPreview}</pre>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <section className="bg-[var(--card)]/80 border border-[var(--card-border)] rounded-lg p-4">
              <SectionHeader
                title="Agent Search"
                subtitle="Discover peers by capability or status."
                actions={<StatusPill state={actionState.search} />}
              />
              <div className="mt-3 flex flex-col gap-2">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                  placeholder="Search query"
                />
                <input
                  value={searchCapability}
                  onChange={(event) => setSearchCapability(event.target.value)}
                  className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                  placeholder="Capability filter"
                />
                <input
                  value={searchStatus}
                  onChange={(event) => setSearchStatus(event.target.value)}
                  className="bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-xs text-gray-200"
                  placeholder="Status filter"
                />
                <button
                  onClick={handleSearch}
                  className="w-full px-3 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--card)]/80 text-gray-300 hover:border-gray-600 transition-colors"
                >
                  Search Agents
                </button>
                {actionState.search.message && (
                  <p className="text-[10px] text-red-400">{actionState.search.message}</p>
                )}
              </div>

              <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <p className="text-[10px] text-gray-500">No search results yet.</p>
                ) : (
                  searchResults.map((agent, index) => (
                    <button
                      key={`agent-${index}`}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setMessageTo(getAgentId(agent) || '');
                      }}
                      className={`w-full text-left border rounded px-3 py-2 transition-colors ${
                        selectedAgentId && selectedAgentId === getAgentId(agent)
                          ? 'border-[var(--neon-green)] bg-[var(--neon-green)]/10'
                          : 'border-[var(--card-border)] bg-[var(--background)]/70 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white truncate">{getAgentLabel(agent)}</span>
                        <span className="text-[9px] text-gray-500">{getString(agent, ['status']) || '—'}</span>
                      </div>
                      <div className="text-[9px] text-gray-500 mt-1">
                        {getStringArray(agent, ['capabilities', 'skills']).join(', ') || 'No capabilities listed'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="bg-[var(--card)]/80 border border-[var(--card-border)] rounded-lg p-4 flex flex-col">
              <SectionHeader
                title="Inbox"
                subtitle="Incoming messages delivered to your agent."
                actions={<StatusPill state={actionState.inbox} />}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleInbox}
                  className="flex-1 px-3 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--card)]/80 text-gray-300 hover:border-gray-600 transition-colors"
                >
                  Refresh Inbox
                </button>
                <button
                  onClick={() => setInbox([])}
                  className="px-3 py-2 text-[10px] border border-[var(--card-border)] rounded bg-[var(--background)]/70 text-gray-500 hover:text-gray-200 transition-colors"
                >
                  Clear
                </button>
              </div>
              {actionState.inbox.message && (
                <p className="text-[10px] text-red-400 mt-2">{actionState.inbox.message}</p>
              )}

              <div className="mt-3 flex-1 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {inbox.length === 0 ? (
                  <p className="text-[10px] text-gray-500">No messages in inbox.</p>
                ) : (
                  inbox.map((message, index) => {
                    const parties = getMessageParties(message);
                    const messageId = getString(message, ['id', 'messageId', 'uuid']) || `msg-${index + 1}`;
                    return (
                      <button
                        key={messageId}
                        onClick={() => {
                          setSelectedMessage(message);
                          const agentId = parties.from || parties.to;
                          if (agentId) {
                            const agentStub: UnknownRecord = { id: agentId, name: agentId };
                            setSelectedAgent(agentStub);
                            setMessageTo(agentId);
                          }
                        }}
                        className={`w-full text-left border rounded px-3 py-2 transition-colors ${
                          selectedMessage && getString(selectedMessage, ['id', 'messageId', 'uuid']) === getString(message, ['id', 'messageId', 'uuid'])
                            ? 'border-blue-800 bg-blue-900/20'
                            : 'border-[var(--card-border)] bg-[var(--background)]/70 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-white truncate">{parties.from || 'Unknown sender'}</span>
                          <span className="text-[9px] text-gray-500">{formatTimestamp(message)}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">
                          {getMessageContent(message)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-4 border-t border-[var(--card-border)] pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Quick Reply</span>
                  <StatusPill state={actionState.reply} />
                </div>
                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  className="min-h-[70px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                  placeholder="Reply to selected message..."
                />
                <div className="flex items-center justify-between">
                  <button
                    className={`px-3 py-1 rounded text-[10px] border transition-colors ${
                      useCustomReply
                        ? 'bg-blue-900/50 text-blue-300 border-blue-800'
                        : 'bg-[var(--card)] text-gray-400 border-[var(--card-border)]'
                    }`}
                    onClick={() => setUseCustomReply(prev => !prev)}
                  >
                    {useCustomReply ? 'Custom JSON' : 'Standard payload'}
                  </button>
                  <button
                    onClick={handleReply}
                    className="px-3 py-2 text-xs border border-[var(--card-border)] rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)] hover:bg-[var(--neon-green)]/20 transition-colors"
                  >
                    Send Reply
                  </button>
                </div>
                {useCustomReply && (
                  <textarea
                    value={customReplyPayload}
                    onChange={(event) => setCustomReplyPayload(event.target.value)}
                    className="min-h-[70px] bg-[var(--background)]/80 border border-[var(--card-border)] rounded px-3 py-2 text-[11px] text-gray-200"
                    placeholder='{"content":"Thanks for the update"}'
                  />
                )}
                {actionState.reply.message && (
                  <p className="text-[10px] text-red-400">{actionState.reply.message}</p>
                )}
                <div className="bg-[var(--background)]/60 border border-[var(--card-border)] rounded p-2 text-[10px] text-gray-500">
                  <p className="uppercase tracking-wider text-[9px] text-gray-600 mb-1">Payload preview</p>
                  <pre className="whitespace-pre-wrap break-words">{replyPreview}</pre>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
