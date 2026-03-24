import { useState, useEffect, useCallback } from "react";

const CX = 260, CY = 215, R = 155;
const PRIORITY_COLOR = { CRITICAL: "#ef4444", HIGH: "#f59e0b", MEDIUM: "#10b981" };

const store = {
  async get(_key) {
    try {
      const res = await fetch('/api/progress');
      if (res.ok) return await res.json();
    } catch {}
    try { const v = localStorage.getItem(_key); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  async set(_key, value) {
    try {
      await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      return;
    } catch {}
    try { localStorage.setItem(_key, JSON.stringify(value)); } catch {}
  }
};

const NODES = [
  {
    id: "system", label: "System\nDesign", emoji: "🏗️", color: "#0891b2", angle: -90,
    priority: "CRITICAL", weeks: 3,
    overview: "System design interviews test your ability to architect large-scale distributed systems under realistic constraints. At SDE 3, you're expected to lead the design, proactively identify failure modes, and quantify every trade-off with real numbers. Your Kafka migration and microservices work at Saxo is your strongest asset — anchor every answer in that real experience.",
    concepts: [
      { term: "Scalability", explanation: "Scalability means handling increased load without degrading performance. Horizontal scaling (scale-out) adds more machines — stateless services work best here because any instance can handle any request. Vertical scaling (scale-up) upgrades hardware — simpler but has a ceiling and creates a SPOF. The key rule: make services stateless, push state to Redis or a DB. Use consistent hashing to distribute load evenly and minimize data movement when nodes are added/removed. Auto-scaling groups (AWS ASG, K8s HPA) can scale based on CPU, memory, or custom metrics like queue depth." },
      { term: "Load Balancing", explanation: "A load balancer distributes incoming requests across backend instances. Algorithms: Round-Robin (equal distribution, default), Least Connections (routes to the least busy instance — good for long-lived connections), IP Hash (same client always hits the same server — useful when you need session stickiness), Weighted Round-Robin (some servers get more traffic proportionally). L4 load balancers work at TCP level (fast, no request inspection). L7 load balancers work at HTTP level (can route based on URL path, headers — more powerful). Health checks detect failed instances and remove them from rotation." },
      { term: "Caching", explanation: "Cache-Aside (Lazy Loading): App checks cache first; on miss, loads from DB and populates cache. Most common pattern — cache only what's needed. Write-Through: Write to cache and DB simultaneously — keeps cache warm but adds write latency. Write-Behind (Write-Back): Write to cache only, async flush to DB — fast writes but risk of data loss on crash. TTL (Time-to-Live) prevents stale data. Cache invalidation is the hard part — use event-driven invalidation (on DB write, publish event, consumer clears cache) for strong consistency. CDNs cache static assets at edge locations close to users." },
      { term: "Message Queues & Kafka", explanation: "Message queues decouple producers from consumers enabling async processing. Kafka uses a distributed commit log — messages are persisted on disk, retained for a configurable period, and consumers track their own offset. Topics are partitioned — each partition is ordered. Multiple consumers in a consumer group share partitions for parallel processing, but one partition = one consumer at a time (maintains ordering). RabbitMQ is push-based and good for task queues with complex routing. SQS is managed, serverless, great for AWS-native stacks. Use Kafka when: you need replay, high throughput, event sourcing, or fan-out to multiple consumers." },
      { term: "Database Design", explanation: "CQRS (Command Query Responsibility Segregation) separates write models (commands) from read models (queries) — the write side can be normalized for integrity, the read side denormalized for speed. Sharding splits data horizontally across DB instances — shard by a key with high cardinality and even distribution. Avoid hotspots. Read replicas offload read traffic from the primary. Polyglot persistence: use different DBs for different needs — Postgres for transactional data, Redis for caching/sessions, Elasticsearch for search. Always design for the access patterns, not just the data model." },
      { term: "Rate Limiting", explanation: "Token Bucket: A bucket holds up to N tokens. Each request consumes one token; tokens refill at a fixed rate. Allows short bursts up to bucket size — most commonly used. Leaky Bucket: Requests enter a queue and are processed at a fixed rate — enforces strict output rate, no bursts. Sliding Window Counter: Tracks request counts in a rolling time window — more accurate than fixed windows. Fixed Window Counter: Simple counter reset every window — allows 2x the rate at window boundary. Implementation: store counters in Redis with atomic INCR + EXPIRE. Apply per user, per IP, and per endpoint." },
      { term: "Resilience Patterns", explanation: "Circuit Breaker: Three states — Closed (normal, all requests pass), Open (failure threshold exceeded, all requests fail fast), Half-Open (probe with a few requests to check recovery). Implemented in .NET via Polly. Bulkhead: Isolate failures by partitioning resources — one slow service can't starve all others. Retry with Exponential Backoff + Jitter: Retry on transient failures, double the wait time each attempt, add random jitter to avoid thundering herd. Timeout: Every external call must have a timeout — no timeout = potential thread leak. Fallback: Return cached data or a degraded response when a dependency fails." },
      { term: "Observability", explanation: "The three pillars: Metrics (quantitative measurements — request rate, error rate, latency p50/p95/p99), Logs (structured events — use JSON, include trace IDs, correlation IDs), Traces (end-to-end request journey across microservices — OpenTelemetry standard). SLI: the metric you measure. SLO: the target (e.g., 99.9% success). SLA: the contractual commitment. USE method for infra: Utilization, Saturation, Errors. RED method for services: Rate, Errors, Duration. Set alerts on SLO burn rate, not just thresholds." },
    ],
    keyPoints: [
      "Always clarify functional requirements, non-functional requirements (scale, latency, availability), and constraints before drawing anything",
      "Back-of-envelope math is mandatory: estimate QPS, storage growth per day, bandwidth, and memory usage",
      "Availability = uptime/(uptime+downtime). 99.9% = 8.7h downtime/year. 99.99% = 52min/year. Each 9 is hard to add",
      "CAP Theorem: in a network partition, choose Consistency (CP) or Availability (AP). Most fintech systems are CP",
      "Idempotency is critical in payment systems — same request processed twice must produce the same result",
      "Design for failure: assume any component can fail at any time. Ask: what happens when X dies?",
      "Prefer async over sync for cross-service calls to improve resilience and decouple failure domains",
      "Database is usually the bottleneck — add read replicas, caching, and denormalize read models before scaling horizontally",
    ],
    resources: [
      { title: "System Design Primer — GitHub", url: "https://github.com/donnemartin/system-design-primer", desc: "Most comprehensive free resource. Covers all patterns with diagrams." },
      { title: "ByteByteGo — Alex Xu", url: "https://bytebytego.com", desc: "Paid newsletter + YouTube channel. Clear visual explanations of real systems." },
      { title: "High Scalability Blog", url: "http://highscalability.com", desc: "Real architecture breakdowns of Twitter, YouTube, Netflix, Uber." },
      { title: "AWS Architecture Center", url: "https://aws.amazon.com/architecture/", desc: "Reference architectures and whitepapers for production fintech patterns." },
      { title: "Martin Fowler — Patterns of Distributed Systems", url: "https://martinfowler.com/articles/patterns-of-distributed-systems/", desc: "Deep-dive on Raft, WAL, segmented log, leaderless replication." },
    ],
  },
  {
    id: "dsa", label: "DSA &\nAlgorithms", emoji: "🧠", color: "#7c3aed", angle: -45,
    priority: "HIGH", weeks: 4,
    overview: "DSA rounds remain standard even at SDE 3. The bar is higher: clean code, optimal complexity, proactive edge case handling, and clear communication of your thought process. Pattern recognition is the skill — once you see 'shortest path in unweighted graph', you immediately reach for BFS. Focus on Graphs, DP, Intervals, and Heaps — most common in fintech and platform engineering.",
    concepts: [
      { term: "Arrays & Sliding Window", explanation: "Sliding Window is used for problems asking for subarray/substring with a constraint. Fixed window: maintain a window of size k, slide by 1 each step. Variable window: expand right pointer to satisfy condition, shrink left pointer when condition violated (e.g., longest substring without repeating chars). Two Pointers: use when array is sorted or you need pairs (e.g., two sum in sorted array, container with most water). Prefix Sums: precompute running totals so range sum queries become O(1) — crucial for 2D matrix problems and subarray sum equals k." },
      { term: "Hash Maps & Sets", explanation: "HashMap enables O(1) average lookup, insert, delete — the workhorse of interview problems. Use for: frequency counting (anagram checks), grouping (group anagrams by sorted key), caching (memoization), two-sum pattern (store complement). Use LinkedHashMap when insertion order matters (LRU Cache). Use TreeMap when sorted order is needed with O(log n) ops. Common patterns: count character frequency, check if two strings are anagrams, find duplicates in O(n). In C#: Dictionary vs ConcurrentDictionary." },
      { term: "Trees & Binary Search", explanation: "In-order traversal of BST yields sorted output. BFS (level-order) uses a queue — finds shortest path in unweighted trees. DFS uses recursion or a stack — preorder (process node first), inorder (left-node-right), postorder (process node last). Binary Search: always works on sorted data. Template: lo=0, hi=n-1, mid=(lo+hi)/2, adjust lo or hi based on condition. Apply binary search on the answer space — e.g., minimum capacity to ship packages in D days: binary search on the capacity value. Two key variants: find leftmost valid position or rightmost." },
      { term: "Graphs: BFS & DFS", explanation: "BFS (Breadth-First Search): uses a queue, explores level by level. Use for shortest path in unweighted graphs, minimum steps problems. DFS (Depth-First Search): uses recursion or stack, explores as deep as possible. Use for: cycle detection, connected components, topological sort, path existence. Topological Sort (Kahn's Algorithm): in-degree tracking with BFS — for course scheduling, build order problems. Union-Find (Disjoint Set): efficiently answers 'are these two nodes connected?' — use path compression + union by rank for near-O(1). Dijkstra: BFS variant with a min-heap for weighted shortest path." },
      { term: "Dynamic Programming", explanation: "DP = identify overlapping subproblems + optimal substructure. Approach: (1) define state — what information do I need at each step? (2) define transition — how does state(i) relate to state(i-1)? (3) base case. Memoization (top-down): recursive + cache results. Tabulation (bottom-up): fill a table iteratively — usually more space-efficient. Common patterns: 0/1 Knapsack (include/exclude each item), Unbounded Knapsack (can reuse items — coin change), LCS (2D DP comparing two strings), LIS (patience sorting O(n log n)), House Robber (skip adjacent)." },
      { term: "Heaps & Priority Queues", explanation: "Min-heap: smallest element always at top. Max-heap: largest at top. Insert and extract: O(log n). Heapify: O(n). Use cases: Top-K elements (maintain min-heap of size K), Merge K Sorted Lists (push first element of each list with list index into min-heap), Sliding Window Maximum (use max-heap or monotonic deque), Median Finder (two heaps: max-heap for lower half, min-heap for upper half — balance them to get O(1) median). In C#: use SortedSet or PriorityQueue<T,P>." },
      { term: "Interval Problems", explanation: "Always sort intervals by start time first. Merge Intervals: if current.start <= prev.end, merge by taking max of ends. Meeting Rooms II (minimum conference rooms): use a min-heap of end times — for each meeting, if it starts after heap.top() ends, reuse that room; else add a new room. Sweep Line: process all start and end events sorted by time — event+1 at start, event-1 at end, track running sum. Key insight: interval problems often model resource allocation — translate to your scheduling domain." },
      { term: "Complexity Analysis", explanation: "Time Complexity: O(1) constant, O(log n) binary search/balanced BST, O(n) linear scan, O(n log n) sorting/heap operations, O(n²) nested loops, O(2ⁿ) exponential backtracking. Space Complexity: count the extra memory used (recursion stack counts!). Interview expectations at SDE 3: state both time and space before coding, explain WHY your approach has that complexity, know when to trade space for time (memoization). In fintech: use long for large sums; use Decimal/BigDecimal for currency values, never double." },
    ],
    keyPoints: [
      "Pattern recognition > memorization: BFS = shortest path, Sliding Window = substring/subarray with constraint, Two Heaps = median, Union-Find = connectivity",
      "Always state brute force first, then optimize — interviewers want to see your thought process",
      "Communicate complexity before coding: 'This will be O(n log n) time and O(n) space because...'",
      "Handle edge cases proactively: empty input, single element, all same elements, negative numbers",
      "Neetcode 150 is the highest-signal list — covers all patterns systematically",
      "Practice on a plain text editor, not an IDE — simulates real interview conditions",
      "In fintech: think about integer overflow (use long), precision (use Decimal not double for money)",
    ],
    resources: [
      { title: "Neetcode.io — Structured 150 Problems", url: "https://neetcode.io/practice", desc: "Best-organized list with video solutions by pattern. Start here." },
      { title: "LeetCode — Top Interview Questions", url: "https://leetcode.com/problem-list/top-interview-questions/", desc: "Primary practice platform. Filter by tag (DP, Graph, etc.)." },
      { title: "Grokking Coding Interview Patterns", url: "https://www.educative.io/courses/grokking-coding-interview-patterns-python", desc: "Pattern-first approach — teaches 20 patterns that cover 150+ problems." },
      { title: "CP-Algorithms.com", url: "https://cp-algorithms.com", desc: "Deep mathematical explanations of graph algorithms, DP, number theory." },
      { title: "Big-O Cheat Sheet", url: "https://www.bigocheatsheet.com", desc: "Quick reference for all data structure operation complexities." },
    ],
  },
  {
    id: "distributed", label: "Distributed\nSystems", emoji: "⚡", color: "#b45309", angle: 0,
    priority: "CRITICAL", weeks: 2,
    overview: "This is your home turf. Your Kafka pipelines, CQRS architecture, race condition fixes, and microservices migration give you depth most candidates don't have. The goal now is to add rigorous theoretical vocabulary to your practical experience — so you can name the patterns you've already implemented and explain the guarantees they provide.",
    concepts: [
      { term: "CAP Theorem & PACELC", explanation: "CAP Theorem: A distributed system can only guarantee two of three — Consistency (every read sees the latest write), Availability (every request gets a non-error response), Partition Tolerance (system continues functioning despite network splits). Since network partitions are unavoidable in practice, you always choose between CP (consistency) or AP (availability) during a partition. Fintech systems are CP — you'd rather refuse a request than return stale balance data. PACELC extends CAP: even when no partition exists (E), there's a trade-off between Latency (L) and Consistency (C)." },
      { term: "Consistency Models", explanation: "Strong Consistency: every read reflects the most recent write — what you get with a single-leader database and synchronous replication. Linearizability: strongest — reads always see writes in real-time order, as if there's one copy. Sequential Consistency: operations appear to execute in some sequential order. Causal Consistency: causally related operations are seen in order by all nodes. Eventual Consistency: given no new updates, all replicas converge — DNS uses this. Read-Your-Writes: you always see your own recent writes. Monotonic Reads: once you read a value, you never read an older one." },
      { term: "Kafka Internals (Deep)", explanation: "Kafka's log: an append-only, ordered, immutable sequence of records. Each topic is split into partitions — partition count determines parallelism. Within a partition, offsets are sequential and ordered. A consumer group assigns one partition per consumer — scale consumers up to partition count. At-least-once delivery: commit offset after processing (default). Exactly-once semantics (EOS): use idempotent producers (enable.idempotence=true) + transactional APIs. Consumer rebalancing: when a consumer joins/leaves, partitions are reassigned — can cause duplicate processing if offsets weren't committed." },
      { term: "Consensus: Raft Algorithm", explanation: "Raft solves distributed consensus — making multiple nodes agree on a sequence of values. Three roles: Leader (handles all writes), Follower (replicates leader's log), Candidate (seeking election). Leader Election: if a follower doesn't hear from leader within election timeout, it becomes a candidate, increments term, requests votes. A node votes for at most one candidate per term. Majority wins. Log Replication: leader appends to its log, sends AppendEntries RPC to followers, commits when majority acknowledge. Etcd, Consul, and CockroachDB use Raft internally." },
      { term: "Saga Pattern", explanation: "Saga manages long-running distributed transactions across microservices without using 2PC. Choreography Saga: each service listens for events and publishes events — no central coordinator. Pros: loose coupling. Cons: hard to track overall saga state. Orchestration Saga: a central orchestrator sends commands to each service and handles responses. Pros: clear workflow, easier compensation. Cons: orchestrator becomes a coordination bottleneck. Compensating transactions: each step has a compensating action to undo it. Sagas are eventually consistent — design your domain to tolerate intermediate states." },
      { term: "Outbox Pattern", explanation: "Problem: You want to write to your DB AND publish a Kafka event atomically. Two separate operations can fail independently. Solution: Write the event to an 'outbox' table in the same DB transaction as your business data. A separate relay process reads the outbox and publishes to Kafka, then marks events as sent. This guarantees at-least-once delivery. The Kafka consumer must be idempotent to handle duplicates. Debezium uses CDC (Change Data Capture) — tails the DB transaction log (WAL) and forwards changes to Kafka." },
      { term: "Idempotency & Exactly-Once", explanation: "Idempotency: performing an operation multiple times has the same effect as performing it once. Critical in payment systems — a retry must not double-charge. Implementation: client sends a unique idempotency key with every request. Server stores (key, response) in Redis/DB. On duplicate key, return stored response without reprocessing. Keys should expire after a reasonable window (e.g., 24 hours). Exactly-once processing in Kafka: idempotent producer + transactional consumer. For DB operations: optimistic concurrency control with a version field." },
      { term: "Distributed Locks", explanation: "Redis SETNX (Set if Not Exists): SET key value NX PX 30000 — atomically sets if not exists with a 30-second TTL. Release: check value is yours (use a random UUID) then delete — must be atomic (use Lua script). Redlock Algorithm: acquire lock on majority (3 of 5) Redis nodes simultaneously. Debate: Martin Kleppmann argued Redlock is unsafe without fencing tokens — use it for efficiency, not correctness. Fencing Token: monotonically increasing number from lock server — storage layer rejects writes with lower token than seen before." },
    ],
    keyPoints: [
      "Distributed systems trade-offs are always about consistency, availability, latency, and throughput — pick your poison based on the domain",
      "Network partitions WILL happen — design for them: circuit breakers, retries with backoff, graceful degradation",
      "Idempotency + at-least-once delivery is the practical standard — exactly-once is expensive and rarely needed if your consumers are idempotent",
      "The Outbox Pattern solves the dual-write problem between DB and message broker — foundational for event-driven fintech systems",
      "Kafka ordering: guaranteed within a partition, not across partitions — use the same partition key for events that must be ordered",
      "Saga compensating transactions must be idempotent — they may also be retried",
      "Distributed locks should be used for efficiency (prevent duplicate work), not correctness — correctness belongs in your domain logic",
    ],
    resources: [
      { title: "Designing Data-Intensive Applications (DDIA)", url: "https://dataintensive.net", desc: "Martin Kleppmann. Chapters 5-9 are the distributed systems bible." },
      { title: "Martin Kleppmann — Distributed Systems Lectures", url: "https://www.youtube.com/playlist?list=PLeKd45zvjcDFUEv_ohr_HdUFe97RItdiB", desc: "Cambridge University lecture series. Covers Raft, linearizability, transactions — free on YouTube." },
      { title: "Apache Kafka Documentation — Exactly Once", url: "https://kafka.apache.org/documentation/#semantics", desc: "Official docs on delivery guarantees, idempotent producers, transactions." },
      { title: "The Log — Jay Kreps (Confluent)", url: "https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying", desc: "Foundational article on why the log unifies distributed systems." },
      { title: "Microservices Patterns — Chris Richardson", url: "https://microservices.io/patterns/", desc: "Free online version. Saga, Outbox, CQRS, Event Sourcing patterns with diagrams." },
    ],
  },
  {
    id: "database", label: "Database\n& SQL", emoji: "🗄️", color: "#be185d", angle: 45,
    priority: "HIGH", weeks: 2,
    overview: "You've written stored procedures and fixed DB-layer race conditions — now shift from writing queries to explaining internals. SDE 3 candidates are expected to own the full DB layer: schema design, query optimization, transaction semantics, and scaling strategy.",
    concepts: [
      { term: "ACID Transactions", explanation: "Atomicity: a transaction is all-or-nothing. If any step fails, all changes are rolled back. Implemented via undo logs. Consistency: a transaction brings the DB from one valid state to another — constraints, foreign keys, and triggers enforce this. Isolation: concurrent transactions don't interfere with each other. Implemented via MVCC or locking. Durability: committed transactions survive crashes. Implemented via WAL (Write-Ahead Log) — changes are written to the log before the data pages. fsync() flushes the log to disk. On recovery, the DB replays the WAL to restore committed state." },
      { term: "Isolation Levels & Anomalies", explanation: "Read Uncommitted: can read dirty data (uncommitted changes) — almost never used. Read Committed (SQL Server default): only reads committed data. Prevents dirty reads. Still allows non-repeatable reads. Repeatable Read: locks rows you've read until transaction ends. Prevents dirty reads and non-repeatable reads. Still allows phantom reads. Serializable: strongest. Prevents all anomalies including phantoms. SQL Server uses Snapshot Isolation (via MVCC) — readers don't block writers. Row versions stored in tempdb." },
      { term: "MVCC & Locking", explanation: "MVCC (Multi-Version Concurrency Control): instead of locking rows on read, the DB keeps multiple versions of each row. Readers see a consistent snapshot from when their transaction started — they never block writers and writers never block readers. SQL Server implements this via row versioning in tempdb. Postgres keeps old versions in-place (VACUUM cleans them up). Optimistic Concurrency Control (OCC): no locks held during the transaction. At commit time, check if any of your reads have been modified — if yes, abort and retry. You implemented this with version columns! OCC works well for low-contention workloads." },
      { term: "Indexing Internals", explanation: "B-Tree Index: balanced tree where leaf nodes contain the actual data (clustered) or pointers to data (non-clustered). Height is typically 3-4 levels even for millions of rows — O(log n) lookup. Clustered Index: the table data is physically ordered by the index key — one per table (primary key in SQL Server). Non-Clustered Index: separate structure with pointers to heap rows — multiple allowed. Composite Index: follows leftmost prefix rule — index on (a, b, c) is usable for queries on a, (a,b), (a,b,c) but NOT on (b) or (c) alone. Covering Index: includes all columns a query needs — avoids a key lookup back to the main table." },
      { term: "Query Optimization", explanation: "EXPLAIN/Execution Plan: shows how the query optimizer will execute your query — look for table scans (red flag) vs index seeks (good). Key Lookup: non-clustered index found the row but had to go back to the clustered index for extra columns — add those columns to the index as INCLUDE. Statistics: the optimizer uses statistics to estimate row counts. Stale statistics cause bad plans. Join strategies: Nested Loop (good for small tables), Hash Join (good for large unsorted tables), Merge Join (good for pre-sorted large datasets). SARGable predicates: WHERE col = @val is sargable. WHERE YEAR(date_col) = 2024 is NOT sargable." },
      { term: "Partitioning & Sharding", explanation: "Vertical Partitioning: split a wide table into multiple narrower tables. Reduces I/O for common queries. Horizontal Partitioning: split rows into multiple partitions based on a partition key (e.g., date ranges). Partition pruning means queries with a date filter only scan relevant partitions. Sharding (Database Sharding): split data across multiple independent DB servers. Shard key choice is critical — must have high cardinality and even distribution. Hash sharding: hash(user_id) % num_shards. Problems: cross-shard joins are expensive, resharding is complex. Use consistent hashing to minimize data movement when adding shards." },
      { term: "NoSQL Trade-offs", explanation: "Document DB (MongoDB, Cosmos): schema-flexible JSON documents. Good for hierarchical data with varied shapes. Bad for complex joins. Key-Value (Redis, DynamoDB): O(1) lookups by key. DynamoDB: single-digit ms at any scale, but access patterns must be known upfront. Column-Family (Cassandra, HBase): optimized for writes and time-series. Wide rows, tunable consistency. Bad for arbitrary queries. Graph DB (Neo4j): optimized for relationship traversal. Good for social networks, fraud detection. For payments: Postgres or SQL Server for transactional correctness, Redis for caching/sessions." },
    ],
    keyPoints: [
      "SQL Server default isolation is Read Committed — understand what anomalies this still allows and when to escalate",
      "MVCC (row versioning) means reads don't block writes in snapshot isolation",
      "Composite index leftmost prefix rule: index on (a,b,c) helps queries filtering on a or (a,b) but NOT on b or c alone",
      "Non-SARGable predicates are index killers: functions on indexed columns, LIKE '%prefix', implicit type conversions all prevent index seeks",
      "Sharding solves write scalability but destroys join simplicity — design your shard key around your most critical access pattern",
      "Your OCC implementation with version columns is the right approach for low-contention financial updates",
      "WAL (Write-Ahead Log) is how durability and crash recovery work — every committed change is in the log before it hits the data pages",
    ],
    resources: [
      { title: "Use The Index, Luke! (Free)", url: "https://use-the-index-luke.com", desc: "Best free resource on SQL indexing internals. Directly applicable to SQL Server work." },
      { title: "DDIA Chapters 2-4 — Kleppmann", url: "https://dataintensive.net", desc: "Storage engines, data models, encoding. The theoretical backbone for all DB internals questions." },
      { title: "SQL Server Isolation Levels — Microsoft Docs", url: "https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql", desc: "Official reference for all isolation levels with behavior table." },
      { title: "Postgres EXPLAIN Guide", url: "https://www.postgresql.org/docs/current/using-explain.html", desc: "Highly transferable to SQL Server's execution plans." },
      { title: "CMU Database Course — Free Online", url: "https://15445.courses.cs.cmu.edu/fall2023/", desc: "Andy Pavlo's DB internals course. B-Trees, buffer pool, concurrency control." },
    ],
  },
  {
    id: "behavioral", label: "Behavioral\n& Leadership", emoji: "👥", color: "#047857", angle: 90,
    priority: "CRITICAL", weeks: 2,
    overview: "Behavioral interviews at SDE 3 are ~40% of the signal. You have exceptional stories from Saxo: Kafka migration, race condition debugging, microservices architecture, junior mentoring, and cross-team design docs. The key is packaging them with crisp metrics and clear leadership signal.",
    concepts: [
      { term: "STAR Method (Structured Storytelling)", explanation: "Situation: set the scene briefly — context, team size, what system, what was at stake. Keep it concise (2-3 sentences). Task: what was YOUR specific responsibility? Distinguish yourself from the team. Action: this is the core — spend 60% of your answer here. Explain what YOU specifically did, why you made each decision, what alternatives you considered and rejected. Result: quantify the outcome. Latency reduced from 24 hours to near-real-time. Zero production incidents in 6 months post-migration. Learning: what would you do differently? Practice each story out loud until it flows naturally in 2-3 minutes." },
      { term: "Technical Influence Without Authority", explanation: "SDE 3s are expected to influence technical direction even without formal authority. Strategies: write a compelling design doc that lays out trade-offs clearly — let the data and reasoning persuade, not your seniority. Run a proof-of-concept to reduce uncertainty and shift the conversation from opinion to evidence. Acknowledge concerns head-on in your doc. Find allies — identify who will benefit most from your proposal and bring them in early. When you disagree: raise concerns early, escalate with data, then commit once a decision is made (disagree and commit)." },
      { term: "Ownership & Ambiguity", explanation: "SDE 3 ownership means: you don't wait to be told what to do next. You identify the next problem. You scope unclear work. You define success criteria when none exist. Interviewers probe this with: 'Tell me about a time you had to make a decision with incomplete information.' Structure your answer: what was unknown, what was the cost of delay, what information did you gather, what decision did you make and why, and what was the outcome. Handling ambiguity also means: breaking down vague requirements into concrete sub-problems, flagging risks proactively, and delivering incremental value." },
      { term: "Mentoring & Growing Others", explanation: "Interviewers at SDE 3 want to see that you can multiply your impact through others. Stories should be specific: not 'I mentored juniors' but 'I worked with [role] on X problem. They were struggling with Y. I pair-programmed with them on Z, explained the underlying mental model, and set up a follow-up review. Two weeks later they independently designed a similar solution for another service.' Metrics matter: PR review turnaround, number of design docs they authored independently, reduction in bugs in their PRs over time." },
      { term: "Failure & Learning", explanation: "This is a trap question for people who give fake failures ('I work too hard'). Interviewers want authentic failures that show self-awareness and growth. Structure: be honest about what went wrong and your specific role in it. Don't deflect to the team. Show you understand the root cause at a deep level. Describe what you changed in your behavior or process as a result. End with how the change produced a better outcome in a subsequent situation. The failure itself matters less than the quality of your reflection." },
      { term: "Conflict & Disagreement", explanation: "'Tell me about a time you disagreed with your team' is about how you navigate conflict, not whether you were right. Good answers show: (1) you raised your concern clearly and early with data/reasoning (not emotion), (2) you listened to the other perspective and updated your view if warranted, (3) you committed fully once a decision was made even if you disagreed, (4) the outcome and what you learned. Avoid: 'I was right and they were wrong.' Good signal: 'I disagreed about X. I laid out my reasoning in a doc, we discussed the trade-offs, ultimately the team chose approach Y. I committed to it fully and mitigated the risk I identified by doing Z.'" },
      { term: "Situational Leadership Questions", explanation: "Common SDE 3 prompts and what they're really testing: 'Walk me through your most complex system' → end-to-end technical ownership. 'How do you decide what to work on?' → prioritization, impact-thinking, saying no. 'How do you handle a production outage?' → incident command, systematic debugging, communication upward. 'How have you raised the bar on your team?' → cultural impact. 'Tell me about a time you had to push back on product' → technical advocacy. Generic answers score low. Specific examples with names, numbers, and decisions score high." },
    ],
    keyPoints: [
      "Write out your 10 best STAR stories with metrics BEFORE your first interview — improvising in the moment produces weak answers",
      "Quantify every result: 'latency improved' → 'p99 latency dropped from 24 hours to under 30 seconds'. Numbers make stories memorable",
      "The interviewer is checking HOW you think, decide, and lead — show the reasoning, not just the outcome",
      "Prepare 5 strong questions to ask the interviewer — it signals strategic thinking",
      "Research the company's engineering blog 48 hours before the interview — reference it naturally to show genuine interest",
      "For failure questions: pick a real failure with a real lesson. Fake failures damage credibility instantly",
      "Amazon Leadership Principles structure maps well to all companies: Ownership, Dive Deep, Invent & Simplify, Earn Trust, Have Backbone",
    ],
    resources: [
      { title: "Amazon Leadership Principles (Framework)", url: "https://www.amazon.jobs/content/en/our-workplace/leadership-principles", desc: "Most widely used framework. Applicable to Google, Microsoft, Meta behavioral interviews." },
      { title: "Grokking the Behavioral Interview", url: "https://www.educative.io/courses/grokking-the-behavioral-interview", desc: "Structured preparation with example stories by situation type." },
      { title: "Interview Kickstart — SDE 3 Behavioral Guide", url: "https://interviewkickstart.com/blogs/interview-questions/senior-software-engineer-behavioral-interview-questions", desc: "Senior-specific behavioral prompts with model answers." },
      { title: "The Manager's Path — Camille Fournier", url: "https://www.oreilly.com/library/view/the-managers-path/9781491973882/", desc: "Chapters 1-3 explain what companies expect from senior ICs." },
    ],
  },
  {
    id: "language", label: "Language\n& Runtime", emoji: "💻", color: "#6d28d9", angle: 135,
    priority: "MEDIUM", weeks: 2,
    overview: "Deep C#/.NET internals will set you apart at SDE 3. Most candidates can write async code; very few can explain what the compiler generates, when ConfigureAwait(false) matters, what triggers a GC pause, or how Span<T> avoids allocations. Your 16-bit computer project gives you rare low-level intuition — bridge it to .NET runtime internals.",
    concepts: [
      { term: "async/await Internals", explanation: "When you write async/await, the C# compiler transforms your method into a state machine. The method is split at each await point into states. The state machine struct holds local variables across suspension points. When you await a Task, if it's already complete, execution continues synchronously. If it's incomplete, a continuation is registered on the Task and the method returns to its caller. When the awaited task completes, the continuation is scheduled on the captured SynchronizationContext (if any) or the ThreadPool. ConfigureAwait(false): in library code, suppress context capture to avoid deadlocks in ASP.NET and improve performance. ValueTask: use for hot paths where the result is often synchronous — avoids heap allocation." },
      { term: "Garbage Collection", explanation: "The .NET GC is a generational, mark-and-compact collector. Gen 0: short-lived objects, collected most frequently (milliseconds). Gen 1: survived Gen 0 collection — buffer generation. Gen 2: long-lived objects, collected rarely. LOH (Large Object Heap): objects > 85KB allocated here, collected with Gen 2, not compacted by default (can cause fragmentation). GC Pause: during collection, managed threads are stopped (STW — stop the world). Background GC (server mode) overlaps Gen 2 collection with application execution. Reduce GC pressure: use object pooling (ArrayPool), Span<T>, struct instead of class for small value types, avoid closures in hot paths." },
      { term: "Task Parallel Library & Threading", explanation: "Task.Run: queues work to the ThreadPool — use for CPU-bound work to free the calling thread. Thread Pool: manages a pool of threads, grows based on demand. Thread creation is expensive (1MB stack default) — always prefer ThreadPool. SemaphoreSlim: async-compatible semaphore — use to limit concurrency (e.g., max 10 concurrent DB calls). lock / Monitor: synchronization primitive — blocks calling thread. Prefer SemaphoreSlim or Channel for async code. Interlocked: atomic operations without locks. ConcurrentDictionary: thread-safe dictionary — uses fine-grained striped locking. System.Threading.Channels: producer-consumer pattern with async support." },
      { term: "Memory & Performance", explanation: "Span<T>: a stack-allocated view over contiguous memory (array, stack, unmanaged). Zero allocation — does not copy data. Cannot be stored on heap. Use for parsing and slicing strings/arrays in hot paths. Memory<T>: heap-allocated version of Span — can be stored in fields. ArrayPool<T>.Shared: rent arrays from a pool instead of allocating — return when done. Prevents LOH pressure for large buffers. Struct vs Class: structs are value types (stack or inline in arrays), classes are reference types (heap + pointer). Avoid boxing: converting value type to object allocates a heap copy — common with non-generic collections." },
      { term: ".NET 8 & Modern Features", explanation: ".NET 8 has ~15% throughput improvement over .NET 7. Minimal APIs: lightweight request pipeline — no controller overhead, great for microservices. Source Generators: compile-time code generation — used by System.Text.Json for zero-reflection serialization. Native AOT: Ahead-of-Time compilation to native binary — no JIT at startup, smaller binaries, faster startup. Tradeoff: no runtime code gen. Primary Constructors: cleaner class/struct initialization. records: immutable value-like types with value equality — great for DTOs and domain events in your CQRS system. Pattern Matching: switch expressions, list patterns, property patterns." },
      { term: "Deadlocks & Synchronization", explanation: "Deadlock requires 4 conditions (Coffman): Mutual Exclusion (resource held by one thread), Hold and Wait (holding one lock while waiting for another), No Preemption (locks not forcibly released), Circular Wait (A waits for B, B waits for A). Prevention: always acquire locks in the same order across all code paths. Async deadlock (classic ASP.NET): calling .Result or .Wait() on an async method while on a SynchronizationContext causes deadlock — the async method tries to resume on the context thread, which is blocked waiting. Solution: use async all the way, or ConfigureAwait(false) in library code." },
    ],
    keyPoints: [
      "async/await compiles to a state machine — understanding this explains why you should await all the way down and never mix .Result with async code",
      "ConfigureAwait(false) is mandatory in library code — it avoids deadlocks and improves performance by not capturing the SynchronizationContext",
      "Gen 0 collections are cheap and frequent; Gen 2 and LOH collections cause the longest pauses — minimize large allocations",
      "Span<T> is your zero-allocation weapon for parsing and slicing — use it in hot paths like message deserialization in your Kafka consumers",
      "SemaphoreSlim with async await is the right tool for bounding concurrency in async code — never use lock with async/await",
      "ValueTask over Task for sync-path-hot methods — eliminates Task allocation on the hot path",
    ],
    resources: [
      { title: "CLR via C# — Jeffrey Richter", url: "https://www.microsoftpressstore.com/store/clr-via-c-sharp-9780735667457", desc: "The definitive .NET internals book. Covers GC, threading, type system at source level." },
      { title: "Stephen Cleary — Async/Await Best Practices", url: "https://learn.microsoft.com/en-us/archive/msdn-magazine/2013/march/async-await-best-practices-in-asynchronous-programming", desc: "The canonical article on async gotchas — ConfigureAwait, deadlocks, async void." },
      { title: "Microsoft Docs — Async Deep Dive", url: "https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/", desc: "Official async/await docs with state machine explanation." },
      { title: ".NET Runtime Team Blog", url: "https://devblogs.microsoft.com/dotnet/", desc: "GC improvements, performance deep-dives, .NET 8 internals straight from the team." },
      { title: "BenchmarkDotNet", url: "https://benchmarkdotnet.org", desc: "Industry standard for .NET perf measurement." },
    ],
  },
  {
    id: "patterns", label: "Design\nPatterns", emoji: "🔧", color: "#c2410c", angle: 180,
    priority: "HIGH", weeks: 1,
    overview: "You already use Repository, Strategy, Factory, Circuit Breaker, CQRS, and OCC in production at Saxo. The SDE 3 goal is teaching-level fluency: explain WHY each pattern exists, WHEN to use it vs alternatives, and what its trade-offs are — not just describe the structure.",
    concepts: [
      { term: "CQRS", explanation: "CQRS separates the write model (commands that change state) from the read model (queries that return data). Commands go through domain logic validation and emit events. The read model is a denormalized projection optimized for the specific query — often a different DB or table. Why: the write model needs strong consistency and domain validation; the read model needs speed and flexibility. Trade-off: eventual consistency between write and read sides — the projection catches up asynchronously. When to use: systems with very different read and write patterns, high read load, complex domain logic." },
      { term: "Event Sourcing", explanation: "Instead of storing current state, store the sequence of events that led to the current state. The event log is the source of truth — current state is derived by replaying events. Benefits: complete audit trail (critical for fintech), ability to replay history, temporal queries ('what was the state on date X?'), easy event-driven integration. Trade-offs: querying current state requires replay or a separate read-model projection; event schema evolution is hard; eventual consistency between event store and projections. Pairs naturally with CQRS — commands produce events, projections consume events to build read models." },
      { term: "Outbox + Transactional Messaging", explanation: "The Outbox Pattern solves dual-write atomicity. Problem: you write to DB and want to publish a domain event, but two separate operations can fail independently. Solution: write both the domain state change AND the outgoing event to the same DB in one transaction. The outbox table holds pending events. A relay process reads the outbox and publishes to Kafka, then marks events as sent. This guarantees at-least-once delivery. Ensure consumers are idempotent. Why not 2PC: they're slow, block resources, and the coordinator is a SPOF." },
      { term: "Repository Pattern", explanation: "Repository abstracts the data access layer behind an interface, decoupling domain logic from persistence details. Benefits: (1) you can swap persistence technology without changing domain code, (2) unit testing becomes easy — mock the interface, test domain logic without a real DB, (3) centralizes query logic. Pitfalls: Generic repositories (IRepository<T> with Add, Remove, Find) over-abstract and leak persistence concerns back into callers. Prefer specific repositories with named methods that express intent — GetActiveOrdersByCustomer is better than Find(x => x.CustomerId == id && x.IsActive)." },
      { term: "Circuit Breaker (Polly in .NET)", explanation: "Circuit Breaker prevents an application from repeatedly trying to call a failing remote service. States: Closed (normal operation, failures are counted), Open (failure threshold exceeded, all calls fail fast — no actual call made), Half-Open (after a recovery timeout, a probe request is allowed through; if it succeeds, circuit closes; if it fails, circuit reopens). In .NET: Polly library. Configure: consecutiveFailureThreshold (e.g., 5), durationOfBreak (e.g., 30s). Combine with Retry and Timeout policies using Polly's ResiliencePipeline. Register policies as singletons — the state must be shared across requests." },
      { term: "Saga Pattern", explanation: "Choreography: each service publishes events and reacts to others' events. No central coordinator. Pros: loose coupling. Cons: hard to visualize the overall flow, debugging requires tracing events across services. Orchestration: a central Saga Orchestrator sends commands to services and handles responses. The overall flow is explicit in one place. Pros: easy to understand, easier error handling and compensation, monitoring in one place. Cons: orchestrator becomes a dependency. When you chose Kafka for your payment pipeline, you were implementing a form of choreography saga." },
      { term: "Strategy & Factory Patterns", explanation: "Strategy: encapsulates a family of algorithms behind a common interface and makes them interchangeable at runtime. Eliminates large if/else or switch chains based on type. Example: IPaymentProcessor with implementations: CreditCardProcessor, BankTransferProcessor, CryptoProcessor. At runtime, inject the correct strategy based on payment type. In .NET with DI: register all strategies by name or use a factory. Factory Method: defines an interface for creating objects but lets subclasses decide which class to instantiate. Abstract Factory: creates families of related objects. Prefer DI containers over manual factories in modern .NET." },
    ],
    keyPoints: [
      "Know WHY each pattern exists, not just what it is — 'Repository exists to decouple domain logic from persistence and enable unit testing without a real DB'",
      "CQRS is not always needed — it adds complexity. Use it when read and write models have significantly different shapes or scale requirements",
      "Event Sourcing + CQRS is a powerful combo for fintech: complete audit trail, event replay, and optimized read projections — but it's complex to operate",
      "Saga compensating transactions must be idempotent and designed to be replayed — failure mid-saga is expected, not exceptional",
      "Circuit Breaker state must be shared (singleton Polly policy) — a per-request circuit breaker is useless",
      "Generic repositories (IRepository<T>) are an anti-pattern — prefer specific, intention-revealing repository methods",
    ],
    resources: [
      { title: "Refactoring.Guru — Design Patterns", url: "https://refactoring.guru/design-patterns", desc: "Best visual explanations of all 23 GoF patterns with C# code examples." },
      { title: "Microservices Patterns — Chris Richardson (free site)", url: "https://microservices.io/patterns/", desc: "Saga, Outbox, CQRS, Event Sourcing, Strangler Fig with full diagrams." },
      { title: "Patterns of Enterprise Application Architecture — Fowler", url: "https://martinfowler.com/books/eaa.html", desc: "Repository, Unit of Work, Domain Model patterns. The original source." },
      { title: "Polly Documentation", url: "https://www.thepollyproject.org", desc: "Official docs for Circuit Breaker, Retry, Timeout in .NET." },
      { title: "Event Sourcing — Martin Fowler", url: "https://martinfowler.com/eaaDev/EventSourcing.html", desc: "The canonical article explaining Event Sourcing with examples." },
    ],
  },
  {
    id: "networking", label: "Networking\n& OS", emoji: "🌐", color: "#0e7490", angle: 225,
    priority: "MEDIUM", weeks: 1,
    overview: "Your 16-bit computer project (HDL → assembler → compiler) is an extraordinary foundation — you understand computation from the ground up. Bridge that to OS internals and networking protocols. These topics appear as depth questions in system design and can make you stand out when most candidates treat networking as a black box.",
    concepts: [
      { term: "TCP vs UDP & HTTP Evolution", explanation: "TCP: connection-oriented (3-way handshake: SYN, SYN-ACK, ACK), reliable (retransmits lost packets), ordered (sequence numbers), flow-controlled and congestion-controlled. Use when data integrity matters (HTTP, DB connections, Kafka). UDP: connectionless, no reliability, no ordering. Lower latency. Use for: live video/audio (a dropped frame is better than delayed), DNS. HTTP/1.1: one request per TCP connection by default, keep-alive reuses connection, but head-of-line blocking. HTTP/2: multiplexing — multiple requests over one TCP connection, binary framing, header compression (HPACK). HTTP/3: built on QUIC (UDP-based) — eliminates TCP HOL blocking, 0-RTT connection establishment." },
      { term: "gRPC vs REST vs GraphQL", explanation: "REST: stateless, resource-based, HTTP verbs, JSON payload. Widely understood, easy to debug. Overhead: verbose JSON. gRPC: uses HTTP/2, Protocol Buffers (binary — 5-10x smaller than JSON, faster serialization), strong typing via .proto schema. Streaming: client-streaming, server-streaming, bidirectional streaming. Best for: internal microservice communication, high-throughput APIs. Not browser-friendly without gRPC-web proxy. GraphQL: client specifies exactly what fields it needs — eliminates over-fetching and under-fetching. Single endpoint. Best for: APIs with many client types with different data needs. Complexity: N+1 query problem (use DataLoader), caching harder than REST." },
      { term: "TLS & Security", explanation: "TLS Handshake (TLS 1.3): (1) Client Hello: supported cipher suites, TLS version, random. (2) Server Hello: chosen cipher, certificate (containing public key). (3) Key Exchange: client and server derive a shared secret using ECDHE — forward secrecy means past sessions can't be decrypted even if private key is compromised. (4) Both sides derive session keys, start encrypted communication. mTLS (Mutual TLS): both client and server present certificates — used in microservices for service-to-service authentication. JWT: header.payload.signature. Verify signature (RS256, ES256). Check exp claim. Store refresh tokens server-side (revocable). Never store access tokens in localStorage." },
      { term: "OS: Processes, Threads, Coroutines", explanation: "Process: isolated memory space, own page table, OS-managed. Context switch is expensive (~1-10μs): save/restore registers, flush TLB. Threads: share memory with parent process, cheaper context switch (~1μs), but require synchronization for shared state. Kernel threads: scheduled by OS on real CPUs. User-space threads (green threads): scheduled by runtime (e.g., Go goroutines, .NET ThreadPool), much cheaper to create. Coroutines: cooperative multitasking — explicitly yield control (.NET async/await). Zero OS involvement for scheduling, extremely cheap. I/O Multiplexing: epoll (Linux) / kqueue (macOS) — single thread monitors thousands of file descriptors for readiness events." },
      { term: "Virtual Memory & OS I/O", explanation: "Virtual Memory: each process sees its own private address space. OS and MMU translate virtual → physical addresses via page tables. TLB (Translation Lookaside Buffer) caches recent translations — TLB miss causes page table walk (expensive). Page Fault: access to a virtual address not yet mapped to physical memory — OS allocates physical frame and updates page table. Memory-Mapped Files (mmap): map a file directly into the virtual address space — reads/writes go directly through page cache without explicit read()/write() syscalls. Kafka uses mmap for its log files — this is why Kafka I/O is so fast (OS page cache acts as a read buffer, zero-copy for consumers)." },
      { term: "DNS & Load Balancing Internals", explanation: "DNS Resolution: browser cache → OS cache → recursive resolver → root nameserver → TLD nameserver → authoritative nameserver → returns A/AAAA record. TTL determines how long clients cache the result. Low TTL enables faster failover but increases DNS query load. GeoDNS: return different IPs based on client's location — used by CDNs. Anycast: same IP announced from multiple locations — BGP routing sends user to nearest node (used by Cloudflare, Fastly). L4 Load Balancer: works at TCP/UDP level, routes by IP and port. Extremely fast. L7 Load Balancer (e.g., Nginx, AWS ALB): works at HTTP level, can route by URL path, Host header, cookies. TLS termination, request modification." },
    ],
    keyPoints: [
      "TCP's reliability guarantees come at a cost: 3-way handshake latency, retransmission delays, head-of-line blocking — know when UDP or QUIC is better",
      "HTTP/2 multiplexing eliminates application-level HOL blocking but not TCP-level HOL — HTTP/3 (QUIC over UDP) solves both",
      "gRPC's binary Protocol Buffers are 5-10x more compact than JSON — significant in high-frequency internal service calls",
      "TLS 1.3's ECDHE key exchange provides forward secrecy — past communications can't be decrypted even if the server's private key is later compromised",
      "mmap is the secret to Kafka's performance: OS page cache handles buffering, zero-copy sendfile() for consumers",
      "Your 16-bit computer gives you the rarest interview superpower: you can explain how the CPU pipeline relates to process context switching and OS scheduling",
    ],
    resources: [
      { title: "High Performance Browser Networking (Free)", url: "https://hpbn.co", desc: "Ilya Grigorik. Deep TCP, UDP, TLS, HTTP/1-2-3, WebSocket internals. Free online." },
      { title: "Beej's Guide to Network Programming (Free)", url: "https://beej.us/guide/bgnet/", desc: "The best practical guide to sockets, TCP/IP from first principles." },
      { title: "Julia Evans — jvns.ca (Networking & OS Zines)", url: "https://jvns.ca", desc: "Julia Evans makes networking and OS topics approachable with clear diagrams." },
      { title: "OSTEPs — Operating Systems: Three Easy Pieces (Free)", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/", desc: "Free OS textbook. Covers scheduling, virtual memory, concurrency, filesystems." },
      { title: "Cloudflare Blog — Technical Deep Dives", url: "https://blog.cloudflare.com", desc: "Real-world articles on TLS, anycast, QUIC, DDoS." },
    ],
  },
];

const EDGES = [
  ["system","distributed"],["system","database"],["system","patterns"],
  ["distributed","database"],["distributed","patterns"],
  ["dsa","system"],["language","distributed"],["behavioral","system"],
];
const STORAGE_KEY = "sde3-progress-v1";

function getPos(deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function emptyProgress() {
  const p = {};
  NODES.forEach(n => { p[n.id] = { concepts: Array(n.concepts.length).fill(false), keypoints: Array(n.keyPoints.length).fill(false) }; });
  return p;
}
function mergeProgress(base, saved) {
  const p = { ...base };
  if (!saved) return p;
  NODES.forEach(n => {
    if (saved[n.id]) p[n.id] = {
      concepts: Array(n.concepts.length).fill(false).map((_, i) => saved[n.id].concepts?.[i] ?? false),
      keypoints: Array(n.keyPoints.length).fill(false).map((_, i) => saved[n.id].keypoints?.[i] ?? false),
    };
  });
  return p;
}

// ─── Light theme tokens ───
const T = {
  bg: "#f8fafc", bg2: "#ffffff", bg3: "#f1f5f9",
  border: "#e2e8f0", border2: "#cbd5e1",
  text: "#0f172a", text2: "#334155", text3: "#64748b",
  headerBg: "#ffffff", headerBorder: "#e2e8f0",
  nodeRing: "#e2e8f0", nodeBg: "#ffffff",
  edgeColor: "#cbd5e1",
  progressTrack: "#e2e8f0",
};

export default function App() {
  const [selected, setSelected] = useState(null);
  const [expandedConcepts, setExpandedConcepts] = useState({});
  const [hoveredNode, setHoveredNode] = useState(null);
  const [activeTab, setActiveTab] = useState("concepts");
  const [progress, setProgress] = useState(emptyProgress);
  const [storageReady, setStorageReady] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    store.get(STORAGE_KEY).then(saved => {
      if (saved) setProgress(mergeProgress(emptyProgress(), saved));
      setStorageReady(true);
    });
  }, []);
  useEffect(() => { if (storageReady) store.set(STORAGE_KEY, progress); }, [progress, storageReady]);

  const toggleConcept = useCallback((nid, i) => setProgress(p => ({ ...p, [nid]: { ...p[nid], concepts: p[nid].concepts.map((v, idx) => idx === i ? !v : v) } })), []);
  const toggleKeypoint = useCallback((nid, i) => setProgress(p => ({ ...p, [nid]: { ...p[nid], keypoints: p[nid].keypoints.map((v, idx) => idx === i ? !v : v) } })), []);
  const markAllConcepts = useCallback((nid, val) => setProgress(p => ({ ...p, [nid]: { ...p[nid], concepts: p[nid].concepts.map(() => val) } })), []);
  const markAllKeypoints = useCallback((nid, val) => setProgress(p => ({ ...p, [nid]: { ...p[nid], keypoints: p[nid].keypoints.map(() => val) } })), []);
  const resetAll = () => { setProgress(emptyProgress()); setShowResetConfirm(false); };

  const totalConcepts = NODES.reduce((s, n) => s + n.concepts.length, 0);
  const totalKP = NODES.reduce((s, n) => s + n.keyPoints.length, 0);
  const doneConcepts = NODES.reduce((s, n) => s + progress[n.id].concepts.filter(Boolean).length, 0);
  const doneKP = NODES.reduce((s, n) => s + progress[n.id].keypoints.filter(Boolean).length, 0);
  const totalItems = totalConcepts + totalKP;
  const doneItems = doneConcepts + doneKP;
  const overallPct = Math.round((doneItems / totalItems) * 100);

  const nodeStats = n => {
    const dc = progress[n.id].concepts.filter(Boolean).length;
    const dk = progress[n.id].keypoints.filter(Boolean).length;
    const tc = n.concepts.length, tk = n.keyPoints.length;
    return { dc, dk, tc, tk, pct: Math.round(((dc + dk) / (tc + tk)) * 100) };
  };

  const node = NODES.find(n => n.id === selected);
  const ns = node ? nodeStats(node) : null;

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: T.text }}>
      <style>{`
        @keyframes dash{to{stroke-dashoffset:-20}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        .hov:hover{background:#f1f5f9 !important;}
        .tab-b{cursor:pointer;transition:all 0.18s;}
        .res-a{color:#2563eb;text-decoration:none;font-weight:600;}
        .res-a:hover{color:#1d4ed8;text-decoration:underline;}
        .chk-wrap:hover{opacity:0.8;}
        .node-g{cursor:pointer;}
        ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#f1f5f9;} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
      `}</style>

      {/* HEADER */}
      <div style={{ background: T.headerBg, borderBottom: `1px solid ${T.headerBorder}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div>
          <div style={{ fontSize: 10, color: "#6366f1", letterSpacing: "0.12em", marginBottom: 3, fontWeight: 600, textTransform: "uppercase" }}>SDE 3 Interview Prep · Revision Dashboard</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Mohd Haarish <span style={{ color: "#0891b2" }}>→ SDE 3</span></div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Saxo Group · Distributed Systems · C#/.NET · Apache Kafka</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: overallPct === 100 ? "#10b981" : "#6366f1" }}>{overallPct}%</div>
            <div style={{ fontSize: 10, color: T.text3, fontWeight: 500 }}>Overall</div>
          </div>
          <div style={{ width: 160 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.text3, marginBottom: 3, fontWeight: 500 }}>
              <span>📖 Concepts</span><span>{doneConcepts}/{totalConcepts}</span>
            </div>
            <div style={{ height: 6, background: T.progressTrack, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", width: `${(doneConcepts / totalConcepts) * 100}%`, background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.text3, marginBottom: 3, fontWeight: 500 }}>
              <span>✦ Key Points</span><span>{doneKP}/{totalKP}</span>
            </div>
            <div style={{ height: 6, background: T.progressTrack, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(doneKP / totalKP) * 100}%`, background: "linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>
          <button onClick={() => setShowResetConfirm(true)} style={{ padding: "6px 14px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: "#fff", border: `1px solid ${T.border2}`, color: T.text3, fontFamily: "inherit", fontWeight: 500 }}>↺ Reset</button>
        </div>
      </div>

      {/* Reset modal */}
      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "28px 32px", textAlign: "center", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 16, color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>Reset All Progress?</div>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 22, lineHeight: 1.6 }}>This will clear all your tracked concepts and key points. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={resetAll} style={{ padding: "8px 20px", cursor: "pointer", borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", color: "#ef4444", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>Yes, Reset</button>
              <button onClick={() => setShowResetConfirm(false)} style={{ padding: "8px 20px", cursor: "pointer", borderRadius: 6, background: "#f8fafc", border: `1px solid ${T.border2}`, color: T.text3, fontFamily: "inherit", fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", minHeight: "calc(100vh - 84px)" }}>
        {/* LEFT: Graph */}
        <div style={{ flex: "0 0 auto", width: "100%", maxWidth: 520, borderRight: `1px solid ${T.border}`, padding: "12px 10px", background: "#fff" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 4, paddingLeft: 8, flexWrap: "wrap", alignItems: "center" }}>
            {Object.entries(PRIORITY_COLOR).map(([p, c]) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                <span style={{ color: T.text3 }}>{p}</span>
              </div>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 10, color: T.text3 }}>Arc = your progress</span>
          </div>

          <svg viewBox="0 0 520 430" style={{ width: "100%", display: "block" }}>
            <defs>
              <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.10"/></filter>
              <filter id="shadowSm"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.08"/></filter>
            </defs>

            {/* Cross-node edges */}
            {EDGES.map(([a, b], i) => {
              const pa = getPos(NODES.find(n => n.id === a).angle);
              const pb = getPos(NODES.find(n => n.id === b).angle);
              return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 5" />;
            })}

            {/* Spoke lines */}
            {NODES.map(n => {
              const pos = getPos(n.angle);
              const isSel = n.id === selected;
              return <line key={n.id} x1={CX} y1={CY} x2={pos.x} y2={pos.y}
                stroke={isSel ? n.color : "#cbd5e1"} strokeWidth={isSel ? 2 : 1}
                strokeDasharray="5 5"
                style={isSel ? { animation: "dash 0.8s linear infinite" } : {}}
                opacity={isSel ? 1 : 0.6} />;
            })}

            {/* Center */}
            <circle cx={CX} cy={CY} r={52} fill="#fff" stroke="#e2e8f0" strokeWidth={2} filter="url(#shadow)" />
            <circle cx={CX} cy={CY} r={52} fill="none" stroke={overallPct === 100 ? "#10b981" : "#6366f1"} strokeWidth={4}
              strokeDasharray={`${(doneItems / totalItems) * 327} 327`} strokeLinecap="round"
              transform={`rotate(-90 ${CX} ${CY})`} style={{ transition: "stroke-dasharray 0.4s" }} />
            <text x={CX} y={CY - 6} textAnchor="middle" fill={overallPct === 100 ? "#10b981" : "#6366f1"} fontSize={16} fontWeight="800" fontFamily="Inter,sans-serif">{overallPct}%</text>
            <text x={CX} y={CY + 11} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="Inter,sans-serif" letterSpacing="0.06em">OVERALL</text>

            {/* Nodes */}
            {NODES.map(n => {
              const pos = getPos(n.angle);
              const isSel = n.id === selected;
              const isHov = n.id === hoveredNode;
              const { pct } = nodeStats(n);
              const circ = 2 * Math.PI * 36;
              const lines = n.label.split("\n");
              return (
                <g key={n.id} className="node-g"
                  onClick={() => { setSelected(n.id === selected ? null : n.id); setActiveTab("concepts"); setExpandedConcepts({}); }}
                  onMouseEnter={() => setHoveredNode(n.id)}
                  onMouseLeave={() => setHoveredNode(null)}>
                  {/* Shadow bg */}
                  <circle cx={pos.x} cy={pos.y} r={38} fill="#fff" filter="url(#shadowSm)" />
                  {/* Main ring */}
                  <circle cx={pos.x} cy={pos.y} r={36}
                    fill={isSel ? n.color + "12" : isHov ? n.color + "08" : "#fff"}
                    stroke={isSel ? n.color : isHov ? n.color + "88" : "#e2e8f0"}
                    strokeWidth={isSel ? 2.5 : 1.5} />
                  {/* Progress arc */}
                  {pct > 0 && (
                    <circle cx={pos.x} cy={pos.y} r={36} fill="none"
                      stroke={pct === 100 ? "#10b981" : n.color}
                      strokeWidth={4} strokeDasharray={`${(pct / 100) * circ} ${circ}`}
                      strokeLinecap="round" transform={`rotate(-90 ${pos.x} ${pos.y})`}
                      style={{ transition: "stroke-dasharray 0.4s" }} opacity={0.85} />
                  )}
                  <text x={pos.x} y={pos.y - 9} textAnchor="middle" fontSize={15}>{n.emoji}</text>
                  {lines.map((line, i) => (
                    <text key={i} x={pos.x} y={pos.y + 5 + i * 11} textAnchor="middle"
                      fill={isSel ? n.color : T.text2}
                      fontSize={8.5} fontWeight={isSel ? "700" : "500"} fontFamily="Inter,sans-serif">
                      {line}
                    </text>
                  ))}
                  <text x={pos.x} y={pos.y + 34} textAnchor="middle"
                    fill={pct === 100 ? "#10b981" : T.text3} fontSize={8} fontWeight={pct === 100 ? "700" : "500"} fontFamily="Inter,sans-serif">
                    {pct === 100 ? "✓ Done" : `${pct}%`}
                  </text>
                  <circle cx={pos.x + 27} cy={pos.y - 27} r={5} fill={PRIORITY_COLOR[n.priority]} />
                </g>
              );
            })}
          </svg>

          {/* Chips */}
          <div style={{ padding: "4px 8px", display: "flex", flexWrap: "wrap", gap: 5 }}>
            {NODES.map(n => {
              const { pct } = nodeStats(n);
              const isSel = n.id === selected;
              return (
                <div key={n.id} onClick={() => { setSelected(isSel ? null : n.id); setActiveTab("concepts"); setExpandedConcepts({}); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 500, transition: "all 0.18s", background: isSel ? n.color + "15" : "#f8fafc", border: `1.5px solid ${isSel ? n.color : T.border}`, color: isSel ? n.color : T.text2 }}>
                  <span>{n.emoji}</span>
                  <span>{n.label.replace("\n", " ")}</span>
                  <span style={{ color: pct === 100 ? "#10b981" : T.text3, fontWeight: 600, fontSize: 10 }}>{pct === 100 ? "✓" : `${pct}%`}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Study Panel */}
        <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
          {!node ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>👆</div>
              <div style={{ fontSize: 15, color: T.text2, lineHeight: 1.7, fontWeight: 500 }}>Click any node to open full study material</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 6 }}>Check off concepts and key points as you study — progress is saved automatically.</div>
              <div style={{ marginTop: 24, width: "100%", maxWidth: 440 }}>
                {NODES.map(n => {
                  const { dc, dk, tc, tk, pct } = nodeStats(n);
                  return (
                    <div key={n.id} onClick={() => setSelected(n.id)} className="hov"
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 6, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                      <span style={{ fontSize: 18 }}>{n.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>{n.label.replace("\n", " ")}</span>
                          <span style={{ fontSize: 11, color: pct === 100 ? "#10b981" : T.text3, fontWeight: 600 }}>{dc + dk}/{tc + tk}</span>
                        </div>
                        <div style={{ height: 5, background: T.progressTrack, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10b981" : n.color, borderRadius: 3, transition: "width 0.4s" }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: pct === 100 ? "#10b981" : T.text3, fontWeight: 700, minWidth: 34, textAlign: "right" }}>{pct === 100 ? "✓" : `${pct}%`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", animation: "fadeIn 0.25s ease" }}>
              {/* Node header */}
              <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: node.color + "12", border: `2px solid ${node.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{node.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: node.color }}>{node.label.replace("\n", " ")}</h2>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: PRIORITY_COLOR[node.priority] + "18", border: `1px solid ${PRIORITY_COLOR[node.priority]}55`, color: PRIORITY_COLOR[node.priority], fontWeight: 700 }}>{node.priority}</span>
                      <span style={{ color: T.text3, fontWeight: 500 }}>⏱ {node.weeks}w recommended</span>
                    </div>
                  </div>
                  {/* Node progress donut */}
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <svg width={54} height={54} viewBox="0 0 54 54">
                      <circle cx={27} cy={27} r={22} fill="none" stroke={T.progressTrack} strokeWidth={4} />
                      <circle cx={27} cy={27} r={22} fill="none" stroke={ns.pct === 100 ? "#10b981" : node.color} strokeWidth={4}
                        strokeDasharray={`${(ns.pct / 100) * 138} 138`} strokeLinecap="round"
                        transform="rotate(-90 27 27)" style={{ transition: "stroke-dasharray 0.4s" }} />
                      <text x={27} y={32} textAnchor="middle" fill={ns.pct === 100 ? "#10b981" : T.text} fontSize={12} fontWeight="800" fontFamily="Inter,sans-serif">{ns.pct}%</text>
                    </svg>
                    <div style={{ fontSize: 9, color: T.text3, fontWeight: 500, marginTop: -2 }}>{ns.dc + ns.dk}/{ns.tc + ns.tk} done</div>
                  </div>
                </div>

                {/* Overview */}
                <div style={{ background: node.color + "08", borderLeft: `3px solid ${node.color}`, padding: "10px 14px", marginBottom: 14, borderRadius: "0 8px 8px 0", fontSize: 12, lineHeight: 1.65, color: T.text2 }}>
                  {node.overview}
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[["concepts", `💡 Concepts (${ns.dc}/${ns.tc})`], ["keypoints", `✦ Key Points (${ns.dk}/${ns.tk})`], ["resources", "🔗 Resources"]].map(([id, label]) => (
                    <div key={id} className="tab-b" onClick={() => setActiveTab(id)}
                      style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: "8px 8px 0 0", background: activeTab === id ? T.bg : "transparent", border: `1px solid ${activeTab === id ? T.border : "transparent"}`, borderBottom: activeTab === id ? `1px solid ${T.bg}` : `1px solid ${T.border}`, color: activeTab === id ? node.color : T.text3, fontFamily: "inherit" }}>{label}</div>
                  ))}
                </div>
              </div>

              {/* Tab body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 28px" }}>

                {/* CONCEPTS */}
                {activeTab === "concepts" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>Click to expand · check off when you understand it</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => markAllConcepts(node.id, true)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: node.color + "12", border: `1px solid ${node.color}40`, color: node.color, fontFamily: "inherit", fontWeight: 600 }}>Mark All ✓</button>
                        <button onClick={() => markAllConcepts(node.id, false)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: "#fff", border: `1px solid ${T.border2}`, color: T.text3, fontFamily: "inherit" }}>Clear All</button>
                      </div>
                    </div>
                    {node.concepts.map((c, i) => {
                      const isOpen = expandedConcepts[`${node.id}-${i}`];
                      const done = progress[node.id].concepts[i];
                      return (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div className={!isOpen ? "hov" : ""} style={{ background: isOpen ? "#fff" : "#fff", border: `1.5px solid ${done ? node.color + "80" : isOpen ? node.color + "50" : T.border}`, borderRadius: isOpen ? "10px 10px 0 0" : 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: isOpen ? `0 2px 8px ${node.color}10` : "0 1px 2px rgba(0,0,0,0.04)" }}>
                            <div className="chk-wrap" onClick={e => { e.stopPropagation(); toggleConcept(node.id, i); }}
                              style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: done ? node.color : "#fff", border: `2px solid ${done ? node.color : T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", boxShadow: done ? `0 0 0 3px ${node.color}20` : "none" }}>
                              {done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }} onClick={() => setExpandedConcepts(e => ({ ...e, [`${node.id}-${i}`]: !e[`${node.id}-${i}`] }))}>
                              <span style={{ color: done ? node.color + "aa" : T.text, fontSize: 13, fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>{c.term}</span>
                            </div>
                            <span style={{ color: T.text3, fontSize: 12 }} onClick={() => setExpandedConcepts(e => ({ ...e, [`${node.id}-${i}`]: !e[`${node.id}-${i}`] }))}>{isOpen ? "▲" : "▼"}</span>
                          </div>
                          {isOpen && (
                            <div style={{ background: "#fafbfc", border: `1.5px solid ${node.color}30`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 16px", fontSize: 13, lineHeight: 1.8, color: T.text2, animation: "fadeIn 0.2s ease" }}>
                              {c.explanation}
                              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                                <button onClick={() => toggleConcept(node.id, i)} style={{ padding: "6px 14px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: done ? "#f8fafc" : node.color, border: done ? `1px solid ${T.border2}` : "none", color: done ? T.text3 : "#fff", fontFamily: "inherit", fontWeight: 600, transition: "all 0.18s" }}>
                                  {done ? "↩ Mark as unread" : "✓ Mark as understood"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button onClick={() => { const o = {}; node.concepts.forEach((_, i) => { o[`${node.id}-${i}`] = true; }); setExpandedConcepts(e => ({ ...e, ...o })); }} style={{ padding: "6px 14px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: node.color + "12", border: `1px solid ${node.color}40`, color: node.color, fontFamily: "inherit", fontWeight: 600 }}>Expand All</button>
                      <button onClick={() => { const o = {}; node.concepts.forEach((_, i) => { o[`${node.id}-${i}`] = false; }); setExpandedConcepts(e => ({ ...e, ...o })); }} style={{ padding: "6px 14px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: "#fff", border: `1px solid ${T.border2}`, color: T.text3, fontFamily: "inherit" }}>Collapse All</button>
                    </div>
                  </div>
                )}

                {/* KEY POINTS */}
                {activeTab === "keypoints" && (
                  <div style={{ animation: "fadeIn 0.2s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>Check off each point when you can recall it confidently</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => markAllKeypoints(node.id, true)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: node.color + "12", border: `1px solid ${node.color}40`, color: node.color, fontFamily: "inherit", fontWeight: 600 }}>Mark All ✓</button>
                        <button onClick={() => markAllKeypoints(node.id, false)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", borderRadius: 6, background: "#fff", border: `1px solid ${T.border2}`, color: T.text3, fontFamily: "inherit" }}>Clear All</button>
                      </div>
                    </div>
                    {node.keyPoints.map((kp, i) => {
                      const done = progress[node.id].keypoints[i];
                      return (
                        <div key={i} className="hov" onClick={() => toggleKeypoint(node.id, i)}
                          style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 14px", marginBottom: 8, background: done ? node.color + "08" : "#fff", border: `1.5px solid ${done ? node.color + "50" : T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.18s", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                          <div className="chk-wrap" style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1, background: done ? node.color : "#fff", border: `2px solid ${done ? node.color : T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", boxShadow: done ? `0 0 0 3px ${node.color}20` : "none" }}>
                            {done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 13, color: done ? T.text3 : T.text2, textDecoration: done ? "line-through" : "none", lineHeight: 1.65, transition: "all 0.18s" }}>
                            <span style={{ color: node.color, fontWeight: 700, marginRight: 6 }}>{i + 1}.</span>{kp}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* RESOURCES */}
                {activeTab === "resources" && (
                  <div style={{ animation: "fadeIn 0.2s ease" }}>
                    <div style={{ fontSize: 11, color: T.text3, marginBottom: 14, fontWeight: 500 }}>Hand-picked resources — highest signal-to-noise for this topic.</div>
                    {node.resources.map((r, i) => (
                      <div key={i} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: node.color + "12", border: `1.5px solid ${node.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: node.color, fontWeight: 700 }}>{i + 1}</div>
                          <div>
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="res-a" style={{ fontSize: 13, display: "block", marginBottom: 3 }}>{r.title} ↗</a>
                            <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.55 }}>{r.desc}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", padding: "5px 8px", background: T.bg3, borderRadius: 5, wordBreak: "break-all" }}>{r.url}</div>
                      </div>
                    ))}
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