import React, { useState, useEffect, useCallback, useMemo } from "react";

// ── Colour helpers ────────────────────────────────────────────────────────
function hexToHsl(hex) {
  var r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  var mx = Math.max(r,g,b), mn = Math.min(r,g,b), h = 0, s = 0, l = (mx+mn)/2;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
    if (mx === r) h = ((g-b)/d + (g < b ? 6 : 0))/6;
    else if (mx === g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  return [h*360, s*100, l*100];
}
function hslToHex(h, s, l) {
  h = ((h%360)+360)%360; s /= 100; l /= 100;
  var a = s * Math.min(l, 1-l);
  var f = function(n) {
    var k = (n + h/30) % 12, c = l - a * Math.max(-1, Math.min(k-3, 9-k, 1));
    return Math.round(255*c).toString(16).padStart(2,"0");
  };
  return "#" + f(0) + f(8) + f(4);
}
function genPalette(hex) {
  var h = hexToHsl(hex)[0];
  return Array.from({length:8}, function(_,i) { return hslToHex((h+i*45)%360, 60+(i%2)*10, 44+(i%3)*6); });
}
var DEFAULT_NC = ["#0891b2","#b45309","#047857","#be185d","#7c3aed","#c2410c","#6d28d9","#0e7490"];
var PRESETS = ["#6366f1","#0891b2","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#f97316"];

function buildTheme(mode, hex) {
  var nc = mode === "custom" ? genPalette(hex) : DEFAULT_NC;
  if (mode === "dark") return { bg:"#060d1c", card:"#0a1628", muted:"#0d1a2d", border:"#0e2340", border2:"#1e3a5f", text:"#e2e8f0", text2:"#a0bcd8", text3:"#64748b", track:"#0e2340", accent:"#818cf8", pg1:"linear-gradient(90deg,#818cf8,#a78bfa)", pg2:"linear-gradient(90deg,#f59e0b,#ef4444)", codeBg:"#020810", codeText:"#e2e8f0", ckFg:"#0a1628", shadow:"rgba(0,0,0,0.5)", isDark:true, nc:nc };
  if (mode === "custom") {
    var arr = hexToHsl(hex), hl = arr[0], hs = arr[1], rl = arr[2];
    var al = Math.min(Math.max(rl, 38), 52);
    var acc = hslToHex(hl, Math.max(hs,62), al), acc2 = hslToHex((hl+35)%360, Math.max(hs,62), al);
    return { bg:hslToHex(hl,18,97), card:hslToHex(hl,10,100), muted:hslToHex(hl,14,93), border:hslToHex(hl,20,88), border2:hslToHex(hl,24,80), text:hslToHex(hl,38,10), text2:hslToHex(hl,28,28), text3:hslToHex(hl,16,50), track:hslToHex(hl,20,88), accent:acc, pg1:"linear-gradient(90deg," + acc + "," + acc2 + ")", pg2:"linear-gradient(90deg," + hslToHex((hl+60)%360,62,46) + "," + hslToHex((hl+120)%360,62,42) + ")", codeBg:hslToHex(hl,36,8), codeText:"#e2e8f0", ckFg:"#fff", shadow:"rgba(0,0,0,0.1)", isDark:false, nc:nc };
  }
  return { bg:"#f8fafc", card:"#fff", muted:"#f1f5f9", border:"#e2e8f0", border2:"#cbd5e1", text:"#0f172a", text2:"#334155", text3:"#64748b", track:"#e2e8f0", accent:"#6366f1", pg1:"linear-gradient(90deg,#6366f1,#8b5cf6)", pg2:"linear-gradient(90deg,#f59e0b,#ef4444)", codeBg:"#0f172a", codeText:"#e2e8f0", ckFg:"#fff", shadow:"rgba(0,0,0,0.07)", isDark:false, nc:nc };
}

// ── Storage ───────────────────────────────────────────────────────────────
var SKEY = "sde3-v7";
function clog(tag, msg, extra) {
  var ts = new Date().toISOString();
  if (extra !== undefined) console.log('[' + ts + '] [' + tag + ']', msg, extra);
  else console.log('[' + ts + '] [' + tag + ']', msg);
}
var store = {
  get: async function(_k) {
    clog('STORE', '→ loading progress from server...');
    try {
      var res = await fetch('/api/progress');
      clog('STORE', '← server response status:', res.status);
      if (res.ok) {
        var data = await res.json();
        if (data !== null && data !== undefined) {
          var topics = Object.keys(data);
          var summary = topics.map(function(t) { return t + ':' + Object.values(data[t].c || {}).filter(Boolean).length + 'c'; }).join(', ');
          clog('STORE', '✅ loaded from SERVER — topics=[' + summary + ']');
          return data;
        }
        clog('STORE', '→ server returned null — falling back to localStorage');
      } else {
        clog('STORE', '❌ server error ' + res.status + ' — falling back to localStorage');
      }
    } catch(e) { clog('STORE', '❌ fetch failed — falling back to localStorage. Error:', e.message); }
    try {
      var v = localStorage.getItem(_k);
      if (v) {
        var ld = JSON.parse(v);
        var ls = Object.keys(ld).map(function(t) { return t + ':' + Object.values(ld[t].c || {}).filter(Boolean).length + 'c'; }).join(', ');
        clog('STORE', '✅ loaded from localStorage — topics=[' + ls + ']');
        return ld;
      }
      clog('STORE', '→ localStorage empty — starting fresh');
      return null;
    } catch(e) { clog('STORE', '❌ localStorage read failed:', e.message); return null; }
  },
  set: async function(_k, v) {
    var topics = Object.keys(v || {});
    var summary = topics.map(function(t) { return t + ':' + Object.values((v[t] && v[t].c) || {}).filter(Boolean).length + 'c'; }).join(', ');
    clog('STORE', '→ saving progress — topics=[' + summary + ']');
    try {
      var res = await fetch('/api/progress', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(v) });
      clog('STORE', '← server save response status:', res.status);
      if (res.ok) {
        clog('STORE', '✅ saved to SERVER successfully');
        try { localStorage.setItem(_k, JSON.stringify(v)); clog('STORE', '✅ also backed up to localStorage'); } catch(e) {}
        return;
      }
      clog('STORE', '❌ server save failed (status ' + res.status + ') — falling back to localStorage');
    } catch(e) { clog('STORE', '❌ server save fetch failed — falling back to localStorage. Error:', e.message); }
    try { localStorage.setItem(_k, JSON.stringify(v)); clog('STORE', '✅ saved to localStorage (offline fallback)'); } catch(e) { clog('STORE', '❌ localStorage save also failed:', e.message); }
  }
};

