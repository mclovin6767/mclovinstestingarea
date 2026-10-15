# Product Requirements Document (PRD)
# Multi-Tenant Restaurant POS Billing Platform

## 1. Product Overview

Build a production-grade multi-tenant restaurant POS billing platform where multiple restaurants can use the same website with fully isolated workspaces.

Each restaurant will have:
- Separate login access
- Separate menu and billing data
- Separate order history
- Separate branding and invoice settings
- Separate tax and billing configuration

The platform is focused on the Basic POS Billing model only.

The system should prioritize:
- Fast billing workflow
- Simple restaurant operations
- Clean and modern UI
- Production-grade backend architecture
- Multi-tenant security and scalability

---

# 2. Product Goals

## Primary Goals
- Create a fast and reliable restaurant billing platform
- Support multiple restaurants on the same system
- Provide isolated restaurant data and settings
- Make billing simple and fast for restaurant owners
- Build a scalable SaaS foundation for future expansion

## Secondary Goals
- Enable future upgrades into advanced restaurant management
- Create reusable SaaS infrastructure
- Build deployment-ready production architecture

---

# 3. Product Scope

## Included in Version 1
- Dashboard
- Menu Management
- Billing Screen
- Order History
- Settings
- Multi-tenant restaurant support
- Invoice generation
- Bill printing
- Tax and discount handling
- Restaurant branding

## Excluded from Version 1
- Inventory management
- Kitchen display system
- Staff roles and permissions
- Delivery management
- Loyalty programs
- Analytics engine
- Multi-branch support
- Online ordering

---

# 4. Target Users

## Primary Users
- Small restaurants
- Cafes
- Fast food shops
- Cloud kitchens
- Food counters
- Small dine-in businesses

---

# 5. System Architecture

## Architecture Type
Multi-tenant SaaS architecture.

One platform supports multiple restaurants.

Every restaurant has:
- Separate data
- Separate settings
- Separate invoices
- Separate menu
- Separate order history

## Tenant Isolation
Every database entity must include:
- restaurant_id

All backend queries must filter by restaurant_id.

No restaurant should ever access another restaurant’s data.

---

# 6. Authentication Model

## Access Structure
Single-role system only.

Every restaurant account acts as:
- Restaurant Owner/Admin

No additional roles such as:
- Cashier
- Manager
- Staff

## Authentication Requirements
- Email/password login
- Secure password hashing
- JWT or secure session authentication
- Token expiration and refresh handling
- Logout functionality
- Password reset flow

---

# 7. Core Features

# 7.1 Dashboard

## Purpose
Provide restaurant owners with a quick overview of business activity.

## Features
- Today’s sales
- Total orders
- Total revenue
- Recent bills
- Top-selling items
- Quick actions

## UI Requirements
- Clean card-based layout
- Responsive design
- Fast loading
- Minimal clutter

---

# 7.2 Menu Management

## Purpose
Allow restaurants to manage menu items.

## Features
- Add menu item
- Edit menu item
- Delete menu item
- Manage categories
- Set pricing
- Set item availability
- Search items
- Filter items

## Menu Item Fields
- Item name
- Category
- Price
- Description
- Availability status
- Image (optional)

## Technical Rules
- All menu items belong to one restaurant_id
- Soft delete preferred over permanent delete

---

# 7.3 Billing Screen

## Purpose
Fast restaurant billing workflow.

## Features
- Fast menu search
- Add items to bill
- Modify quantities
- Apply discounts
- Apply tax
- Auto total calculation
- Generate invoice
- Print bill
- Download PDF bill
- Save order history

## Billing Rules
- Final totals calculated on backend
- Tax calculated server-side
- Discount validated server-side
- Invoice number auto-generated
- Finalized bills locked from direct editing

## Billing Data
- Bill number
- Items
- Quantity
- Tax
- Discount
- Total amount
- Payment method
- Timestamp

## UI Requirements
- Large touch-friendly buttons
- Optimized for tablet use
- Fast item addition
- Minimal clicks

