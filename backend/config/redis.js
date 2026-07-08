import Redis from "ioredis";

let client = null;

export async function connectRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[Redis] REDIS_URL not set — using in-memory mock (dev only).");
    client = createMock();
    return;
  }
  try {
    client = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: false, lazyConnect: true });
    await client.connect();
    console.log("[Redis] Connected.");
  } catch (err) {
    console.warn("[Redis] Connection failed — using in-memory mock:", err.message);
    client = createMock();
  }
}

export function getRedis() {
  return client || createMock();
}

function createMock() {
  const store = new Map();
  return {
    get:    async (k)        => store.get(k) ?? null,
    set:    async (k, v)     => { store.set(k, v); return "OK"; },
    setex:  async (k, t, v)  => { store.set(k, v); return "OK"; },
    del:    async (k)        => { store.delete(k); return 1; },
    incr:   async (k)        => { const v = parseInt(store.get(k) ?? "0") + 1; store.set(k, String(v)); return v; },
    expire: async ()         => 1,
    on:     ()               => {},
  };
}
