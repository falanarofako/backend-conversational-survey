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