---

# 7.4 Order History

## Purpose
Allow restaurants to review previous transactions.

## Features
- View past bills
- Search orders
- Filter by date
- Filter by payment type
- View invoice details
- Reprint invoice

## Technical Requirements
- Paginated results
- Indexed database queries
- Fast search performance

---

# 7.5 Settings

## Purpose
Allow restaurants to configure their billing environment.

## Features
- Restaurant profile
- Restaurant logo upload
- Brand color settings
- Currency settings
- Tax configuration
- Invoice format configuration
- Printer settings
- Account settings

## Restaurant Profile Fields
- Restaurant name
- Address
- Phone number
- Email
- GST/VAT number
- Logo

---

# 8. Database Design

## Core Tables

### restaurants
- id
- name
- logo
- address
- phone
- email
- tax_number
- created_at

### users
- id
- restaurant_id
- email
- password_hash
- created_at

### categories
- id
- restaurant_id
- name
- created_at

### menu_items
- id
- restaurant_id
- category_id
- name
- description
- price
- image_url
- is_available
- created_at

### orders
- id
- restaurant_id
- invoice_number
- subtotal
- tax_amount
- discount_amount
- total_amount
- payment_method
- created_at

### order_items
- id
- order_id
- menu_item_id
- quantity
- unit_price
- total_price

### settings
- id
- restaurant_id
- currency
- tax_percentage
- invoice_prefix
- printer_config

### audit_logs
- id
- restaurant_id
- action
- entity_type
- entity_id
- created_at

---

# 9. API Structure

## Authentication APIs
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/reset-password

## Menu APIs
- GET /menu
- POST /menu
- PUT /menu/:id
- DELETE /menu/:id

## Category APIs
- GET /categories
- POST /categories
- PUT /categories/:id
- DELETE /categories/:id

## Billing APIs
- POST /orders
- GET /orders
- GET /orders/:id
- POST /orders/:id/print

## Settings APIs
- GET /settings
- PUT /settings

---

# 10. Security Requirements

## Authentication Security
- Password hashing using bcrypt or argon2
- JWT/session protection
- Secure cookie handling
- Token expiration

## API Security
- Validate all requests server-side
- Protect all tenant data
- Prevent unauthorized access
- Rate limiting
- Input sanitization

## Data Security
- Tenant-based query filtering
- Audit logging
- Backup strategy
- Secure environment variables

---

# 11. Production Requirements

## Performance
- Fast billing response time
- Optimized database queries
- Pagination for history data
- Cached frequently accessed settings

## Reliability
- Error handling
- Retry-safe operations
- Logging and monitoring
- Automatic backups

## Scalability
- Modular architecture
- Scalable database design
- Container-ready deployment

---

# 12. Design System and Product Experience

## Product Feel
The application should feel:
- Premium
- Modern
- Minimal
- Operationally fast
- Restaurant-focused
- Elegant
- Highly usable

The user experience should prioritize:
- Speed
- Clarity
- Workflow efficiency
- Low cognitive load
- Smooth interactions
- Minimal clicks during billing

## Design Inspiration
The UI quality should feel comparable to:
- Square POS
- Toast POS
- Stripe Dashboard
- Shopify Admin
- Linear
- Apple-level minimalism

## Brand Guidelines

### Brand Name
QR Dines

### Brand Colors

#### Primary Color
Emerald Green — #059669

#### Dark Surface
Deep Forest Slate — #1B2A24

#### Background
Soft White — #F9FAFB

#### Accent
Mint Emerald — #10B981

#### Optional Highlight
Warm Gold — #EAB308

#### Primary Text
#111827

#### Secondary Text
#64748B

#### Borders
#E5E7EB

## Typography
Use Inter font family throughout the application.

Typography should feel:
- Clean
- Modern
- Highly readable
- Spacious
- Professional

## UI Style Guidelines

### Visual Style
- Soft shadows
- Rounded corners
- Spacious layouts
- Subtle gradients
- Modern cards
- Premium dashboard feel
- Smooth subtle animations

