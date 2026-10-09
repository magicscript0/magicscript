# Viewer Mode Design: Live Game Data & Statistical Engine

## 1. Executive Summary
Viewer Mode is an analytics and live-observation layer for the `magicscript` web platform that consumes real-time game telemetry, historical session outcomes, and player metrics from `https://labx.site`. It provides operators and players with clear real-time visibility into active rounds (row progress, picks, and dynamic multipliers), full session history reconstruction (wins, losses, crash points, duration), and comprehensive aggregated statistics (win rate, net profit/loss, average bets, streak analysis) without disrupting the core gameplay UI or Firebase compatibility.

---

## 2. Data Availability Matrix

| Metric / Value | Direct or Derived | Source API Endpoint & Field | Formula / Derivation Method |
| :--- | :--- | :--- | :--- |
| **Current Session ID** | **Directly** | `/_debug/live-game` → `session_id` | Direct field |
| **Current Account ID** | **Directly** | `/_debug/live-game` → `account_id` | Direct field |
| **Current Bet Sum** (`دخلت بكام`) | **Directly** | `/_debug/live-game` → `bet_sum` | Direct field |
| **Current Win Sum** (`المكسب`) | **Directly** | `/_debug/live-game` → `win_sum` | Direct field (accumulated round prize) |
| **Current Row / Step** (`الصف`) | **Directly** | `/_debug/live-game` → `current_row` | `0` (Level 1) to `9` (Level 10) |
| **Total Rows Played** | **Derived** | `/_debug/live-game` → `user_picks` | `user_picks.length` |
| **User Picks (All)** | **Directly** | `/_debug/live-game` → `user_picks` | Array of column indices (`0`..`4`) |
| **Full 10×5 Matrix** | **Directly** | `/_debug/live-game` → `matrix` | 10 rows × 5 cols (`1`=apple/safe, `0`=skull/bomb) |
| **Current Balance** | **Directly** | `/_debug/balance` → `balance` | Direct numerical balance |
| **Balance at Start of Game** | **Derived** | `/_debug/balance` + `/_debug/live-game` | `balance + bet_sum` (when game is active) |
| **Balance at Start of Day** | **Derived** | `/_debug/balance` + `/_debug/sessions` | `current_balance - sum(s.win_sum - s.bet_sum for s today)` |
| **Historical Sessions List** | **Directly** | `/_debug/sessions` | Array of completed/saved session objects |
| **Session Outcome** | **Directly** | `/_debug/sessions` → `status` | `status === 2` (Win/Cashout), `status === 3` (Loss) |
| **Row Win/Loss Breakdown** | **Derived** | `matrix[row][col]` & `user_picks[row]` | `matrix[row][user_picks[row]] === 1 ? 'WIN' : 'LOSS'` |
| **Session Timestamps** | **Directly** | `/_debug/sessions` → `created_at`, `updated_at` | Epoch milliseconds |

---

## 3. Session Reconstruction Algorithm

```typescript
/**
 * Reconstructs a complete session lifecycle from an API record.
 */
function reconstructSession(session: LabxSessionRecord): ReconstructedSession {
  const isWin = session.status === 2
  const durationMs = session.updated_at - session.created_at
  const rowsPlayed = session.user_picks.length
  
  // Reconstruct step-by-step progress
  const stepBreakdown = session.user_picks.map((pickedCol, rowIndex) => {
    const isSafe = session.matrix[rowIndex][pickedCol] === 1
    const multiplier = ROW_MULTIPLIERS[rowIndex] // [1.23, 1.54, 1.93, 2.41, 4.02, 6.71, 11.18, 27.97, 69.93, 349.68]
    const potentialWin = Number((session.bet_sum * multiplier).toFixed(2))

    return {
      step: rowIndex + 1,
      pickedColumn: pickedCol,
      isSafe,
      multiplier,
      potentialWin
    }
  })

  const netProfit = isWin ? (session.win_sum - session.bet_sum) : -session.bet_sum

  return {
    id: session.id,
    accountId: session.account_id,
    gameId: session.game_id,
    startedAt: new Date(session.created_at),
    endedAt: new Date(session.updated_at),
    durationSeconds: Math.round(durationMs / 1000),
    betAmount: session.bet_sum,
    payoutAmount: session.win_sum,
    netProfit: Number(netProfit.toFixed(2)),
    outcome: isWin ? 'WON' : 'LOST',
    finalRowReached: rowsPlayed,
    steps: stepBreakdown,
    matrix: session.matrix
  }
}
```

