# Journal Management System \- Implementation Tasks

Phases 1-5: Detailed Task Breakdown

# **Phase 1: Foundation (Week 1-2)**

Goal: Basic infrastructure and authentication

## **Task 1.1: Project Setup & Configuration**

**Priority:** CRITICAL

**Estimated Time:** 4-6 hours

### **Description:**

Initialize the TanStack Start project with all necessary dependencies and configure Supabase connection.

### **Steps:**

* Create new TanStack Start project using official starter template  
* Install all dependencies from PRD Section 6.2 (Key Dependencies)  
* Configure TypeScript with strict mode  
* Setup Tailwind CSS configuration  
* Create .env.local file with environment variables from PRD Section 6.3  
* Initialize Supabase client in app/lib/supabase/client.ts  
* Test Supabase connection  
* Setup project folder structure: app/components/, app/lib/, app/routes/

### **Reference:**

PRD Section 6.2: Key Dependencies

PRD Section 6.3: Environment Variables

### **Deliverable:**

Working TanStack Start app with Supabase connected

All dependencies installed and configured

## **Task 1.2: Database Schema Migration**

**Priority:** CRITICAL

**Estimated Time:** 2-3 hours

### **Description:**

Execute the complete SQL migration to create the journal schema with all tables, RLS policies, triggers, and functions.

### **Steps:**

* Access Supabase Dashboard SQL Editor  
* Copy the complete SQL script from PRD Section 3 (Database Schema)  
* Execute the migration script  
* Verify all tables were created in the journal schema  
* Test RLS policies are active  
* Verify triggers are working (test submission\_number generation)  
* Check that views are created correctly  
* Insert initial data for journal\_settings table

### **Reference:**

PRD Section 3: Complete Database Schema (SQL)

PRD Section 3.2: RLS Policies

PRD Section 3.3: Triggers & Functions

### **Deliverable:**

Complete journal schema created in Supabase

All 15+ tables created with proper relationships

RLS policies active and tested

## **Task 1.3: Supabase Storage Configuration**

**Priority:** HIGH

**Estimated Time:** 1-2 hours

### **Description:**

Create and configure storage buckets for article files with appropriate RLS policies.

### **Steps:**

* Go to Supabase Dashboard Storage  
* Create bucket journal-submissions (PRIVATE)  
* Create bucket journal-published (PUBLIC)  
* Apply RLS policies from PRD Section 6.4  
* Test upload permissions for authenticated users  
* Test read permissions based on roles  
* Configure CORS if needed  
* Set file size limits (10MB for submissions)

### **Reference:**

PRD Section 6.4: Supabase Storage Buckets

### **Deliverable:**

Two storage buckets created and configured

RLS policies applied and tested

## **Task 1.4: TypeScript Type Generation**

*Priority: HIGH | Estimated Time: 1 hour*

Generate TypeScript types from Supabase schema for type-safe database queries.

Reference: PRD Section 6.5

## **Task 1.5: Authentication System**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Implement complete authentication flow with sign up, login, logout, and password reset.

Reference: PRD Section 4.1

## **Task 1.6: User Profile Management**

*Priority: MEDIUM | Estimated Time: 4-5 hours*

Create user profile page where users can view and edit their information.

Reference: PRD Section 3 (user\_profiles table)

# **Phase 2: Submission Module (Week 3-4)**

## ~~**Task 2.0: Profile Onboarding Flow**~~ ✅

*Priority: CRITICAL | Estimated Time: 2-3 hours*

**Status: COMPLETED**

Implemented profile onboarding system to handle users without profiles:
- Created `ProfileOnboarding` component to prompt profile completion
- Modified `getUserProfile` to use `.maybeSingle()` for graceful null handling
- Added conditional rendering in `/journal/index.tsx` to show onboarding when profile is missing
- Users are now directed to complete their profile before accessing journal features

## **Task 2.1: Multi-Step Submission Form Structure**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Create the multi-step submission form structure with navigation and state management.

6 Steps: Article Type, Bilingual Metadata, Authors, File Upload, Additional Info, Review

Reference: PRD Section 4.2, Section 8.1

## **Task 2.2: Submission Form Fields Implementation**

*Priority: CRITICAL | Estimated Time: 8-10 hours*

Implement all form fields with proper validation and bilingual support.

Reference: PRD Section 8.1 (complete example)

## **Task 2.3: File Upload System**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Implement secure file upload for PDF, Typst, and supplementary materials.

Reference: PRD Section 6.4, Section 12.1

## **Task 2.4: Submission Backend Logic**

*Priority: CRITICAL | Estimated Time: 4-6 hours*

Implement server-side logic for article submission with proper database transactions.

Reference: PRD Section 4.2, Section 3.3

## **Task 2.5: Email Notification System**

*Priority: HIGH | Estimated Time: 4-5 hours*

Setup email service (Resend) and implement submission confirmation emails.

Reference: PRD Section 7

## **Task 2.6: Author Dashboard**

*Priority: HIGH | Estimated Time: 5-6 hours*

Create dashboard where authors can view all their submissions and their status.

Reference: PRD Section 4.2, Section 3.4

