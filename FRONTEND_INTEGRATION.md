# CAA Backend – Frontend Integration Guide

Reference document for frontend developers to integrate with the CAA Backend API. Includes all endpoints, enums, and payload structures.

---

## Base URL & Authentication

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:3000` |
| Production | Configure via `VITE_API_URL` or equivalent |

**Authentication:** JWT Bearer token (except endpoints marked as Public)

```
Authorization: Bearer <access_token>
```

**Token Refresh:** Use `POST /auth/refresh` with `refreshToken` when `accessToken` expires.

---

## Enums

### RoleName
Use for user roles, role-based UI, and role selection in forms.

```typescript
enum RoleName {
  MASTER_ADMIN = 'MASTER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  CAA = 'CAA',
  ORG_EMPLOYEE = 'ORG_EMPLOYEE',
  CLIENT = 'CLIENT',
}
```

### Client Status
Use for client status field in create/update/onboard flows.

```typescript
type ClientStatus = 'active' | 'inactive' | 'terminated';
```

### Template Category
Use for email template category selection.

```typescript
enum TemplateCategory {
  SERVICE = 'service',
  LOGIN = 'login',
  NOTIFICATION = 'notification',
  FOLLOW_UP = 'follow_up',
  REMINDER = 'reminder',
}
```

### Template Types (by category)
Use for email template type dropdown based on selected category.

| Category | Types |
|----------|-------|
| `service` | `gst_filing`, `income_tax_return`, `tds`, `audit`, `roc_filing`, `pf_esic`, `accounting`, `book_keeping`, `company_registration`, `llp_registration`, `trademark`, `iso_certification`, `labour_compliance`, `custom_service` |
| `login` | `login_credentials`, `password_reset`, `welcome_email` |
| `notification` | `client_onboarded`, `service_assigned`, `document_uploaded`, `payment_received` |
| `follow_up` | `follow_up_documents`, `follow_up_payment`, `follow_up_meeting` |
| `reminder` | `reminder_deadline`, `reminder_submission`, `reminder_renewal` |

### Email Schedule Status
Use when listing or filtering scheduled emails.

```typescript
type EmailScheduleStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
```

### Schedule Type
Use for schedule configuration in mail management.

```typescript
type ScheduleType = 'single_date' | 'date_range' | 'multiple_dates';
```

---

## API Endpoints

### Auth (Public unless noted)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | Public | Login; returns `accessToken`, `refreshToken`, `user` |
| POST | `/auth/refresh` | Public | Refresh tokens |
| GET | `/auth/me` | JWT | Current user |
| GET | `/auth/roles` | Public | Roles for dropdown |
| GET | `/auth/organizations` | Public | Organizations for dropdown |
| POST | `/auth/register` | Public | Generic registration |
| POST | `/auth/signup/master-admin` | Public | Master admin signup |
| POST | `/auth/signup/organization` | Public | Organization + admin signup |
| POST | `/auth/signup/org-admin` | Public | Org admin signup (existing org) |
| POST | `/auth/forgot-password` | Public | Request OTP for password reset |
| POST | `/auth/reset-password` | Public | Reset password with OTP |

#### Request Bodies

**Login**
```json
{ "email": "user@example.com", "password": "password123" }
```

**Register**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "roleName": "CAA",
  "organizationId": 1
}
```

**Signup Organization**
```json
{
  "organization": {
    "name": "Acme CA",
    "city": "Mumbai",
    "state": "MH",
    "country": "India",
    "pincode": "400001"
  },
  "admin": {
    "name": "Org Admin",
    "email": "orgadmin@example.com",
    "password": "password123",
    "phone": "9876543210"
  }
}
```

**Signup Org Admin**
```json
{
  "organizationId": 1,
  "name": "Another Admin",
  "email": "admin2@example.com",
  "password": "password123",
  "phone": "9876543211"
}
```

**Forgot Password**
```json
{ "email": "user@example.com" }
```

**Reset Password**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

---

### Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/organizations` | Create (MASTER_ADMIN) |
| GET | `/organizations` | List all |
| GET | `/organizations/:id` | Get by ID |
| PATCH | `/organizations/:id` | Update (MASTER_ADMIN, ORG_ADMIN) |
| DELETE | `/organizations/:id` | Delete (MASTER_ADMIN) |

