# Phase 2A Core Worklist - Test Cases & Validation Procedures

## Overview
This document outlines manual test cases for validating the Phase 2A Core Worklist features implemented in the Radiology Dashboard.

---

## Test Environment Setup

### Prerequisites
1. Application server running at `http://localhost:8000`
2. Database seeded with test data
3. Test user accounts:
   - Radiologist user with `radiologist` role
   - Admin user with `admin` role
4. Browser: Chrome/Firefox with developer console open

### Access URL
```
http://localhost:8000/radiology/dashboard
```

---

## Test Case 1: Worklist Display

### Objective
Verify that the radiology worklist displays correctly with study data.

### Steps
1. **Login** as a radiologist user
2. Navigate to **Radiology Dashboard** (should auto-redirect from `/login`)
3. Observe the worklist panel on the left side

### Expected Results
| Checkpoint | Expected |
|------------|----------|
| Worklist loads | Studies displayed within 3 seconds |
| Study cards visible | Each card shows: Patient name, modality, body part, priority badge |
| Empty state | "No studies found" message if no data |
| Loading state | Spinner/skeleton while fetching |

### Pass Criteria
- [ ] Worklist renders without errors
- [ ] Study cards display all required information
- [ ] Pagination controls visible if >20 studies

---

## Test Case 2: Patient Search

### Objective
Verify the search functionality filters studies by patient name.

### Steps
1. Navigate to **Radiology Dashboard**
2. Locate the **Search** input field in the worklist
3. Type a patient name (e.g., "John", "Jane")
4. Observe filtered results

### Expected Results
| Checkpoint | Expected |
|------------|----------|
| Search input exists | Text field with search icon |
| Real-time filtering | Results update as user types (debounced ~300ms) |
| No results | "No studies match your search" message |
| Clear search | "X" button or clear field |

### Pass Criteria
- [ ] Search filters worklist in real-time
- [ ] Case-insensitive matching works
- [ ] Clearing search restores full list

---

## Test Case 3: Status Filtering

### Objective
Verify studies can be filtered by status.

### Steps
1. Navigate to **Radiology Dashboard**
2. Locate the **Status** filter dropdown
3. Test each status option:
   - Pending
   - Ordered
   - In Progress
   - Completed
   - Reported

### Expected Results
| Filter | Expected Behavior |
|--------|------------------|
| Pending | Shows studies with `status = 'pending'` |
| Ordered | Shows studies with `status = 'ordered'` |
| In Progress | Shows studies assigned to current radiologist |
| Completed | Shows completed studies |
| Reported | Shows studies with final reports |

### Pass Criteria
- [ ] Each status filter works correctly
- [ ] Filter combinations work (if multiple filters allowed)
- [ ] "All" option resets filter

---

## Test Case 4: Priority Filtering

### Objective
Verify studies can be filtered by priority level.

### Steps
1. Navigate to **Radiology Dashboard**
2. Locate the **Priority** filter dropdown
3. Test each priority:
   - STAT (Emergency)
   - Urgent
   - Routine
   - Scheduled

### Expected Results
| Priority | Badge Color | Sort Order |
|----------|-------------|-------------|
| STAT | Red | 1 (Highest) |
| Urgent | Orange | 2 |
| Routine | Blue | 3 |
| Scheduled | Gray | 4 |

### Pass Criteria
- [ ] Priority badges display correct colors
- [ ] Studies sort by priority by default

---

## Test Case 5: Modality Filtering

### Objective
Verify studies can be filtered by imaging modality.

### Steps
1. Navigate to **Radiology Dashboard**
2. Locate the **Modality** filter
3. Test each modality:
   - CT
   - MRI
   - X-Ray
   - Ultrasound
   - PET
   - Mammography

### Expected Results
| Checkpoint | Expected |
|------------|----------|
| Filter options | All modalities listed |
| Selection | Shows only selected modality |
| Multi-select | Can select multiple modalities |

### Pass Criteria
- [ ] Modality filter works correctly
- [ ] Studies display correct modality icon

---

## Test Case 6: Sorting Functionality

### Objective
Verify worklist can be sorted by different criteria.

### Steps
1. Navigate to **Radiology Dashboard**
2. Locate **Sort By** dropdown
3. Test sorting options:
   - Priority (default)
   - Date Ordered
   - Patient Name
   - Modality

### Expected Results
| Sort Option | Behavior |
|------------|----------|
| Priority | STAT → Urgent → Routine → Scheduled |
| Date Ordered | Newest first (descending) |
| Patient Name | A-Z alphabetical |
| Modality | Grouped by modality |

### Pass Criteria
- [ ] Default sort is Priority (STAT first)
- [ ] Ascending/descending toggle works

