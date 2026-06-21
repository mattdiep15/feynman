# Feynman — dependent nodes, meta node & learning infrastructure prompt

Three connected changes: concept dependency edges, a meta Learning Profile node, and an invisible infrastructure layer that feeds both. Implement in this order — data model first, then graph rendering, then inference logic.

---

## Overview of changes

| Area | What changes |
|------|-------------|
| Redis data model | Add `edgeType` field, `hasUnmetPrerequisites` flag, `effectiveMastery`, `longterm memory` schema |
| Claude extraction prompt | Classify edges as `depends_on`, `relates_to`, or `is_example_of` |
| Graph rendering (`nodeCanvasObject`) | Dependency indicator on nodes, directional arrows on edges, meta node style |
| `/api/evaluate` | Prerequisite propagator, pattern detector, style inferrer run after every session |
| New component | `LearningProfilePanel` — shown when meta node is clicked |

---

## 1. Data model changes

### Edge types

Every edge now has a `type` field. Update the Redis edge schema and the Claude extraction prompt to classify each relationship.

```ts
// Three edge types
type EdgeType = 'depends_on' | 'relates_to' | 'is_example_of'

// Redis: edges:demo:finance:{conceptId}
// Members now include type: "{toId}:{type}"
// e.g. "principal:depends_on" or "inflation:relates_to"
```

Update the Claude extraction prompt:

```ts
const extractionPrompt = `
Given these notes, extract concepts and relationships.
For each edge, classify the relationship type:
- depends_on: understanding concept A requires understanding concept B first
- relates_to: concepts are connected but neither is a strict prerequisite
- is_example_of: one concept is a concrete instance of another

Return ONLY valid JSON:
{
  "concepts": [
    { "id": "compound_interest", "name": "Compound Interest", "summary": "..." }
  ],
  "edges": [
    { "from": "compound_interest", "to": "principal", "type": "depends_on" },
    { "from": "compound_interest", "to": "inflation", "type": "relates_to" }
  ]
}
`
```

### Node fields — add to every concept hash

```ts
// Additional fields on concept:{userId}:{brainId}:{conceptId}
{
  // existing fields...
  masteryScore:           number,   // 0–100, raw score from last teachback
  status:                 string,   // untouched | weak | learning | improving | mastered
  everAttempted:          boolean,

  // new fields
  effectiveMastery:       number,   // masteryScore penalised by unmet prerequisites
  hasUnmetPrerequisites:  boolean,  // true if any depends_on node is below 70%
  prerequisiteIds:        string[], // list of concept IDs this node depends on
}
```

### Long-term memory schema

```ts
// memory:longterm:demo — HASH
{
  explanationStyle:     'analogy-first' | 'example-first' | 'definition-first' | 'unknown',
  confusionPatterns:    string[],   // e.g. ["skips time component", "conflates rate with return"]
  confidenceGap:        boolean,    // fluent explanations that miss key mechanisms
  verbosityPref:        'brief' | 'standard' | 'detailed',
  strongConcepts:       string[],   // conceptIds with mastery > 80%
  weakPrerequisites:    string[],   // prerequisite conceptIds with mastery < 50%
  sessionCount:         number,
  scoreTrajectory:      number[],   // last 10 session avg scores
  lastUpdated:          string,     // ISO timestamp
}
```

---

## 2. Graph rendering — `nodeCanvasObject`

Replace the existing `nodeCanvasObject` with this consolidated function. Handles all five mastery states, the meta node, the dependency indicator, and hollow untouched nodes.

```ts
// lib/nodeColors.ts
export function nodeFill(status: string): string {
  switch (status) {
    case 'weak':      return '#FEF2F2'
    case 'learning':  return '#FFFBEB'
    case 'improving': return '#F3F0FF'
    case 'mastered':  return '#ECFDF5'
    default:          return 'transparent'
  }
}

export function nodeBorder(status: string): string {
  switch (status) {
    case 'weak':      return '#FCA5A5'
    case 'learning':  return '#FDE68A'
    case 'improving': return '#C4B5FD'
    case 'mastered':  return '#22C55E'
    default:          return '#D1D5DB'
  }
}

export function nodeTextColor(status: string): string {
  switch (status) {
    case 'weak':      return '#EF4444'
    case 'learning':  return '#D97706'
    case 'improving': return '#7C3AED'
    case 'mastered':  return '#16523A'
    default:          return '#9CA3AF'
  }
}
```