**Create**
```json
{
  "name": "New CA Firm",
  "slug": "new-ca-firm",
  "city": "Delhi",
  "state": "DL",
  "country": "India",
  "pincode": "110001"
}
```

**Update** (all optional)
```json
{
  "name": "Updated CA Firm",
  "slug": "updated-slug",
  "city": "Mumbai",
  "state": "MH",
  "country": "India",
  "pincode": "400001"
}
```

---

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/employees` | Create employee (MASTER_ADMIN, ORG_ADMIN) |
| GET | `/users` | List users; `?organizationId=1` optional |
| GET | `/users/:id` | Get by ID |

**Create Employee**
```json
{
  "organizationId": 1,
  "name": "John CAA",
  "email": "caa@example.com",
  "password": "password123",
  "phone": "9876543210",
  "roleName": "CAA"
}
```
`roleName`: `ORG_ADMIN` | `CAA` | `ORG_EMPLOYEE`. Master admin must pass `organizationId`.

---

### Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/clients` | Create client |
| POST | `/clients/with-login` | Create client with auto-generated login |
| POST | `/clients/onboard` | Full onboarding form |
| GET | `/clients` | List; `?organizationId=1` optional |
| GET | `/clients/:id` | Get by ID |
| PATCH | `/clients/:id` | Update |
| DELETE | `/clients/:id` | Delete |
| GET | `/clients/:id/directors` | List directors |
| POST | `/clients/:id/directors` | Add director |
| PATCH | `/clients/:id/directors/:dirId` | Update director |
| DELETE | `/clients/:id/directors/:dirId` | Delete director |

**Create Client**
```json
{
  "organizationId": 1,
  "name": "ABC Pvt Ltd",
  "email": "client@example.com",
  "phone": "9876543210"
}
```

**Create Client with Login**
```json
{
  "email": "client@example.com",
  "name": "Client Name",
  "phone": "9876543210",
  "organizationId": 1
}
```
Returns `client` + `generatedPassword`.

**Onboard Client** (full form)
```json
{
  "name": "Full Client",
  "email": "fullclient@example.com",
  "companyName": "Company Ltd",
  "businessTypeId": 1,
  "panNumber": "ABCDE1234F",
  "gstNumber": "27XXXXX",
  "status": "active",
  "address": "123 Street",
  "city": "Mumbai",
  "state": "MH",
  "country": "India",
  "pincode": "400001",
  "serviceIds": [1, 2],
  "onboardDate": "2025-01-01",
  "followupDate": "2025-02-01",
  "additionalNotes": "Notes",
  "phone": "9876543210",
  "organizationId": 1
}
```
`status`: `active` | `inactive` | `terminated`.

**Update Client** (all optional)
```json
{
  "name": "Updated Client",
  "status": "active",
  "companyName": "...",
  "address": "...",
  "city": "...",
  "state": "...",
  "country": "...",
  "pincode": "...",
  "panNumber": "...",
  "gstNumber": "...",
  "additionalNotes": "...",
  "phone": "..."
}
```

**Add Director**
```json
{
  "directorName": "Director Name",
  "email": "director@example.com",
  "phone": "9876543211",
  "designation": "Director",
  "din": "",
  "pan": "",
  "aadharNumber": ""
}
```

---

### Business Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business-types` | List; `?organizationId=1` optional |
| POST | `/business-types` | Create custom (requires auth) |

**Create**
```json
{
  "name": "Custom Type",
  "organizationId": 1
}
```

---

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/services` | List; `?organizationId=1` optional |
| POST | `/services` | Create custom |

**Create**
```json
{
  "name": "Custom Service",
  "organizationId": 1
}
```

---

### Client Files

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/client-files/upload` | CLIENT | Upload files (form-data) |
| GET | `/client-files` | CLIENT | List own files |
| GET | `/client-files/client/:clientId` | Org users | List files for client |
| GET | `/client-files/:id/download-url` | CLIENT / Org users | Get presigned download URL |

**Upload** (multipart/form-data)
- `files`: one or more files (max 20)
- `type`: optional string (e.g. `"document"`)

---

