import type { Env, SituationalMemory } from '../types';

const memoryCache = new Map<string, SituationalMemory>();
let memoryTableReady = false;

export function clearMemoryCache(): void {
  memoryCache.clear();
}

async function ensureMemoryTable(env: Env): Promise<void> {
  if (!env?.DB || memoryTableReady) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_situational_memories (
        user_id TEXT PRIMARY KEY,
        user_name TEXT,
        memory_json TEXT,
        updated_at INTEGER
      )
    `).run();
    memoryTableReady = true;
  } catch (err) {
    console.warn('[MemoryStore] 校验情景记忆表结构跳过:', err);
  }
}

export async function getSituationalMemory(env: Env, userId: string): Promise<SituationalMemory | null> {
  const cleanId = (userId || '').trim();
  if (!cleanId) return null;

  if (memoryCache.has(cleanId)) {
    return memoryCache.get(cleanId) || null;
  }

  if (env?.DB) {
    try {
      await ensureMemoryTable(env);

      const row = await env.DB.prepare(
        'SELECT memory_json FROM user_situational_memories WHERE user_id = ? OR user_name = ?'
      )
        .bind(cleanId, cleanId)
        .first<any>();

      if (row?.memory_json) {
        const parsed = JSON.parse(row.memory_json) as SituationalMemory;
        memoryCache.set(cleanId, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('[MemoryStore] D1 情景记忆读取异常:', err);
    }
  }

  return null;
}

export async function saveSituationalMemory(env: Env, memory: SituationalMemory): Promise<void> {
  if (!memory || !memory.userId) return;

  const cleanId = memory.userId.trim();
  if (!cleanId) return;

  memoryCache.set(cleanId, memory);
  if (memory.userName) {
    memoryCache.set(memory.userName.trim(), memory);
  }

  if (env?.DB) {
    try {
      await ensureMemoryTable(env);

      const memoryJson = JSON.stringify(memory);
      await env.DB.prepare(`
        INSERT INTO user_situational_memories (user_id, user_name, memory_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          user_name = excluded.user_name,
          memory_json = excluded.memory_json,
          updated_at = excluded.updated_at
      `)
        .bind(cleanId, memory.userName || cleanId, memoryJson, memory.lastUpdated || Date.now())
        .run();
    } catch (err) {
      console.warn('[MemoryStore] D1 情景记忆持久化异常:', err);
    }
  }
}