---

## 4. Row-by-Row Breakdown Algorithm

```typescript
/**
 * Evaluates live or completed round row matrix against picks.
 */
function getRowByRowBreakdown(
  matrix: number[][],
  userPicks: number[],
  betSum: number,
  currentRow: number
): RowEvaluation[] {
  const MULTIPLIERS = [1.23, 1.54, 1.93, 2.41, 4.02, 6.71, 11.18, 27.97, 69.93, 349.68]
  
  return matrix.map((rowCells, rowIndex) => {
    const pickedCol = userPicks[rowIndex] !== undefined ? userPicks[rowIndex] : null
    const isCurrent = rowIndex === currentRow
    const isPlayed = pickedCol !== null
    const isSafe = pickedCol !== null ? rowCells[pickedCol] === 1 : null
    const multiplier = MULTIPLIERS[rowIndex]
    const stepWinSum = Number((betSum * multiplier).toFixed(2))
    
    // Find safe column indices (1s) vs bomb indices (0s)
    const safeColumns = rowCells.map((val, idx) => (val === 1 ? idx : -1)).filter(idx => idx !== -1)
    const bombColumns = rowCells.map((val, idx) => (val === 0 ? idx : -1)).filter(idx => idx !== -1)

    return {
      rowLevel: rowIndex + 1,
      multiplier,
      stepWinSum,
      pickedCol,
      isCurrent,
      isPlayed,
      isSafe,
      safeColumns,
      bombColumns,
      status: !isPlayed 
        ? (isCurrent ? 'ACTIVE' : 'UPCOMING') 
        : (isSafe ? 'PASSED' : 'BUSTED')
    }
  })
}
```

---

## 5. Statistics Computation Formulas

Given a list of historical sessions $S = [s_1, s_2, \dots, s_n]$:

1. **Total Wagered Amount ($W_{total}$):**
   $$\sum_{s \in S} s.\text{bet\_sum}$$
2. **Total Won Amount ($P_{total}$):**
   $$\sum_{s \in S, s.\text{status} = 2} s.\text{win\_sum}$$
3. **Total Lost Amount ($L_{total}$):**
   $$\sum_{s \in S, s.\text{status} = 3} s.\text{bet\_sum}$$
4. **Net Profit/Loss ($\Delta$):**
   $$\Delta = P_{total} - W_{total}$$
5. **Win Rate ($R_{win}$):**
   $$R_{win} = \left(\frac{|\{s \in S \mid s.\text{status} = 2\}|}{|S|}\right) \times 100\%$$
6. **Biggest Win ($W_{max}$):**
   $$\max_{s \in S} (s.\text{win\_sum})$$
7. **Biggest Loss ($L_{max}$):**
   $$\max_{s \in S, s.\text{status} = 3} (s.\text{bet\_sum})$$
8. **Average Bet Size ($\overline{B}$):**
   $$\overline{B} = \frac{W_{total}}{|S|}$$
9. **Average Win Size ($\overline{W}$):**
   $$\overline{W} = \frac{P_{total}}{|\{s \in S \mid s.\text{status} = 2\}|}$$
10. **Average Loss Size ($\overline{L}$):**
    $$\overline{L} = \frac{L_{total}}{|\{s \in S \mid s.\text{status} = 3\}|}$$

---

## 6. UI Layout Recommendation

A dual-mode layout that offers **Option C (In-Place Mode Switcher)** on `/play` with an expandable analytics drawer/dashboard.

