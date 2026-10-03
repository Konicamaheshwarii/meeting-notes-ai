import { Meeting } from '../models';
import { readJson, writeJson } from '../storage';

/** Where meetings are persisted. IndexedDB in browsers, with localStorage and memory fallbacks. */
export interface MeetingBackend {
  all(): Promise<Meeting[]>;
  put(meeting: Meeting): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBackend implements MeetingBackend {
  private readonly map = new Map<string, Meeting>();
  async all() { return [...this.map.values()].map((m) => structuredClone(m)); }
  async put(m: Meeting) { this.map.set(m.id, structuredClone(m)); }
  async remove(id: string) { this.map.delete(id); }
  async clear() { this.map.clear(); }
}

export class LocalStorageBackend implements MeetingBackend {
  constructor(private readonly key = 'minutes.meetings') {}
  private read(): Meeting[] { return readJson<Meeting[]>(this.key, []); }
  async all() { return this.read(); }
  async put(m: Meeting) { writeJson(this.key, [...this.read().filter((x) => x.id !== m.id), m]); }
  async remove(id: string) { writeJson(this.key, this.read().filter((x) => x.id !== id)); }
  async clear() { writeJson(this.key, []); }
}

const DB = 'minutes';
const STORE = 'meetings';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbBackend implements MeetingBackend {
  private db?: Promise<IDBDatabase>;

  constructor(private readonly name = DB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
  }

  async all() { return request<Meeting[]>((await this.store('readonly')).getAll()); }
  async put(m: Meeting) { await request((await this.store('readwrite')).put(m)); }
  async remove(id: string) { await request((await this.store('readwrite')).delete(id)); }
  async clear() { await request((await this.store('readwrite')).clear()); }
}

/**
 * IndexedDB when it works (it is unavailable in some private modes), otherwise localStorage.
 * The first failed call switches to the fallback for the rest of the session.
 */
export class ResilientBackend implements MeetingBackend {
  private active: MeetingBackend;

  constructor(primary: MeetingBackend | null, private readonly fallback: MeetingBackend) {
    this.active = primary ?? fallback;
  }

  private async run<T>(fn: (b: MeetingBackend) => Promise<T>): Promise<T> {
    try {
      return await fn(this.active);
    } catch {
      if (this.active === this.fallback) throw new Error('Could not save meetings in this browser.');
      this.active = this.fallback;
      return fn(this.active);
    }
  }

  all() { return this.run((b) => b.all()); }
  put(m: Meeting) { return this.run((b) => b.put(m)); }
  remove(id: string) { return this.run((b) => b.remove(id)); }
  clear() { return this.run((b) => b.clear()); }
}

export function browserBackend(): MeetingBackend {
  const idb = typeof indexedDB !== 'undefined' ? new IndexedDbBackend() : null;
  return new ResilientBackend(idb, new LocalStorageBackend());
}
