# Plan: Merge Autotrade Interfaces

## Decision Summary
- **Payment:** Keep x402 ($1/day USDC required)
- **UI Location:** Header AUTO button (remove wallet tab)
- **Backend:** StrategyLoop (plugin-strategy-core)

---

## Implementation Plan

### Phase 1: Backend - Add Subscription Check to Automation API

**File:** `src/packages/server/src/api/automation/index.ts`

1. Import AutotradeService
2. Add subscription status to `GET /status` response
3. Block toggle ON if no active subscription (return 402)
4. Add `POST /pay-and-enable` endpoint:
   - Transfer $1 USDC to treasury
   - Activate subscription
   - Enable automation
   - Send welcome chat message

### Phase 2: Backend - StrategyLoop Subscription Validation

**File:** `src/plugins/plugin-strategy-core/src/services/strategy-loop.service.ts`

1. Add `checkSubscription(userId)` method that queries AutotradeService
2. In `executeCycleForUser()`, check subscription before trading
3. If expired: disable automation, notify user via chat

### Phase 3: Frontend - Update Automation Modal

**File:** `src/frontend/components/automation/automation-modal-content.tsx`

1. Add subscription state from status response
2. Add subscription status UI:
   - Inactive: "$1/day required" + "Pay & Enable" button
   - Active: Time remaining display (e.g., "23h 45m")
3. Modify toggle: if no subscription, trigger payment flow instead

**File:** `src/packages/api-client/src/services/automation.ts`

1. Add `SubscriptionStatus` interface
2. Add subscription to `AutomationStatusResponse`
3. Add `payAndEnable(channelId?)` method

### Phase 4: Cleanup - Remove Wallet Autotrade Tab

**File:** `src/frontend/components/dashboard/cdp-wallet-card/index.tsx`

1. Remove "Autotrade" from tabs array
2. Remove AutotradeTab import
3. Remove conditional render

---

## Critical Files

| File | Changes |
|------|---------|
| `src/packages/server/src/api/automation/index.ts` | Add subscription check, pay-and-enable endpoint |
| `src/plugins/plugin-strategy-core/src/services/strategy-loop.service.ts` | Validate subscription before trading |
| `src/frontend/components/automation/automation-modal-content.tsx` | Add subscription UI, payment flow |
| `src/packages/api-client/src/services/automation.ts` | Add subscription types/methods |
| `src/frontend/components/dashboard/cdp-wallet-card/index.tsx` | Remove Autotrade tab |

---

## User Flow After Implementation

```
User clicks AUTO button
    ↓
Modal opens, shows subscription status
    ↓
If no subscription:
    → Show "$1/day required" + "Pay & Enable" button
    → User clicks → USDC transferred → Subscription activated → Automation enabled
    ↓
If subscription active:
    → Show time remaining + toggle + config
    → User can toggle on/off, adjust settings
    ↓
StrategyLoop runs every 5 min:
    → Check subscription valid
    → If expired: disable + notify
    → If valid: analyze markets + trade
```

---

## Keep vs Remove

| Component | Action |
|-----------|--------|
| `AutotradeService` | KEEP - handles payments |
| `AutotradeRepository` | KEEP - subscription DB |
| `/api/autotrade/*` | KEEP - payment endpoints |
| `AutotradeTab.tsx` | REMOVE from wallet |
| `automation-modal-content.tsx` | ENHANCE with subscription |
| `StrategyLoop` | ENHANCE with subscription check |