```ts
// In NeuronMap.tsx — pass to ForceGraph2D
nodeCanvasObject={(node, ctx, globalScale) => {
  const r = node.type === 'meta'
    ? 18
    : node.status === 'untouched'
      ? 10
      : Math.max(12, (node.masteryScore / 100) * 28 + 10)

  // ── Meta node ─────────────────────────────────────────────────────────
  if (node.type === 'meta') {
    // dashed border
    ctx.setLineDash([3 / globalScale, 2 / globalScale])
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.strokeStyle = '#7C3AED'
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
    ctx.setLineDash([])

    // soft fill
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = '#F3F0FF'
    ctx.fill()

    // label
    const fontSize = 9 / globalScale
    ctx.font = `500 ${fontSize}px system-ui`
    ctx.fillStyle = '#7C3AED'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Learning', node.x, node.y - fontSize * 0.7)
    ctx.fillText('Profile',  node.x, node.y + fontSize * 0.7)
    return
  }

  // ── Untouched node — hollow ────────────────────────────────────────────
  if (node.status === 'untouched') {
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.strokeStyle = '#D1D5DB'
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
    // no fill
  } else {
    // ── Standard mastery node ────────────────────────────────────────────
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = nodeFill(node.status)
    ctx.fill()
    ctx.strokeStyle = nodeBorder(node.status)
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
  }

  // ── Dependency indicator — small grey dot in top-right corner ─────────
  if (node.hasUnmetPrerequisites) {
    const dotR = 3.5 / globalScale
    const dotX = node.x + r * 0.65
    const dotY = node.y - r * 0.65
    ctx.beginPath()
    ctx.arc(dotX, dotY, dotR, 0, 2 * Math.PI)
    ctx.fillStyle = '#9CA3AF'
    ctx.fill()
    ctx.strokeStyle = '#FAFAF9'
    ctx.lineWidth = 1 / globalScale
    ctx.stroke()
  }

  // ── Label ─────────────────────────────────────────────────────────────
  const fontSize = 10 / globalScale
  ctx.font = `${node.status === 'untouched' ? '400' : '500'} ${fontSize}px system-ui`
  ctx.fillStyle = nodeTextColor(node.status)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(node.name, node.x, node.y)
}}
nodeCanvasObjectMode={() => 'replace'}
```

### Edge rendering — directional arrows on `depends_on` edges

```ts
<ForceGraph2D
  // ... existing props

  linkDirectionalArrowLength={link => link.type === 'depends_on' ? 5 : 0}
  linkDirectionalArrowRelPos={1}
  linkColor={link =>
    link.type === 'depends_on'   ? '#C4B5FD' :
    link.type === 'is_example_of'? '#FDE68A' :
    '#E5E7EB'
  }
  linkWidth={link => link.type === 'depends_on' ? 1.5 : 0.8}
  linkOpacity={0.7}
/>
```

---

## 3. The meta node

### Adding it to the graph data

The meta node is injected into the graph data client-side — it is not stored as a concept in Redis. Add it when building the graph payload:

```ts
// in /api/graph or in the client before passing to ForceGraph2D
const metaNode = {
  id:   'learning_profile',
  name: 'Learning Profile',
  type: 'meta',           // triggers meta rendering in nodeCanvasObject
  // no masteryScore, no status, no everAttempted
}

const graphData = {
  nodes: [...conceptNodes, metaNode],
  links: [...conceptEdges],
  // meta node has no edges — it floats freely
}
```

### Learning Profile panel

When the meta node is clicked, show a panel (sidebar or modal) with the inferred learning data.

