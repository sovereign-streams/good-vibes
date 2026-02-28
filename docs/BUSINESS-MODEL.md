# Good Vibes — Business Model & Sustainability

## The Mission

Pay infrastructure bills. Fund advocacy. Spread the idea. That's it.

Good Vibes exists to prove that algorithmic sovereignty works in practice — and to make it accessible to anyone. The business model serves the mission, not the other way around.

---

## Revenue Streams

### 1. Pro Subscriptions — $9/month

The primary revenue source. Clear value proposition:

| | Community (Free) | Pro ($9/mo) |
|---|---|---|
| Requests/day | 200 | 5,000 |
| Exchange models | Curated only | All (including full browse) |
| Max items/payload | 25 | 100 |
| Enrichment priority | Standard queue | Priority |
| Support | Community | Email |

**Why $9?** Low enough to be impulse-affordable. High enough to cover per-user infrastructure costs with margin. In the range of a streaming service add-on, not a SaaS product.

**Who pays?** Power users running their own PAE with custom profiles, developers building on top of Good Vibes, small apps integrating the feed.

**Who doesn't need to pay?** A casual user browsing curated sessions through the default web shell. The free tier is genuinely useful for personal use.

### 2. Telemetry Exchange

Users trade engagement data for benefits:
- Full session telemetry → 30 days free Pro
- Weekly aggregates → 30% off Pro

**Value to Good Vibes:** Better enrichment data. Understanding which content actually resonates improves tagging quality, which improves the product for everyone.

**Value to users:** Free or cheaper access. And they know exactly what they're sharing.

**Critical:** This must never feel coercive. The free tier is fully functional without telemetry. This is a bonus, not a gate.

### 3. Partner/Enterprise Tier — Custom Pricing

For organizations building on Good Vibes:
- Media companies wanting enriched metadata for their own content
- Education platforms integrating curated learning content
- Wellness apps embedding cognitive environment features
- Other SEP providers wanting to cross-reference enrichment data

Pricing: Custom, based on volume and use case. Could be $99/mo for a small app to $999/mo for enterprise integration.

### 4. Ethical Sponsored Content — Future

If/when implemented:
- Sponsors pay Good Vibes to include their content in payloads
- Content still passes the enrichment pipeline — no score inflation
- Transparently tagged (consumers see it's sponsored)
- Consumers opt in and earn a share of the sponsor's payment
- Good Vibes takes a margin (e.g., 30% provider / 70% to consumer)

**Why "ethical"?** The consumer chooses to see ads. The consumer gets paid. The content is honestly scored. This is advertising as a voluntary value exchange, not an attention extraction system.

### 5. Creator Tips — Future

- Consumers tip creators through Good Vibes
- Good Vibes processes the payment and takes a small fee (10%)
- Creates a direct creator-audience value exchange
- Incentivizes creators to produce "Good Vibes-friendly" content

---

## Cost Structure

### Per-User Costs (at scale)

| Cost | Per User/Month | Notes |
|------|---------------|-------|
| LLM enrichment | ~$0.05 | Haiku, amortized across index |
| Storage | ~$0.01 | SQLite/S3, metadata only |
| Bandwidth | ~$0.02 | Meta-first = tiny payloads |
| Compute | ~$0.02 | Stateless query engine |
| **Total** | **~$0.10** | Per active user |

At $9/mo Pro and $0.10/user cost: **$8.90 margin per paying user.**

### Fixed Costs

| Cost | Monthly | Notes |
|------|---------|-------|
| YouTube API (paid tier) | $200-1,000 | Scale-dependent |
| Servers (baseline) | $200-500 | 2-3 VPS or cloud instances |
| Domain/SSL/DNS | $20 | Minimal |
| Monitoring/logging | $50-100 | Datadog or equivalent |
| **Total fixed** | **~$500-1,600** | Before any revenue |

### Break-Even Analysis

```
Fixed costs: ~$1,000/mo
Variable per user: ~$0.10
Pro price: $9/mo

Break-even subscribers: ~115
At 10K total users, 3% conversion: 300 Pro users × $9 = $2,700/mo ✅
At 100K total users, 3% conversion: 3,000 Pro users × $9 = $27,000/mo ✅✅
```

This is sustainable at modest scale. No VC required. No growth-at-all-costs pressure.

---

## Organizational Options

### Option A: For-Profit LLC

**Pros:** Simple. Paul owns it. Fast decisions. Standard business banking.
**Cons:** Harder to build community trust. "For-profit algorithmic sovereignty" is a tougher sell.
**Best for:** Getting started quickly. Can convert later.

### Option B: Non-Profit (501c3)

**Pros:** Tax-exempt. Grant-eligible. Mission-aligned. Community trust.
**Cons:** No equity, no investors, slower bureaucracy. Revenue goes to mission, not personal income. Paul draws a salary, not profits.
**Best for:** Long-term mission alignment. "We're not here to get rich, we're here to fix the internet."

### Option C: DAO

**Pros:** Decentralized governance matches the ethos. Token could align incentives. Community ownership.
**Cons:** Legal complexity. Regulatory risk. Speculation attracts the wrong crowd. Governance is hard.
**Best for:** If the community grows large and wants real ownership. Probably a Phase 2 organizational evolution, not a starting point.

### Option D: Hybrid — Non-Profit Protocol + For-Profit Provider

**Pros:** Clean separation. SEP Foundation (non-profit) owns the protocol. Good Vibes Inc. (for-profit or non-profit) operates the first provider. Paul can draw salary from the provider entity while the protocol remains community-owned.
**Cons:** Two entities to manage. More accounting.
**Best for:** The long game. This is how HTTP (W3C) and Firefox (Mozilla Foundation + Mozilla Corp) work.

### Recommendation

**Start as LLC.** It's the simplest path to getting revenue flowing and paying bills. Structure it so conversion to non-profit or hybrid is possible later. The important thing is that the **protocol spec is always open** regardless of the business entity.

---

## What Success Looks Like

### Year 1
- 1,000 active users
- 50 Pro subscribers ($450/mo)
- Protocol spec at v0.2.0
- 1-2 third-party providers experimenting with SEP
- Costs covered by Pro revenue + Paul's time investment

### Year 2
- 10,000 active users
- 500 Pro subscribers ($4,500/mo)
- 2-3 community contributors to the spec
- First partner integration
- Paul can work on this full-time (or close to it)

### Year 3
- 100,000 active users
- 3,000+ Pro subscribers ($27,000/mo)
- SEP Foundation established (non-profit)
- 5+ independent SEP providers
- Good Vibes is the reference implementation, not the only implementation
- The idea has spread beyond one person's project

### The Real Success Metric

**Not revenue. Not users. Not providers.**

The real success metric is: **Can a person control what shapes their mind?**

If a teenager can run a PAE, connect to multiple providers, and decide what they see — without any platform extracting their attention — that's success. Everything else is infrastructure to get there.
