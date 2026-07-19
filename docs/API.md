# ExportTrack Portal API Documentation

This document describes the REST API endpoints of the ExportTrack Cargo Portal. 

All API requests and responses use JSON format. Date-time fields are in ISO 8601 string format (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## Global Response Envelope

All API endpoints return a standard response envelope of type `ApiResponse<T>`:

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE",
  "validationErrors": {
    "field_name": ["Specific validation error explanation"]
  }
}
```

---

## 1. Authentication Endpoints

### POST `/api/auth/register`
Creates a new user profile credentials link.
*   **Authentication Required**: None
*   **Request Body Schema**:
    ```json
    {
      "email": "user@exporttrack.com",
      "password": "PasswordSecure123!",
      "name": "Export Coordinator",
      "role": "user"
    }
    ```
*   **Response Schema (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "usr-12345",
        "name": "Export Coordinator",
        "email": "user@exporttrack.com",
        "role": "user",
        "isActive": true
      }
    }
    ```
*   **Error Responses**:
    *   `400 Bad Request`: Input validation failed.
    *   `409 Conflict` (`CONFLICT`): Email already in use.

### POST `/api/auth/login`
Authenticates a user via email and password, establishing a session.
*   **Authentication Required**: None
*   **Request Body Schema**:
    ```json
    {
      "email": "user@exporttrack.com",
      "password": "PasswordSecure123!"
    }
    ```
*   **Response Schema (200 OK)**:
    Returns the session token and user profile. Sets a signed `better-auth.session_token` cookie.
    ```json
    {
      "token": "sess-abc123xyz",
      "user": {
        "id": "usr-12345",
        "name": "Export Coordinator",
        "email": "user@exporttrack.com",
        "role": "user"
      }
    }
    ```
*   **Error Responses**:
    *   `401 Unauthorized` (`INVALID_EMAIL_OR_PASSWORD`): Invalid email or password.

### POST `/api/auth/logout`
Deactivates the active session and clears auth cookies.
*   **Authentication Required**: Yes
*   **Request Body**: None
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true
    }
    ```

### GET `/api/auth/me`
Retrieves the user profile for the current authenticated session.
*   **Authentication Required**: Yes (Bearer Token or Cookie)
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "usr-12345",
        "name": "Export Coordinator",
        "email": "user@exporttrack.com",
        "role": "user",
        "isActive": true
      }
    }
    ```
*   **Error Responses**:
    *   `401 Unauthorized` (`UNAUTHORIZED`): Session expired or missing.

---

## 2. User Management Endpoints

### GET `/api/users`
Lists portal users with search and pagination filters.
*   **Authentication Required**: Yes (Manager+)
*   **Query Parameters**:
    *   `page`: Page index (default: `1`)
    *   `limit`: Page size (default: `25`)
    *   `search`: Search filter on name/email
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "users": [
          {
            "id": "usr-12345",
            "name": "Export Coordinator",
            "email": "user@exporttrack.com",
            "role": "user",
            "isActive": true
          }
        ],
        "total": 1
      }
    }
    ```

### POST `/api/users`
Creates a new portal user profile.
*   **Authentication Required**: Yes (Admin only)
*   **Request Body Schema**: Same as `/api/auth/register`
*   **Response Schema (210 Created)**: Same as `/api/auth/register`

### GET `/api/users/[id]`
Retrieves details for a specific user.
*   **Authentication Required**: Yes (Manager+ or Self)
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "usr-12345",
        "name": "Export Coordinator",
        "email": "user@exporttrack.com",
        "role": "user",
        "isActive": true
      }
    }
    ```

### PATCH `/api/users/[id]`
Updates user profile fields.
*   **Authentication Required**: Yes (Admin only for role updates; Self/Admin for details)
*   **Request Body Schema**:
    ```json
    {
      "name": "Updated Name",
      "role": "manager"
    }
    ```
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "usr-12345",
        "name": "Updated Name",
        "email": "user@exporttrack.com",
        "role": "manager",
        "isActive": true
      }
    }
    ```

---

## 3. Customer Endpoints

### GET `/api/customers`
Retrieves customer profiles with search pagination.
*   **Authentication Required**: Yes
*   **Query Parameters**:
    *   `search`: Matches customer name, email, or phone.
    *   `isActive`: Filter active (`true`/`false`)
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "customers": [
          {
            "id": "cust-9988",
            "name": "Acme Shippers Ltd",
            "email": "logistics@acme.com",
            "phone": "+15550199",
            "address": "Warehouse Row B",
            "isActive": true,
            "chatCount": 2
          }
        ],
        "total": 1
      }
    }
    ```

### POST `/api/customers`
Creates a customer shipper profile.
*   **Authentication Required**: Yes (Manager+)
*   **Request Body Schema**:
    ```json
    {
      "name": "Acme Shippers Ltd",
      "email": "logistics@acme.com",
      "phone": "+15550199",
      "location": "Warehouse Row B"
    }
    ```