### Interaction Design
- Fast transitions
- Subtle hover states
- Minimal motion distraction
- Smooth page transitions
- Responsive feedback for actions

### Layout Principles
- Clear hierarchy
- Large readable controls
- Consistent spacing system
- Minimal visual clutter
- Focus on billing speed

## Avoid
- Harsh black colors
- Cluttered layouts
- Neon colors
- Overly playful design
- Excessive gradients
- Enterprise-heavy appearance

---

# 13. Frontend Requirements

## Frontend Stack

### Required Technologies
- Next.js 15
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Zustand
- TanStack Table
- Lucide React

## Frontend Architecture
The frontend architecture should be:
- Scalable
- Component-driven
- Modular
- Reusable
- Maintainable
- Production-ready

## Folder Structure Goals
- Clear feature separation
- Shared UI components
- Reusable layouts
- Shared hooks and utilities
- Centralized design system
- Organized state management
Recommended:
- Next.js
- React
- Tailwind CSS
- TypeScript

## UI Requirements
- Modern SaaS dashboard design
- Tablet responsive
- Fast interactions
- Clean navigation
- Minimalistic interface

## State Management
Recommended:
- Zustand or Redux Toolkit

---

# 14. Backend Requirements

## Backend Stack
Recommended:
- Node.js
- Express.js
- PostgreSQL

## Backend Responsibilities
- Billing calculations
- Authentication
- Tenant isolation
- Validation
- Invoice generation
- Data persistence

---

# 15. Deployment Requirements

## Infrastructure
- Dockerized services
- Cloud deployment
- CI/CD pipeline
- HTTPS enabled
- Environment-based configuration

## Monitoring
- Error logging
- API monitoring
- Performance monitoring

## Backup Strategy
- Daily database backups
- Secure backup storage
- Recovery testing

---

# 16. Development Roadmap

# Phase 1: Product Foundation
- Define tenant model
- Define billing rules
- Define invoice structure
- Define isolated data model

# Phase 2: UI/UX Design
- Dashboard design
- Menu management design
- Billing screen design
- Order history design
- Settings design

# Phase 3: Backend and Database
- Create database schema
- Build authentication
- Implement tenant isolation
- Create API architecture

# Phase 4: Core Feature Development
- Menu CRUD
- Billing workflow
- Invoice generation
- Order history
- Settings module

# Phase 5: Production Hardening
- Validation
- Security checks
- Logging
- Monitoring
- Backups
- Deployment pipeline

# Phase 6: Testing and Launch
- Unit testing
- Integration testing
- End-to-end testing
- Billing accuracy testing
- Tenant isolation testing
- Production deployment

---

# 17. Testing Requirements

## Unit Testing
Test:
- Billing calculations
- Tax calculations
- Discount calculations
- API validation

## Integration Testing
Test:
- Authentication flow
- Billing workflow
- Database operations

## End-to-End Testing
Test:
- Complete restaurant workflow
- Menu creation to invoice generation

## Multi-Tenant Testing
Verify:
- Restaurants cannot access other restaurant data
- Queries are properly isolated

---

# 18. Success Metrics

## Product Metrics
- Fast invoice generation
- Stable billing workflow
- Low error rate
- Fast UI interactions

## Business Metrics
- Restaurant onboarding count
- Daily active restaurants
- Monthly recurring revenue
- Customer retention

---

# 19. Future Expansion

Possible future upgrades:
- Inventory management
- Kitchen display system
- Multi-branch support
- Staff permissions
- Delivery integration
- Loyalty system
- Advanced analytics
- Mobile app
- QR ordering
- Online ordering

---

# 20. Final Product Vision

Build a modern restaurant billing SaaS platform that is:
- Fast
- Reliable
- Production-grade
- Multi-tenant
- Easy to use
- Scalable
- Secure
- Ready for future expansion

The platform should feel lightweight for small restaurants while maintaining strong production architecture for long-term scaling.