## **Task 2.7: Article Detail Page (Author View)**

*Priority: MEDIUM | Estimated Time: 4-5 hours*

Create detailed view of a single article for authors to track progress.

Reference: PRD Section 4.2

# **Phase 3: Editorial Dashboard (Week 5-6)**

## **Task 3.1: Editorial Dashboard Kanban View**

*Priority: CRITICAL | Estimated Time: 8-10 hours*

Create Kanban board for visual management of article workflow.

Reference: PRD Section 8.2 (complete implementation), Section 4.3

## **Task 3.2: Editorial Dashboard Table View**

*Priority: HIGH | Estimated Time: 4-5 hours*

Create alternative table view for detailed article listing.

Reference: PRD Section 4.3, Section 3.4

## **Task 3.3: Advanced Filtering & Search**

*Priority: HIGH | Estimated Time: 4-5 hours*

Implement comprehensive filtering and search for editorial dashboard.

Reference: PRD Section 4.3, Section 13.1

## **Task 3.4: Editor Article Detail Page**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Create comprehensive article view for editors with all management options.

Reference: PRD Section 4.3

## **Task 3.5: Reviewer Invitation System**

*Priority: CRITICAL | Estimated Time: 6-7 hours*

Implement system for editors to invite reviewers to review articles.

Reference: PRD Section 4.4, Section 7.2

## **Task 3.6: Editorial Metrics Dashboard**

*Priority: MEDIUM | Estimated Time: 4-5 hours*

Create metrics panel showing key editorial statistics.

Reference: PRD Section 4.3

# **Phase 4: Review System (Week 7-8)**

## **Task 4.1: Reviewer Invitation Response Page**

*Priority: CRITICAL | Estimated Time: 4-5 hours*

Create page where reviewers can accept or decline review invitations.

Reference: PRD Section 4.4

## **Task 4.2: Reviewer Dashboard**

*Priority: HIGH | Estimated Time: 3-4 hours*

Create dashboard for reviewers to see all their assigned reviews.

Reference: PRD Section 4.4, Section 3.4

## **Task 4.3: Review Form Structure & Scoring**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Create comprehensive review form with scoring criteria.

5 scoring criteria: Originality, Methodology, Results, Clarity, References

Reference: PRD Section 4.4, Section 3 (reviews table)

## **Task 4.4: PDF Viewer for Reviewers**

*Priority: HIGH | Estimated Time: 3-4 hours*

Integrate PDF viewer so reviewers can read manuscripts while reviewing.

Reference: PRD Section 6.2 (react-pdf)

## **Task 4.5: Review Submission Backend**

*Priority: CRITICAL | Estimated Time: 4-5 hours*

Implement backend logic for review submission and status updates.

Reference: PRD Section 4.4

## **Task 4.6: Editor Review Viewing Interface**

*Priority: HIGH | Estimated Time: 4-5 hours*

Create interface for editors to view all reviews for an article.

Reference: PRD Section 4.4

## **Task 4.7: Editorial Decision System**

*Priority: CRITICAL | Estimated Time: 5-6 hours*

Implement system for editors to make final decisions on articles.

Reference: PRD Section 4.5

# **Phase 5: Publication (Week 9-10)**

## **Task 5.1: Publication Workflow**

*Priority: CRITICAL | Estimated Time: 4-5 hours*

Implement workflow for editors to publish accepted articles.

Reference: PRD Section 4.6

## **Task 5.2: Public Article Page**

*Priority: CRITICAL | Estimated Time: 6-8 hours*

Create public-facing page for published articles.

Reference: PRD Section 4.7

## **Task 5.3: Journal Homepage**

*Priority: HIGH | Estimated Time: 5-6 hours*

Create journal homepage with article listing and navigation.

Reference: PRD Section 4.7, Section 3.4

## **Task 5.4: Article Search & Filtering**

*Priority: HIGH | Estimated Time: 4-5 hours*

Implement public search and filtering for published articles.

Reference: PRD Section 4.7, Section 13

## **Task 5.5: BibTeX Export**

*Priority: MEDIUM | Estimated Time: 2-3 hours*

Implement BibTeX citation export for articles.

Reference: PRD Section 4.7

## **Task 5.6: RSS Feed Generation**

*Priority: MEDIUM | Estimated Time: 2-3 hours*

Generate RSS feed for latest published articles.

Reference: PRD Section 4.7

## **Task 5.7: Volume & Issue Management**

*Priority: MEDIUM | Estimated Time: 4-5 hours*

Create interface for managing journal volumes and issues.

Reference: PRD Section 4.6

## **Task 5.8: Article Metrics & Analytics**

*Priority: LOW | Estimated Time: 3-4 hours*

Track and display article views and downloads.

Reference: PRD Section 14.2, Section 16

# **Implementation Summary**

Total Tasks: 34

Total Estimated Time: 144-184 hours

Timeline: 10 weeks

## **How to Use with Claude:**

1\. Start with Phase 1, Task 1.1

2\. Copy task description and reference sections

3\. Provide to Claude with PRD context

4\. Review and test generated code

5\. Move to next task sequentially

**Good luck with implementation\!**