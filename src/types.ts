export interface Lead {
  name: string;
  email: string;
  whatsapp: string;
  city: string;
  student: boolean;
  cro: string;
  acknowledged: boolean;
  marketing: boolean;
}

export interface Game {
  id: string;
  status: 'active' | 'won' | 'cancelled';
  moves: number;
  pairs: number;
  totalPairs: number;
  cards: { index: number; face: number | null; matched: boolean }[];
  mismatchUntil: number;
  prize: string | null;
}

export interface RecordEntry {
  id: string;
  version: number;
  lead: Lead;
  createdAt: string;
  status: Game['status'];
  prize: string;
  moves: number;
  delivered: boolean;
  noticeVersion: string;
}

export interface PublicInfo {
  configured: boolean;
  privacyContact: string;
  available: number;
  game: Game | null;
}

export interface AdminInfo {
  deviceId: string;
  prizes: { id: string; name: string; available: number; total: number }[];
  records: RecordEntry[];
  pending: number;
  cloudUrl: string;
  cloudConfigured: boolean;
  lastSync: string;
  syncError: string;
  syncing: boolean;
  emails: EmailInfo;
}

export interface EmailConfig {
  enabled: boolean;
  username: string;
  fromName: string;
  dentistSubject: string;
  dentistBody: string;
  studentSubject: string;
  studentBody: string;
}

export type EmailStatus = 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed' | 'cancelled';

export interface EmailInfo {
  config: EmailConfig;
  passwordConfigured: boolean;
  sending: boolean;
  error: string;
  counts: Partial<Record<EmailStatus, number>>;
  queue: { id: string; email: string; status: EmailStatus; attempts: number; lastError: string; sentAt: string }[];
}

export interface Actions {
  info: { input: undefined; output: PublicInfo };
  setup: { input: { password: string; contact: string }; output: boolean };
  login: { input: { password: string }; output: string };
  logout: { input: undefined; output: boolean };
  start: { input: Lead; output: Game };
  flip: { input: { id: string; index: number }; output: Game };
  game: { input: { id: string }; output: Game };
  admin: { input: { token: string }; output: AdminInfo };
  'prize.add': { input: { token: string; name: string; quantity: number }; output: boolean };
  'prize.stock': { input: { token: string; id: string; quantity: number }; output: boolean };
  'prize.remove': { input: { token: string; id: string }; output: boolean };
  'game.cancel': { input: { token: string; id: string }; output: boolean };
  'game.deliver': { input: { token: string; id: string }; output: boolean };
  cloud: { input: { token: string; url: string; key: string }; output: boolean };
  sync: { input: { token: string }; output: boolean };
  export: { input: { token: string }; output: boolean };
  backup: { input: { token: string }; output: boolean };
  fullscreen: { input: { token: string }; output: boolean };
  quit: { input: { token: string }; output: boolean };
  'email.configure': { input: EmailConfig & { token: string; password: string }; output: boolean };
  'email.test': { input: { token: string; student: boolean }; output: boolean };
  'email.retry': { input: { token: string; id: string }; output: boolean };
  'email.suppress': { input: { token: string; id: string }; output: boolean };
}

declare global {
  interface Window {
    ea?: {
      call<K extends keyof Actions>(action: K, input: Actions[K]['input']): Promise<
        { ok: true; data: Actions[K]['output'] } | { ok: false; error: string }
      >;
    };
  }
}
