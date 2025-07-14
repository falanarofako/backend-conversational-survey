# Backend Conversational Survey

## Recent Changes - Evaluation Session Validation

### Overview
Modified the evaluation system to ensure that users can only create evaluation sessions if they have at least one survey session (either IN_PROGRESS or COMPLETED).

### Changes Made

#### 1. Service Layer (`src/services/evaluationService.ts`)
- Added import for `SurveySession` model
- Added validation logic in `initializeEvaluation` function:
  - If `sessionId` is provided: validates that the survey session exists and belongs to the user
  - If no `sessionId` is provided: checks if user has any survey sessions at all
  - Throws appropriate error messages if validation fails

#### 2. Controller Layer (`src/controllers/evaluationController.ts`)
- Enhanced error handling in `handleInitializeEvaluation`:
  - Added specific HTTP status codes for different validation errors
  - 400: User has no survey sessions
  - 403: Survey session does not belong to user
  - 404: Survey session not found or user not found
  - 500: Server error

#### 3. Routes Documentation (`src/routes/evaluationRoutes.ts`)
- Updated API documentation to reflect new validation requirements
- Added detailed error response codes

### Validation Rules

1. **User must have at least one survey session** before creating an evaluation
2. **Survey session can be either IN_PROGRESS or COMPLETED** - both are acceptable
3. **If session_id is provided**, it must:
   - Exist in the database
   - Belong to the authenticated user
4. **If no session_id is provided**, the system checks if the user has any survey sessions at all

### API Response Examples

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "_id": "evaluation_id",
    "user_id": "user_id",
    "session_id": "session_id",
    "answers": {},
    "completed": false,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error - No Survey Sessions (400 Bad Request)
```json
{
  "success": false,
  "message": "Cannot create evaluation: User must have at least one survey session before creating an evaluation",
  "error": "Cannot create evaluation: User must have at least one survey session before creating an evaluation"
}
```

#### Error - Survey Session Not Found (404 Not Found)
```json
{
  "success": false,
  "message": "Survey session not found",
  "error": "Survey session not found"
}
```

#### Error - Unauthorized Session (403 Forbidden)
```json
{
  "success": false,
  "message": "Survey session does not belong to this user",
  "error": "Survey session does not belong to this user"
}
```

### Testing the Changes

To test the new validation:

1. **Test with user who has no survey sessions:**
   - Should return 400 error

2. **Test with user who has survey sessions:**
   - Should allow evaluation creation

3. **Test with invalid session_id:**
   - Should return 404 error

4. **Test with session_id belonging to different user:**
   - Should return 403 error

### Migration Notes

- Existing evaluations are not affected
- Users who already have evaluations can continue using them
- New evaluations require the validation to pass

---

## New Feature - Accurate Survey Progress Calculation

### Overview
Added a new endpoint to calculate survey progress with high accuracy by considering skipping logic and N/A answers.

### New Endpoint

#### GET `/api/survey/accurate-progress/:session_id`
Calculates accurate survey progress considering:
- Skipping logic based on previous answers
- Auto-filled N/A answers
- Question applicability for each user

**Authentication:** Required (Private)

**Parameters:**
- `session_id` (path parameter): The survey session ID

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "session_id",
    "status": "IN_PROGRESS",
    "current_question_index": 47,
    "current_question": {
      "code": "S029",
      "text": "Berapa rupiah total pengeluaran Anda setelah perjalanan ini?",
      // ... other question properties
    },
    
    // Progress metrics
    "total_questions": 48,
    "total_applicable_questions": 45,
    "answered_questions": 47,
    "actually_answered_questions": 46,
    "skipped_questions": 2,
    "na_questions": 1,
    
    // Progress percentages
    "basic_progress_percentage": 98,
    "accurate_progress_percentage": 100,
    
    // Detailed breakdown
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
      // ... more questions
    ],
    
    // Additional metrics
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

### Skipping Logic Implemented

1. **S008 Logic (Pulang-Pergi di Hari yang Sama):**
   - If S008 = "Ya", skip questions: S009, S010, S011, S013A, S013B, S013C, S013D, S013E, S013F, S014
   - Jump to question index 14

2. **S012 Logic (Paket Perjalanan):**
   - If S012 = "Tidak", skip questions: S013A, S013B, S013C, S013D, S013E, S013F, S014
   - Jump to question index 25

3. **KR005 Auto-fill Logic:**
   - If KR004 = "Tidak Bekerja", KR005 is auto-filled with "N/A"
   - Skip KR006 (next question)

### Progress Calculation

- **Basic Progress:** `(answered_questions / total_questions) * 100`
- **Accurate Progress:** `(actually_answered_questions / total_applicable_questions) * 100`

The accurate progress excludes:
- Questions that are skipped due to logic
- Auto-filled N/A answers (not counted as user progress)

### Use Cases

1. **Display accurate progress bar** in the frontend
2. **Show detailed question status** for debugging
3. **Track survey completion** more precisely
4. **Analyze survey flow** and skipping patterns

### Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "message": "Session ID is required"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "message": "Unauthorized: This survey session does not belong to the authenticated user"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Survey session not found"
}
```

### Practical Example

Using the provided session data with `current_question_index: 47` and 47 responses:

**Request:**
```
GET /api/survey/accurate-progress/6873a94d2e43e00fe4f2d23c
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "6873a94d2e43e00fe4f2d23c",
    "status": "IN_PROGRESS",
    "current_question_index": 47,
    "current_question": {
      "code": "S029",
      "text": "Berapa rupiah total pengeluaran Anda setelah perjalanan ini? Contohnya, biaya laundry pakaian atau perawatan kendaraan."
    },
    
    // Progress metrics
    "total_questions": 48,
    "total_applicable_questions": 47,
    "answered_questions": 47,
    "actually_answered_questions": 46,
    "skipped_questions": 0,
    "na_questions": 1,
    
    // Progress percentages
    "basic_progress_percentage": 98,
    "accurate_progress_percentage": 98,
    
    // Detailed breakdown
    "skipped_questions_detail": [],
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
      },
      {
        "question_code": "KR004",
        "question_text": "Apa pekerjaan utama atau aktivitas utama Anda?",
        "index": 3,
        "is_applicable": true,
        "is_answered": true,
        "is_skipped": false,
        "is_na": false,
        "answer": "Tidak Bekerja",
        "skip_reason": null,
        "na_reason": null
      },
      {
        "question_code": "KR005",
        "question_text": "Deskripsikan pekerjaan Anda",
        "index": 4,
        "is_applicable": true,
        "is_answered": true,
        "is_skipped": false,
        "is_na": true,
        "answer": "N/A",
        "skip_reason": null,
        "na_reason": "Auto-filled N/A karena KR004 = Tidak Bekerja"
      }
      // ... more questions
    ],
    
    // Additional metrics
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

**Analysis:**
- User has answered 47 out of 48 total questions (98% basic progress)
- KR005 was auto-filled with "N/A" due to KR004 = "Tidak Bekerja"
- No questions were skipped due to S008/S012 logic
- Accurate progress is 98% (46 actually answered / 47 applicable questions)
- User is on the final question (S029) 