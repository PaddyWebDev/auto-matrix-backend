# Backend API Documentation for Auto Matrix

This document provides detailed documentation for all API endpoints in the Express.js backend application.

## Appointments APIs

### 1.1 Create Appointment

**URL:** /appointments/create

**Method:** POST

**Description:** Create a new appointment for a customer.

**Access:** Internal (authenticated)

**Headers:** None

**Request Parameters:** None

**BODY:**
```json
{
  "vehicleId": "string",
  "serviceType": "string",
  "serviceCenterId": "string",
  "serviceDeadline": "date",
  "userId": "string",
  "isAccidental": "boolean",
  "photos": ["string"]
}
```

**Success Response:**
- Status: 201
- Body: "Appointment Created"

**Error codes and response:**
- 400: "Missing Fields"
- 404: "User Not found"
- 400: { "error": "Invalid input" }

### 1.2 Update Appointment Decision

**URL:** /appointments/:appointmentId/decision

**Method:** PATCH

**Description:** Update the decision on an appointment (approve/reject) and assign priority/SLA.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - appointmentId (string, required): Appointment ID

**BODY:**
```json
{
  "priority": "string",
  "slaDeadline": "date",
  "status": "string"
}
```

**Success Response:**
- Status: 200
- Body: "Appointment Status Updated"

**Error codes and response:**
- 400: "Appointment Id is required" or "Status is required"
- 404: "Appointment Not Found"
- 500: "Internal Server Error"

### 1.3 Update Appointment Status

**URL:** /appointments/:appointmentId/status/update

**Method:** PATCH

**Description:** Update the status of an appointment (e.g., InService, Completed).

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - appointmentId (string, required): Appointment ID

**BODY:**
```json
{
  "status": "string"
}
```

**Success Response:**
- Status: 200
- Body: "Status Updated Successfully"

**Error codes and response:**
- 400: "Appointment Id is required" or "Missing Status" or "Invalid Status"
- 404: "Appointment Not found"
- 500: "Internal Server Error"

### 1.4 Assign Mechanic

**URL:** /appointments/:appointmentId/assign-mechanic

**Method:** POST

**Description:** Assign a mechanic to an appointment.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - appointmentId (string, required): Appointment ID

**BODY:**
```json
{
  "mechanicId": "string"
}
```

**Success Response:**
- Status: 200
- Body: "Mechanic Assigned Successfully"

**Error codes and response:**
- 400: "Appointment Id is required" or "Mechanic Id is required" or "Invalid Mechanic"
- 404: "Appointment Not Found"
- 500: "Internal Server Error"

### 1.5 Create Invoice

**URL:** /appointments/:appointmentId/invoice/create

**Method:** POST

**Description:** Generate an invoice for an appointment.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - appointmentId (string, required): Appointment ID

**BODY:**
```json
{
  "totalAmount": "number"
}
```

**Success Response:**
- Status: 201
- Body:
```json
{
  "message": "Invoice Generated Successfully",
  "billing_date": "date"
}
```

**Error codes and response:**
- 400: "Appointment Id is required" or "Total Amount is required"
- 404: "Appointment Not Found"
- 409: "Invoice is already generated"
- 500: "Internal Server Error"

## Inventory APIs

### 2.1 Create Inventory Item

**URL:** /inventory/create

**Method:** POST

**Description:** Create a new inventory item for a service center.

**Access:** Service Center

**Headers:** None

**Request Parameters:** None

**BODY:**
```json
{
  "name": "string",
  "sku": "string",
  "brand": "string",
  "category": "string",
  "unitPrice": "number",
  "minimumStock": "number",
  "serviceCenterId": "string"
}
```

**Success Response:**
- Status: 201
- Body:
```json
{
  "message": "Created Successfully",
  "new_inventory_item": { ... }
}
```

**Error codes and response:**
- 400: "Missing Fields"
- 404: "Service Center Id is required" or "Service center not found"
- 500: "Internal Server Error"

### 2.2 Update Inventory Quantity

**URL:** /inventory/update-quantity/:inventoryItemId

**Method:** PATCH

**Description:** Update the quantity of an inventory item.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - inventoryItemId (string, required): Inventory Item ID
- Query:
  - scId (string, required): Service Center ID

**BODY:**
```json
{
  "quantity": "number"
}
```

**Success Response:**
- Status: 200
- Body:
```json
{
  "message": "Stock Quantity Updated Successfully",
  "quantityData": "number"
}
```

**Error codes and response:**
- 400: "Inventory Id is required" or "Quantity is required"
- 404: "Inventory Item not found"
- 409: "This item doesn't belong to the selected service center."
- 500: "Internal Server Error"

### 2.3 Delete Inventory Item

**URL:** /inventory/delete/:inventoryItemId

**Method:** DELETE

**Description:** Delete an inventory item.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - inventoryItemId (string, required): Inventory Item ID
- Query:
  - serviceCenterId (string, required): Service Center ID

**BODY:** None

**Success Response:**
- Status: 200
- Body: "Inventory Item Deleted Successfully"

**Error codes and response:**
- 400: "Inventory Item Id is required" or "Service Center Id is required"
- 404: "Service Center not found"
- 500: "Internal Server Error"

## Job Card APIs

### 3.1 Create Job Card

**URL:** /appointments/job-card/create

**Method:** POST

**Description:** Create a new job card for an appointment.

**Access:** Service Center

**Headers:** None

**Request Parameters:** None

**BODY:**
```json
{
  "jobName": "string",
  "jobDescription": "string",
  "price": "number",
  "appointmentId": "string"
}
```

