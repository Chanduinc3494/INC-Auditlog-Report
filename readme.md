# Audit Logging and Reporting

This project is a SAP CAP (Cloud Application Programming) application that collects and reports audit and entitlement information from SAP BTP.

The application integrates with:

- SAP HANA Cloud (HDI Container)
- SAP Audit Log Service
- SAP Cloud Management Service (CMS)

---

# Project Structure

| Folder | Purpose |
|---------|----------|
| `app/` | SAP Fiori Elements applications |
| `db/` | CDS data model and persistence layer |
| `srv/` | CAP service definitions and business logic |
| `lib/` | Utility modules (Audit Log, CMS APIs, Authentication) |
| `readme.md` | Project documentation |

---

# Prerequisites

Install the following before running the project:

- Node.js
- SAP CDS Development Kit

```bash
npm install -g @sap/cds-dk
```

Login to Cloud Foundry:

```bash
cf login
```

---

# Install Dependencies

```bash
npm install
```

---

# Bind Required SAP BTP Services

This project requires the following service instances to be bound locally.

## 1. HDI Container

```bash
cds bind db --to <HDI_CONTAINER_INSTANCE> --kind hana
```

Example

```bash
cds bind db --to HDI_Audit --kind hana
```

---

## 2. Audit Log Service

```bash
cds bind auditlog --to <AUDIT_LOG_INSTANCE> --kind auditlog
```

Example

```bash
cds bind auditlog --to audit-log --kind auditlog
```

---

## 3. Cloud Management Service (CMS)

```bash
cds bind cms --to <CMS_INSTANCE>
```

Example

```bash
cds bind cms --to cent-cms
```

---

# Verify Bindings

Check all bindings:

```bash
cds bind --resolve
```

---

# Run the Application

Start the CAP application using the hybrid profile:

```bash
cds watch --profile hybrid
```

The application will be available at

```
http://localhost:4004
```

---

# Available Services

The application exposes:

- Audit Reports
- Configuration Reports
- User Audit Reports
- Service Audit Reports

---

# Synchronize Entitlement Data

The application provides a CAP Action to synchronize the latest entitlement information from SAP BTP.

Invoke the action using:

```
POST /odata/v4/audit-logging-and-reporting/syncEntitlements
```

This action performs the following:

1. Retrieves all subaccounts.
2. Fetches assigned services for each subaccount.
3. Updates the HANA database.
4. Inserts new records and updates existing records.

---

# Synchronize Audit Logs

To fetch the latest Audit Log data:

```
POST /odata/v4/audit-logging-and-reporting/syncAuditLogs
```

---

# Useful Commands

Install dependencies

```bash
npm install
```

Run locally

```bash
cds watch --profile hybrid
```

Deploy to HANA

```bash
cds deploy --to hana
```

Build MTAR

```bash
mbt build
```

Deploy MTAR

```bash
cf deploy mta_archives/<file>.mtar
```

View bindings

```bash
cds bind --resolve
```

---

# Technologies

- SAP CAP (Node.js)
- SAP HANA Cloud
- SAP Audit Log Service
- SAP Cloud Management Service (CMS)
- SAP Fiori Elements
- SAP BTP Cloud Foundry

---

# Notes

- Always start the application with the **hybrid** profile during local development.
- Ensure the required SAP BTP service instances are bound before running the application.
- Entitlement synchronization can be triggered manually through the `syncEntitlements` CAP action or scheduled using SAP Job Scheduler.