// ── ALL STUDY DATA ────────────────────────────────────────────────────────
var NODES = [
  {
    id:"system", label:"System\nDesign", emoji:"🏗️", angle:-90, priority:"CRITICAL", weeks:3,
    overview:"At SDE 3 you architect large-scale distributed systems and lead the design discussion. Your Kafka migration at Saxo is your anchor story — quantify every decision with real numbers and proactively surface failure modes.",
    concepts: [
      { term:"Scalability",
        why:"At SDE 3, every architecture discussion begins with 'what happens when load doubles?' Your Kafka migration was a scalability solution — batch processing could not scale to real-time event volumes. Poor scalability is the #1 cause of fintech failure at peak trading hours.",
        what:"Scalability = handling increased load without proportional performance degradation.\n\n• Vertical scaling (scale-up): add CPU/RAM to one machine. Simple but has a ceiling and creates a SPOF.\n• Horizontal scaling (scale-out): add more machines. Foundation of cloud-native systems. Requires stateless services.\n• Elasticity: dynamic horizontal scaling on demand — AWS Auto Scaling, K8s HPA.\n• Key metric: throughput (requests/sec) vs latency (ms per request) — they pull in opposite directions. Always specify which you are optimising for.",
        how:"1. Profile first to find the bottleneck — CPU-bound, I/O-bound, or DB queries? Never guess.\n2. CPU bottleneck → add stateless API instances behind a load balancer.\n3. DB read bottleneck → add read replicas and a Redis caching layer.\n4. DB write bottleneck → partition writes or shard.\n5. Make services stateless: store session state in Redis so any instance handles any request.\n6. Introduce Kafka as a buffer to absorb traffic spikes without dropping requests.\n7. Define SLOs (e.g. p99 < 200ms at 10k RPS) and validate with load tests.",
        example:"Saxo payment settlement: a single SQL Server writer was the bottleneck at month-end. Fix: Kafka topic partitioned by account-type absorbed the spike; 8 consumer instances processed in parallel. Throughput increased 8x with the same p99 latency. Key lesson: identify the specific bottleneck and scale that layer only — don't scale everything blindly.",
        code:null },
      { term:"Load Balancing",
        why:"Without a load balancer, all traffic hits one server. If it dies, the service is down. At SDE 3 you must explain balancing algorithm trade-offs, not just say 'use a load balancer'. Your Saxo microservices sit behind one — explain how it routes requests.",
        what:"A load balancer distributes traffic across a pool of backend servers.\n\n• L4 (Transport): routes by IP/TCP — fast, no HTTP inspection.\n• L7 (Application): routes by HTTP headers, URLs, cookies — enables path-based routing and canary deployments.\n• Round Robin: rotate sequentially. Equal distribution.\n• Least Connections: route to instance with fewest active connections. Best for variable-duration requests.\n• Consistent Hashing: hash(client) → always same server. Used for cache affinity. Kafka uses this for partition assignment.\n• Health checks: poll each instance (GET /health every 5s). 2 failures → remove. 2 successes → re-add.",
        how:"In .NET microservices: NGINX or Azure API Gateway sits at the edge, terminates SSL, inspects the Host header, and forwards to the correct service cluster.\n\nSticky sessions: LB attaches a cookie to route the same user to the same instance — useful for legacy stateful apps but prevents true horizontal scaling. Avoid where possible.\n\nConsistent hashing: when a server is added or removed, only a fraction of keys re-map, minimising cache invalidation. This is exactly how Kafka assigns partitions to consumers.",
        example:"Your 8 Kafka consumer instances behind an internal LB with Least-Connections: the LB ensures a consumer processing a slow DB write does not receive a new message while 7 others are idle. This prevents one slow consumer from creating a backlog imbalance across partitions.",
        code:null },
      { term:"Caching",
        why:"A cache converts a 20ms DB round-trip into a 0.2ms memory read — 100x improvement. At Saxo, account balance lookups happen thousands of times per second during market open. Cache invalidation is the hardest part and what SDE 3 questions specifically probe.",
        what:"A cache is a fast temporary storage layer for expensive query results.\n\n• Cache-aside (lazy loading): check cache first, on miss load from DB and populate. Most common pattern.\n• Write-through: write to cache and DB simultaneously. Consistent but slower writes.\n• Write-behind: write cache first, flush DB asynchronously. Fast writes, risk of data loss on crash.\n• TTL (Time-To-Live): automatic expiry prevents stale data persisting indefinitely.\n• Eviction: LRU (least recently used) is most common.\n• Two-tier: L1 = in-process memory (microseconds, per-instance); L2 = Redis (milliseconds, shared across all instances).",
        how:"C#/Redis cache-aside: check Redis key 'balance:{accountId}'. On hit, return. On miss, query SQL Server, write to Redis with TTL=30s, return.\n\nCache stampede: when a hot key expires, thousands of requests simultaneously miss and hammer the DB. Fix: probabilistic early expiration or a distributed lock so only one request rebuilds the cache.\n\nInvalidation: when a payment processes and balance changes, explicitly DELETE the Redis key. On Kafka-based systems: publish an event → cache-invalidation consumer deletes the key.",
        example:"Saxo fund NAV recalculated once per day. Cache in Redis with TTL=24h. All thousands of intraday reads hit Redis, not SQL Server. On NAV recalculation event, publish to Kafka; a cache-invalidation consumer deletes the key so the next read fetches the fresh value.",
        code:"// C# cache-aside with Redis\npublic async Task<decimal> GetBalance(string accountId)\n{\n    var key = \"balance:\" + accountId;\n    var cached = await _redis.StringGetAsync(key);\n    if (cached.HasValue) return decimal.Parse(cached);\n\n    var balance = await _db.Accounts\n        .Where(a => a.Id == accountId)\n        .Select(a => a.Balance).FirstAsync();\n\n    await _redis.StringSetAsync(key, balance.ToString(),\n        TimeSpan.FromSeconds(30));\n    return balance;\n}" },
      { term:"Message Queues & Kafka",
        why:"This is your home turf. At SDE 3 you articulate internal mechanics, not just 'I used Kafka'. Kafka enables event replay, exactly-once semantics, and partitioned parallelism that no traditional queue offers.",
        what:"A message queue is a durable ordered buffer between producers and consumers.\n\nKafka = distributed, partitioned, replicated commit log. Unlike RabbitMQ, messages are retained after consumption — enabling replay and audit trails.\n\n• Topic → N partitions. Each = ordered, immutable append-only log.\n• Consumer Groups: consumers sharing a group-id each get a different partition — horizontal scaling.\n• Offset: consumer's position in a partition. Committing = 'I processed up to message N'.\n• Retention: keeps messages for a configurable period (e.g. 7 days) regardless of consumption.\n• Replication factor=3: 1 leader + 2 followers per partition.",
        how:"Producer → publishes with partition key = account_id. All messages for the same account go to the same partition, ensuring per-account ordering.\n\nAt-least-once delivery: process message, then commit offset. If consumer crashes before committing, message is redelivered → always design consumers to be idempotent.\n\nacks=all + min.insync.replicas=2: write acknowledged only after 2 of 3 replicas have it — single broker failure cannot cause data loss.",
        example:"Saxo payment pipeline: PaymentService publishes PaymentInitiated (partition key = account_id). SettlementConsumer and AuditConsumer are in different consumer groups — both receive every message independently. SettlementConsumer: 8 instances, 8 partitions, processes 80k payments/minute. After DB write succeeds, commits offset.",
        code:null },
      { term:"Rate Limiting",
        why:"Without rate limiting, a single misbehaving client can consume all your service capacity. At Saxo, the Open API for third-party vendors must be rate limited — a vendor bug could otherwise overwhelm the payment service.",
        what:"Rate limiting controls requests per client in a time window.\n\n• Fixed Window: count per time slot. Simple but allows 2x burst at window boundaries.\n• Sliding Window Counter: approximate using two fixed windows weighted by overlap. Good balance of accuracy and memory.\n• Token Bucket: tokens accumulate at rate R; each request consumes one. Allows controlled bursting.\n• Leaky Bucket: requests enter a fixed-rate queue. Smooths bursts to a constant output rate.\n\nDistributed: store counters in Redis. INCR + EXPIRE: atomically increment counter and set TTL.",
        how:"1. Pick your algorithm: Token Bucket for APIs that allow controlled bursts.\n2. Store counters in Redis: SET + EXPIRE in a Lua script for atomicity.\n3. Rate limit by: API key (per vendor), user ID (per user), IP (anti-abuse), endpoint.\n4. Return HTTP 429 (Too Many Requests) with a Retry-After header.\n5. Tiered limits: free=100 req/min, standard=1000 req/min, enterprise=10,000 req/min.",
        example:"Saxo Open API: vendor sends 500 requests/second during a load test. Redis key 'ratelimit:{apiKey}:{windowMinute}' incremented per request. At request 201 (limit=200), INCR returns 201 > 200, so the API gateway returns 429 with Retry-After: 42 seconds. The vendor's SDK backs off — the payment service is protected from overload.",
        code:"-- Redis Lua: atomic sliding window rate limit\nlocal key = KEYS[1]\nlocal limit = tonumber(ARGV[1])\nlocal window = tonumber(ARGV[2])\nlocal current = redis.call('INCR', key)\nif current == 1 then redis.call('EXPIRE', key, window) end\nif current > limit then return 0 end\nreturn 1" },
      { term:"Resilience Patterns",
        why:"In distributed systems, partial failure is the normal operating condition. At SDE 3 you design for failure, not hope for success. Without resilience patterns, one slow downstream service causes a cascading failure that takes down the entire platform.",
        what:"Resilience patterns allow a system to continue (possibly degraded) when components fail.\n\n• Circuit Breaker: after N failures, 'opens' and fail-fasts all calls. After a timeout, moves to half-open to test recovery.\n• Retry with Exponential Backoff: retry after delays that double (1s, 2s, 4s, 8s). Add jitter to avoid thundering herd.\n• Bulkhead: isolate thread pools per dependency — one slow service can't exhaust all threads.\n• Timeout: every external call must have a timeout — no timeout = potential thread leak.\n• Fallback: return cached or default response when a service is unavailable.",
        how:"Polly in .NET: chain policies — RetryPolicy → CircuitBreakerPolicy → TimeoutPolicy → FallbackPolicy.\n\nCircuit breaker config: 5 failures within 30s opens the circuit. Half-open after 60s. 2 successes close it again.\n\nRetry rules: HTTP 5xx and transient network exceptions trigger retry. HTTP 4xx do NOT — retrying a bad request is wasteful.\n\nIdempotency prerequisite: only safe to retry if the operation is idempotent (GET or write with idempotency key).",
        example:"Saxo: PaymentService calls NotificationService for push alerts. Policy chain: Timeout(2s) → Retry(3x, exp backoff) → CircuitBreaker(5 failures/30s) → Fallback(log to audit queue). When NotificationService degrades: after 5 failures, circuit opens. All calls immediately fall back — no wasted threads. NotificationService recovers, circuit closes automatically.",
        code:null },
      { term:"Observability",
        why:"You cannot fix what you cannot see. A single user request in a distributed system spans multiple services — without tracing, debugging is impossible. SDE 3 owns the full operational posture: not just build services, but instrument them so on-call engineers diagnose issues in minutes.",
        what:"Observability = understanding internal system state from external outputs. Three pillars:\n\n• Logs: structured JSON events with timestamps, severity, correlation IDs. Use Serilog or NLog — not string concatenation.\n• Metrics: Counters (total requests), Gauges (queue depth), Histograms (latency p50/p95/p99). Exposed via Prometheus, Datadog, Azure Monitor.\n• Traces: follow a single request across all services. Each service adds a span. OpenTelemetry is the standard.\n• Correlation ID: unique ID generated at the API gateway edge, propagated in all headers and logs.",
        how:"Instrument every HTTP handler and Kafka consumer with: request count (counter), latency histogram (p50/p95/p99), error rate (counter by status code).\n\nSLO alerting: alert when p99 latency > 500ms for 5 consecutive minutes, or error rate > 1% over 10 minutes.\n\nKafka-specific: track consumer lag (current_offset vs log_end_offset) — rising lag = slow consumer or traffic spike.\n\nRunbook link in every alert: structured alerts include a link to the runbook with diagnosis steps — reduces MTTR (Mean Time To Resolve).",
        example:"Saxo: a PEA-PME transfer failing for 2% of French accounts. Correlation ID in Datadog traced from the API gateway through PaymentService to SQL Server to Kafka. The trace showed a 1.8-second latency spike in the DB span — a missing index on the compliance-check query. Root cause found and fixed in 30 minutes because the trace made it unambiguous.",
        code:null },
      { term:"Capacity Estimation",
        why:"Every system design interview at SDE 3 requires back-of-envelope math before drawing any architecture. If you can't estimate scale, you can't justify design decisions. Interviewers specifically check whether you quantify or hand-wave.",
        what:"Capacity estimation = rough calculation of the resources a system needs at a given scale.\n\nKey numbers to memorize:\n• 1 day = 86,400 seconds (~100k for rough math)\n• DB row read: ~1ms SQL Server, ~0.1ms Redis\n• Kafka produce + ack: ~5ms\n\nProcess: users → DAU → requests per user per day → RPS → storage per request → total storage → bandwidth.",
        how:"Example: design a payment system for 10M users.\n• 10% active daily = 1M DAU.\n• 2 payments/user/day = 2M payments/day.\n• 2M / 86,400 = ~23 RPS average. Peak = 5x = 115 RPS.\n• Each payment record = ~1KB. 2M × 1KB = 2GB/day.\n• After 5 years = 3.6TB. Plan for partitioning.\n\nConclusion: a single SQL Server handles 115 RPS easily. Add read replicas and Redis caching for headroom.",
        example:"Saxo month-end: 500k payments in 3 hours = ~46 RPS. Single SQL Server writer saturates at ~200 RPS. Headroom exists normally but batch windows concentrate load. Kafka + 8 consumers: 46 RPS / 8 = ~6 RPS per consumer. This calculation justified the Kafka migration over simply scaling up the SQL Server.",
        code:null },
    ],
    keyPoints:["Clarify functional + non-functional requirements BEFORE drawing anything","Back-of-envelope math is mandatory: QPS, storage per day, bandwidth","Availability: 99.9% = 8.7h downtime/year. Each extra 9 is exponentially harder","CAP Theorem: in a network partition choose CP or AP. Fintech = CP","Idempotency is non-negotiable in payment systems","Design for failure: assume any component can fail at any time","Prefer async over sync for cross-service calls","Database is usually the bottleneck — add read replicas and caching before scaling horizontally"],
    resources:[{title:"System Design Primer — GitHub",url:"https://github.com/donnemartin/system-design-primer",desc:"Most comprehensive free resource. All patterns with diagrams."},{title:"ByteByteGo — Alex Xu",url:"https://bytebytego.com",desc:"Paid newsletter + YouTube. Clear visual explanations of real systems."},{title:"High Scalability Blog",url:"http://highscalability.com",desc:"Real architecture breakdowns of Twitter, YouTube, Netflix, Uber."}]
  },
  {
    id:"distributed", label:"Distributed\nSystems", emoji:"⚡", angle:0, priority:"CRITICAL", weeks:2,
    overview:"This is your home turf. Your Kafka pipelines, CQRS architecture, and race condition fixes give you depth most candidates lack. Add rigorous theoretical vocabulary to name the patterns you've already implemented.",
    concepts: [
      { term:"CAP Theorem & PACELC",
        why:"Every distributed system makes a fundamental trade-off. As the architect of Saxo's distributed payment system, you must justify why you chose SQL Server (CP) over a NoSQL store (AP). Interviewers use CAP to probe whether you truly understand distributed system constraints.",
        what:"CAP Theorem: a distributed system guarantees at most two of three:\n• Consistency (C): every read sees the latest write.\n• Availability (A): every request receives a non-error response.\n• Partition Tolerance (P): system continues despite network splits.\n\nSince partitions are unavoidable, the real choice is CP vs AP:\n• CP: SQL Server, HBase, ZooKeeper, Etcd. During partition, refuse to serve stale data.\n• AP: Cassandra, DynamoDB, CouchDB. During partition, serve potentially stale data.\n\nPACELC: even with No partition (E), there's a trade-off between Latency (L) and Consistency (C). Cassandra is PA/EL — available and low-latency.",
        how:"Payment system: payments must never be double-processed → strong consistency → CP (SQL Server).\n\nUser preferences (dark mode, language): eventual consistency fine → AP (DynamoDB) for low latency globally.\n\nKafka cluster: CP (leader election via Raft). Consumer processing can be AP — process immediately and reconcile inconsistencies later.\n\nCassandra tunable: WRITE QUORUM + READ QUORUM = strong consistency. WRITE ONE + READ ONE = fastest but eventual.",
        example:"Saxo cross-border payment: we cannot show 'payment sent' if the DB hasn't committed. CP is non-negotiable. Saxo market data feed: showing a price 50ms stale is acceptable. AP with lowest latency is the right choice — strong consistency would add unnecessary round-trip overhead with no business benefit.",
        code:null },
      { term:"Consistency Models",
        why:"Most engineers know 'eventual consistency' but can't explain the spectrum. SDE 3 must articulate why you chose a specific model and what anomalies are acceptable. Your MVCC and OCC implementation at Saxo is a direct application — you were solving a read-write anomaly.",
        what:"Consistency models define guarantees about the order and visibility of reads/writes across replicas:\n\n• Linearizability (Strong): every operation appears instantaneous and globally ordered. Most expensive — requires coordination.\n• Sequential Consistency: all clients see operations in the same order, but not necessarily in real-time.\n• Causal Consistency: causally related operations seen in order by all clients. Independent operations may differ.\n• Eventual Consistency: if no new updates occur, all replicas eventually converge. Example: DNS, Cassandra default.\n• Read-Your-Writes: a client always reads its own writes.\n• Monotonic Reads: once you read a value, you never read an older one.",
        how:"Banking: use strong consistency (linearizable) for balance updates. Use eventual consistency for notification delivery — a push alert being 200ms delayed is fine.\n\nRead-Your-Writes in a microservice: after a write, return a 'write token' (timestamp). On reads, route to a replica that has processed at least that timestamp.\n\nCassandra: WRITE QUORUM + READ QUORUM = strong consistency. WRITE ONE + READ ONE = fastest but eventual.",
        example:"Saxo race condition bug: two async operations read account row (balance=1000), both calculated debit independently (500), both wrote 500. Net: two debits applied but balance only reduced once — money created from nothing. Fix: optimistic concurrency with row-version check. One write wins; the other sees version mismatch and retries with the fresh balance.",
        code:null },
      { term:"Kafka Internals (Deep)",
        why:"You built Kafka pipelines at Saxo. At SDE 3, you must be able to debug a consumer lag spike, explain why a producer is dropping messages, and design partition strategies. Understanding internals separates a user from an owner.",
        what:"Kafka = distributed log. Topic → N partitions. Each = ordered, append-only segment files on disk.\n\n• Broker: a Kafka server. Each partition has one leader + R-1 followers.\n• ISR (In-Sync Replicas): replicas fully caught up with the leader. acks=all waits until all ISR ack.\n• Producer acks: acks=0 (fire and forget), acks=1 (leader only), acks=all (all ISR — strongest).\n• Consumer Group Rebalance: when consumer joins/leaves, partitions reassigned. Consumption pauses during rebalance — tune session.timeout.ms and max.poll.interval.ms.\n• Log compaction: retain only the latest message per key. Useful for representing current state.",
        how:"Partition key: use account_id for ordering guarantees. Without a key, Kafka round-robins — no ordering for the same entity.\n\nConsumer lag: current_offset vs log_end_offset. Lag > 0 = consumer falling behind. Monitor with kafka-consumer-groups --describe.\n\nExactly-once: enable.idempotence=true + transactional API. Producer assigns each message a sequence number; broker deduplicates retries with the same PID+sequence.\n\nSchema evolution: use Apache Avro + Schema Registry. Schemas are versioned — consumers can read messages produced with a newer schema if fields are backward-compatible.",
        example:"Saxo payment pipeline config: acks=all, replication.factor=3, min.insync.replicas=2. Write acknowledged only after 2 of 3 replicas — single broker failure cannot cause data loss. Consumer lag alert: if lag > 10,000 messages for > 2 minutes, alert on-call. Root cause was usually a slow DB call inside the consumer — fixed by adding a covering index.",
        code:null },
      { term:"Consensus: Raft Algorithm",
        why:"Kafka now uses KRaft (Kafka Raft) instead of ZooKeeper. Etcd (Kubernetes), Consul, and CockroachDB use Raft. SDE 3 should understand how a cluster decides who is the leader and how data is safely replicated.",
        what:"Raft = consensus algorithm designed for understandability. Ensures a cluster agrees on a sequence of values even when some nodes fail.\n\n• Roles: Leader (handles all writes, replicates log), Follower (passive, replicates from leader), Candidate (seeks votes).\n• Leader Election: followers wait for heartbeats. If no heartbeat within election timeout (150–300ms), a follower becomes a candidate, increments its term, requests votes. Majority wins.\n• Quorum: 5-node cluster → 3 votes needed. No split-brain.\n• Log Replication: leader appends command to its log, sends AppendEntries RPC. Once majority acknowledge, entry is committed.\n• Safety: committed entries are never overwritten.",
        how:"KRaft in Kafka: metadata (broker assignments, topic configs) stored in a Raft log. Controller leader manages all partition state. Removing ZooKeeper simplified Kafka operations dramatically.\n\nPractical impact: if 2 of 3 nodes in a Raft cluster are unavailable, the cluster becomes unavailable (CP — refuses to serve rather than serve stale data).",
        example:"5-node Kafka cluster: Broker 1 (leader) crashes. Election timeout fires (~200ms). Broker 3 calls election (term 2), receives votes from Brokers 2, 4, 5 (3 = majority). Broker 3 becomes new controller. Partition leaders updated accordingly. Total downtime: ~300ms.",
        code:null },
      { term:"Saga Pattern",
        why:"In microservices, a single business transaction spans multiple services. There is no distributed ACID transaction across services. The Saga pattern enables long-running distributed transactions with compensating actions — essential for SDE 3 at a fintech company.",
        what:"A Saga = a sequence of local transactions, each in a different service, with compensating transactions for rollback if any step fails.\n\n• Choreography: each service reacts to events from the previous service. No central coordinator. Decoupled but hard to debug — flow is implicit.\n• Orchestration: central orchestrator sends commands and handles failures explicitly. Easier to reason about.\n• Compensating transaction: the semantic undo of a completed step. Must also be idempotent.\n\nFor fintech: orchestration is usually preferred — compliance requirements demand a clear, auditable flow.",
        how:"Saxo payment Saga (orchestrated):\nStep 1: DebitAccount\nStep 2: TransferToRecipient (SWIFT)\nStep 3: NotifyBoth\n\nIf Step 2 fails: orchestrator issues CreditAccount (compensate Step 1).\n\nKafka choreography: PaymentService publishes PaymentInitiated → ComplianceService consumes, approves, publishes ComplianceApproved → SettlementService consumes, settles, publishes PaymentSettled.",
        example:"EU cross-border transfer at Saxo: Debit EUR account → Call SWIFT gateway → Credit GBP account. If SWIFT times out: compensate by re-crediting EUR account. Retry SWIFT with exponential backoff. Idempotency key on SWIFT prevents double-sending. Saga retries until SWIFT confirms.",
        code:null },
      { term:"Outbox Pattern",
        why:"Problem: your service writes to DB AND publishes a Kafka event — these are not atomic. If DB commits but Kafka fails, you have a silent data inconsistency. This is catastrophic in financial systems.",
        what:"Outbox Pattern guarantees atomic DB write + event publication:\n\n• Write the event to an 'outbox' table in the SAME DB transaction as the business data.\n• A separate relay process reads the outbox and publishes to Kafka. Only after successful publish is the row marked as published.\n• At-least-once delivery: relay may crash after publishing but before marking — event re-published. Consumers must be idempotent.\n• CDC option: Debezium reads the SQL Server WAL and publishes outbox row changes to Kafka automatically — zero relay code.",
        how:"Step 1: Create outbox table: (id UUID, event_type VARCHAR, payload JSON, created_at DATETIME2, published_at DATETIME2 NULL).\nStep 2: In the same transaction that debits the account: INSERT INTO outbox (event_type='PaymentDebited', payload={...}).\nStep 3: Background relay (IHostedService): every 100ms, SELECT TOP 100 * FROM outbox WHERE published_at IS NULL ORDER BY created_at. Publish to Kafka. On success, UPDATE outbox SET published_at=NOW().",
        example:"Without Outbox at Saxo: PaymentService commits to SQL, then calls kafka.Produce(event). Kafka broker is temporarily unavailable. Event is lost silently — DB has the debit but no downstream processing occurs. With Outbox: both DB row and outbox entry commit together. Relay retries until Kafka is available — guaranteed eventual delivery.",
        code:null },
      { term:"Idempotency & Exactly-Once",
        why:"At-least-once delivery means a message can be delivered multiple times. Without idempotency, duplicate processing causes double charges, double credits, or duplicate notifications. Every Kafka consumer you write at Saxo should be idempotent — this is non-negotiable in fintech.",
        what:"Idempotency: an operation produces the same result regardless of how many times it is executed.\n\nAt-least-once + idempotent consumer = effectively-once: messages may be delivered multiple times but the consumer detects and ignores duplicates.\n\nIdempotency key: a unique identifier for an operation. The server stores processed keys and rejects duplicates.\n\nKafka EOS: enable.idempotence=true + transactional API. Each producer gets a PID + sequence number. Broker deduplicates retries. Costly — prefer at-least-once + app-layer idempotency.",
        how:"DB-level idempotency: UNIQUE constraint on idempotency_key column. Duplicate insert fails with unique violation — catch and return previous result.\n\nApplication-level: on receiving a Kafka message, check if payment_id already exists. If yes, skip processing and commit offset.\n\nAPI idempotency: client sends Idempotency-Key header. Server stores (key → response) in Redis for 24 hours. Duplicate request returns cached response without reprocessing.",
        example:"Saxo Kafka consumer crashes after writing to DB but before committing offset. On restart, message is redelivered. Consumer tries INSERT INTO payments VALUES (payment_id='abc123',...). SQL Server throws unique constraint violation. Consumer catches it, logs 'duplicate detected, skipping', commits offset, moves on. Total effect: one payment processed.",
        code:null },
      { term:"Distributed Locks",
        why:"When multiple service instances run concurrently, some operations must be performed by exactly one instance at a time. Your race condition fix at Saxo was a form of distributed locking at the DB layer — distributed locks generalise this across services.",
        what:"A distributed lock ensures mutual exclusion across multiple processes — only one holder at a time.\n\n• Redis lock: SET key value NX PX 30000. NX = only set if not exists. PX 30000 = expire in 30s (prevents deadlock if holder crashes).\n• Redlock: acquire lock on majority (3 of 5) Redis nodes simultaneously. Use for efficiency, not correctness.\n• Fencing token: monotonically increasing number issued with each lock. Downstream operations reject stale tokens.\n• DB-based: SELECT...FOR UPDATE (pessimistic) or row-version check (optimistic). Simpler for most fintech use cases.",
        how:"Redis acquisition: SET lock:{resource} {uniqueToken} NX PX 30000.\n\nRelease: Lua script checks token matches before deleting — prevents a slow process from deleting a lock acquired by another process after TTL expired.\n\nLock expiry risk: if holder is slow and TTL expires, another process acquires the lock. Mitigate: watchdog thread extends TTL while holder is alive.",
        example:"Saxo daily compliance report job should run exactly once at midnight, not on all 8 service instances simultaneously. Each instance tries: SET lock:daily-compliance {instanceId} NX PX 600000. Only one succeeds. Others get NULL (lock already held) and sleep. TTL=10 minutes ensures the lock releases if the winner crashes mid-run.",
        code:null },
    ],
    keyPoints:["CAP: since partitions are inevitable, real choice is CP vs AP. Fintech = CP","Idempotency + at-least-once = effectively-once. True exactly-once is expensive","Outbox Pattern solves the dual-write problem between DB and message broker","Kafka ordering: guaranteed within a partition, not across partitions","Saga compensating transactions must be idempotent — they may be retried multiple times","Use distributed locks for efficiency, not correctness","Network partitions WILL happen — circuit breakers, retries, graceful degradation"],
    resources:[{title:"Designing Data-Intensive Applications (DDIA)",url:"https://dataintensive.net",desc:"Martin Kleppmann. Chapters 5–9 are the distributed systems bible."},{title:"Martin Kleppmann — Distributed Systems Lectures",url:"https://www.youtube.com/playlist?list=PLeKd45zvjcDFUEv_ohr_HdUFe97RItdiB",desc:"Cambridge University lecture series. Free on YouTube."},{title:"Microservices Patterns — Chris Richardson",url:"https://microservices.io/patterns/",desc:"Saga, Outbox, CQRS, Event Sourcing with full diagrams."}]
  },
  {
    id:"behavioral", label:"Behavioral\n& Leadership", emoji:"👥", angle:90, priority:"CRITICAL", weeks:2,
    overview:"Behavioral interviews at SDE 3 are ~40% of the total signal. Your Saxo stories — Kafka migration, race condition fix, PEA-PME compliance, junior mentoring — are exceptional raw material. Package them with metrics and clear leadership signal.",
    concepts: [
      { term:"STAR Method",
        why:"A technically brilliant candidate who answers 'we fixed a bug' without context, action details, or outcomes will fail behavioral rounds. Interviewers are trained to score STAR-structured answers — they look for specific evidence of each competency.",
        what:"STAR = Situation, Task, Action, Result.\n\n• Situation: 1–2 sentences. Context, stakes. What was happening? Why did it matter?\n• Task: YOUR specific responsibility. Not 'we were tasked' — 'I was tasked with migrating the settlement workflow.'\n• Action: the bulk (60%). What YOU specifically did, why each decision, what alternatives you rejected. Use 'I', not 'we'.\n• Result: quantified outcome. 'Settlement latency: 3 hours → 4 minutes. Handles 80k transactions/minute with zero incidents in 6 months.'\n• Optional Learning: what would you do differently? Signals maturity.",
        how:"Prepare 6–8 stories covering: technical leadership, system design decision, debugging a critical issue, handling ambiguity, mentoring, failure/learning, cross-team influence, conflict resolution.\n\nQuantify everything: latency in ms, throughput in tx/min, error rates in %, code coverage %, team size mentored.\n\nPractice out loud. Time yourself. Aim for 2–3 minutes per story.",
        example:"Q: 'Tell me about a time you improved system performance.'\nS: 'Our settlement processed 500k month-end transactions in a 3-hour batch via a legacy monolith.'\nT: 'I led the design and delivery of a Kafka-based migration to real-time streaming settlement.'\nA: 'I designed the partition strategy (account_id as key), implemented idempotent consumers, set up the Outbox pattern, and ran shadow-mode parallel run for 2 weeks before cutover.'\nR: 'Settlement latency: 3 hours → 4 minutes. Zero data loss. Throughput headroom: 500k/night → 2M+/day.'",
        code:null },
      { term:"Technical Influence Without Authority",
        why:"At SDE 3 you regularly convince team members, adjacent teams, or your manager to adopt a design without the authority to mandate it. This is one of the clearest signals interviewers use to distinguish SDE 2 (executes tasks) from SDE 3 (shapes technical direction).",
        what:"Technical influence without authority = achieving alignment by building consensus, demonstrating evidence, and making peers' jobs easier — not by seniority or mandate.\n\nMechanisms: RFC (Request for Comments) documents, design reviews, technical demos (proof-of-concept), data/benchmarks as persuasion, finding internal champions in other teams.\n\nAnti-patterns: mandating without explanation, dismissing concerns, not acknowledging alternatives, advocating one option without listing trade-offs.",
        how:"1. Prototype a solution first. A working demo is worth 100 slides.\n2. Write a technical proposal with trade-offs explicitly listed — never just advocate one option.\n3. Find an ally: another senior engineer who agrees. Two voices are harder to dismiss.\n4. Frame changes in terms of team pain: 'This eliminates the race conditions we spent 3 sprints debugging.'\n5. Disagree and commit: once a decision is made, commit fully even if your option wasn't chosen.",
        example:"Saxo: all microservices used different logging formats, making cross-service debugging slow. I had no authority to mandate a standard. Action: implemented structured JSON logging with Serilog in my service, then shared a 5-minute demo showing how correlation IDs linked logs across services in Datadog. Two senior engineers immediately adopted it. Within a month it became the team standard — without a mandate.",
        code:null },
      { term:"Ownership & Ambiguity",
        why:"SDE 3 is expected to operate with minimal guidance in ambiguous situations. Interviewers specifically look for candidates who define the problem when it isn't clear. Your PEA-PME compliance work — reading French AMF regulations independently — was ownership under ambiguity.",
        what:"Ownership = taking full responsibility for a problem — its definition, solution, delivery, and post-delivery health — even when not explicitly assigned.\n\nAmbiguity tolerance = making forward progress when requirements are unclear while proactively reducing ambiguity.\n\nAnti-patterns: waiting for complete specifications, escalating every decision, 'that's not my job', delivering exactly as stated even when clearly wrong.",
        how:"When given an ambiguous task:\n1. Write down your interpretation and assumptions.\n2. Confirm with the requester in one focused meeting.\n3. Own the rest — don't ask for permission on every decision.\n\nFor production incidents crossing team boundaries: take the lead even if it's not your service. Diagnose, coordinate, fix, write the post-mortem.",
        example:"S: 'The business asked me to support PEA-PME transfers for French clients but gave no technical spec.'\nA: 'I read the French AMF regulations, mapped the compliance rules to our data model, wrote the technical design document, and got sign-off from business and compliance before writing a line of code.'\nR: 'Zero compliance incidents post-launch. Business onboarded French institutional clients 2 months earlier than projected.'",
        code:null },
      { term:"Mentoring & Growing Others",
        why:"At SDE 3, your impact is measured not just by what you build but by how much you multiply the team's capability. Interviewers want to know: are you a force multiplier or a solo contributor? Specific, measurable mentoring stories are a clear SDE 3 signal.",
        what:"Mentoring at SDE 3 means proactively identifying where juniors are stuck or forming bad habits — not just helping when asked.\n\nForms: code reviews (teaching principles, not just finding bugs), pair programming, design document feedback, introducing juniors to stakeholders, advocating for their work in planning meetings.\n\nMeasurable signals: PR review turnaround time, number of design docs they authored independently, reduction in bugs in their PRs over time.",
        how:"In code reviews: instead of 'fix this', write 'consider X pattern here because Y — it would also solve the problem you have in service Z'. Teach the principle, not just the fix.\n\nPair programming: let the junior drive (type), you navigate. They learn faster by doing than watching.\n\nSet growth goals: 'By next quarter I want you to own the design document for the next Kafka integration.' Then coach them through it.",
        example:"A junior developer had a pattern of writing 1,000-line god-class services. Instead of just commenting in PRs, I ran bi-weekly design pattern sessions using our actual codebase. Walking through Repository Pattern and SOLID principles. The junior's next service was clean, testable, required only minor review comments. They later mentored another new joiner using the same material — the knowledge compounded.",
        code:null },
      { term:"Failure & Learning",
        why:"Every SDE 3 candidate who claims they've never failed is lying. Interviewers use failure questions to assess self-awareness, accountability, and growth mindset. A great failure story is more impressive than a mediocre success story.",
        what:"The ideal failure story structure:\n1. What went wrong — be specific.\n2. YOUR role — own it, don't blame others.\n3. What you learned — understand the root cause deeply.\n4. What you changed — concrete, measurable outcome.\n\nAnti-patterns: blaming teammates or unclear requirements, choosing a trivial failure, failure with no learning, success disguised as failure ('I work too hard').",
        how:"Choose a real failure with real consequences — a production incident, a missed deadline, a design decision that had to be reversed.\n\nBe clear about what your specific decision or inaction contributed.\n\nThe 'what changed' must be concrete: 'I now write design docs before implementation', 'I added monitoring alerts for this failure class', 'I added an idempotency checklist to our PR template'.",
        example:"S: 'I shipped a Kafka consumer that processed payment events without an idempotency check.'\nT: 'A network blip caused 40 messages to be re-delivered. We processed 40 duplicate payments.'\nA: 'I led the incident response, identified the root cause, wrote the fix (unique constraint on payment_id) and deployed within 2 hours.'\nLearning: 'I added an idempotency checklist to our PR review template. Every consumer we write now has a documented idempotency strategy before code review.'",
        code:null },
      { term:"Conflict & Disagreement",
        why:"SDE 3 will have strong technical opinions and so will peers. The ability to disagree constructively — and either update your view based on evidence or advocate persuasively — is a core SDE 3 competency.",
        what:"Technical disagreements: evaluate trade-offs objectively, run a small experiment if feasible, defer to the person closest to the risk.\n\nProcess disagreements: frame around shared goals (code quality, reduced incidents) not personal preferences.\n\nManager disagreements: articulate the risk clearly once, in writing. If overruled, implement with a documented concern.\n\nDisagree and commit: once a decision is made with input from all parties, commit fully — even if your preferred option wasn't chosen.",
        how:"Structure for a conflict story:\n1. State the disagreement (without making the other person look bad).\n2. Your position and reasoning.\n3. How you engaged (data, demos, genuinely listening to their concerns).\n4. The resolution.",
        example:"S: 'A colleague wanted to use a single large Kafka topic for all event types; I believed we needed per-domain topics.'\nA: 'I wrote a short technical comparison covering consumer isolation, schema evolution, and monitoring granularity. I presented it at the design review.'\nR: 'We agreed to try per-domain topics for the first service. After 2 weeks the per-domain approach clearly won on observability. The team adopted it as the standard.'",
        code:null },
      { term:"Situational Leadership",
        why:"Interviewers present hypothetical scenarios to assess your decision-making framework and leadership maturity. These test whether you have genuine leadership instinct or memorised answers.",
        what:"Situational questions require a framework, not a script:\n1. Assess the situation (facts vs assumptions).\n2. Identify stakeholders and their interests.\n3. List options with trade-offs.\n4. Choose with justification.\n5. Communicate proactively.\n\nLeadership style should match the situation: directive when urgency is high (production incident), coaching when a junior has potential, collaborative when the decision has broad impact.",
        how:"Production incident during critical demo: immediately acknowledge the issue, have a prepared backup (pre-recorded demo or static screenshots), engage your on-call engineer in parallel. Transparency builds trust.\n\nConflicting priorities from two stakeholders: don't silently pick one. Bring both together with a clear trade-off analysis. Your job is to surface the conflict, not resolve politics.\n\nUnderperforming team member: private, specific, constructive feedback with a concrete improvement plan and timeline.",
        example:"Q: 'How would you handle a critical bug found in production 2 hours before a major client presentation?'\nA: 'First, assess severity: data-corruption or display bug? If data: halt the demo, communicate immediately to the client with a revised timeline. If display: prepare a workaround, brief the presenter, fix in parallel. Either way: be transparent, not defensive. Clients respect honesty far more than a cover-up.'",
        code:null },
    ],
    keyPoints:["Write your 10 best STAR stories with metrics BEFORE your first interview — improvising produces weak answers","Quantify every result: 'latency dropped from 24h to 30 seconds'. Numbers make stories memorable","The interviewer checks HOW you think and lead — show the reasoning process, not just the outcome","Prepare 5 strong questions to ask the interviewer — signals strategic thinking","For failure questions: pick a real failure with a real lesson. Fake failures damage credibility instantly","Disagree and commit is a mark of seniority — commit fully once a decision is made"],
    resources:[{title:"Amazon Leadership Principles",url:"https://www.amazon.jobs/content/en/our-workplace/leadership-principles",desc:"Most widely used framework. Applicable to all top tech companies."},{title:"Grokking the Behavioral Interview",url:"https://www.educative.io/courses/grokking-the-behavioral-interview",desc:"Structured preparation with example stories by situation type."},{title:"The Manager's Path — Camille Fournier",url:"https://www.oreilly.com/library/view/the-managers-path/9781491973882/",desc:"Chapters 1–3 explain what companies expect from senior ICs."}]
  },
  {
    id:"database", label:"Database\n& SQL", emoji:"🗄️", angle:45, priority:"HIGH", weeks:2,
    overview:"SDE 3 owns the full DB layer: schema design, query optimization, transaction semantics, and scaling strategy. You have hands-on experience at Saxo — now add the vocabulary and internals that let you teach these concepts.",
    concepts: [
      { term:"ACID Transactions",
        why:"ACID is the foundation of every financial database guarantee. Without it, double-spends, partial writes, and phantom reads become possible. You fixed race conditions at Saxo — that fix worked because SQL Server's ACID guarantees existed. You just needed to use them correctly.",
        what:"ACID = Atomicity, Consistency, Isolation, Durability.\n\n• Atomicity: entire transaction succeeds or entirely fails. Implemented via undo log. Payment debit commits but credit fails → whole transaction rolls back.\n• Consistency: transaction takes DB from one valid state to another. Constraints (FK, unique, check) enforced.\n• Isolation: concurrent transactions behave as if executed serially. Others cannot see intermediate states.\n• Durability: committed transactions survive crashes. Implemented via WAL (Write-Ahead Log) — changes written to log before data pages.",
        how:"SQL Server: BEGIN TRANSACTION ... COMMIT TRANSACTION (or ROLLBACK). All statements in between are atomic.\n\nAtomicity: if step 2 fails, SQL Server reverses all changes in the undo log.\nDurability: changes written to transaction log (WAL) synchronously before acknowledging commit. Data pages flushed asynchronously later.\nTrade-off: ACID has overhead (logging, locking). NoSQL databases sacrifice some ACID properties for higher write throughput.",
        example:"Transfer £500 from Account A to Account B. If the second UPDATE fails (constraint violation on B), the entire transaction rolls back — Account A's balance is restored. No money vanishes. This is the guarantee that makes financial DBs trustworthy.",
        code:"BEGIN TRANSACTION;\nUPDATE Accounts SET Balance = Balance - 500 WHERE AccountId = 'A';\nIF @@ROWCOUNT = 0 BEGIN\n    ROLLBACK;\n    THROW 50001, 'Account A not found', 1;\nEND\nUPDATE Accounts SET Balance = Balance + 500 WHERE AccountId = 'B';\nIF @@ROWCOUNT = 0 BEGIN\n    ROLLBACK;\n    THROW 50002, 'Account B not found', 1;\nEND\nCOMMIT TRANSACTION;" },
      { term:"Isolation Levels & Anomalies",
        why:"The wrong isolation level is the root cause of a huge class of bugs. The race condition at Saxo was an isolation-level problem. SDE 3 must know which level to choose for each scenario without looking it up.",
        what:"• Read Uncommitted: reads uncommitted data (dirty reads). Almost never appropriate.\n• Read Committed (SQL Server default): only reads committed data. Prevents dirty reads. Still allows non-repeatable reads (row changes between two reads in same transaction).\n• Repeatable Read: rows read can't be modified by others until transaction ends. Still allows phantom rows (new rows matching a query appear).\n• Serializable: full isolation. Prevents all anomalies. Highest overhead.\n• Snapshot Isolation (SQL Server): readers see a consistent snapshot at transaction start. Writers don't block readers. Conflict detected at commit time. Uses row versions in tempdb.",
        how:"Dirty read: Txn A updates balance to 500 but hasn't committed. Txn B reads 500. Txn A rolls back. Txn B now holds a value that never existed.\n\nNon-repeatable read: Txn B reads balance=1000. Txn A commits balance=800. Txn B reads again = 800. Same query, different result.\n\nPhantom read: Txn B counts rows WHERE amount > 100, gets 5. Txn A inserts a new row. Txn B counts again, gets 6.\n\nFor Saxo: use Snapshot Isolation (READ_COMMITTED_SNAPSHOT = ON). Readers never block writers. OCC handles write conflicts.",
        example:"Race condition at Saxo: two concurrent processes both read balance=1000 under Read Committed. Both calculate debit = 500. Both write 500. Net: two debits, only one deducted. Fix: Snapshot Isolation + optimistic concurrency (WHERE RowVersion = @version). One write wins. The other re-reads, recalculates, and retries.",
        code:null },
      { term:"MVCC & Locking",
        why:"MVCC is the mechanism behind Snapshot Isolation. Understanding it explains why readers never block writers. Your optimistic concurrency implementation at Saxo is MVCC at the application layer.",
        what:"• MVCC (Multi-Version Concurrency Control): instead of locking a row on write, the DB keeps multiple versions with transaction timestamps. Each transaction sees a consistent snapshot as of its start time. SQL Server stores old versions in tempdb.\n• Pessimistic locking: lock the row before reading or writing. SELECT...WITH (UPDLOCK).\n• Optimistic locking (OCC): read without locking. On write, check if row was modified since you read it (via RowVersion/ETag). If modified, abort and retry.\n• Deadlock: Txn A locks row 1 and waits for row 2. Txn B locks row 2 and waits for row 1. SQL Server kills the 'cheaper' transaction.",
        how:"Avoid deadlocks: always acquire locks in the same order across all transactions. Keep transactions short. Never call external services while holding a lock.\n\nOCC in Entity Framework Core: add [Timestamp] attribute on RowVersion column. EF Core automatically adds WHERE RowVersion = @original to UPDATE statements.\n\nWhen to use which: pessimistic = high conflict rate. Optimistic = conflicts are rare (the normal case for Saxo's account balance updates).",
        example:"Saxo OCC fix: added RowVersion (timestamp) column to Accounts table. On read: SELECT Balance, RowVersion. On write: UPDATE Accounts SET Balance = @newBalance WHERE Id = @id AND RowVersion = @originalVersion. If RowVersion changed: 0 rows affected. Application catches this, re-reads latest balance, recalculates, and retries. Zero money creation/destruction bugs since.",
        code:null },
      { term:"Indexing Internals",
        why:"Indexes are the single most impactful performance lever in SQL Server. A missing index turns a 1ms query into a 30-second full table scan on 500M rows. Too many indexes slows every write. Every SQL query you write should have a mental model of which index will serve it.",
        what:"• B-Tree index: balanced tree. Leaf nodes contain actual data (clustered) or pointers (non-clustered). O(log N) lookup.\n• Clustered index: determines physical row order on disk. Only ONE per table. Default = primary key.\n• Non-clustered index: separate structure with indexed columns + row locator. Multiple per table.\n• Covering index: includes ALL columns a query needs — no lookup to base table required. Dramatically faster for read-heavy queries.\n• Composite index key order: put equality predicates first, range predicates last. Index on (account_id, created_at) serves WHERE account_id = 'X' AND created_at > '2024' efficiently.",
        how:"Identify missing indexes: SQL Server execution plan shows 'Missing Index' suggestions. Also check sys.dm_db_missing_index_details.\n\nMaintenance: fragmentation > 30% → REBUILD (offline). 10-30% → REORGANIZE (online).\n\nToo many indexes: each INSERT/UPDATE/DELETE must update every index. Audit via sys.dm_db_index_usage_stats.\n\nSARGable predicates: WHERE col = @val is sargable (uses index). WHERE YEAR(created_at) = 2025 is NOT sargable — rewrite as WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'.",
        example:"Saxo query: SELECT * FROM Payments WHERE AccountId = 'X' AND CreatedAt > '2025-01-01' ORDER BY CreatedAt DESC. Without index: full table scan of 500M rows — 30 seconds. With non-clustered covering index on (AccountId, CreatedAt) INCLUDE (Amount, Status, PaymentId): seeks directly to AccountId='X', range scans CreatedAt — 1ms.",
        code:null },
      { term:"Query Optimization",
        why:"You optimised SQL Server stored procedures at Saxo. SDE 3 must look at an execution plan and immediately identify the bottleneck. Slow queries in a high-throughput financial system cause cascading timeouts.",
        what:"• Query Optimizer: cost-based. Evaluates multiple plans, chooses cheapest estimated one. Only as good as its statistics.\n• Execution plan operators: Table Scan (full table — bad), Index Seek (direct lookup — good), Nested Loop Join (good for small sets), Hash Join (good for large unsorted sets), Merge Join (good for sorted sets).\n• Statistics: SQL Server maintains histograms of column value distributions. Outdated statistics → wrong plans.\n• Parameter sniffing: SQL Server compiles a stored procedure with the first parameter value and caches that plan. If subsequent calls use very different parameters, the cached plan is suboptimal.",
        how:"Analyse execution plan: enable 'Include Actual Execution Plan' in SSMS. Look for fat arrows (many rows), table scans, high estimated vs actual row count discrepancies.\n\nFix parameter sniffing: OPTION(RECOMPILE) for queries with highly variable parameters.\n\nAvoid SELECT *: always specify needed columns — prevents covering index use.\n\nAvoid functions on indexed columns: WHERE YEAR(created_at) = 2025 prevents index seek. Use a range condition instead.",
        example:"Saxo stored procedure for account statement generation: originally 8 seconds. Execution plan showed Hash Join on 400M rows. Root cause: missing index on (AccountId, CreatedAt). Added covering index → plan changed to Index Seek + Merge Join → 40ms. Secondary issue: parameter sniffing — plan compiled for an account with 5 transactions but used for one with 5M. Added OPTION(RECOMPILE). Final: consistently < 100ms.",
        code:null },
      { term:"Partitioning & Sharding",
        why:"A single 500M-row SQL Server table will eventually hit I/O, memory, and lock contention limits. Partitioning and sharding are the strategies for growing beyond a single DB instance.",
        what:"• Table Partitioning (within one server): split a large table into smaller physical segments by partition key (e.g. YEAR(created_at)). Queries prune to specific partitions. Transparent to application.\n• Sharding (across servers): split data across multiple independent DB servers. Application/routing layer determines which shard to query.\n• Shard key selection: the most critical decision. Bad key → hotspots or cross-shard queries (expensive). Good keys: user_id, account_id.\n• Consistent hashing: hash(shard_key) % N_shards. When adding a shard, minimises data movement.",
        how:"SQL Server table partitioning: CREATE PARTITION FUNCTION pf_byYear (datetime2) AS RANGE RIGHT FOR VALUES ('2023-01-01', '2024-01-01', '2025-01-01'). Queries with WHERE created_at > '2025-01-01' scan only the 2025 partition.\n\nApplication-level sharding in C#: hash(accountId) % 4 = shardIndex → ConnectionString[shardIndex].\n\nCross-shard queries: avoid by design. Use a separate aggregated CQRS read model for cross-shard reporting.",
        example:"Saxo payments table: 600M rows, single SQL Server, I/O saturated during month-end. Applied SQL Server partitioning by YEAR(created_at). Month-end queries scan only the current year partition (~80M rows) instead of all 600M. Query time: 8s → 900ms. No application code changes needed. Try partitioning before full sharding — much simpler operationally.",
        code:null },
      { term:"NoSQL Trade-offs",
        why:"Not every data problem fits a relational model. At SDE 3 you must choose the right database for the job, justify why, and articulate what you're giving up. CAP theorem makes NoSQL trade-offs concrete: AP vs CP, eventual vs strong consistency.",
        what:"• Document DB (MongoDB, Cosmos): JSON documents. Great for flexible schemas. No multi-document transactions in most cases.\n• Column-family (Cassandra, HBase): optimised for high write throughput and time-series data. Design tables around query patterns.\n• Key-Value (Redis, DynamoDB): O(1) lookup by key. Fastest reads. Only lookup by key — no range scans.\n• Graph DB (Neo4j): relationships as first-class citizens. Good for fraud detection and social graphs.\n• Time-series DB (InfluxDB, TimescaleDB): append-heavy time-series data (metrics, logs, sensor data). Efficient compression and time-range queries.",
        how:"Choose SQL for: financial transactions, joins, complex queries, referential integrity.\nChoose Cassandra for: high-write event logs, audit trails, time-series metrics. Partition key = (user_id, year), clustering key = timestamp.\nChoose Redis for: caching, rate limiting, session storage. Data must fit in memory.\nChoose DynamoDB for: globally distributed, high-scale key-value access, Lambda-friendly. Single-digit millisecond latency globally.",
        example:"Saxo architecture decisions: payment transactions → SQL Server (ACID required). Kafka event log (audit trail) kept for 90 days then archived. Market data quotes (1M+ writes/sec) → TimescaleDB or Cassandra (SQL Server would be overwhelmed at this write rate). User sessions → Redis (sub-millisecond lookup, TTL-based expiry, no ACID needed).",
        code:null },
    ],
    keyPoints:["SQL Server default isolation is Read Committed — this still allows non-repeatable reads. Use Snapshot Isolation for OLTP workloads","MVCC means reads don't block writes in snapshot isolation — why your readers were fast even under heavy write load","Composite index leftmost prefix rule: index on (a,b,c) helps queries on a or (a,b) but NOT on b or c alone","Non-SARGable predicates kill index performance: WHERE YEAR(col)=2024 prevents index seek — rewrite as a range","Your OCC implementation with RowVersion columns is textbook correct for low-contention fintech updates","Sharding solves write scalability but makes cross-shard joins impossible — design shard key around your most critical query"],
    resources:[{title:"Use The Index, Luke! (Free)",url:"https://use-the-index-luke.com",desc:"Best free resource on SQL indexing internals. Directly applicable to SQL Server."},{title:"DDIA Chapters 2–4 — Kleppmann",url:"https://dataintensive.net",desc:"Storage engines, data models, encoding. Theoretical backbone for DB internals."},{title:"CMU Database Course — Free Online",url:"https://15445.courses.cs.cmu.edu/fall2023/",desc:"Andy Pavlo's DB internals course: B-Trees, buffer pool, concurrency control."}]
  },
  {
    id:"dsa", label:"DSA &\nAlgorithms", emoji:"🧠", angle:-45, priority:"HIGH", weeks:4,
    overview:"DSA rounds remain standard even at SDE 3 — the bar is simply higher. Pattern recognition is the skill. Focus on Graphs, DP, Intervals, and Heaps. Practice writing clean code without an IDE.",
    concepts: [
      { term:"Arrays & Sliding Window",
        why:"Arrays are the foundation of most DSA problems. The Sliding Window converts O(N²) naive solutions to O(N) by avoiding redundant computation. In fintech: moving averages, real-time rate limiting (count requests in the last N seconds), detecting anomalous transaction patterns.",
        what:"• Array: contiguous memory. O(1) random access. O(N) insert/delete in middle.\n• Fixed-size window: maintain running sum — subtract outgoing element, add incoming element. O(N) time, O(1) space.\n• Variable-size window: window expands/contracts based on a condition. Expand right until satisfied, then shrink left.\n• Two Pointers: use when array is sorted or you need pairs (two sum, container with most water).\n• Prefix Sums: precompute running totals so range sum queries become O(1).",
        how:"Fixed window template:\n1. Initialise sum with first K elements.\n2. Slide: windowSum -= arr[i-K]; windowSum += arr[i].\n\nVariable window template:\nleft=0, right=0. Expand right. When condition violated, shrink from left. Track min/max window length.\n\nCommon patterns:\n• Longest substring without repeating chars → variable window + HashSet\n• Minimum window substring → variable window + frequency map\n• Max consecutive ones with K flips → variable window tracking zeroes flipped",
        example:"Rate limiting at Saxo: count requests in the last 60 seconds. Use a sliding window with a deque of timestamps. On each request: pop timestamps older than 60s from the front, push new timestamp to back. Window size = current request count. O(1) amortised per request — far better than O(N) linear scan.",
        code:"// Max sum of subarray of size K — O(N) time, O(1) space\nint MaxSumWindow(int[] arr, int k)\n{\n    int windowSum = arr.Take(k).Sum();\n    int maxSum = windowSum;\n    for (int i = k; i < arr.Length; i++)\n    {\n        // Slide: add right element, remove left element\n        windowSum += arr[i] - arr[i - k];\n        maxSum = Math.Max(maxSum, windowSum);\n    }\n    return maxSum;\n}" },
      { term:"Hash Maps & Sets",
        why:"Hash maps are the most commonly used data structure in interview problems. They convert O(N) search time to O(1) — transforming many O(N²) algorithms to O(N). In production: idempotency key lookup, session store, Kafka message deduplication, rate limiting counters.",
        what:"• HashMap (Dictionary in C#): O(1) average get/put/delete. O(N) worst case if many collisions.\n• HashSet: only cares about presence, not associated value. O(1) contains check.\n• Open addressing: on collision, probe for next empty slot. Cache-friendly. Used in .NET's Dictionary.\n• Chaining: each bucket holds a linked list. Used in Java's HashMap.\n• LinkedHashMap: maintains insertion order. Foundation of LRU Cache.",
        how:"Two Sum pattern: store complement (target - current) in HashMap. On each element, check if it already exists. O(N) instead of O(N²).\n\nFrequency count: count character frequencies in O(N). Answer queries in O(1).\n\nGrouping anagrams: for each word, sort its characters as the key. Group words with the same sorted key.\n\nLRU Cache: HashMap (O(1) lookup) + doubly-linked list (O(1) move to front, O(1) evict from back).",
        example:"Idempotency at Saxo: HashSet of processed payment IDs kept in Redis. O(1) lookup to check if a Kafka message was already processed. If payment_id exists → skip processing, commit offset. Prevents double-payments when Kafka redelivers messages after a consumer crash.",
        code:"// Two Sum — O(N) with HashMap\nint[] TwoSum(int[] nums, int target)\n{\n    var seen = new Dictionary<int, int>(); // value → index\n    for (int i = 0; i < nums.Length; i++)\n    {\n        int complement = target - nums[i];\n        if (seen.ContainsKey(complement))\n            return new[] { seen[complement], i };\n        seen[nums[i]] = i;\n    }\n    return Array.Empty<int>();\n}" },
      { term:"Trees & Binary Search",
        why:"Trees underpin databases (B-Trees for indexes), operating systems (file systems), and compilers (ASTs). Binary Search is the foundation of O(log N) lookup — it's what makes SQL Server B+ Tree index seeks take milliseconds on 500M-row tables.",
        what:"• BST: left < parent < right. O(log N) average search. O(N) worst case if unbalanced.\n• Balanced BST (AVL, Red-Black): self-balancing, guaranteeing O(log N) worst case.\n• Binary Search: requires sorted array. At each step, compare with midpoint, eliminate half. O(log N).\n• Tree traversals: In-order (left, root, right) → sorted output for BST. Pre-order → copy a tree. Post-order → delete a tree. Level-order (BFS) → process by level.",
        how:"Binary Search template:\nleft=0, right=arr.Length-1\nWhile left<=right: mid = left + (right-left)/2 — avoids integer overflow!\nIf arr[mid]==target return mid. If arr[mid] < target: left=mid+1 else right=mid-1.\n\nSearch for insertion point: when target not found, left is the insertion index. Useful for 'find first element >= target'.",
        example:"Finding if a payment amount falls within a valid fee band: pre-sort the bands, binary search for position. O(log N) vs O(N) linear scan. SQL Server B+ Tree index: finding AccountId = 'X' in a 500M row table navigates the tree in ~29 comparisons (log2(500M) ≈ 29). This is why index seeks take milliseconds on massive tables.",
        code:null },
      { term:"Graphs: BFS & DFS",
        why:"Graphs model relationships: network topology, dependency chains, reachability. BFS for shortest path in unweighted graphs. DFS for cycle detection, topological sort, connected components. Microservice dependency graphs and Kafka consumer group topologies are graphs.",
        what:"• Graph: vertices connected by edges. Directed or undirected. Weighted or unweighted.\n• BFS: explore all neighbours at depth D before depth D+1. Uses a Queue. Guarantees shortest path in unweighted graphs.\n• DFS: explore as deep as possible before backtracking. Uses Stack (or recursion). Good for topological sort, cycle detection, strongly connected components.\n• Topological Sort (Kahn's): in-degree tracking with BFS — for course scheduling, build order problems.\n• Union-Find (Disjoint Set): answers 'are these two nodes connected?' efficiently.\n• Dijkstra: BFS variant with a min-heap for weighted shortest path.",
        how:"BFS template: queue = [start]; visited = {start}. While queue not empty: node = dequeue. Process. For each unvisited neighbour: mark visited, enqueue.\n\nDFS template: dfs(node, visited): if node in visited return. Mark visited. For each neighbour: dfs(neighbour, visited).\n\nCycle detection in directed graph: track 'in-progress' set (grey nodes). If you visit a grey node, you've found a cycle.",
        example:"Microservice dependency check: model services as directed graph (A depends on B = edge A→B). DFS cycle detection finds circular dependencies before deployment — prevents deadlocked startup sequences. Shortest hop count between two Kafka consumers in a consumer group topology: BFS guarantees minimum hops.",
        code:null },
      { term:"Dynamic Programming",
        why:"DP is the pattern for optimisation problems where subproblems overlap. Recognising a DP problem and choosing top-down vs bottom-up separates strong SDE 3 candidates. DP thinking applies to memoising expensive financial calculations like fee schedule computation.",
        what:"DP = overlapping subproblems + optimal substructure.\n\n• Top-down (memoisation): recursive with a cache. Natural to write. Starts from the original problem.\n• Bottom-up (tabulation): iterative, fills a table from base cases. More space-efficient. Avoids recursion stack overflow.\n• State definition: 'what is dp[i]?' is the hardest part. Often 'the best answer for the first i elements'.\n• Space optimisation: if dp[i] only depends on dp[i-1], store only the previous row — O(N) space from O(N²).",
        how:"Coin Change (minimum coins to make amount N):\ndp[i] = min coins to make amount i. Base: dp[0]=0.\nFor each amount i, for each coin c: dp[i] = min(dp[i], dp[i-c]+1).\n\nInterview approach:\n1. Start with brute force/recursion.\n2. Add memoisation (top-down).\n3. Convert to tabulation (bottom-up) if needed.\n4. Optimise space if dp[i] only uses dp[i-1].",
        example:"Fee schedule calculation: given a tiered fee structure with N brackets, find the minimum fee for a transaction of amount X. This maps directly to Coin Change (LeetCode 322) — DP gives O(N × amount) vs O(2^N) brute force. At Saxo's transaction volumes, this is never a theoretical exercise.",
        code:null },
      { term:"Heaps & Priority Queues",
        why:"Heaps power any 'top K', 'median of stream', or 'next earliest event' problem. In distributed systems, priority queues underpin task schedulers, event ordering, and Kafka consumer offset management.",
        what:"• Min-heap: parent ≤ children. Root = minimum. O(log N) insert/extract. O(1) peek.\n• Max-heap: parent ≥ children. Root = maximum.\n• Building a heap from N elements: O(N) — not O(N log N)!\n• PriorityQueue in C#/.NET 6+: built-in min-heap. Enqueue with priority, dequeue returns lowest priority.\n• Two-heap trick for running median: max-heap for lower half, min-heap for upper half. Balance sizes. Median = average of two tops or top of the larger heap.",
        how:"Top K frequent elements: count frequencies O(N), then use a min-heap of size K. For each element, if heap size < K: push. Else if frequency > heap.top: pop and push. O(N log K).\n\nMerge K sorted lists: put first element of each list in min-heap with list index. Extract min, advance that list, re-insert. O(N log K) for N total elements.\n\nTask scheduling with deadlines: sort tasks by deadline, process with priority queue to maximise completed tasks.",
        example:"Kafka consumer with multiple partitions having different processing times: a priority queue sorted by (next_scheduled_retry_time) ensures the soonest-due retry fires first — O(log N) scheduling instead of O(N) linear scan across all pending retries.",
        code:null },
      { term:"Interval Problems",
        why:"Interval problems appear in scheduling, resource allocation, and time-series processing. Common in fintech interviews: 'find overlapping trading windows', 'how many compliance audits are happening simultaneously?'",
        what:"• An interval is defined by [start, end].\n• Merge overlapping intervals: sort by start. If current.start <= prev.end, merge by extending end to max(prev.end, current.end).\n• Meeting rooms needed (max overlapping): separate starts and ends into two sorted arrays. Two-pointer: if next event is a start, rooms++; if end, rooms--. Track maximum.\n• Insert interval: find position, merge with all overlapping intervals on both sides.\n• Sweep line: process all start/end events sorted by time. +1 for start, -1 for end. Running sum = active intervals.",
        how:"Merge intervals: O(N log N) for sort + O(N) for merge = O(N log N) total.\n\nMeeting rooms: O(N log N) for sorting, O(N) space.\n\nSort key: by start time for merge/insert. Edge case: [1,4] and [4,5] — define 'overlap' precisely (< vs <= at boundary, depends on the problem statement).",
        example:"Saxo trading window system: each product has trading hours as intervals. Given a new order, check if current time falls within any open trading window. Sort intervals, binary search for position, check overlap. O(log N) lookup after O(N log N) preprocessing. Sweep line answers 'how many products are tradeable right now?' in O(N log N).",
        code:null },
      { term:"Complexity Analysis",
        why:"SDE 3 must explain time and space complexity for every solution without being asked. At Saxo: will this algorithm run in 1ms or 30 seconds on 500M rows? The difference between O(N) and O(N²) on 500M rows is the difference between a 1-second job and a 3-day job.",
        what:"Big O: describes growth rate as N → infinity. Ignores constants and lower-order terms.\n\n• O(1): constant — hash map lookup, array index\n• O(log N): logarithmic — binary search, B-tree lookup\n• O(N): linear — single loop over all elements\n• O(N log N): linearithmic — efficient sort, heap ops on all elements\n• O(N²): quadratic — nested loops over same array\n• O(2^N): exponential — brute-force subset enumeration\n\nSpace complexity: extra memory used. Recursion depth counts (call stack).",
        how:"Analyse by counting loop iterations as a function of N.\n• Nested loops over same array = O(N²).\n• Halving the search space each step = O(log N).\n• Dominant term: O(N² + N log N) simplifies to O(N²).\n\nInterview communication:\n1. State complexity BEFORE coding: 'This will be O(N log N) time, O(N) space because...'\n2. Restate AFTER coding.\n3. Ask: 'Can I trade space for time here?' — shows DP/memoisation awareness.",
        example:"Naive duplicate payment check: for each payment, scan all previous. O(N²). With hash set: O(N) time, O(N) space. For 10M payments: O(N²) = 100 trillion operations vs O(N) = 10 million. The difference between a 3-day job and a 1-second job. At Saxo's transaction volumes, this is never a theoretical exercise.",
        code:null },
    ],
    keyPoints:["Pattern first: BFS = shortest path, Sliding Window = substring/subarray with constraint, Two Heaps = median, Union-Find = connectivity","Always state brute force first to show you understand the problem, then optimise","State complexity BEFORE coding: 'This will be O(N log N) time, O(N) space because...'","Handle edge cases proactively: empty input, single element, all same elements, negative numbers","In fintech: use long for large sums (integer overflow), use Decimal not double for currency","LRU Cache = HashMap + Doubly-Linked List — 'system design in miniature', appears everywhere"],
    resources:[{title:"Neetcode.io — Structured 150 Problems",url:"https://neetcode.io/practice",desc:"Best-organized list with video solutions by pattern. Start here."},{title:"LeetCode — Top Interview Questions",url:"https://leetcode.com/problem-list/top-interview-questions/",desc:"Primary practice platform. Filter by tag (DP, Graph, etc.)."},{title:"Big-O Cheat Sheet",url:"https://www.bigocheatsheet.com",desc:"Quick reference for all data structure operation complexities."}]
  },
  {
    id:"patterns", label:"Design\nPatterns", emoji:"🔧", angle:180, priority:"HIGH", weeks:1,
    overview:"You already use Repository, Strategy, Factory, Circuit Breaker, CQRS, and OCC in production at Saxo. The SDE 3 goal is teaching-level fluency: explain WHY each pattern exists, WHEN to use it vs alternatives, and what its trade-offs are.",
    concepts: [
      { term:"CQRS",
        why:"CQRS is the pattern you implemented at Saxo. At SDE 3 you must articulate WHY it was the right choice, not just that you used it. CQRS solves the impedance mismatch between write models (normalised, transactional) and read models (denormalised, fast, projection-based).",
        what:"CQRS: separate the model for writes (Commands) from reads (Queries). Each can be independently scaled, optimised, and persisted differently.\n\n• Command side: validates business rules, applies domain logic, persists to write store (normalised SQL), publishes domain events.\n• Query side: read model optimised for specific query patterns. Can be a separate SQL view, Redis cache, or Elasticsearch index.\n• Event Sourcing + CQRS: commands produce events (stored as source of truth). Read models built by replaying events.\n• Trade-off: eventual consistency between write and read models.",
        how:"Implementation in .NET: use MediatR library. Commands implement IRequest<T>. Queries implement IRequest<T>. Separate handlers. No coupling between read and write paths.\n\nCommand handler: validate → apply to domain aggregate → save to SQL → publish domain event to Kafka.\n\nQuery handler: query the read model (denormalised SQL view or Redis cache). No business logic, just data projection.\n\nProjection (event consumer): subscribes to domain events from Kafka, updates the read model asynchronously.",
        example:"Saxo account service: CreateTransferCommand writes to normalised Accounts and Transactions tables and publishes TransferInitiated event. GetAccountSummaryQuery reads from a denormalised AccountSummary read model (pre-computed balance, recent transactions) — sub-10ms response. Without CQRS: every summary query joined 3 tables with aggregates — 800ms.",
        code:null },
      { term:"Event Sourcing",
        why:"Event Sourcing is uniquely powerful for financial systems: your state IS the log of events. This gives you time travel (replay state at any point in history) and a complete audit trail. At Saxo, every payment state change (initiated, approved, settled, failed) is an event.",
        what:"Event Sourcing: instead of storing current state, store every state-changing event. Current state is derived by replaying all events.\n\n• Events are immutable facts: 'AccountDebited(accountId=X, amount=500, timestamp=T)'. Once written, never changed.\n• Event store: append-only table (aggregate_id, sequence_number, event_type, event_data JSON, created_at).\n• Snapshots: to avoid replaying all events from the beginning, periodically save current state snapshot. Replay only from the last snapshot.\n• Trade-off: querying current state requires projection rebuilding. Use CQRS read models for complex queries.",
        how:"Loading an aggregate: SELECT * FROM events WHERE aggregate_id = @id ORDER BY sequence_number. Apply each event to rebuild state.\n\nOptimistic concurrency: check expected sequence number on write. INSERT fails if aggregate_id + sequence already exists.\n\nPayment aggregate events: PaymentRequested → ComplianceChecked → FundsReserved → SettlementSent → PaymentCompleted. Snapshot after 100 events to avoid full replay cost.",
        example:"Audit trail: regulators ask 'what was the state of payment P at 14:32 on 3 March?' Replay events up to that timestamp — perfect answer, no guessing. This is impossible with traditional current-state-only storage (the old state was overwritten). Event Sourcing turns 'we can't know' into 'we can reproduce exactly'.",
        code:null },
      { term:"Outbox + Transactional Messaging",
        why:"The Outbox Pattern solves the fundamental dual-write problem in microservices: writing to DB and publishing an event are not atomic. If the DB commits but Kafka publish fails, you have a silent data inconsistency. Every event must be processed in financial systems.",
        what:"Core guarantee: a domain event is published if and only if the corresponding DB transaction commits.\n\n• Achieved by writing the event to an 'outbox' table in the SAME DB transaction, then a separate relay publishes from the outbox.\n• Two-phase commit (XA) alternative: complex, slow, ties two systems together. Outbox is simpler and more resilient.\n• Relay is idempotent: mark published_at on success. If relay crashes and restarts, re-publishes. Consumers must be idempotent.\n• CDC option: Debezium reads WAL log, publishes outbox row changes to Kafka automatically.",
        how:"In C#/EF Core: use a single DbContext transaction. SaveChanges() persists both the domain entity update and the OutboxMessage row atomically.\n\nBackground relay (IHostedService): every 100ms, query outbox WHERE published_at IS NULL. Publish to Kafka. On success, update published_at.\n\nOutbox schema: (id UUID, event_type VARCHAR, aggregate_id VARCHAR, payload JSON, created_at DATETIME2, published_at DATETIME2 NULL).",
        example:"Without Outbox: app.SaveChanges(); kafka.Produce(event); — if Kafka restarts between these two lines, event is lost silently. Payment debited in DB, no downstream services notified. With Outbox: single transaction saves both. Even if Kafka is down for 5 minutes, events queue up and are delivered when Kafka recovers.",
        code:null },
      { term:"Repository Pattern",
        why:"You use the Repository Pattern at Saxo. At SDE 3 you must explain WHY: it abstracts the data access layer, makes business logic testable in isolation (mock the repository), and decouples domain logic from infrastructure concerns.",
        what:"Repository: an abstraction over the data store that exposes collection-like semantics to the domain layer.\n\n• Domain layer depends on IRepository<T> interface, not on EF Core or SQL Server.\n• At runtime: concrete SqlAccountRepository injected. In tests: MockAccountRepository injected.\n• Specific Repository: IAccountRepository extends IRepository<Account> with domain-specific queries.\n• Unit of Work (UoW): coordinates multiple repositories within a single transaction.\n• Anti-pattern: Generic repositories that leak persistence concerns to callers (passing Expression<Func<T,bool>> is EF Core leaking out).",
        how:"Define: IAccountRepository { Account GetById(Guid id); void Add(Account account); IEnumerable<Account> GetByStatus(AccountStatus status); }\n\nImplement with EF Core: SqlAccountRepository(DbContext context) — delegates to context.Accounts.\n\nTest with mock: var mockRepo = new Mock<IAccountRepository>(); mockRepo.Setup(r => r.GetById(id)).Returns(testAccount); No database required.\n\nRegister in DI: services.AddScoped<IAccountRepository, SqlAccountRepository>() in production.",
        example:"AccountService.ProcessPayment() calls _accountRepo.GetById(fromAccountId) and _accountRepo.GetById(toAccountId). In a unit test, both return pre-configured test accounts. Zero database dependency. Tests run in milliseconds. Without this abstraction, every unit test requires a real SQL Server connection — much slower and fragile.",
        code:null },
      { term:"Circuit Breaker (Polly in .NET)",
        why:"Circuit Breaker is a structural pattern preventing cascading failures by detecting repeated downstream failures and short-circuiting calls. At Saxo, your Polly configuration is a production implementation of this state machine — be ready to explain every state and transition.",
        what:"Circuit Breaker state machine:\n• Closed → normal operation. All calls go through. Failures counted.\n• Closed → Open: failure threshold breached (e.g. 5 consecutive failures or 50% failure rate in 30s).\n• Open → fail fast: all calls immediately rejected (BrokenCircuitException). No actual call made.\n• Open → Half-Open: after break duration (e.g. 60s). One probe request allowed.\n• Half-Open → Closed: probe succeeds. Normal operation resumes.\n\nCRITICAL: Circuit breaker state must be SHARED (singleton Polly policy). A per-request circuit breaker is completely useless.",
        how:"Polly in C#:\nvar policy = Policy.Handle<HttpRequestException>()\n  .CircuitBreakerAsync(5, TimeSpan.FromSeconds(60));\n\nCombine with retry: retryPolicy.WrapAsync(circuitBreakerPolicy). Retry handles transient failures; circuit breaker handles sustained outages.\n\nExpose circuit state via health endpoint: if Open, return 503 to upstream callers so they can route around.",
        example:"NotificationService is down. Without circuit breaker: every payment call waits 30s for timeout → thread pool exhaustion → service crash. With circuit breaker: after 5 failures, circuit opens. Next 60 seconds: all calls immediately throw BrokenCircuitException. Fallback: log to audit queue. PaymentService stays healthy and processes payments normally.",
        code:null },
      { term:"Saga Pattern (Design Perspective)",
        why:"Saga is the pattern for managing long-running, multi-step business processes spanning multiple services — the microservices replacement for distributed ACID transactions. For fintech, orchestration is usually preferred because compliance requires a clear, auditable flow.",
        what:"Choreography vs Orchestration:\n\n• Choreography: services react to events published by others. Pros: loose coupling. Cons: hard to debug, flow is implicit in event subscriptions.\n• Orchestration: central Saga Orchestrator sends commands and handles responses. Flow is explicit. Better for fintech compliance.\n\nStateless orchestrator: saga state persisted in DB (SagaState table). Resumes from last state after crash — durable workflow.\n\nLibraries: MassTransit Sagas (.NET), Temporal, AWS Step Functions.",
        how:"Implement with a state machine: states (PaymentInitiated, ComplianceChecked, FundsReserved, Settled, Failed).\n\nOrchestration flow: Orchestrator sends DebitAccountCommand → receives AccountDebitedEvent → sends SWIFTTransferCommand → receives SWIFTAcknowledgedEvent → sends CreditAccountCommand → saga complete.\n\nIf SWIFTTransferCommand times out: orchestrator executes compensation → sends CreditAccountCommand (refund debit) → marks saga as Compensated.",
        example:"Cross-border payment saga at Saxo: Debit EUR account → Call SWIFT gateway → Credit GBP account. If SWIFT times out: compensate by re-crediting EUR account. Retry SWIFT with exponential backoff and an idempotency key to prevent double-sending. The orchestrator persists saga state so it can resume after a service restart.",
        code:null },
      { term:"Strategy & Factory Patterns",
        why:"You use Strategy and Factory at Saxo. Strategy eliminates switch statements and enables extension without modification (Open/Closed Principle). Factory decouples object creation from usage.",
        what:"Strategy Pattern: define a family of algorithms, encapsulate each, make them interchangeable. The context delegates to a strategy object.\n• Use case: different fee calculation rules per product type, different settlement logic per account type.\n• Eliminates large if/else or switch chains based on type.\n\nFactory Method: defines an interface for creating objects but lets subclasses decide which concrete class to instantiate.\n\nAbstract Factory: creates families of related objects.\n• Use case: creating different Kafka serialisers based on message type; different payment processors based on currency.",
        how:"Strategy in C#:\nIFeeCalculationStrategy { decimal Calculate(Payment payment); }\nConcrete: UKFeeStrategy, EUFeeStrategy, USFeeStrategy. Injected by DI or selected by a factory.\n\nFactory in C#:\nIPaymentProcessorFactory { IPaymentProcessor Create(string currency); }\nImplementation: switch on currency, return new UKPaymentProcessor() or new EUPaymentProcessor().\n\nCombining: factory creates the right strategy at runtime. FeeStrategyFactory.Create(account.Region) returns the correct IFeeCalculationStrategy.",
        example:"Saxo account-type-specific Kafka payment pipelines: a PaymentProcessorFactory creates a different IPaymentProcessor based on account type (PEA, PEA-PME, Standard). Each processor uses a different IFeeStrategy and IComplianceStrategy. The context (PaymentService) doesn't know which concrete classes are in use. Adding a new account type = one new strategy class, zero changes to PaymentService.",
        code:null },
    ],
    keyPoints:["Know WHY each pattern exists — 'Repository exists to decouple domain logic from persistence and enable unit testing'","CQRS adds complexity — use only when read and write models have significantly different shape or scale needs","Event Sourcing + CQRS gives complete audit trail + event replay + optimised read projections — but complex to operate","Saga compensating transactions must be idempotent and replayable — failure mid-saga is expected, not exceptional","Circuit Breaker state MUST be a shared singleton — a per-request circuit breaker is completely useless","Generic repositories (IRepository<T>) are an anti-pattern — they leak persistence concerns to callers"],
    resources:[{title:"Refactoring.Guru — Design Patterns",url:"https://refactoring.guru/design-patterns",desc:"Best visual explanations of all 23 GoF patterns with C# code examples."},{title:"Microservices Patterns — Chris Richardson",url:"https://microservices.io/patterns/",desc:"Saga, Outbox, CQRS, Event Sourcing, Strangler Fig with full diagrams."},{title:"Polly Documentation",url:"https://www.thepollyproject.org",desc:"Official docs for Circuit Breaker, Retry, Timeout in .NET."}]
  },
  {
    id:"language", label:"Language\n& Runtime", emoji:"💻", angle:135, priority:"MEDIUM", weeks:2,
    overview:"Deep C#/.NET internals will set you apart at SDE 3. Most candidates write async code; very few can explain what the compiler generates, when ConfigureAwait(false) matters, or what triggers a GC pause.",
    concepts: [
      { term:"async/await Internals",
        why:"Most .NET developers write async/await without knowing what the compiler generates. SDE 3 at Saxo must explain: why is ConfigureAwait(false) important? What is a SynchronizationContext? Why does calling .Result cause deadlocks?",
        what:"async/await is syntactic sugar. The compiler transforms an async method into a state machine struct implementing IAsyncStateMachine.\n\n• When you hit await: if the awaitable is already complete, execution continues synchronously. If not, the method suspends — returns a Task to the caller, registers a continuation, and the thread is freed.\n• SynchronizationContext: captures the execution environment. After await resumes, it can marshal back to the original context.\n• ConfigureAwait(false): suppress context capture. Avoids deadlocks in ASP.NET Classic. Improves performance in library code.\n• async void: exceptions are unhandled — they crash the process. Only use for event handlers. Always prefer async Task.",
        how:"Deadlock scenario (ASP.NET Classic): calling .Result or .Wait() on a Task — the thread waits for the continuation, but the continuation needs that same thread. Deadlock.\n\nFix: always await, never .Result. If you must block synchronously: Task.Run(() => AsyncMethod()).Result offloads to a thread-pool thread without the deadlock.\n\nValueTask vs Task: Task is always heap-allocated. ValueTask avoids allocation when the result is available synchronously (common in cache-hit paths). Use ValueTask for hot-path methods.",
        example:"GetBalance(accountId) hits Redis: cache hit result is available immediately. Task<decimal> always allocates a Task object on the heap even for this trivial path. ValueTask<decimal> avoids allocation on cache hit. Only allocates when actual async I/O is needed (cache miss). At 100k calls/sec, this is significant GC pressure savings.",
        code:"// ValueTask for hot-path cache pattern\npublic async ValueTask<decimal> GetBalance(string id)\n{\n    // Cache hit: zero allocation — no Task object created\n    if (_cache.TryGetValue(id, out var cached))\n        return cached;\n\n    // Cache miss: actual async I/O\n    var balance = await _db.QueryAsync<decimal>(\n        \"SELECT Balance FROM Accounts WHERE Id = @id\",\n        new { id }).ConfigureAwait(false);\n\n    _cache[id] = balance;\n    return balance;\n}" },
      { term:"Garbage Collection",
        why:"Unexpected GC pauses cause latency spikes in production .NET services. At SDE 3 you must explain GC generations, when pauses occur, and how to reduce GC pressure. Understanding GC explains why Span<T> and ArrayPool<T> matter in your Saxo Kafka consumers.",
        what:".NET GC is generational:\n• Gen 0: short-lived, small objects. Collected most frequently (< 1ms). Triggered every few MB allocated.\n• Gen 1: survived one Gen 0 collection — buffer generation.\n• Gen 2: long-lived objects. Collected rarely. Can take 10ms+ — 'stop the world' pause.\n• LOH (Large Object Heap): objects > 85KB. Collected with Gen 2. Not compacted by default — can cause fragmentation.\n• Finalizers: objects with finalizers survive one extra GC cycle. Avoid — use IDisposable + using instead.\n• Server GC: one GC thread per core. Higher throughput, larger heap. Default for ASP.NET Core.",
        how:"Reduce allocations:\n• Avoid string concatenation in loops — use StringBuilder or string interpolation.\n• Reuse buffers with ArrayPool<T>.\n• Use Span<T> for slice operations — no heap allocation.\n\nDiagnose: dotnet-trace, PerfView, Application Insights. High Gen2 collection rate = memory pressure.\n\ndotnet-counters monitor: watch gc-heap-size, alloc-rate, exception-count, cpu-usage in real time.",
        example:"Kafka consumer parsing 100k messages/sec: naive JSON deserialisation creates a new byte[] per message. 100k allocations/sec cause frequent Gen 0 GC and eventually Gen 2 pressure. Fix: rent a buffer from ArrayPool<byte>.Shared, deserialise into it, process, return to pool. GC pressure drops 90%. Benchmark: naive = 45ns, 120 bytes allocated; ArrayPool + Span = 38ns, 0 bytes allocated.",
        code:null },
      { term:"Task Parallel Library & Threading",
        why:"TPL enables parallelism and concurrency in .NET. SDE 3 must know when to use Task.WhenAll (parallel async), Parallel.ForEach (CPU-bound parallelism), and Channel<T> (producer-consumer pipelines) — and critically, when NOT to use each.",
        what:"• Task.WhenAll: runs multiple async tasks concurrently and waits for all. Ideal for parallel I/O-bound operations.\n• Task.WhenAny: wait for the first task to complete.\n• Parallel.ForEach / PLINQ: CPU-bound parallelism across multiple threads. Avoid for I/O-bound work — use Task.WhenAll instead.\n• Channel<T>: high-performance, thread-safe producer-consumer pipeline. Replace ConcurrentQueue + semaphore with Channel<T>.\n• SemaphoreSlim: limit concurrency — 'process at most 10 Kafka messages in parallel': acquire semaphore before processing, release after.",
        how:"Fan-out pattern: var tasks = accounts.Select(a => ProcessAccount(a)); await Task.WhenAll(tasks). All accounts processed concurrently, not sequentially.\n\nThrottled fan-out: SemaphoreSlim(10) — only 10 tasks concurrently at a time. Prevents resource exhaustion (too many concurrent DB connections).\n\nChannel producer-consumer: Kafka reader → ChannelWriter.WriteAsync(). Processing workers → ChannelReader.ReadAsync(). Decoupled, back-pressure aware.\n\nBack-pressure: if channel is full (BoundedCapacity=100), Kafka reader blocks — preventing out-of-memory.",
        example:"Saxo: 8 Kafka partitions, 8 consumer instances. Each instance uses a Channel<PaymentEvent> with BoundedCapacity=100 and 3 processing workers (SemaphoreSlim(3)). Kafka reader writes to channel fast. Workers read and call the slow compliance API concurrently, limited to 3 at a time. If channel is full, Kafka reader waits.",
        code:null },
      { term:"Memory & Performance (Span, ArrayPool)",
        why:"High-throughput financial systems must minimise allocations, avoid unnecessary copies, and use zero-copy patterns. Span<T>, Memory<T>, and ArrayPool<T> are the .NET tools for this — directly applicable to your Kafka message processing at Saxo.",
        what:"• Span<T>: a ref struct that represents a contiguous memory slice. Zero allocation for slicing — just a pointer + length. Cannot be stored in fields (ref struct restriction).\n• Memory<T>: the heap-safe equivalent of Span<T>. Can be stored in fields, used with async.\n• ArrayPool<T>: rents pre-allocated arrays from a shared pool. Return when done. Eliminates per-message allocation in hot paths.\n• stackalloc: allocate small buffers on the stack. No GC overhead. Limit: stack ~1MB.\n• String interning: for frequently repeated strings (e.g. currency codes), consider string.Intern().",
        how:"Parse a CSV payment message without allocating: ReadOnlySpan<char> line = rawLine.AsSpan(); var slice = line.Slice(start, length). No string allocation — just a view into the original buffer.\n\nBenchmark with BenchmarkDotNet: [Benchmark] attribute. Run with 'dotnet run -c Release'. Measures mean time, allocated bytes, GC counts per operation.",
        example:"Kafka message deserialisation: each message arrives as byte[]. With ArrayPool: rent a buffer, copy bytes, parse with Span<byte> slices, return buffer. Zero heap allocations for the parsing path. Benchmark: naive (new byte[] per message) = 45ns, 120 bytes allocated; ArrayPool + Span = 38ns, 0 bytes allocated.",
        code:null },
      { term:".NET 8 & Modern Features",
        why:".NET 8 is the current LTS. SDE 3 at Saxo must know what's new: primary constructors, frozen collections, IExceptionHandler, native AOT, and the runtime performance improvements.",
        what:"• Primary constructors (C# 12): class MyService(ILogger logger, IRepo repo) {} — parameters in scope throughout the class. Reduces boilerplate significantly.\n• Collection expressions (C# 12): int[] arr = [1, 2, 3] — unified syntax for all collection types.\n• FrozenDictionary / FrozenSet (.NET 8): read-only, highly optimised. 30–40% faster lookup than Dictionary<> for static data.\n• IExceptionHandler (.NET 8): new middleware pipeline for global exception handling. Testable, injectable.\n• Native AOT: compile .NET to native binary. Cold start: seconds → milliseconds. Great for Lambda/serverless.",
        how:"Primary constructor: public class PaymentProcessor(ILogger<PaymentProcessor> logger, IAccountRepo repo, IKafkaProducer producer) — all three injected and available in all methods.\n\nFrozenDictionary: var currencyMap = new Dictionary<string, CurrencyInfo> { ... }.ToFrozenDictionary(). 30–40% faster lookup for static data.\n\nNative AOT for compliance check Lambda: cold start from 1.8 seconds to 80 milliseconds.",
        example:"Saxo API migration to .NET 8: primary constructors reduced boilerplate in 40 service classes. FrozenDictionary for the account-type-to-processor mapping reduced hot-path lookup time by 35%. Native AOT for the compliance check Lambda: cold start from 1.8s to 80ms — critical for event-triggered compliance workflows that run infrequently.",
        code:null },
      { term:"Deadlocks & Synchronization",
        why:"Deadlocks cause complete thread starvation — the service becomes unresponsive without throwing an exception. SDE 3 must identify, debug, and prevent deadlocks in both DB and application code.",
        what:"Deadlock requires all 4 Coffman conditions simultaneously:\n1. Mutual Exclusion: resource held by only one thread.\n2. Hold and Wait: holds one lock, waiting for another.\n3. No Preemption: locks can only be voluntarily released.\n4. Circular Wait: A waits for B, B waits for A.\n\n• Application deadlock: calling .Result/.Wait() in async code; lock(A) then lock(B) in thread 1 while thread 2 does lock(B) then lock(A).\n• DB deadlock: Txn A locks row 1, waits for row 2. Txn B locks row 2, waits for row 1. SQL Server kills the 'cheaper' transaction.\n• Sync primitives: Monitor (lock keyword, re-entrant), SemaphoreSlim (non-re-entrant, async-compatible), ReaderWriterLockSlim.",
        how:"Prevent application deadlocks:\n• Always acquire locks in the same global order.\n• Keep lock scope minimal — acquire late, release early.\n• Never call external services while holding a lock.\n• Use async all the way — never .Result or .Wait() in async code.\n\nDetect DB deadlocks: sys.dm_exec_requests, sys.dm_os_waiting_tasks. Trace flag 1222 logs detailed deadlock graphs.",
        example:"Saxo async bug: a junior developer called accountRepo.GetBalance(id).Result inside an async controller action. ASP.NET Classic SynchronizationContext caused a deadlock — .Result blocked the only thread available, and the async continuation needed that same thread to resume. Fix: always await. Added async/await guidelines to team PR template. Zero deadlocks after the fix.",
        code:null },
    ],
    keyPoints:["async/await compiles to a state machine — never mix .Result with async code","ConfigureAwait(false) is mandatory in library code — prevents deadlocks and improves performance","Gen 2 and LOH collections cause the longest STW pauses — minimise large allocations","Span<T> is your zero-allocation weapon for parsing and slicing — use in Kafka message deserialization hot paths","SemaphoreSlim with async/await correctly bounds concurrency — never use lock keyword with async/await","ValueTask over Task for sync-path-hot methods (cache hits) — eliminates Task allocation on the happy path"],
    resources:[{title:"CLR via C# — Jeffrey Richter",url:"https://www.microsoftpressstore.com/store/clr-via-c-sharp-9780735667457",desc:"The definitive .NET internals book. GC, threading, type system."},{title:"Stephen Cleary — Async/Await Best Practices",url:"https://learn.microsoft.com/en-us/archive/msdn-magazine/2013/march/async-await-best-practices-in-asynchronous-programming",desc:"Canonical article on async gotchas — ConfigureAwait, deadlocks, async void."},{title:".NET Runtime Team Blog",url:"https://devblogs.microsoft.com/dotnet/",desc:"GC improvements, performance deep-dives, .NET 8 internals from the team."}]
  },
  {
    id:"networking", label:"Networking\n& OS", emoji:"🌐", angle:225, priority:"MEDIUM", weeks:1,
    overview:"Your 16-bit computer project (HDL → assembler → compiler) is an extraordinary foundation. Bridge that to OS internals and networking protocols. These topics appear as depth questions in system design rounds.",
    concepts: [
      { term:"TCP vs UDP & HTTP Evolution",
        why:"Every API call you make traverses TCP. Understanding the TCP three-way handshake, flow control, and congestion avoidance explains why HTTP/2 is faster, why Kafka uses TCP, and when UDP is the right choice.",
        what:"• TCP: reliable, ordered, connection-oriented. Three-way handshake (SYN, SYN-ACK, ACK). Flow control (window size). Congestion control (slow start). Use when data integrity matters.\n• UDP: connectionless, unreliable, no ordering. No handshake. Fastest possible. Use where occasional loss is acceptable (video streaming, gaming, DNS).\n• HTTP/1.1: persistent connections, pipelining, but head-of-line blocking. Text-based headers.\n• HTTP/2: binary framing, multiplexing (multiple streams over one TCP connection — eliminates HTTP-level HOL blocking), header compression (HPACK).\n• HTTP/3 (QUIC): built on UDP. Eliminates TCP HOL blocking entirely. Per-stream independent retransmission. 0-RTT handshake for known servers.",
        how:"Kafka uses TCP: reliable delivery, ordered messages per partition. Kafka's acks mechanism sits on top of TCP reliability.\n\nInternal microservice calls: use HTTP/2 with gRPC for performance. HTTP/2 multiplexing means a single connection handles concurrent RPC calls efficiently.\n\nConnection pooling: HttpClient in .NET must be reused (not created per-request). IHttpClientFactory manages pooled connections with DNS refresh. Creating new HttpClient per request = port exhaustion.",
        example:"Saxo microservice performance: switching internal service-to-service communication from HTTP/1.1 REST to gRPC (HTTP/2) reduced average latency from 12ms to 4ms for concurrent calls, due to multiplexing eliminating per-request connection setup overhead. For market data feeds where a dropped frame is better than a delayed one, UDP would be the right choice — but for payment API calls, TCP's reliability is non-negotiable.",
        code:null },
      { term:"gRPC vs REST vs GraphQL",
        why:"You built paginated Open APIs at Saxo (REST). SDE 3 must know when to use each protocol and articulate the trade-offs precisely.",
        what:"• REST: stateless, resource-based, HTTP verbs, JSON. Simple, universally supported, human-readable. Trade-off: over-fetching, under-fetching, no type safety.\n• gRPC: RPC framework using Protocol Buffers (binary) over HTTP/2. Strongly typed, schema-first. 5–10x smaller payload than JSON. Bi-directional streaming. Trade-off: harder to debug, no browser support without a proxy.\n• GraphQL: client specifies exactly what fields it needs. Single endpoint. Solves over/under-fetching. Trade-off: complex to implement, N+1 query problem on server, harder to cache.",
        how:"When to use REST: public-facing APIs, browser clients, simple CRUD, when developer experience > raw performance. Saxo's Open API for third-party vendors.\n\nWhen to use gRPC: internal microservice-to-microservice communication, high-throughput data pipelines, strongly-typed contracts between teams. Saxo's internal settlement service calls.\n\nWhen to use GraphQL: BFF (Backend For Frontend) pattern where mobile and web apps need different projections of the same data.",
        example:"Saxo architecture: REST for the public Open API (third-party vendors need a standard, browsable API). gRPC for internal settlement microservice calls (5x faster binary protocol, type-safe contracts). Kafka for async event streaming — a fundamentally different communication model (async, durable, replayable) that neither REST nor gRPC replaces.",
        code:null },
      { term:"TLS & Security",
        why:"All Saxo API traffic must be encrypted in transit. SDE 3 must understand TLS handshake, certificate validation, mTLS (mutual TLS for service-to-service auth), and common vulnerabilities.",
        what:"• TLS Handshake (TLS 1.3): ClientHello → ServerHello + certificate + key exchange → client verifies cert, completes key exchange → both derive session keys → encrypted communication begins.\n• ECDHE: Ephemeral Diffie-Hellman key exchange. Provides forward secrecy — past sessions cannot be decrypted even if private key is later compromised.\n• mTLS (Mutual TLS): both client AND server present certificates. Server verifies client identity. Used for service-to-service auth in microservices (zero-trust).\n• Common vulnerabilities: expired certificates (outage), TLS downgrade attacks. Enforce TLS 1.2+, use HSTS, automate certificate rotation.",
        how:"In .NET HttpClient with mTLS: attach client certificate to HttpClientHandler. Server configures Kestrel to require and validate client certificates against a known CA.\n\nCertificate rotation: use Azure Key Vault or Kubernetes secrets with automatic rotation.\n\nJWT security: verify signature (RS256/ES256). Check exp claim. Store refresh tokens server-side (revocable). Never store access tokens in localStorage.",
        example:"Saxo service mesh: all internal microservice calls use mTLS. Each service has a certificate issued by the internal CA. The payment service only accepts calls from services whose certificate chain is signed by the internal CA — prevents lateral movement if one service is compromised.",
        code:null },
      { term:"OS: Processes, Threads, Coroutines",
        why:"Your 16-bit computer project gave you insight into computation at the hardware level. Bridging that to OS concepts — scheduling, context switches, the .NET thread model — makes you exceptional at explaining why async/await is faster than creating one thread per I/O operation.",
        what:"• Process: isolated execution environment — own memory space, file handles, resources. IPC needed to share data.\n• Thread: lightweight execution unit within a process. Shares process's memory space. Context switch ~1 microsecond. Each OS thread = ~1MB stack by default.\n• Context switch: OS saves current thread's register state, restores another's, resumes. Overhead: cache invalidation, pipeline flush.\n• Green threads / Coroutines: user-space scheduled, cooperative. No OS context switch. .NET async/await = coroutines (state machines).\n• .NET ThreadPool: manages a pool of OS threads. Adding threads above CPU count doesn't increase CPU-bound throughput.",
        how:"I/O-bound vs CPU-bound: I/O-bound tasks spend most time waiting. Async/await releases the thread while waiting — one thread handles thousands of concurrent I/O operations. CPU-bound tasks need as many threads as CPU cores.\n\nThread starvation: too many synchronous blocking calls (.Result) exhaust the ThreadPool. Async incoming requests queue up. Service becomes unresponsive.\n\nParallelism: for CPU-bound work, use Parallel.ForEach or Task.Run to utilise all cores.",
        example:"Saxo Kafka consumer: 1,000 concurrent message processings with 1,000 OS threads would require 1,000 x 1MB stack = 1GB RAM just for stacks. With async/await: one ThreadPool thread initiates 1,000 DB calls asynchronously. All 1,000 are 'in-flight' using OS I/O completion ports (IOCP on Windows, epoll on Linux). Thread freed while waiting. Memory: negligible.",
        code:null },
      { term:"Virtual Memory & OS I/O",
        why:"Understanding virtual memory explains why processes are isolated, how memory-mapped files work, and why Kafka is so fast. OS I/O models explain the fundamental advantage of epoll/IOCP-based async I/O in Kafka and ASP.NET Core.",
        what:"• Virtual memory: each process sees its own virtual address space. OS and MMU translate virtual → physical addresses via page tables. TLB caches recent translations.\n• Page fault: process accesses a virtual page not in RAM. OS pauses the process, loads the page from disk, resumes. Can take milliseconds.\n• Memory-mapped files (mmap): map a file to a virtual address range. Reading the file = reading memory. Kafka uses this for log segment reads.\n• OS page cache: OS caches recently accessed disk pages in RAM. Hot data served from RAM — near-memory speed.\n• I/O models: blocking (thread blocks), non-blocking (returns immediately), async/IOCP (kernel notifies on completion — what .NET uses internally).",
        how:"Kafka performance: brokers use mmap for log segment reads. OS page cache serves reads from RAM if the page is hot. Zero-copy sendfile() for consumers: OS copies directly from page cache to network socket, bypassing JVM heap entirely.\n\n.NET async I/O: when await StreamReader.ReadAsync() is called, .NET registers the read with IOCP. Thread returned to pool. OS completes the read, posts completion. A ThreadPool thread picks it up and resumes the state machine.",
        example:"Kafka broker with 32GB RAM: JVM uses 6GB. OS page cache uses 26GB. The most recent 26GB of log data is served from RAM. Producers get low-latency acknowledgements because the leader writes to the page cache (OS flushes to disk asynchronously). This is why you should allocate as little heap to the JVM as needed and let the OS page cache have the rest.",
        code:null },
      { term:"DNS & Load Balancing Internals",
        why:"DNS is the first thing that happens on any client request. DNS misconfiguration or stale caching causes outages. SDE 3 must understand the full resolution chain and how it interacts with load balancing, service discovery, and deployment strategies.",
        what:"• DNS resolution: client cache → OS cache → recursive resolver → root name server → TLD name server → authoritative name server → returns IP. TTL controls caching duration at each step.\n• DNS load balancing: authoritative server returns multiple A records. Client picks one. No health checking.\n• TTL tuning: low TTL (30s) = fast failover, higher DNS query volume. High TTL (3600s) = efficient caching, slow failover.\n• Service discovery vs DNS: Kubernetes CoreDNS provides service discovery (service name → ClusterIP). kube-proxy DNAT forwards to a ready pod IP.\n• HttpClient DNS caching in .NET: IHttpClientFactory rotates connections per DNS TTL (SocketsHttpHandler.PooledConnectionLifetime = 2 minutes).",
        how:"Blue-green deployment with DNS: blue is live (TTL=60s). After green smoke tests pass, update DNS to green. Wait 60s for TTL expiry. All traffic on green. Rollback: flip DNS back to blue.\n\nWeighted DNS (AWS Route 53): send 10% traffic to new deployment, 90% to stable. Increase gradually — canary rollout via DNS weighting.\n\nTTL best practice: lower TTL to 60s for all production domains 24 hours before any IP-changing maintenance.",
        example:"Saxo incident: a certificate renewal required a new load balancer IP. The old DNS A record had TTL=3600. Some clients cached the old IP for up to an hour, causing connection failures. Fix: lowered TTL to 60s for all production domains 24 hours before any IP-changing maintenance. Documented as a standard pre-change checklist item.",
        code:null },
    ],
    keyPoints:["TCP's reliability guarantees come at a cost: 3-way handshake latency, retransmission delays, HOL blocking — know when UDP or QUIC is better","HTTP/2 multiplexing eliminates HTTP-level HOL blocking but not TCP-level — HTTP/3 (QUIC over UDP) solves both","gRPC's binary Protocol Buffers are 5–10x more compact than JSON — significant for high-frequency internal service calls","mmap is the secret to Kafka's performance: OS page cache handles buffering, zero-copy sendfile() for consumers","Your 16-bit computer project bridges directly to process context switching and OS scheduling","Lower DNS TTL to 60s 24 hours before any IP-changing maintenance — this was a real Saxo incident lesson"],
    resources:[{title:"High Performance Browser Networking (Free)",url:"https://hpbn.co",desc:"Ilya Grigorik. Deep TCP, UDP, TLS, HTTP/1–2–3, WebSocket internals."},{title:"Beej's Guide to Network Programming (Free)",url:"https://beej.us/guide/bgnet/",desc:"Best practical guide to sockets and TCP/IP from first principles."},{title:"OSTEPs — OS: Three Easy Pieces (Free)",url:"https://pages.cs.wisc.edu/~remzi/OSTEP/",desc:"Free OS textbook — scheduling, virtual memory, concurrency, filesystems."}]
  }
];