### Email Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/email-templates/categories` | Template categories + labels |
| GET | `/email-templates/types?category=service` | Types for a category |
| GET | `/email-templates/variables` | Available template variables |
| POST | `/email-templates/test-mail` | **Public** – Send simple test email (no auth) |
| POST | `/email-templates` | Create template |
| GET | `/email-templates` | List; `?category=login` optional |
| GET | `/email-templates/:id` | Get by ID |
| PATCH | `/email-templates/:id` | Update |
| DELETE | `/email-templates/:id` | Delete |
| POST | `/email-templates/send` | Send email with template |

**Send Test Mail** (no auth)
```json
{
  "to": "recipient@example.com",
  "subject": "Optional subject (default: CAA Test Email)",
  "body": "Optional body (default: test message)"
}
```

**Create Template**
```json
{
  "category": "login",
  "type": "login_credentials",
  "name": "Login Credentials",
  "subject": "Your login - {{client_name}}",
  "body": "Hello {{client_name}},\nYour email: {{login_email}}\nPassword: {{login_password}}\nURL: {{login_url}}"
}
```

**Update Template** (all optional)
```json
{
  "subject": "Updated subject",
  "body": "Updated body",
  "name": "Updated Name"
}
```

**Send Email**
```json
{
  "to": "recipient@example.com",
  "templateId": 1,
  "variables": {
    "client_name": "John",
    "login_email": "john@example.com",
    "login_password": "temp123",
    "login_url": "https://app.example.com"
  }
}
```

**Template Variables** (use `{{key}}` in subject/body)
- `{{client_name}}`, `{{client_email}}`, `{{client_phone}}`
- `{{company_name}}`, `{{org_name}}`, `{{org_email}}`, `{{org_phone}}`
- `{{service_name}}`, `{{service_description}}`
- `{{current_date}}`, `{{date}}`, `{{today}}`, `{{deadline_date}}`, `{{follow_up_date}}`
- `{{login_email}}`, `{{login_password}}`, `{{login_url}}`
- `{{additional_notes}}`, `{{amount}}`, `{{document_name}}`

---

### Mail Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mail-management/recipients?organizationId=1` | Recipients for sending |
| GET | `/mail-management/org-mails?organizationId=1` | Org mails (Master Admin) |
| GET | `/mail-management/templates` | Templates for sending |
| POST | `/mail-management/schedule` | Schedule email |
| GET | `/mail-management/schedules` | List schedules; `?status=pending` optional |
| GET | `/mail-management/schedules/:id` | Get schedule by ID |
| DELETE | `/mail-management/schedules/:id` | Cancel schedule |

**Schedule Email – single date**
```json
{
  "templateId": 1,
  "recipientEmails": ["user@example.com"],
  "variables": { "client_name": "John" },
  "schedule": {
    "type": "single_date",
    "date": "2025-02-15",
    "times": ["09:00", "14:00"]
  }
}
```

**Schedule Email – date range**
```json
{
  "templateId": 1,
  "recipientEmails": ["user@example.com"],
  "schedule": {
    "type": "date_range",
    "fromDate": "2025-02-01",
    "toDate": "2025-02-05",
    "times": ["10:00"]
  }
}
```

**Schedule Email – multiple dates**
```json
{
  "templateId": 1,
  "recipientEmails": ["user@example.com"],
  "schedule": {
    "type": "multiple_dates",
    "dates": ["2025-02-01", "2025-02-15"],
    "times": ["09:00"]
  }
}
```
`times`: array of `"HH:mm"` strings.

---

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Public | Health check |

---

## Frontend Implementation Notes

1. **Auth flow**: Store `accessToken` and `refreshToken`. Call `/auth/refresh` when 401; retry original request with new token.
2. **organizationId**: Master admin must pass `organizationId` for many endpoints; org users derive it from their context.
3. **Template types**: Fetch `/email-templates/types?category=X` when user selects a category; use returned map for type dropdown.
4. **Client files**: Use `multipart/form-data` with `files` (array) for upload; use presigned URL for download.
5. **Dates**: Use `YYYY-MM-DD` for dates, `HH:mm` for times.
6. **IDs**: All IDs are integers (not UUIDs).

---

## Changelog

| Date | Changes |
|------|---------|
| 2025-01-31 | Initial frontend integration document |