**Success Response:**
- Status: 201
- Body:
```json
{
  "message": "Created Successfully",
  "new_job_card": { ... }
}
```

**Error codes and response:**
- 400: "Missing Fields"
- 404: "Appointment Not found"
- 500: "Internal Server Error"

### 3.2 Delete Job Card

**URL:** /appointments/job-card/delete/:jobCardId

**Method:** DELETE

**Description:** Delete a job card and restore inventory.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - jobCardId (string, required): Job Card ID
- Query:
  - appointmentId (string, required): Appointment ID

**BODY:** None

**Success Response:**
- Status: 200
- Body: "Job card deleted successfully"

**Error codes and response:**
- 400: "Missing jobCardId" or "Missing appointmentId"
- 404: "Job card not found for this appointment"
- 500: "Internal Server Error"

### 3.3 Add Part to Job Card

**URL:** /appointments/job-card/part/add

**Method:** POST

**Description:** Add a part to a job card and update inventory.

**Access:** Service Center

**Headers:** None

**Request Parameters:** None

**BODY:**
```json
{
  "jobCardId": "string",
  "partId": "string",
  "quantity": "number",
  "appointmentId": "string"
}
```

**Success Response:**
- Status: 200
- Body:
```json
{
  "new_part_job_card": { ... },
  "message": "Part Added Successfully"
}
```

**Error codes and response:**
- 400: "Missing Fields" or "Quantity should be greater than zero" or "Insufficient Stock"
- 404: "Job Card Not Found" or "Appointment Not Found" or "Inventory Not found"
- 500: "Internal Server Error"

## Notifications APIs

### 4.1 Mark Customer Notification as Read

**URL:** /notifications/customer/:notificationId

**Method:** PATCH

**Description:** Mark a customer notification as read.

**Access:** Customer

**Headers:** None

**Request Parameters:**
- Path:
  - notificationId (string, required): Notification ID

**BODY:** None

**Success Response:**
- Status: 200
- Body: "Success"

**Error codes and response:**
- 400: "Notification Id is required"
- 404: "Notification Not found"
- 500: "Internal Server Error"

### 4.2 Mark Service Center Notification as Read

**URL:** /notifications/service-center/:notificationId

**Method:** PATCH

**Description:** Mark a service center notification as read.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - notificationId (string, required): Notification ID

**BODY:** None

**Success Response:**
- Status: 200
- Body: "Success"

**Error codes and response:**
- 400: "Notification Id is required"
- 404: "Notification Not found"
- 500: "Internal Server Error"

## Payment APIs

### 5.1 Create Payment

**URL:** /payment/create/:appointmentId

**Method:** POST

**Description:** Create a payment for an appointment invoice.

**Access:** Customer/Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - appointmentId (string, required): Appointment ID
- Query:
  - invoiceId (string, required): Invoice ID

**BODY:**
```json
{
  "amount": "number",
  "method": "string"
}
```

**Success Response:**
- Status: 201
- Body: "Payment Successful"

**Error codes and response:**
- 400: "Appointment & Invoice Id is required" or "Amount & Payment Method is required"
- 404: "Appointment Not Found" or "Invoice Not Found"
- 500: "Internal Server Error"

## Service Center APIs

### 6.1 Create Mechanic

**URL:** /service-center/:serviceCenterId/mechanic/create

**Method:** POST

**Description:** Create a new mechanic for a service center.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - serviceCenterId (string, required): Service Center ID

**BODY:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "specialty": "string",
  "experienceYears": "number"
}
```

**Success Response:**
- Status: 201
- Body: "Mechanic Registered Successfully"

**Error codes and response:**
- 400: "Service Center Id is required" or "Missing Fields"
- 404: "Service Center Not Found"
- 500: "Internal Server Error"

### 6.2 Update Mechanic Status

**URL:** /service-center/mechanic/:mechanicId/status/update

**Method:** PATCH

**Description:** Update the status of a mechanic.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - mechanicId (string, required): Mechanic ID

**BODY:**
```json
{
  "status": "string"
}
```

**Success Response:**
- Status: 200
- Body: (No response body specified)

**Error codes and response:**
- 400: "Mechanic Id is required" or "Status is required"
- 404: "Mechanic Not Found"
- 500: "Internal Server Error"

### 6.3 Delete Mechanic

**URL:** /service-center/:serviceCenterId/mechanic/:mechanicId/delete

**Method:** DELETE

**Description:** Delete a mechanic from a service center.

**Access:** Service Center

**Headers:** None

**Request Parameters:**
- Path:
  - serviceCenterId (string, required): Service Center ID
  - mechanicId (string, required): Mechanic ID

**BODY:** None

**Success Response:**
- Status: 200
- Body: "Mechanic Deleted Successfully"

**Error codes and response:**
- 400: "Service Center & Mechanic Id is required"
- 404: "Mechanic Not Found"
- 409: "Invalid Service Center Id"
- 500: "Internal Server Error"

## Vehicles APIs

### 7.1 Add Vehicle

**URL:** /vehicles/add

**Method:** POST

**Description:** Add a new vehicle for a customer.

**Access:** Customer

**Headers:** None

**Request Parameters:** None

**BODY:**
```json
{
  "vehicleName": "string",
  "vehicleMake": "string",
  "vehicleModel": "number",
  "vehicleType": "string",
  "userId": "string",
  "numberPlate": "string"
}
```

**Success Response:**
- Status: 201
- Body:
```json
{
  "new_vehicle": { ... },
  "message": "Created Successfully"
}
```

**Error codes and response:**
- 400: "Missing Fields"
- 404: "User not found"
- 409: "The number plate used already exist in our system"
- 500: "Internal Server Error"