```text
┌────────────────────────────────────────────────────────────────────────┐
│  MAGIC SCRIPT   [ Live Telemetry ]        Account: 978866681   [Exit]  │
│  Mode: [ ● Play Mode ]  [ ◈ Viewer / Analytics Mode ]                  │
├──────────────────────────────────────┬─────────────────────────────────┤
│          LIVE ROUND VIEWER           │        METRICS & WALLET         │
│ ┌──────────────────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ Row 10 [×349.68]  [ ][ ][ ][ ][ ]│ │ │ Balance:        2,194.49 EGP│ │
│ │ Row 9  [×69.93]   [ ][ ][ ][ ][ ]│ │ │ Initial Bet:       10.00 EGP│ │
│ │ ...                              │ │ │ Current Win:       19.30 EGP│ │
│ │ Row 3  [×1.93]    [●][ ][ ][ ][ ]│ │ │ Current Step:      Row 3/10 │ │
│ │ Row 2  [×1.54]    [●][ ][ ][ ][ ]│ │ └─────────────────────────────┘ │
│ │ Row 1  [×1.23]    [●][ ][ ][ ][ ]│ │        AGGREGATE STATS          │
│ └──────────────────────────────────┘ │ ┌─────────────────────────────┐ │
│  Recommended Next: Col 1, 2, 4, 5    │ │ Win Rate:              68.4%│ │
│                                      │ │ Total Bets:       1,450.00  │ │
│                                      │ │ Net Profit:        +342.10  │ │
│                                      │ │ Total Games:             24 │ │
│                                      │ └─────────────────────────────┘ │
├──────────────────────────────────────┴─────────────────────────────────┤
│                      SESSION HISTORY TIMELINE                          │
│ ┌────┬──────────┬──────────┬──────────┬────────┬──────────┬──────────┐ │
│ │ ID │ Time     │ Bet      │ Won      │ Profit │ Rows     │ Status   │ │
│ ├────┼──────────┼──────────┼──────────┼────────┼──────────┼──────────┤ │
│ │ 71 │ 21:28:38 │ 10.00    │ 19.30    │ +9.30  │ Row 3/10 │ ACTIVE   │ │
│ │ 58 │ 21:04:48 │ 1,082.51 │ 1,331.49 │ +248.98│ Row 1/10 │ WON      │ │
│ │ 57 │ 21:02:64 │ 10.00    │ 279.70   │ +269.70│ Row 8/10 │ WON      │ │
│ └────┴──────────┴──────────┴──────────┴────────┴──────────┴──────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Files to be Added
- `src/components/ViewerMode.tsx`: Main viewer visualization container.
- `src/components/ViewerStatsCard.tsx`: Summary statistic badges.
- `src/components/ViewerHistoryTable.tsx`: Session timeline and details modal.
- `src/hooks/useLabxTelemetry.ts`: Polling hook aggregating `live-game`, `sessions`, and `balance`.
- `src/utils/statistics.ts`: Math and aggregation functions.

## 8. Files to be Modified
- `src/pages/Fortune.tsx`: Integrate Play / Viewer mode toggle.
- `src/services/labx.ts`: Add `fetchLabxSessions()` and `fetchLabxBalance()` helpers.
- `src/types/game.ts`: Add telemetry and session interfaces.

## 9. Files to be Preserved (Untouched)
- `src/components/FortuneBoard.tsx` (Existing game grid)
- `src/services/firebase.ts` & `src/services/m11.ts` (Firebase bridges)
- `src/pages/Login.tsx` & `src/pages/GameLogin.tsx` (Auth workflows)
- `src/services/supabase.ts` (Control plane)

## 10. Estimated Effort
- **Adapter & Hook extensions:** ~1.5 hours
- **Analytics engine & calculations:** ~1.5 hours
- **UI Components & Responsive Grid:** ~3.0 hours
- **Testing & Verification:** ~1.0 hour
- **Total:** ~7.0 hours

## 11. Risks & Mitigation
- **Risk:** High-frequency polling on multiple endpoints (`live-game`, `sessions`, `balance`) could introduce rate-limiting.
  - *Mitigation:* Single coordinated poll cycle (1s interval for active game, 5s for inactive, caching sessions list).
- **Risk:** Session timing clock drift between VPS and local client.
  - *Mitigation:* Format times using timestamps provided by the server (`created_at`).