*   **Response Schema (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "cust-9988",
        "name": "Acme Shippers Ltd",
        "email": "logistics@acme.com",
        "phone": "+15550199",
        "address": "Warehouse Row B",
        "isActive": true
      }
    }
    ```

### POST `/api/customers/import`
Imports customer profiles in bulk from raw CSV text.
*   **Authentication Required**: Yes (Manager+)
*   **Request Headers**: `Content-Type: text/plain` (or multipart form file upload)
*   **Request Body**:
    ```csv
    name,email,phone,location
    Acme Shippers Ltd,logistics@acme.com,+15550199,Warehouse Row B
    Beta Log,beta@log.com,+15550200,Loading Dock 1
    ```
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "success": 2,
        "failed": 0,
        "errors": []
      }
    }
    ```

---

## 4. Tracker Endpoints

### GET `/api/trackers`
Lists tracker devices.
*   **Authentication Required**: Yes
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "trackers": [
          {
            "id": "trk-1122",
            "externalTrackerId": "ext-gps-55",
            "customerId": "cust-9988",
            "label": "Gps Box #5",
            "trackerType": "gps",
            "status": "active"
          }
        ],
        "total": 1
      }
    }
    ```

### POST `/api/trackers`
Registers a tracker device.
*   **Authentication Required**: Yes (Manager+)
*   **Request Body Schema**:
    ```json
    {
      "externalTrackerId": "ext-gps-55",
      "customerId": "cust-9988",
      "label": "Gps Box #5",
      "trackerType": "gps"
    }
    ```

### POST `/api/trackers/sync`
Manually triggers synchronization with the external Tracker API.
*   **Authentication Required**: Yes (Admin only)
*   **Request Body Schema**:
    ```json
    {
      "customerId": "cust-9988"
    }
    ```
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "synced": 5,
        "created": 2,
        "updated": 3
      }
    }
    ```

---

## 5. Export Shipment & Geofence Endpoints

### POST `/api/shipment-exports`
Creates a shipment export tracking loop. Rejects if the tracker has no recorded positions, or is already assigned to an active shipment.
*   **Authentication Required**: Yes (Manager+)
*   **Request Body Schema**:
    ```json
    {
      "trackerId": "trk-1122",
      "customerId": "cust-9988",
      "productCategory": "electronics",
      "productDescription": "Bales of memory chips",
      "destinationCountry": "US",
      "shippingMethod": "air_freight",
      "containerNumber": "CON-909"
    }
    ```
*   **Response Schema (210 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "ship-8899",
        "shipmentReference": "EXP-2026-XYZ",
        "status": "in_transit"
      }
    }
    ```

### GET `/api/shipment-exports/[id]/timeline`
Returns chronological events logs for the shipment.
*   **Authentication Required**: Yes
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "evt-01",
          "eventType": "status_change",
          "occurredAt": "2026-07-18T12:00:00Z",
          "notes": "Shipment status changed from baseline to in_transit"
        }
      ]
    }
    ```

### POST `/api/shipment-exports/[id]/confirm`
Manually confirms export exit and deactivates tracker.
*   **Authentication Required**: Yes (Admin only)
*   **Request Body Schema**:
    ```json
    {
      "notes": "Manual release confirmed at airport custom inspection gate."
    }
    ```

### POST `/api/shipment-exports/[id]/flag-exception`
Puts shipment in exception mode manually.
*   **Authentication Required**: Yes (Manager+)
*   **Request Body Schema**:
    ```json
    {
      "reason": "customs_hold",
      "details": "Container locked at border terminal for secondary check."
    }
    ```

---

## 6. Dashboard Endpoints

### GET `/api/dashboard/summary`
*   **Authentication Required**: Yes
*   **Query Parameters**: `timeRange` (`today`/`week`/`month`)
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "activeChatsCount": 3,
        "totalTrackerEvents": 1450,
        "recentAlerts": [],
        "activeShipmentExports": 12,
        "exportsInException": 1,
        "eventsChart": [
          { "timestamp": "2026-07-18", "count": 210 }
        ],
        "systemHealth": {
          "redis": "ok",
          "db": "ok",
          "telegram": "ok"
        }
      }
    }
    ```

### GET `/api/dashboard/health`
Performs status checks of backend modules.
*   **Authentication Required**: Yes (Admin only)
*   **Response Schema (200 OK)**: Same as `systemHealth` sub-property.

---

## 7. Webhook Endpoints

### POST `/api/webhook/tracker`
Secure endpoint for external IoT position updates.
*   **Authentication Required**: API Key verification (`x-api-key` header)
*   **Rate Limit**: 1000 requests/minute
*   **Request Headers**: `x-api-key: <WEBHOOK_SECRET>`
*   **Request Body Schema**:
    ```json
    {
      "externalTrackerId": "ext-gps-55",
      "lat": 37.7749,
      "lng": -122.4194,
      "recordedAt": "2026-07-18T15:30:00.000Z"
    }
    ```
*   **Response Schema (200 OK)**:
    ```json
    {
      "success": true,
      "eventId": "evt-uuid-1122"
    }
    ```
*   **Error Responses**:
    *   `401 Unauthorized`: Missing or invalid API key.
    *   `429 Too Many Requests`: Rate limit exceeded.
