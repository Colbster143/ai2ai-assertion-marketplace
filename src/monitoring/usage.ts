import { v4 as uuid } from 'uuid';
import { getDatabase } from '../registry/database.js';

export function logApiRequest(method: string, path: string, ip: string, userAgent: string | undefined, statusCode: number): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO api_requests (id, method, path, ip, user_agent, status_code, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuid(), method, path, ip, userAgent || null, statusCode);
}

export function logActivity(event: string, detail: string, actorId?: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO activity_log (id, event, detail, actor_id, timestamp)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(uuid(), event, detail, actorId || null);
}

export interface ActivityEntry {
  event: string;
  detail: string;
  actorId: string | null;
  timestamp: string;
}

export interface ApiRequestEntry {
  method: string;
  path: string;
  ip: string;
  userAgent: string | null;
  statusCode: number;
  timestamp: string;
}

export interface UsageReport {
  last24Hours: {
    totalRequests: number;
    uniqueIps: number;
    transactions: number;
    transactionVolume: number;
    newAttestations: number;
    newVerifiers: number;
    topEndpoints: { path: string; count: number }[];
    topIps: { ip: string; count: number }[];
  };
  allTime: {
    totalRequests: number;
    totalTransactions: number;
    totalVolume: number;
    totalAttestations: number;
    totalVerifiers: number;
    uniqueBuyers: number;
  };
  recentActivity: ActivityEntry[];
  recentRequests: ApiRequestEntry[];
}

export function getUsageReport(): UsageReport {
  const db = getDatabase();

  const last24h = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM api_requests WHERE timestamp > datetime('now', '-1 day')) as total_requests,
      (SELECT COUNT(DISTINCT ip) FROM api_requests WHERE timestamp > datetime('now', '-1 day')) as unique_ips,
      (SELECT COUNT(*) FROM transactions WHERE timestamp > datetime('now', '-1 day')) as transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE timestamp > datetime('now', '-1 day')) as volume,
      (SELECT COUNT(*) FROM attestations WHERE created_at > datetime('now', '-1 day')) as new_attestations,
      (SELECT COUNT(*) FROM verifiers WHERE registered_at > datetime('now', '-1 day')) as new_verifiers
  `).get() as {
    total_requests: number;
    unique_ips: number;
    transactions: number;
    volume: number;
    new_attestations: number;
    new_verifiers: number;
  };

  const topEndpoints = db.prepare(`
    SELECT path, COUNT(*) as count FROM api_requests
    WHERE timestamp > datetime('now', '-1 day')
    GROUP BY path ORDER BY count DESC LIMIT 10
  `).all() as { path: string; count: number }[];

  const topIps = db.prepare(`
    SELECT ip, COUNT(*) as count FROM api_requests
    WHERE timestamp > datetime('now', '-1 day')
    GROUP BY ip ORDER BY count DESC LIMIT 10
  `).all() as { ip: string; count: number }[];

  const allTime = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM api_requests) as total_requests,
      (SELECT COUNT(*) FROM transactions) as total_transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_volume,
      (SELECT COUNT(*) FROM attestations) as total_attestations,
      (SELECT COUNT(*) FROM verifiers) as total_verifiers,
      (SELECT COUNT(DISTINCT buyer_id) FROM transactions) as unique_buyers
  `).get() as {
    total_requests: number;
    total_transactions: number;
    total_volume: number;
    total_attestations: number;
    total_verifiers: number;
    unique_buyers: number;
  };

  const recentActivity = db.prepare(`
    SELECT event, detail, actor_id, timestamp FROM activity_log
    ORDER BY timestamp DESC LIMIT 30
  `).all() as { event: string; detail: string; actor_id: string | null; timestamp: string }[];

  const recentRequests = db.prepare(`
    SELECT method, path, ip, user_agent, status_code, timestamp FROM api_requests
    ORDER BY timestamp DESC LIMIT 30
  `).all() as {
    method: string; path: string; ip: string; user_agent: string | null;
    status_code: number; timestamp: string;
  }[];

  return {
    last24Hours: {
      totalRequests: last24h.total_requests,
      uniqueIps: last24h.unique_ips,
      transactions: last24h.transactions,
      transactionVolume: last24h.volume,
      newAttestations: last24h.new_attestations,
      newVerifiers: last24h.new_verifiers,
      topEndpoints,
      topIps,
    },
    allTime: {
      totalRequests: allTime.total_requests,
      totalTransactions: allTime.total_transactions,
      totalVolume: allTime.total_volume,
      totalAttestations: allTime.total_attestations,
      totalVerifiers: allTime.total_verifiers,
      uniqueBuyers: allTime.unique_buyers,
    },
    recentActivity: recentActivity.map((a) => ({
      event: a.event,
      detail: a.detail,
      actorId: a.actor_id,
      timestamp: a.timestamp,
    })),
    recentRequests: recentRequests.map((r) => ({
      method: r.method,
      path: r.path,
      ip: r.ip,
      userAgent: r.user_agent,
      statusCode: r.status_code,
      timestamp: r.timestamp,
    })),
  };
}

export function getHourlyStats(hours = 24): { hour: string; requests: number; transactions: number }[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:00', timestamp) as hour,
      SUM(CASE WHEN type = 'request' THEN 1 ELSE 0 END) as requests,
      SUM(CASE WHEN type = 'transaction' THEN 1 ELSE 0 END) as transactions
    FROM (
      SELECT timestamp, 'request' as type FROM api_requests WHERE timestamp > datetime('now', '-${hours} hours')
      UNION ALL
      SELECT timestamp, 'transaction' as type FROM transactions WHERE timestamp > datetime('now', '-${hours} hours')
    )
    GROUP BY hour ORDER BY hour DESC
  `).all() as { hour: string; requests: number; transactions: number }[];

  return rows;
}