```tsx
// components/LearningProfilePanel.tsx
type LearningProfile = {
  explanationStyle:  string
  confusionPatterns: string[]
  confidenceGap:     boolean
  verbosityPref:     string
  strongConcepts:    string[]
  weakPrerequisites: string[]
  sessionCount:      number
  scoreTrajectory:   number[]
}

export function LearningProfilePanel({ profile }: { profile: LearningProfile }) {
  return (
    <div style={{
      background: '#FAFAF9', border: '0.5px solid #E5E7EB',
      borderRadius: 12, padding: '20px 24px',
    }}>
      <div style={{ fontSize: 10, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
        Learning Profile
      </div>

      <Row label="Explanation style"  value={profile.explanationStyle} />
      <Row label="Feedback preference" value={profile.verbosityPref} />
      <Row label="Sessions completed" value={String(profile.sessionCount)} />
      <Row label="Confidence gap"     value={profile.confidenceGap ? 'Detected' : 'None'} />

      {profile.confusionPatterns.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 6 }}>Recurring patterns</div>
          {profile.confusionPatterns.map(p => (
            <div key={p} style={{
              fontSize: 11, color: '#EF4444',
              background: '#FEF2F2', border: '0.5px solid #FCA5A5',
              borderRadius: 6, padding: '3px 8px', marginBottom: 4, display: 'inline-block', marginRight: 4,
            }}>{p}</div>
          ))}
        </div>
      )}

      {profile.strongConcepts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 6 }}>Strong areas</div>
          {profile.strongConcepts.map(c => (
            <div key={c} style={{
              fontSize: 11, color: '#16523A',
              background: '#ECFDF5', border: '0.5px solid #22C55E',
              borderRadius: 6, padding: '3px 8px', marginBottom: 4, display: 'inline-block', marginRight: 4,
            }}>{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #E5E7EB' }}>
      <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
```

Wire up the click handler on the neuron map:

```ts
onNodeClick={(node) => {
  if (node.type === 'meta') {
    setShowLearningProfile(true)
  } else {
    setActiveConceptId(node.id)
    switchTab('chat')
  }
}}
```

---

## 4. Invisible infrastructure — runs after every evaluation

Add these three functions to `/api/evaluate`. They run after the score is written to Redis, silently, on every session. They never block the response.

### A. Prerequisite propagator

Recalculates `effectiveMastery` and `hasUnmetPrerequisites` for every node that depends on the concept just evaluated.

```ts
// lib/prerequisitePropagator.ts
export async function propagatePrerequisites(
  changedConceptId: string,
  brainId: string,
  userId: string,
  redis: RedisClient
) {
  // Get all concepts that depend on the changed concept
  const allConcepts = await getAllConcepts(redis, userId, brainId)

  for (const concept of allConcepts) {
    if (!concept.prerequisiteIds?.includes(changedConceptId)) continue

    // Check all prerequisites for this concept
    const prereqScores = await Promise.all(
      concept.prerequisiteIds.map(async id => {
        const data = await redis.hGetAll(`concept:${userId}:${brainId}:${id}`)
        return Number(data.masteryScore ?? 0)
      })
    )

    const hasUnmet = prereqScores.some(score => score < 70)
    const minPrereq = Math.min(...prereqScores)

    // effectiveMastery is penalised if prerequisites are weak
    const effectiveMastery = hasUnmet
      ? Math.min(concept.masteryScore, minPrereq * 0.8)
      : concept.masteryScore

    await redis.hSet(`concept:${userId}:${brainId}:${concept.id}`, {
      hasUnmetPrerequisites: hasUnmet ? '1' : '0',
      effectiveMastery: String(Math.round(effectiveMastery)),
    })
  }
}
```

### B. Pattern detector

Looks for recurring gaps across sessions and updates `confusionPatterns` in long-term memory.

```ts
// lib/patternDetector.ts
export async function detectPatterns(
  transcript: string,
  evaluation: EvaluationResult,
  redis: RedisClient,
  userId: string
) {
  // Pull existing memory
  const memory = await redis.hGetAll(`memory:longterm:${userId}`)
  const patterns: string[] = JSON.parse(memory.confusionPatterns ?? '[]')

  // Ask Claude to identify recurring patterns in this explanation
  const patternPrompt = `
    The user explained a concept. Identify any recurring confusion patterns in 3 words or less.
    Only flag patterns that are clearly wrong, not just incomplete.
    Transcript: "${transcript}"
    Missing concepts: ${evaluation.missing.join(', ')}
    Misconceptions: ${evaluation.misconceptions.join(', ')}
    
    Return ONLY a JSON array of short pattern strings, or [] if none.
    Example: ["skips time component", "conflates rate with return"]
  `

  const newPatterns = await callClaude(patternPrompt)

  // Merge with existing, deduplicate
  const merged = [...new Set([...patterns, ...newPatterns])].slice(0, 8)

  await redis.hSet(`memory:longterm:${userId}`, {
    confusionPatterns: JSON.stringify(merged),
    lastUpdated: new Date().toISOString(),
  })
}
```

