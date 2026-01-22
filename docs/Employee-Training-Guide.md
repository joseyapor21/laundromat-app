# Laundromat Mobile App
# Employee Training Guide

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [Bottom Navigation](#2-bottom-navigation)
3. [Dashboard Screen](#3-dashboard-screen)
4. [Creating a New Order](#4-creating-a-new-order)
5. [Order Details Screen](#5-order-details-screen)
6. [Order Workflow](#6-order-workflow)
7. [Driver Screen](#7-driver-screen)
8. [Profile Screen](#8-profile-screen)
9. [Admin Screen](#9-admin-screen)
10. [Quick Reference](#10-quick-reference)

---

## 1. Logging In

### Steps to Log In:

1. Open the **Laundromat** app on your phone
2. You will see the login screen with two fields:
   - **Username** - Enter your username
   - **Password** - Enter your password
3. Tap the blue **"Log In"** button
4. Wait for the app to load your dashboard

### If You Can't Log In:
- Check that your username and password are correct
- Make sure you have internet connection
- Contact your manager to reset your password

---

## 2. Bottom Navigation

The app has 4 tabs at the bottom of the screen:

| Tab | Icon | What It Does |
|-----|------|--------------|
| **Dashboard** | Home icon | View and manage all orders |
| **New Order** | Plus (+) icon | Create a new customer order |
| **Driver** | Car icon | Pickup and delivery tasks |
| **Profile** | Person icon | Your account and settings |

**Tap any tab to switch screens.**

---

## 3. Dashboard Screen

The Dashboard shows all active orders in your laundromat.

### Understanding the Board View

The screen shows 3 columns:

| Column | Color | What's Here |
|--------|-------|-------------|
| **NEW** | Blue | New orders waiting to be processed |
| **PROCESSING** | Orange/Yellow | Orders being washed, dried, or folded |
| **READY** | Green | Orders ready for pickup or delivery |

### Each Order Card Shows:
- **Order number** (e.g., #1234)
- **Customer name**
- **Current status** (e.g., "In Washer", "Folding")
- **Total price** (e.g., $25.50)
- **Weight** (e.g., 15 lbs)
- **Number of bags** (e.g., 2 bags)
- **Pickup/Delivery date** (e.g., SUN, 21)

### Icons on Order Cards:
- ⚡ **Lightning bolt** = Same-day rush order
- 🔴 **Red circle** = Not paid yet
- ✅ **Green checkmark** = Already paid
- 🚗 **Car icon** = Delivery order
- 🏪 **Store icon** = In-store pickup

### Filter Buttons (Top of Screen):

Tap these to show specific orders:

| Button | Shows |
|--------|-------|
| **All** | All active orders |
| **In-Store** | Store pickup orders only |
| **Delivery** | Delivery orders only |
| **New** | New/received orders |
| **Processing** | Orders being washed/dried/folded |
| **Ready** | Orders ready for customer |
| **Done** | Completed orders |

### QR Scanner Button:
- Tap the **QR code icon** (top right) to scan a bag label
- This opens the order for that bag

### To View an Order:
- **Tap on any order card** to open the Order Details screen

### To Refresh Orders:
- **Pull down** on the screen and release to refresh

---

## 4. Creating a New Order

### Step 1: Start New Order
1. Tap **"New Order"** (plus icon) in the bottom navigation

### Step 2: Select Customer
1. **Search for existing customer:**
   - Type the customer's name or phone number in the search box
   - Tap on the customer when they appear in the list
2. **Or create new customer:**
   - Tap **"+ Add New Customer"** button
   - Fill in their information (name, phone, address)
   - Tap **"Save"**

### Step 3: Set Order Type
Choose one:
- **In-Store Pickup** - Customer will pick up at the store
- **Delivery** - We will deliver to customer

### Step 4: Same Day Service (Optional)
- Toggle **"Same Day"** switch ON for rush orders
- Extra charge is added automatically

### Step 5: Add Bags
1. Tap **"+ Add Bag"** button
2. Enter the **weight** in pounds (e.g., 15.5)
3. Optionally add:
   - **Color** (e.g., "Blue hamper")
   - **Description** (e.g., "Delicates")
4. Tap **"Add"** to save the bag
5. Repeat for each bag

### Step 6: Add Extra Items (Optional)
1. Tap **"Add Extra Items"** button
2. A list of extra services appears (comforters, blankets, etc.)
3. Tap **"+"** to add an item, **"-"** to remove
4. Tap **"Done"** when finished

### Step 7: Set Pickup Date/Time
1. Tap on the **date/time field**
2. Select when the order will be ready
3. Tap **"Confirm"**

### Step 8: Add Special Instructions (Optional)
- Type any notes in the **"Special Instructions"** box
- Example: "No fabric softener", "Fold shirts separately"

### Step 9: Review Order
- Check the **price breakdown** at the bottom:
  - Subtotal (weight × price per pound)
  - Extra items
  - Delivery fee (if delivery)
  - Same day fee (if rush)
  - **Total**

### Step 10: Create Order
1. Tap the green **"Create Order"** button
2. Wait for confirmation
3. Receipts will print automatically (if printer connected)

---

## 5. Order Details Screen

Tap any order on the Dashboard to open this screen.

### Header Section Shows:
- **Order #** (e.g., Order #1234)
- **Status badge** (colored label showing current status)
- **Total amount**
- **Edit button** - Tap to modify the order

### Customer Information:
- Customer name
- Phone number (tap to call)
- Address (for delivery orders)
- Buzzer code (if provided)
- Special instructions

### Order Information:
- **Order type:** In-Store Pickup or Delivery
- **Same day:** Yes or No
- **Drop-off date:** When order was received
- **Pickup/Delivery date:** When it should be ready
- **Weight:** Total pounds
- **Bags:** List of all bags with weights

### Bags Section:
Each bag shows:
- Bag identifier (e.g., "Bag 1")
- Weight
- Color/description
- **Folding check** status (verified or not)

### Actions Available:

#### Update Status:
- Tap **"Update Status"** to change the order status
- Select the new status from the list

#### Assign to Machine:
- Tap **"Assign Machine"**
- Select washer or dryer from the list
- Machine will show as "In Use"

#### Mark as Paid:
1. Select payment method (Cash, Check, Venmo, Zelle)
2. Tap **"Mark as Paid"**

#### Print:
- Tap **"Print Receipt"** to print customer receipt
- Tap **"Print Labels"** to print bag labels

---

## 6. Order Workflow

### Status Flow (In Order):

```
New Order → Received → In Washer → In Dryer → On Cart → Folding → Ready → Completed
```

### Step-by-Step Process:

#### 1. NEW ORDER
- Order just created
- **Action:** Review order, then tap **"Mark Received"**

#### 2. RECEIVED
- Order acknowledged, ready to wash
- **Action:** Assign to washer, tap **"Start Washing"**

#### 3. IN WASHER
- Clothes are in the washing machine
- Machine shows as "In Use" in the system
- **Action:** When done, tap **"Move to Dryer"**

#### 4. IN DRYER
- Clothes are in the dryer
- **Action:** When done, tap **"Remove from Dryer"**

#### 5. ON CART (Laid on Cart)
- Clothes removed from dryer, on a cart
- **Action:** Tap **"Start Folding"**

#### 6. FOLDING
- Someone is folding the clothes
- Shows who started folding and when
- **Action:** When done, tap **"Done Folding"**

#### 7. FOLDED
- Folding complete, needs verification
- **Action:** A DIFFERENT person taps **"Verify Folding"**
- Note: Same person cannot fold and verify

#### 8. READY FOR PICKUP / READY FOR DELIVERY
- Order is complete and waiting for customer
- **Action:** Mark as paid when customer pays
- For pickup: Tap **"Complete"** when customer takes order
- For delivery: Send to Driver screen

#### 9. COMPLETED
- Order is finished and picked up/delivered

### Machine Assignment:

When assigning machines:
1. Tap **"Assign Machine"** or **"Scan QR"**
2. Select the machine (Washer 1, Dryer 2, etc.)
3. Your initials are recorded with the assignment
4. Machine shows as "In Use" until removed

### Checking Machines:
- Tap the **checkmark** on a machine assignment to verify it
- This records who checked the machine

---

## 7. Driver Screen

Access by tapping **"Driver"** (car icon) in bottom navigation.

### Two Tabs:

#### PICKUPS Tab
Shows orders that need to be picked up from customers.

These are delivery orders where we go GET the laundry.

**Pickup statuses shown:**
- New Order
- Scheduled Pickup
- Picked Up

#### DELIVERIES Tab
Shows orders ready to be delivered to customers.

**Date Filter Buttons:**
- **Today** - Only today's deliveries
- **Tomorrow** - Tomorrow's deliveries
- **All** - All pending deliveries

### Order Cards Show:
- Order number and customer name
- Customer address
- Buzzer code (if any)
- Customer notes
- Weight and total amount
- Paid status

### Actions on Each Order:

#### Navigate Button (Arrow icon)
- Tap to open directions in your map app
- Choose: Google Maps, Apple Maps, or Waze

#### For Pickups:
- Tap **"Picked Up"** after collecting the laundry

#### For Deliveries:
- Tap **"Deliver"** when at the customer
- If NOT paid: Select payment method (Cash, Check, Venmo, Zelle)
- If already paid: Just confirms delivery

### Route Planning:

1. Tap **"Plan Route"** button (top of screen)
2. A modal opens showing all delivery stops
3. **To reorder manually:** Use up/down arrows
4. **To optimize automatically:** Tap purple **"Optimize Route"** button
   - This finds the fastest order for all stops
   - Shows total distance and time
5. **To edit an address:** Tap on the address text
6. Tap **"Start Navigation"** to open in your map app

### Connecting Bluetooth Printer:

1. Tap to expand the **"Printer"** section
2. Tap **"Scan for Printers"**
3. Wait for your printer to appear
4. Tap on the printer name to connect
5. Green checkmark means connected

### Print Tag:
- Tap **"Print Tag"** on any order to print a bag label
- Only shows for pickup orders

---

## 8. Profile Screen

Access by tapping **"Profile"** (person icon) in bottom navigation.

### Your Information:
- Your name
- Your username
- Your role (Admin, Cashier, Driver)

### Menu Options:

#### Edit Profile
1. Tap **"Edit Profile"**
2. Update your first name and/or last name
3. Tap **"Save"**

#### Change Password
1. Tap **"Change Password"**
2. Enter your **current password**
3. Enter your **new password**
4. Enter new password again to **confirm**
5. Tap **"Change Password"**

#### Bluetooth Printer
- Same as Driver screen printer setup
- Connect to thermal printer for receipts

#### End of Day Report
1. Tap **"End of Day Report"**
2. See summary of orders:
   - In Carts
   - In Dryers
   - In Washers
   - Things to Wash Tomorrow
3. Check off cleaning tasks:
   - ☐ Lints cleaned from dryers
   - ☐ Trash taken out
   - ☐ Top of machines cleaned
   - ☐ Floor swept
   - ☐ Bathroom cleaned
4. Add notes for next shift
5. Tap **"Share Report"** to send via text/email

#### Cashier Report
1. Tap **"Cashier Report"**
2. See all orders paid today
3. Breakdown by payment method:
   - Cash total
   - Check total
   - Venmo total
   - Zelle total
4. Select different date to view past reports

#### Admin (Admin users only)
- Opens Admin screen (see next section)

#### Log Out
1. Scroll to bottom
2. Tap red **"Log Out"** button
3. Confirm when asked

---

## 9. Admin Screen

**Only available for Admin and Super Admin users.**

Access from Profile → Admin

### Tabs Available:

#### Users Tab
Manage staff accounts.

**View Users:**
- See all staff members
- See their role and status

**Add New User:**
1. Tap **"+ Add User"**
2. Enter:
   - Username
   - Password
   - First name
   - Last name
   - Role (Cashier, Driver, Admin)
3. Tap **"Save"**

**Edit User:**
1. Tap on user name
2. Change information
3. Tap **"Save"**

#### Customers Tab
Manage customer database.

**Search:**
- Type name or phone to find customer

**Add Customer:**
1. Tap **"+ Add Customer"**
2. Fill in details:
   - Name (required)
   - Phone (required)
   - Address
   - Buzzer code
   - Delivery fee
   - Notes
3. Tap **"Save"**

**Edit Customer:**
1. Tap on customer
2. Update information
3. Tap **"Save"**

#### Extras Tab
Manage extra items/services.

**Add Extra Item:**
1. Tap **"+ Add Item"**
2. Enter:
   - Name (e.g., "Comforter - Queen")
   - Description
   - Price
   - Weight-based pricing (optional)
3. Toggle **"Active"** on/off
4. Tap **"Save"**

#### Settings Tab
Configure app settings.

**Pricing:**
- Minimum weight (lbs)
- Minimum price ($)
- Price per pound ($)
- Same-day extra charge

**Store Location:**
- Store address (for route optimization)
- Latitude/Longitude coordinates

**Thermal Printer:**
- Printer IP address
- Printer port (usually 9100)

#### Machines Tab
Manage washers and dryers.

**Add Machine:**
1. Tap **"+ Add Machine"**
2. Enter name (e.g., "Washer 1")
3. Select type (Washer or Dryer)
4. Tap **"Save"**

**Set Machine Status:**
- Available
- In Use
- Out of Order

#### Activity Tab
View system logs:
- Who created orders
- Who updated orders
- Login history

#### Reports Tab
Access additional reports.

---

## 10. Quick Reference

### Order Status Colors:

| Color | Meaning |
|-------|---------|
| 🔵 Blue | New order, needs attention |
| 🟡 Yellow/Orange | Processing (washing/drying/folding) |
| 🟢 Green | Ready for pickup/delivery |
| ⚫ Gray | Completed |

### Payment Methods:
- **Cash** - Customer paid cash
- **Check** - Customer wrote a check
- **Venmo** - Paid via Venmo app
- **Zelle** - Paid via Zelle

### Common Tasks:

| Task | Where | Steps |
|------|-------|-------|
| Find an order | Dashboard | Tap on order card |
| Create order | New Order tab | Fill form, tap Create |
| Update status | Order Details | Tap Update Status |
| Assign machine | Order Details | Tap Assign Machine |
| Mark paid | Order Details | Select method, tap Mark Paid |
| Start delivery | Driver tab | Tap Navigate |
| Print receipt | Order Details | Tap Print Receipt |
| Add customer | Admin → Customers | Tap + Add Customer |

### Troubleshooting:

| Problem | Solution |
|---------|----------|
| Orders not showing | Pull down to refresh |
| Can't connect printer | Make sure Bluetooth is on |
| Route optimization failed | Check all addresses have city/state |
| Customer not found | Try searching by phone number |
| Can't update status | Check your user permissions |

### Tips:
- **Pull down** on any list to refresh
- **Tap phone number** to call customer
- **Tap address** to open in maps
- Use **QR scanner** to quickly find orders
- **Same person** cannot fold AND verify an order

---

## Need Help?

Contact your store manager or supervisor for:
- Password resets
- Permission issues
- App problems

---

*Training Guide Version 1.0*
*Last Updated: January 2025*