// ── Graph constants ───────────────────────────────────────────────────────
var CX = 260, CY = 215, R = 155;
var GEDGES = [["system","distributed"],["system","database"],["system","patterns"],["distributed","database"],["distributed","patterns"],["dsa","system"],["language","distributed"],["behavioral","system"]];
var PRICOLORS = { CRITICAL:"#ef4444", HIGH:"#f59e0b", MEDIUM:"#10b981" };
var STABS = [{id:"why",label:"❓ WHY",col:"#ef4444"},{id:"what",label:"📖 WHAT",col:"#3b82f6"},{id:"how",label:"⚙️ HOW",col:"#f59e0b"},{id:"example",label:"💡 Example",col:"#10b981"},{id:"code",label:"💻 Code",col:"#8b5cf6"},{id:"notes",label:"📝 Notes",col:"#0891b2"}];

function svgPos(deg) {
  var rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

// ── Progress helpers ──────────────────────────────────────────────────────
function initProg() {
  var p = {};
  NODES.forEach(function(n) { p[n.id] = { c: {}, k: Array(n.keyPoints.length).fill(false) }; });
  return p;
}
function mergeProg(base, saved) {
  if (!saved) return base;
  var p = Object.assign({}, base);
  NODES.forEach(function(n) {
    if (saved[n.id]) {
      p[n.id] = {
        c: saved[n.id].c || {},
        k: Array(n.keyPoints.length).fill(false).map(function(_, i) { return !!(saved[n.id].k && saved[n.id].k[i]); })
      };
    }
  });
  return p;
}
function nodeStats(prog, n) {
  var dc = n.concepts.filter(function(c) { return prog[n.id].c[c.term]; }).length;
  var dk = prog[n.id].k.filter(Boolean).length;
  return { dc: dc, dk: dk, pct: Math.round(((dc + dk) / (n.concepts.length + n.keyPoints.length)) * 100) };
}

// ── CodeBlock ─────────────────────────────────────────────────────────────
function CodeBlock(props) {
  var code = props.code, T = props.T;
  var copied = useState(false);
  var cp = copied[0], setCp = copied[1];
  return React.createElement("div", { style: { position:"relative", marginTop:12 } },
    React.createElement("div", { style: { background:T.codeBg, borderRadius:8, padding:"14px 16px", overflow:"auto" } },
      React.createElement("pre", { style: { margin:0, fontFamily:"'Courier New',monospace", fontSize:12, lineHeight:1.7, color:T.codeText, whiteSpace:"pre" } }, code)
    ),
    React.createElement("button", {
      onClick: function() { navigator.clipboard && navigator.clipboard.writeText(code); setCp(true); setTimeout(function() { setCp(false); }, 2000); },
      style: { position:"absolute", top:8, right:8, padding:"3px 9px", fontSize:10, cursor:"pointer", borderRadius:4, background:cp?"#10b981":"#334155", border:"none", color:"#fff", fontFamily:"inherit", fontWeight:600 }
    }, cp ? "✓" : "Copy")
  );
}

// ── NoteEditor ────────────────────────────────────────────────────────────
function NoteEditor(props) {
  var topicId = props.topicId, T = props.T, nc = props.nc;
  var isAuthenticated = props.isAuthenticated, token = props.token, onOpenAuthModal = props.onOpenAuthModal;
  var statusState = React.useState('idle'), status = statusState[0], setStatus = statusState[1];
  var editorRef = React.useRef(null);
  var timerRef  = React.useRef(null);
  var savedRangeRef = React.useRef(null);

  React.useEffect(function() {
    if (!isAuthenticated || !editorRef.current) return;
    setStatus('loading');
    fetch('/api/notes/' + encodeURIComponent(topicId), {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) {
      if (r.status === 404) return { content: '' };
      if (!r.ok) throw new Error('load');
      return r.json();
    }).then(function(data) {
      if (editorRef.current) editorRef.current.innerHTML = data.content || '';
      setStatus('idle');
    }).catch(function() { setStatus('idle'); });
  }, [isAuthenticated, topicId, token]);

  function doSave() {
    if (!editorRef.current) return;
    var html = editorRef.current.innerHTML;
    fetch('/api/notes/' + encodeURIComponent(topicId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content: html })
    }).then(function(r) {
      if (!r.ok) throw new Error('save');
      setStatus('saved');
      setTimeout(function() { setStatus('idle'); }, 2000);
    }).catch(function() { setStatus('error'); });
  }

  function handleInput() {
    clearTimeout(timerRef.current);
    setStatus('saving');
    timerRef.current = setTimeout(doSave, 1500);
  }

  function execCmd(cmd, val) {
    if (editorRef.current) editorRef.current.focus();
    document.execCommand(cmd, false, val || null);
  }

  function insertLink() {
    var url = prompt('Enter URL:');
    if (!url) return;
    if (editorRef.current) editorRef.current.focus();
    document.execCommand('createLink', false, url);
    if (editorRef.current) {
      var links = editorRef.current.querySelectorAll('a[href="' + url + '"]');
      links.forEach(function(a) { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    }
    handleInput();
  }

  function handleImageChange(e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    setStatus('uploading');
    var formData = new FormData();
    formData.append('image', file);
    fetch('/api/notes/images/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    }).then(function(r) {
      if (!r.ok) throw new Error('upload');
      return r.json();
    }).then(function(data) {
      var imgHtml = '<img src="' + data.url + '" style="max-width:100%;border-radius:8px;margin:8px 0;" />';
      if (savedRangeRef.current && editorRef.current) {
        editorRef.current.focus();
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
        document.execCommand('insertHTML', false, imgHtml);
      } else if (editorRef.current) {
        editorRef.current.innerHTML += imgHtml;
      }
      handleInput();
    }).catch(function() { setStatus('error'); alert('Upload failed'); });
  }

  var btnS = { padding:'4px 9px', fontSize:11, cursor:'pointer', borderRadius:5, background:T.muted, border:'1px solid ' + T.border, color:T.text2, fontFamily:'inherit', fontWeight:700, lineHeight:'1.4' };

  if (!isAuthenticated) {
    return React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:160, gap:10 } },
      React.createElement('div', { style:{ fontSize:13, color:T.text2 } }, 'Enter PIN to sync notes'),
      React.createElement('button', { onClick:onOpenAuthModal, style:{ padding:'7px 18px', cursor:'pointer', borderRadius:6, background:nc, border:'none', color:'#fff', fontFamily:'inherit', fontSize:12, fontWeight:600 } }, '🔐 Sign In')
    );
  }

  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8, padding:'6px 8px', background:T.card, borderRadius:8, border:'1px solid ' + T.border } },
      React.createElement('button', { onMouseDown:function(e){ e.preventDefault(); execCmd('bold'); }, style:Object.assign({}, btnS, { fontWeight:900 }) }, 'B'),
      React.createElement('button', { onMouseDown:function(e){ e.preventDefault(); execCmd('italic'); }, style:Object.assign({}, btnS, { fontStyle:'italic' }) }, 'I'),
      React.createElement('button', { onMouseDown:function(e){ e.preventDefault(); execCmd('formatBlock','h3'); }, style:btnS }, 'H3'),
      React.createElement('button', { onMouseDown:function(e){ e.preventDefault(); execCmd('insertUnorderedList'); }, style:btnS }, '• List'),
      React.createElement('button', { onMouseDown:function(e){ e.preventDefault(); insertLink(); }, style:btnS }, '🔗 Link'),
      React.createElement('label', { style:Object.assign({}, btnS, { display:'inline-flex', alignItems:'center', gap:3, cursor:'pointer' }),
        onMouseDown:function() { var sel = window.getSelection(); if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange(); }
      },
        '🖼 Image',
        React.createElement('input', { type:'file', accept:'image/*', style:{ display:'none' }, onChange:handleImageChange })
      )
    ),
    React.createElement('div', {
      ref: editorRef,
      contentEditable: true,
      suppressContentEditableWarning: true,
      onInput: handleInput,
      style:{ minHeight:200, padding:'14px 16px', borderRadius:8, background:T.card, color:T.text, border:'1.5px solid ' + T.border, fontSize:13, lineHeight:1.8, outline:'none', wordBreak:'break-word' }
    }),
    React.createElement('div', { style:{ fontSize:11, marginTop:6, color: status === 'error' ? '#ef4444' : status === 'saved' ? '#10b981' : T.text3 } },
      status === 'loading' ? 'Loading...' : status === 'saving' ? 'Saving...' : status === 'uploading' ? 'Uploading...' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed' : ''
    )
  );
}