### C. Style inferrer

Detects verbosity preference and explanation style from score trends.

```ts
// lib/styleInferrer.ts
export async function inferStyle(
  transcript: string,
  newScore: number,
  previousScore: number,
  redis: RedisClient,
  userId: string
) {
  const memory = await redis.hGetAll(`memory:longterm:${userId}`)
  const sessionCount = Number(memory.sessionCount ?? 0) + 1
  const trajectory = JSON.parse(memory.scoreTrajectory ?? '[]')

  // Detect confidence gap: long transcript, low score improvement
  const wordCount = transcript.split(' ').length
  const scoreImprovement = newScore - previousScore
  const confidenceGap = wordCount > 80 && scoreImprovement < 10

  // Update trajectory
  trajectory.push(newScore)
  if (trajectory.length > 10) trajectory.shift()

  await redis.hSet(`memory:longterm:${userId}`, {
    sessionCount:    String(sessionCount),
    scoreTrajectory: JSON.stringify(trajectory),
    confidenceGap:   confidenceGap ? '1' : '0',
  })
}
```

### Wiring into `/api/evaluate`

```ts
// in /api/evaluate — after writing new score to Redis
const previousScore = Number(existingConcept.masteryScore ?? 0)

// Write new score first
await redis.hSet(`concept:${userId}:${brainId}:${conceptId}`, {
  masteryScore: String(evaluation.masteryScore),
  status: masteryToStatus(evaluation.masteryScore, true),
  everAttempted: '1',
})

// Run infrastructure silently — do not await, don't block response
Promise.all([
  propagatePrerequisites(conceptId, brainId, userId, redis),
  detectPatterns(transcript, evaluation, redis, userId),
  inferStyle(transcript, evaluation.masteryScore, previousScore, redis, userId),
]).catch(err => console.error('Infrastructure error:', err))

// Return evaluation to client immediately
return Response.json(evaluation)
```

---

## 5. Inject learning profile into Claude evaluation prompt

```ts
// in /api/evaluate — before calling Claude
const memory = await redis.hGetAll(`memory:longterm:${userId}`)
const confusionPatterns = JSON.parse(memory.confusionPatterns ?? '[]')
const confidenceGap = memory.confidenceGap === '1'

const learningProfileBlock = sessionCount > 2
  ? `
User learning profile (inferred from ${memory.sessionCount} sessions):
${confusionPatterns.length > 0 ? `- Recurring confusion patterns: ${confusionPatterns.join(', ')}` : ''}
${confidenceGap ? '- Confidence gap detected: this user often sounds fluent but misses key mechanisms — push for specificity' : ''}
- Preferred feedback depth: ${memory.verbosityPref ?? 'standard'}

Factor these into your evaluation. Reference specific patterns if they appear in this explanation.
`
  : '' // don't inject on first two sessions — not enough data yet
```

---

## Critical rules

1. **Meta node is client-side only** — never write it to Redis. Inject it into graph data in the frontend before passing to `ForceGraph2D`.
2. **Infrastructure functions must never block the API response** — use `Promise.all().catch()` without `await`. If they fail, the session still completes.
3. **`effectiveMastery` is display-only** — the raw `masteryScore` is always the source of truth for mastery state and coloring. `effectiveMastery` is only used in the Progress tab to show a "effective" secondary value.
4. **Don't inject learning profile into Claude before session 3** — there isn't enough data and it adds noise.
5. **`nodeCanvasObject` must call `ctx.setLineDash([])` after drawing the meta node** — forgetting to reset the dash pattern will make all subsequent nodes render with dashed borders.
6. **Edge types are written at extraction time** — never infer them later. If Claude didn't classify an edge, default to `relates_to`.
7. **`hasUnmetPrerequisites` only considers `depends_on` edges** — `relates_to` and `is_example_of` edges never block mastery.
