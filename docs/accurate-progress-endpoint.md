# Accurate Survey Progress Endpoint

## Overview

The `/api/survey/accurate-progress/:session_id` endpoint provides highly accurate survey progress calculation by considering:

1. **Skipping Logic** - Questions that are skipped based on previous answers
2. **Auto-filled N/A Answers** - Questions automatically filled with "N/A" 
3. **Question Applicability** - Which questions are actually relevant for each user

## Endpoint Details

- **Method:** GET
- **URL:** `/api/survey/accurate-progress/:session_id`
- **Authentication:** Required (Private)
- **Parameters:** 
  - `session_id` (path parameter): The survey session ID

## Skipping Logic Implemented

### 1. S008 Logic (Pulang-Pergi di Hari yang Sama)
- **Trigger:** When S008 = "Ya"
- **Skipped Questions:** S009, S010, S011, S013A, S013B, S013C, S013D, S013E, S013F, S014
- **Jump to:** Question index 14
- **Reason:** If user travels round-trip on the same day, questions about accommodation and package details are not applicable

### 2. S012 Logic (Paket Perjalanan)
- **Trigger:** When S012 = "Tidak" 
- **Skipped Questions:** S013A, S013B, S013C, S013D, S013E, S013F, S014
- **Jump to:** Question index 25
- **Reason:** If user didn't buy a travel package, package-related questions are not applicable

### 3. KR005 Auto-fill Logic
- **Trigger:** When KR004 = "Tidak Bekerja"
- **Action:** KR005 is auto-filled with "N/A"
- **Skip:** KR006 (next question)
- **Reason:** If user is not working, job description question is not applicable

## Progress Calculation

### Basic Progress
```
basic_progress_percentage = (answered_questions / total_questions) * 100
```

### Accurate Progress  
```
accurate_progress_percentage = (actually_answered_questions / total_applicable_questions) * 100
```

**Key Differences:**
- **Basic Progress:** Counts all answered questions against total questions
- **Accurate Progress:** Excludes skipped questions and auto-filled N/A answers

## Response Structure

```json
{
  "success": true,
  "data": {
    "session_id": "string",
    "status": "IN_PROGRESS|COMPLETED",
    "current_question_index": 47,
    "current_question": {
      "code": "S029",
      "text": "Question text...",
      "type": "text",
      "options": []
    },
    
    // Progress Metrics
    "total_questions": 48,
    "total_applicable_questions": 45,
    "answered_questions": 47,
    "actually_answered_questions": 46,
    "skipped_questions": 2,
    "na_questions": 1,
    
    // Progress Percentages
    "basic_progress_percentage": 98,
    "accurate_progress_percentage": 100,
    
    // Detailed Breakdown
    "skipped_questions_detail": [
      {
        "questionCode": "S009",
        "reason": "Skipped karena S008 = Ya (pulang-pergi di hari yang sama)"
      }
    ],
    "na_questions_detail": [
      {
        "questionCode": "KR005", 
        "reason": "Auto-filled N/A karena KR004 = Tidak Bekerja"
      }
    ],
    "question_status": [
      {
        "question_code": "KR001",
        "question_text": "Apa jenis kelamin Anda?",
        "index": 0,
        "is_applicable": true,
        "is_answered": true,
        "is_skipped": false,
        "is_na": false,
        "answer": "Laki-laki",
        "skip_reason": null,
        "na_reason": null
      }
    ],
    
    // Additional Metrics
    "responses_count": 47,
    "metrics": {
      "is_breakoff": true,
      "avg_response_time": 216082.26,
      "item_nonresponse": 0,
      "dont_know_response": 2
    }
  }
}
```

## Use Cases

### 1. Frontend Progress Bar
Display accurate progress percentage instead of basic count:
```javascript
// Instead of: (answered / total) * 100
// Use: accurate_progress_percentage
```

### 2. Survey Analytics
Analyze which questions are most commonly skipped:
```javascript
const skippedQuestions = response.data.skipped_questions_detail;
const skipReasons = skippedQuestions.map(q => q.reason);
```

### 3. Debug Survey Flow
Check question status for troubleshooting:
```javascript
const questionStatus = response.data.question_status;
const applicableQuestions = questionStatus.filter(q => q.is_applicable);
```

### 4. Completion Tracking
Determine if survey is truly complete:
```javascript
const isComplete = response.data.accurate_progress_percentage === 100;
```

## Error Handling

### 400 Bad Request
```json
{
  "success": false,
  "message": "Session ID is required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Unauthorized: This survey session does not belong to the authenticated user"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Survey session not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Questionnaire not found"
}
```

## Implementation Notes

### Service Layer (`surveyService.ts`)
- `calculateAccurateProgress()` function simulates survey flow
- Tracks applicable, skipped, and N/A questions
- Calculates both basic and accurate progress percentages

### Controller Layer (`surveyController.ts`)
- `handleGetAccurateProgress()` validates session ownership
- Returns detailed progress data with error handling

### Route Layer (`surveyRoutes.ts`)
- `GET /api/survey/accurate-progress/:session_id` with authentication

## Testing

### Test Cases

1. **Normal Survey Flow**
   - User answers all applicable questions
   - No skipping logic triggered
   - Accurate progress = basic progress

2. **S008 Skipping Triggered**
   - User answers S008 = "Ya"
   - Questions S009-S014 should be marked as skipped
   - Accurate progress excludes skipped questions

3. **S012 Skipping Triggered**
   - User answers S012 = "Tidak"
   - Questions S013A-S014 should be marked as skipped
   - Accurate progress excludes skipped questions

4. **KR005 Auto-fill**
   - User answers KR004 = "Tidak Bekerja"
   - KR005 should be marked as N/A
   - Accurate progress excludes auto-filled N/A

5. **Mixed Scenarios**
   - Multiple skipping conditions triggered
   - Accurate progress reflects all exclusions

### Example Test Data
```json
{
  "session_id": "6873a94d2e43e00fe4f2d23c",
  "responses": [
    {"question_code": "KR004", "valid_response": "Tidak Bekerja"},
    {"question_code": "S008", "valid_response": "Ya"},
    {"question_code": "S012", "valid_response": "Tidak"}
  ]
}
```

## Performance Considerations

- Function simulates entire survey flow for each request
- Consider caching for frequently accessed sessions
- Question status calculation is O(n) where n = total questions
- Skipping logic evaluation is O(m) where m = responses

## Future Enhancements

1. **Caching Layer**
   - Cache progress calculations for active sessions
   - Invalidate cache when new responses added

2. **Real-time Updates**
   - WebSocket integration for live progress updates
   - Progress changes triggered by new responses

3. **Advanced Analytics**
   - Skip pattern analysis
   - Question difficulty assessment
   - Completion time predictions 