// ── ConceptCard ───────────────────────────────────────────────────────────
function ConceptCard(props) {
  var concept = props.concept, done = props.done, onToggle = props.onToggle, nc = props.nc, T = props.T;
  var isAuthenticated = props.isAuthenticated, token = props.token, onOpenAuthModal = props.onOpenAuthModal, nodeId = props.nodeId;
  var openState = useState(false), open = openState[0], setOpen = openState[1];
  var subState = useState("why"), sub = subState[0], setSub = subState[1];

  var avail = STABS.filter(function(t) { return t.id !== "code" || (concept.code && concept.code.trim().length > 0); });

  return React.createElement("div", { style: { marginBottom:10 } },
    React.createElement("div", {
      style: { background:T.card, border:"1.5px solid " + (done ? nc + "88" : open ? nc + "55" : T.border), borderRadius:open?"10px 10px 0 0":"10px", padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }
    },
      React.createElement("div", {
        onClick: function(e) { e.stopPropagation(); onToggle(); },
        style: { width:20, height:20, borderRadius:5, flexShrink:0, background:done?nc:T.card, border:"2px solid " + (done?nc:T.border2), display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }
      }, done ? React.createElement("span", { style: { color:T.ckFg, fontSize:12, fontWeight:800, lineHeight:1 } }, "✓") : null),
      React.createElement("span", {
        onClick: function() { setOpen(!open); },
        style: { flex:1, color:done?nc+"99":T.text, fontSize:13, fontWeight:600, textDecoration:done?"line-through":"none" }
      }, concept.term),
      React.createElement("span", { onClick: function() { setOpen(!open); }, style: { color:T.text3, fontSize:12 } }, open ? "▲" : "▼")
    ),
    open ? React.createElement("div", { style: { background:T.muted, border:"1.5px solid " + nc + "30", borderTop:"none", borderRadius:"0 0 10px 10px" } },
      React.createElement("div", { style: { display:"flex", gap:2, padding:"10px 14px 0", overflowX:"auto" } },
        avail.map(function(t) {
          return React.createElement("button", {
            key: t.id,
            onClick: function() { setSub(t.id); },
            style: { padding:"5px 12px", fontSize:11, fontWeight:600, borderRadius:"6px 6px 0 0", border:"1px solid " + (sub===t.id ? t.col+"66" : T.border), borderBottom:"1px solid " + (sub===t.id ? T.muted : T.border), background:sub===t.id?T.card:T.muted, color:sub===t.id?t.col:T.text3, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }
          }, t.label);
        })
      ),
      React.createElement("div", { style: { padding:"14px 16px", borderTop:"1px solid " + T.border, fontSize:13, lineHeight:1.8, color:T.text2, whiteSpace: sub === "notes" ? "normal" : "pre-wrap" } },
        sub === "why" ? concept.why : sub === "what" ? concept.what : sub === "how" ? concept.how : sub === "example" ? concept.example : sub === "code" && concept.code ? React.createElement(CodeBlock, { code:concept.code, T:T }) : sub === "notes" ? React.createElement(NoteEditor, { topicId: nodeId + "_" + concept.term, T:T, nc:nc, isAuthenticated:isAuthenticated, token:token, onOpenAuthModal:onOpenAuthModal }) : null
      ),
      sub !== "notes" ? React.createElement("div", { style: { padding:"0 16px 14px", display:"flex", justifyContent:"flex-end" } },
        React.createElement("button", {
          onClick: onToggle,
          style: { padding:"6px 14px", fontSize:11, cursor:"pointer", borderRadius:6, background:done?T.muted:nc, border:done?"1px solid " + T.border2:"none", color:done?T.text3:"#fff", fontFamily:"inherit", fontWeight:600 }
        }, done ? "↩ Mark unread" : "✓ Mark understood")
      ) : null
    ) : null
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  var tmState = useState("light"), themeMode = tmState[0], setThemeMode = tmState[1];
  var hxState = useState("#6366f1"), customHex = hxState[0], setCustomHex = hxState[1];
  var T = useMemo(function() { return buildTheme(themeMode, customHex); }, [themeMode, customHex]);

  var selState = useState(null), selId = selState[0], setSelId = selState[1];
  var tabState = useState("concepts"), tab = tabState[0], setTab = tabState[1];
  var hovState = useState(null), hovId = hovState[0], setHovId = hovState[1];
  var progState = useState(initProg), prog = progState[0], setProg = progState[1];
  var readyState = useState(false), ready = readyState[0], setReady = readyState[1];
  var rstState = useState(false), showReset = rstState[0], setShowReset = rstState[1];

  // ── Auth state ──────────────────────────────────────────────────────────
  var tkState  = useState(function() { return localStorage.getItem('sde3_auth_token') || null; }), token = tkState[0], setToken = tkState[1];
  var authState = useState(false), isAuthenticated = authState[0], setIsAuthenticated = authState[1];
  var authModalState = useState(false), showAuthModal = authModalState[0], setShowAuthModal = authModalState[1];
  var pinState = useState(''), pinInput = pinState[0], setPinInput = pinState[1];
  var authErrState = useState(''), authError = authErrState[0], setAuthError = authErrState[1];
  var authLoadState = useState(false), authLoading = authLoadState[0], setAuthLoading = authLoadState[1];

  useEffect(function() {
    clog('APP', '→ app mounted — loading progress...');
    store.get(SKEY).then(function(saved) {
      if (saved) {
        clog('APP', '✅ progress loaded — merging into state');
        setProg(mergeProg(initProg(), saved));
      } else {
        clog('APP', '→ no saved progress found — using fresh state');
      }
      setReady(true);
    });
  }, []);
  useEffect(function() {
    if (ready) {
      clog('APP', '→ progress changed — triggering save...');
      store.set(SKEY, prog);
    }
  }, [prog, ready]);

  // Verify stored token on load
  useEffect(function() {
    var t = localStorage.getItem('sde3_auth_token');
    if (!t) { clog('AUTH', '→ no stored token found'); return; }
    clog('AUTH', '→ found stored token — verifying with server...');
    fetch('/api/auth/verify', { headers: { 'Authorization': 'Bearer ' + t } })
      .then(function(r) {
        clog('AUTH', '← verify response status:', r.status);
        if (r.ok) { clog('AUTH', '✅ token valid — user authenticated'); setIsAuthenticated(true); }
        else { clog('AUTH', '❌ token invalid/expired — clearing'); localStorage.removeItem('sde3_auth_token'); setToken(null); }
      })
      .catch(function(e) { clog('AUTH', '❌ verify fetch failed:', e.message); });
  }, []);

  var openAuthModal = useCallback(function() { setShowAuthModal(true); setPinInput(''); setAuthError(''); }, []);
  var handleLogin = useCallback(function(pin) {
    clog('AUTH', '→ login attempt — PIN length:', String(pin).length);
    setAuthLoading(true);
    fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ pin: pin }) })
      .then(function(r) {
        clog('AUTH', '← login response status:', r.status);
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
      })
      .then(function(d) {
        clog('AUTH', '✅ login successful — token received, storing');
        localStorage.setItem('sde3_auth_token', d.token); setToken(d.token); setIsAuthenticated(true); setShowAuthModal(false); setAuthLoading(false);
      })
      .catch(function(e) { clog('AUTH', '❌ login failed:', e.message); setAuthError('Invalid PIN'); setAuthLoading(false); });
  }, []);
  var handleLogout = useCallback(function() { clog('AUTH', '→ logout'); localStorage.removeItem('sde3_auth_token'); setToken(null); setIsAuthenticated(false); }, []);

  var toggleConcept = useCallback(function(nid, term) {
    clog('PROGRESS', '→ toggle concept — topic=' + nid + ', concept="' + term + '"');
    setProg(function(p) { var nc2 = Object.assign({}, p[nid].c); nc2[term] = !nc2[term]; clog('PROGRESS', '→ concept "' + term + '" set to', nc2[term]); return Object.assign({}, p, { [nid]: Object.assign({}, p[nid], { c: nc2 }) }); });
  }, []);
  var toggleKP = useCallback(function(nid, i) {
    clog('PROGRESS', '→ toggle key point — topic=' + nid + ', index=' + i);
    setProg(function(p) { return Object.assign({}, p, { [nid]: Object.assign({}, p[nid], { k: p[nid].k.map(function(v, j) { return j === i ? !v : v; }) }) }); });
  }, []);

  var totalC = NODES.reduce(function(s,n) { return s + n.concepts.length; }, 0);
  var totalK = NODES.reduce(function(s,n) { return s + n.keyPoints.length; }, 0);
  var doneC  = NODES.reduce(function(s,n) { return s + n.concepts.filter(function(c) { return prog[n.id].c[c.term]; }).length; }, 0);
  var doneK  = NODES.reduce(function(s,n) { return s + prog[n.id].k.filter(Boolean).length; }, 0);
  var oPct   = Math.round(((doneC + doneK) / (totalC + totalK)) * 100);

  var node    = NODES.find(function(n) { return n.id === selId; });
  var nodeIdx = node ? NODES.findIndex(function(n) { return n.id === node.id; }) : 0;
  var nc      = T.nc[nodeIdx] || T.accent;
  var ns      = node ? nodeStats(prog, node) : null;

  return (
    <div style={{ background:T.bg, minHeight:"100vh", fontFamily:"Inter,system-ui,sans-serif", color:T.text }}>
      <style>{`*{box-sizing:border-box}@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${T.bg}}::-webkit-scrollbar-thumb{background:${T.border2};border-radius:3px}`}</style>

      {/* HEADER */}
      <div style={{ background:T.card, borderBottom:"1px solid " + T.border, padding:"12px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:10, color:T.accent, letterSpacing:"0.12em", marginBottom:2, fontWeight:700, textTransform:"uppercase" }}>SDE 3 Interview Prep · 57 Topics · WHY / WHAT / HOW</div>
          <div style={{ fontSize:18, fontWeight:700 }}>Mohd Haarish <span style={{ color:T.accent }}>→ SDE 3</span></div>
          <div style={{ fontSize:11, color:T.text3 }}>Saxo Group · Distributed Systems · C#/.NET · Apache Kafka</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:24, fontWeight:800, color:oPct===100?"#10b981":T.accent }}>{oPct}%</div>
            <div style={{ fontSize:10, color:T.text3 }}>Overall</div>
          </div>
          <div style={{ width:148 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginBottom:3 }}><span>📖 Concepts</span><span>{doneC}/{totalC}</span></div>
            <div style={{ height:5, background:T.track, borderRadius:3, overflow:"hidden", marginBottom:5 }}>
              <div style={{ height:"100%", width:((doneC/totalC)*100) + "%", background:T.pg1, borderRadius:3 }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginBottom:3 }}><span>✦ Key Points</span><span>{doneK}/{totalK}</span></div>
            <div style={{ height:5, background:T.track, borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:((doneK/totalK)*100) + "%", background:T.pg2, borderRadius:3 }} />
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ display:"flex", gap:5 }}>
              {[["light","☀️ Light"],["dark","🌙 Dark"],["custom","🎨 Custom"]].map(function(item) {
                var m = item[0], lbl = item[1];
                return (
                  <button key={m} onClick={function() { setThemeMode(m); }}
                    style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, border:"1.5px solid " + (themeMode===m?T.accent:T.border), background:themeMode===m?T.accent+"18":T.card, color:themeMode===m?T.accent:T.text3 }}>
                    {lbl}
                  </button>
                );
              })}
            </div>
            {themeMode === "custom" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", background:T.muted, borderRadius:8, border:"1px solid " + T.border, flexWrap:"wrap" }}>
                <label style={{ position:"relative", cursor:"pointer", flexShrink:0 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:customHex, border:"2px solid " + T.border2 }} />
                  <input type="color" value={customHex} onChange={function(e) { setCustomHex(e.target.value); }}
                    style={{ position:"absolute", opacity:0, width:24, height:24, top:0, left:0, cursor:"pointer" }} />
                </label>
                {PRESETS.map(function(c) {
                  return (
                    <div key={c} onClick={function() { setCustomHex(c); }}
                      style={{ width:16, height:16, borderRadius:"50%", background:c, cursor:"pointer", border:customHex===c?"2.5px solid " + T.text:"2px solid transparent", flexShrink:0 }} />
                  );
                })}
                <span style={{ fontSize:9, color:T.text3 }}>→</span>
                {T.nc.map(function(c, i) { return <div key={i} style={{ width:13, height:13, borderRadius:3, background:c, flexShrink:0 }} />; })}
              </div>
            )}
            <div style={{ display:"flex", gap:6, alignSelf:"flex-end" }}>
              <button onClick={function() { setShowReset(true); }}
                style={{ padding:"4px 10px", fontSize:10, cursor:"pointer", borderRadius:5, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit" }}>
                ↺ Reset
              </button>
              {isAuthenticated ? (
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:10, color:"#10b981", fontWeight:600 }}>Notes ✓</span>
                  <button onClick={handleLogout} style={{ padding:"4px 10px", fontSize:10, cursor:"pointer", borderRadius:5, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit" }}>Sign Out</button>
                </div>
              ) : (
                <button onClick={openAuthModal} style={{ padding:"4px 10px", fontSize:10, cursor:"pointer", borderRadius:5, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit" }}>🔐 Notes Login</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RESET MODAL */}
      {showReset && (
        <div style={{ position:"fixed", inset:0, background:T.isDark?"rgba(0,0,0,0.75)":"rgba(15,23,42,0.4)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:T.card, border:"1px solid " + T.border, borderRadius:12, padding:"26px 30px", textAlign:"center", maxWidth:300 }}>
            <div style={{ fontSize:15, color:"#ef4444", fontWeight:700, marginBottom:8 }}>Reset All Progress?</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:20, lineHeight:1.6 }}>This will clear all your tracked concepts and key points. Cannot be undone.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={function() { setProg(initProg()); setShowReset(false); }}
                style={{ padding:"7px 18px", cursor:"pointer", borderRadius:6, background:"#fef2f2", border:"1px solid #fca5a5", color:"#ef4444", fontFamily:"inherit", fontSize:12, fontWeight:600 }}>
                Yes, Reset
              </button>
              <button onClick={function() { setShowReset(false); }}
                style={{ padding:"7px 18px", cursor:"pointer", borderRadius:6, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit", fontSize:12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN AUTH MODAL */}
      {showAuthModal && (
        <div style={{ position:"fixed", inset:0, background:T.isDark?"rgba(0,0,0,0.75)":"rgba(15,23,42,0.4)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:T.card, border:"1px solid " + T.border, borderRadius:12, padding:"26px 30px", textAlign:"center", maxWidth:320, width:"90%" }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:6 }}>🔐 Notes Sign In</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:18, lineHeight:1.6 }}>Enter your PIN to sync notes across devices.</div>
            <input
              type="password"
              placeholder="Enter PIN"
              value={pinInput}
              onChange={function(e) { setPinInput(e.target.value); setAuthError(''); }}
              onKeyDown={function(e) { if (e.key === 'Enter' && pinInput) handleLogin(pinInput); }}
              autoFocus
              style={{ width:"100%", padding:"9px 12px", fontSize:13, borderRadius:7, border:"1.5px solid " + (authError ? "#ef4444" : T.border), background:T.bg, color:T.text, outline:"none", fontFamily:"inherit", marginBottom: authError ? 6 : 16, boxSizing:"border-box" }}
            />
            {authError && <div style={{ fontSize:11, color:"#ef4444", marginBottom:12 }}>{authError}</div>}
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={function() { if (pinInput) handleLogin(pinInput); }} disabled={authLoading}
                style={{ padding:"8px 22px", cursor:"pointer", borderRadius:6, background:T.accent, border:"none", color:"#fff", fontFamily:"inherit", fontSize:13, fontWeight:600, opacity:authLoading?0.7:1 }}>
                {authLoading ? "Signing in…" : "Sign In"}
              </button>
              <button onClick={function() { setShowAuthModal(false); }}
                style={{ padding:"8px 16px", cursor:"pointer", borderRadius:6, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit", fontSize:12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", minHeight:"calc(100vh - 128px)" }}>

        {/* LEFT: Graph */}
        <div style={{ flex:"0 0 auto", width:"100%", maxWidth:520, borderRight:"1px solid " + T.border, padding:"10px 8px 12px", background:T.card }}>
          <div style={{ display:"flex", gap:12, marginBottom:4, paddingLeft:8, flexWrap:"wrap", alignItems:"center" }}>
            {Object.entries(PRICOLORS).map(function(entry) {
              return (
                <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:600 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:entry[1] }} />
                  <span style={{ color:T.text3 }}>{entry[0]}</span>
                </div>
              );
            })}
            <span style={{ marginLeft:"auto", fontSize:10, color:T.text3 }}>Arc = progress</span>
          </div>

          <svg viewBox="0 0 520 430" style={{ width:"100%", display:"block" }}>
            <defs>
              <filter id="s1"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" /></filter>
              <filter id="s2"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" /></filter>
            </defs>
            {GEDGES.map(function(edge, i) {
              var pa = svgPos(NODES.find(function(n) { return n.id === edge[0]; }).angle);
              var pb = svgPos(NODES.find(function(n) { return n.id === edge[1]; }).angle);
              return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={T.border} strokeWidth={1} strokeDasharray="4 5" />;
            })}
            {NODES.map(function(n, i) {
              var p = svgPos(n.angle), isSel = n.id === selId, c = T.nc[i];
              return <line key={n.id} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={isSel?c:T.border2} strokeWidth={isSel?2:1} strokeDasharray="5 5" opacity={isSel?1:0.6} />;
            })}
            <circle cx={CX} cy={CY} r={52} fill={T.card} stroke={T.border} strokeWidth={2} filter="url(#s1)" />
            <circle cx={CX} cy={CY} r={52} fill="none" stroke={oPct===100?"#10b981":T.accent} strokeWidth={4}
              strokeDasharray={(((doneC+doneK)/(totalC+totalK))*327) + " 327"} strokeLinecap="round"
              transform={"rotate(-90 " + CX + " " + CY + ")"} />
            <text x={CX} y={CY-6} textAnchor="middle" fill={oPct===100?"#10b981":T.accent} fontSize={16} fontWeight="800" fontFamily="Inter,sans-serif">{oPct}%</text>
            <text x={CX} y={CY+11} textAnchor="middle" fill={T.text3} fontSize={9} fontFamily="Inter,sans-serif">OVERALL</text>
            {NODES.map(function(n, i) {
              var p = svgPos(n.angle), isSel = n.id === selId, isHov = n.id === hovId, c = T.nc[i];
              var st = nodeStats(prog, n), circ = 2 * Math.PI * 36, lines = n.label.split("\n");
              return (
                <g key={n.id} style={{ cursor:"pointer" }}
                  onClick={function() { setSelId(n.id === selId ? null : n.id); setTab("concepts"); }}
                  onMouseEnter={function() { setHovId(n.id); }}
                  onMouseLeave={function() { setHovId(null); }}>
                  <circle cx={p.x} cy={p.y} r={38} fill={T.card} filter="url(#s2)" />
                  <circle cx={p.x} cy={p.y} r={36} fill={isSel?c+"18":isHov?c+"0a":T.card} stroke={isSel?c:isHov?c+"88":T.border} strokeWidth={isSel?2.5:1.5} />
                  {st.pct > 0 && (
                    <circle cx={p.x} cy={p.y} r={36} fill="none" stroke={st.pct===100?"#10b981":c}
                      strokeWidth={4} strokeDasharray={((st.pct/100)*circ) + " " + circ}
                      strokeLinecap="round" transform={"rotate(-90 " + p.x + " " + p.y + ")"} opacity={0.85} />
                  )}
                  <text x={p.x} y={p.y-9} textAnchor="middle" fontSize={15}>{n.emoji}</text>
                  {lines.map(function(line, li) {
                    return <text key={li} x={p.x} y={p.y+5+li*11} textAnchor="middle" fill={isSel?c:T.text2} fontSize={8.5} fontWeight={isSel?"700":"500"} fontFamily="Inter,sans-serif">{line}</text>;
                  })}
                  <text x={p.x} y={p.y+34} textAnchor="middle" fill={st.pct===100?"#10b981":T.text3} fontSize={8} fontFamily="Inter,sans-serif">{st.pct===100?"✓ Done":st.pct+"%"}</text>
                  <circle cx={p.x+27} cy={p.y-27} r={5} fill={PRICOLORS[n.priority]} />
                </g>
              );
            })}
          </svg>

          <div style={{ padding:"4px 8px", display:"flex", flexWrap:"wrap", gap:5 }}>
            {NODES.map(function(n, i) {
              var pct = nodeStats(prog, n).pct, isSel = n.id === selId, c = T.nc[i];
              return (
                <div key={n.id}
                  onClick={function() { setSelId(isSel?null:n.id); setTab("concepts"); }}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:500, background:isSel?c+"18":T.muted, border:"1.5px solid " + (isSel?c:T.border), color:isSel?c:T.text2 }}>
                  <span>{n.emoji}</span>
                  <span>{n.label.replace("\n", " ")}</span>
                  <span style={{ color:pct===100?"#10b981":T.text3, fontWeight:600, fontSize:10 }}>{pct===100?"✓":pct+"%"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Study panel */}
        <div style={{ flex:1, minWidth:300, display:"flex", flexDirection:"column", overflow:"hidden", background:T.bg }}>
          {!node ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:32 }}>
              <div style={{ fontSize:48, marginBottom:14 }}>👆</div>
              <div style={{ fontSize:15, color:T.text2, lineHeight:1.7, fontWeight:500 }}>Click any node to open full study material</div>
              <div style={{ fontSize:12, color:T.text3, marginTop:6 }}>Each concept has WHY / WHAT / HOW / Example / Code tabs. Progress saved automatically.</div>
              <div style={{ marginTop:24, width:"100%", maxWidth:420 }}>
                {NODES.map(function(n, i) {
                  var st = nodeStats(prog, n), tot = n.concepts.length + n.keyPoints.length, c = T.nc[i];
                  return (
                    <div key={n.id} onClick={function() { setSelId(n.id); }}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", marginBottom:6, background:T.card, border:"1px solid " + T.border, borderRadius:10, cursor:"pointer" }}>
                      <span style={{ fontSize:18 }}>{n.emoji}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, color:T.text2, fontWeight:600 }}>{n.label.replace("\n"," ")}</span>
                          <span style={{ fontSize:11, color:st.pct===100?"#10b981":T.text3, fontWeight:600 }}>{st.dc+st.dk}/{tot}</span>
                        </div>
                        <div style={{ height:5, background:T.track, borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:st.pct+"%", background:st.pct===100?"#10b981":c, borderRadius:3 }} />
                        </div>
                      </div>
                      <span style={{ fontSize:12, color:st.pct===100?"#10b981":T.text3, fontWeight:700, minWidth:34, textAlign:"right" }}>{st.pct===100?"✓":st.pct+"%"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", height:"100%", animation:"fi .25s ease" }}>
              {/* Node header */}
              <div style={{ padding:"16px 22px 0", borderBottom:"1px solid " + T.border, flexShrink:0, background:T.card }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:12 }}>
                  <div style={{ width:52, height:52, borderRadius:12, background:nc+"18", border:"2px solid " + nc+"44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{node.emoji}</div>
                  <div style={{ flex:1 }}>
                    <h2 style={{ margin:"0 0 6px", fontSize:18, fontWeight:700, color:nc }}>{node.label.replace("\n"," ")}</h2>
                    <div style={{ display:"flex", gap:8, alignItems:"center", fontSize:11, flexWrap:"wrap" }}>
                      <span style={{ padding:"2px 8px", borderRadius:4, background:PRICOLORS[node.priority]+"22", border:"1px solid " + PRICOLORS[node.priority]+"55", color:PRICOLORS[node.priority], fontWeight:700 }}>{node.priority}</span>
                      <span style={{ color:T.text3 }}>⏱ {node.weeks}w recommended</span>
                    </div>
                  </div>
                  <div style={{ textAlign:"center", flexShrink:0 }}>
                    <svg width={54} height={54} viewBox="0 0 54 54">
                      <circle cx={27} cy={27} r={22} fill="none" stroke={T.track} strokeWidth={4} />
                      <circle cx={27} cy={27} r={22} fill="none" stroke={ns.pct===100?"#10b981":nc} strokeWidth={4}
                        strokeDasharray={((ns.pct/100)*138) + " 138"} strokeLinecap="round" transform="rotate(-90 27 27)" />
                      <text x={27} y={32} textAnchor="middle" fill={ns.pct===100?"#10b981":T.text} fontSize={12} fontWeight="800" fontFamily="Inter,sans-serif">{ns.pct}%</text>
                    </svg>
                    <div style={{ fontSize:9, color:T.text3, marginTop:-2 }}>{ns.dc+ns.dk}/{node.concepts.length+node.keyPoints.length}</div>
                  </div>
                </div>
                <div style={{ background:nc+"12", borderLeft:"3px solid " + nc, padding:"9px 13px", marginBottom:14, borderRadius:"0 8px 8px 0", fontSize:12, lineHeight:1.65, color:T.text2 }}>{node.overview}</div>
                <div style={{ display:"flex", gap:4, overflowX:"auto" }}>
                  {[["concepts","💡 Concepts (" + ns.dc + "/" + node.concepts.length + ")"],["keypoints","✦ Key Points (" + ns.dk + "/" + node.keyPoints.length + ")"],["resources","🔗 Resources"]].map(function(item) {
                    var id = item[0], lbl = item[1];
                    return (
                      <div key={id} onClick={function() { setTab(id); }}
                        style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:"8px 8px 0 0", cursor:"pointer", background:tab===id?T.bg:T.card, border:"1px solid " + (tab===id?T.border:"transparent"), borderBottom:"1px solid " + (tab===id?T.bg:T.border), color:tab===id?nc:T.text3, fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
                        {lbl}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tab body */}
              <div style={{ flex:1, overflowY:"auto", padding:"16px 22px 28px" }}>

                {/* CONCEPTS */}
                {tab === "concepts" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                      <span style={{ fontSize:11, color:T.text3 }}>Click to expand · study WHY/WHAT/HOW · check off when understood</span>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={function() { setProg(function(p) { var c = {}; node.concepts.forEach(function(x) { c[x.term] = true; }); return Object.assign({}, p, { [node.id]: Object.assign({}, p[node.id], { c:c }) }); }); }}
                          style={{ padding:"5px 12px", fontSize:11, cursor:"pointer", borderRadius:6, background:nc+"18", border:"1px solid " + nc+"44", color:nc, fontFamily:"inherit", fontWeight:600 }}>Mark All ✓</button>
                        <button onClick={function() { setProg(function(p) { return Object.assign({}, p, { [node.id]: Object.assign({}, p[node.id], { c:{} }) }); }); }}
                          style={{ padding:"5px 12px", fontSize:11, cursor:"pointer", borderRadius:6, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit" }}>Clear</button>
                      </div>
                    </div>
                    {node.concepts.map(function(concept) {
                      return (
                        <ConceptCard key={concept.term} concept={concept} done={!!prog[node.id].c[concept.term]}
                          onToggle={function() { toggleConcept(node.id, concept.term); }} nc={nc} T={T}
                          nodeId={node.id} isAuthenticated={isAuthenticated} token={token} onOpenAuthModal={openAuthModal} />
                      );
                    })}
                  </div>
                )}

                {/* KEY POINTS */}
                {tab === "keypoints" && (
                  <div style={{ animation:"fi .2s ease" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <span style={{ fontSize:11, color:T.text3 }}>Check off each point when you can recall it cold in an interview</span>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={function() { setProg(function(p) { return Object.assign({}, p, { [node.id]: Object.assign({}, p[node.id], { k: p[node.id].k.map(function() { return true; }) }) }); }); }}
                          style={{ padding:"5px 12px", fontSize:11, cursor:"pointer", borderRadius:6, background:nc+"18", border:"1px solid " + nc+"44", color:nc, fontFamily:"inherit", fontWeight:600 }}>Mark All ✓</button>
                        <button onClick={function() { setProg(function(p) { return Object.assign({}, p, { [node.id]: Object.assign({}, p[node.id], { k: p[node.id].k.map(function() { return false; }) }) }); }); }}
                          style={{ padding:"5px 12px", fontSize:11, cursor:"pointer", borderRadius:6, background:T.muted, border:"1px solid " + T.border2, color:T.text3, fontFamily:"inherit" }}>Clear</button>
                      </div>
                    </div>
                    {node.keyPoints.map(function(kp, i) {
                      var done = prog[node.id].k[i];
                      return (
                        <div key={i} onClick={function() { toggleKP(node.id, i); }}
                          style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"11px 14px", marginBottom:8, background:done?nc+"0e":T.card, border:"1.5px solid " + (done?nc+"55":T.border), borderRadius:10, cursor:"pointer" }}>
                          <div style={{ width:20, height:20, borderRadius:5, flexShrink:0, marginTop:1, background:done?nc:T.card, border:"2px solid " + (done?nc:T.border2), display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {done && <span style={{ color:T.ckFg, fontSize:12, fontWeight:800, lineHeight:1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:13, color:done?T.text3:T.text2, textDecoration:done?"line-through":"none", lineHeight:1.65 }}>
                            <span style={{ color:nc, fontWeight:700, marginRight:6 }}>{i+1}.</span>{kp}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* RESOURCES */}
                {tab === "resources" && (
                  <div style={{ animation:"fi .2s ease" }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>Hand-picked resources — highest signal-to-noise for this topic. Links open in a new tab.</div>
                    {node.resources.map(function(r, i) {
                      return (
                        <div key={i} style={{ background:T.card, border:"1px solid " + T.border, borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
                          <div style={{ display:"flex", gap:12, marginBottom:8 }}>
                            <div style={{ width:28, height:28, borderRadius:7, flexShrink:0, background:nc+"18", border:"1.5px solid " + nc+"44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:nc, fontWeight:700 }}>{i+1}</div>
                            <div>
                              <a href={r.url} target="_blank" rel="noopener noreferrer"
                                style={{ color:T.accent, textDecoration:"none", fontWeight:600, fontSize:13, display:"block", marginBottom:3 }}>{r.title} ↗</a>
                              <div style={{ fontSize:12, color:T.text3, lineHeight:1.55 }}>{r.desc}</div>
                            </div>
                          </div>
                          <div style={{ fontSize:10, color:T.text3, padding:"5px 8px", background:T.muted, borderRadius:5, wordBreak:"break-all" }}>{r.url}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}