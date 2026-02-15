# Clinical Test Script: Pediatric Respiratory Path
**File:** `/docs/testing/clinical-test-peds-respiratory.md`

Test the following patient scenarios in sequence:

## Scenario 1: "Red Priority - Very Severe Disease"
*   **Inputs:** Age: 8 months. Danger Sign: "Lethargic" = YES. RR: 45.
*   **Expected Output:** Immediate `RED` priority. "URGENT REFERRAL" action plan.
*   **Verify:** App prevents transition to "observations" section (skips it).

## Scenario 2: "Yellow Priority - Severe Pneumonia"
*   **Inputs:** Age: 24 months. Danger Signs: All NO. Chest Indrawing: YES. RR: 55.
*   **Expected Output:** `YELLOW` priority. "Start antibiotic" action.
*   **Verify:** "Fast breathing" warning appears next to RR field.

## Scenario 3: "Green Priority - Cough/Cold"
*   **Inputs:** Age: 36 months. Danger Signs: All NO. Chest Indrawing: NO. RR: 35.
*   **Expected Output:** `GREEN` priority. "Home care" advice.
*   **Verify:** All "urgent" UI styling is absent.

## Scenario 4: "Data Persistence & Resume"
1.  Start Scenario 2.
2.  Enter RR, but force-close the app before saving.
3.  Reopen the app. **Expected:** Form is in "draft" with RR value intact.