---

## Test Case 7: Study Acceptance

### Objective
Verify radiologist can accept/claim a study.

### Steps
1. Navigate to **Radiology Dashboard**
2. Find an **unassigned** study in the worklist
3. Click **Accept** or **Claim** button on the study card

### Expected Results
| Checkpoint | Expected |
|------------|----------|
| Accept button | Visible on unassigned studies |
| Click action | Study moves to "My Studies" |
| Status update | Study status changes to "In Progress" |
| Assignment | Current user set as `assigned_radiologist_id` |

### Pass Criteria
- [ ] Accept button works
- [ ] Study shows as assigned to current user
- [ ] Success notification appears

---

## Test Case 8: Study Details View

### Objective
Verify clicking a study opens detailed view.

### Steps
1. Navigate to **Radiology Dashboard**
2. Click on any study card
3. Observe study detail panel/slide-out

### Expected Results
| Section | Content |
|---------|---------|
| Patient Info | Name, DOB, Gender |
| Study Details | Modality, Body Part, Clinical Indication |
| Status | Current status with timeline |
| Actions | Accept, Assign, View Report buttons |

### Pass Criteria
- [ ] Clicking study opens details
- [ ] All patient info displays correctly
- [ ] Close button returns to worklist

---

## Test Case 9: Dashboard Statistics

### Objective
Verify dashboard displays correct statistics.

### Steps
1. Navigate to **Radiology Dashboard**
2. Observe the statistics cards at top

### Expected Results
| Stat | Description |
|------|-------------|
| Pending Studies | Count of pending + ordered studies |
| My Studies | Studies assigned to current user |
| Critical Studies | Studies with AI critical flag |
| Completed Today | Studies completed today |

### Pass Criteria
- [ ] Statistics display numeric counts
- [ ] Counts match actual data

---

## Test Case 10: Pagination

### Objective
Verify worklist pagination works correctly.

### Steps
1. Ensure >20 studies exist in database
2. Navigate to **Radiology Dashboard**
3. Observe pagination controls

### Expected Results
| Checkpoint | Expected |
|------------|----------|
| Page indicator | "Page 1 of X" |
| Next/Prev | Buttons to navigate pages |
| Per page | Shows 20 items per page |

### Pass Criteria
- [ ] Pagination controls visible
- [ ] Can navigate to next page
- [ ] Page count accurate

---

## Test Case 11: Real-time Updates (Optional)

### Objective
Verify worklist updates when new studies arrive.

### Steps
1. Open dashboard in two browser tabs
2. Create a new study via API or admin panel
3. Observe if second tab updates

### Expected Results
- Worklist auto-refreshes (polling every 30 seconds)
- Or WebSocket notification appears

### Pass Criteria
- [ ] New studies appear without page refresh

---

## API Endpoint Testing

### Worklist Endpoint
```bash
GET /api/radiology/worklist
```

**Test with curl:**
```bash
curl -X GET "http://localhost:8000/api/radiology/worklist" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": 1,
      "study_uuid": "abc123",
      "modality": "CT",
      "body_part": "Brain",
      "priority": "stat",
      "status": "pending",
      "patient": { "name": "John Doe" }
    }
  ],
  "current_page": 1,
  "last_page": 5,
  "total": 100
}
```

### Filter Testing
```bash
# Filter by status
curl -X GET "http://localhost:8000/api/radiology/worklist?status=pending"

# Filter by priority
curl -X GET "http://localhost:8000/api/radiology/worklist?priority=stat"

# Filter by modality
curl -X GET "http://localhost:8000/api/radiology/worklist?modality=CT"

# Filter assigned to me
curl -X GET "http://localhost:8000/api/radiology/worklist?assigned_to_me=true"
```

---

## Test Data Requirements

### Minimum Test Data
| Table | Records Needed |
|-------|----------------|
| radiology_studies | 25+ (various statuses/priorities) |
| patients | 20+ |
| users | 2+ radiologists |

### Seed Command
```bash
php artisan db:seed --class=RadiologyStudySeeder
```

---

## Bug Reporting Template

If a test fails, document:

1. **Test Case #**: 
2. **Environment**: 
3. **Browser**: 
4. **Steps to Reproduce**:
5. **Expected**:
6. **Actual**:
7. **Screenshots**:
8. **Console Errors**:

---

## Sign-off Checklist

- [ ] All test cases executed
- [ ] All pass criteria met
- [ ] No critical bugs open
- [ ] Performance acceptable (<3s load time)
- [ ] Mobile responsive (if applicable)
- [ ] Approved by QA Lead

---

*Document Version: 1.0*
*Last Updated: 2026-02-20*
*Author: Development Team*
