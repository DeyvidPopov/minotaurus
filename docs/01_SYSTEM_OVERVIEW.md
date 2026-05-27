# 01 System Overview

## Project Title

Perfect Documentation Platform / SSOT Architecture Platform

## Thesis Alignment

The platform is a web application for managing and interconnecting software documentation, APIs, and system architecture. Its core purpose is to replace fragmented software engineering documentation with a unified environment where all artifacts are structured, linked, validated, and exportable as a Single Source of Truth.

## Core Problem

Software projects often spread important knowledge across multiple tools:

- Markdown documents
- API specifications
- architecture diagrams
- database schemas
- tickets and requirements
- security rules
- deployment notes

This leads to duplicated information, missing traceability, inconsistent documentation, and weak visibility into architecture changes.

## Core Solution

The system introduces a centralized documentation and architecture platform built around interconnected software artifacts. Every relevant engineering object is represented as an artifact and can be linked to other artifacts.

Examples:

- API endpoint documents a backend service
- service uses a database table
- requirement is implemented by a feature
- security policy protects an endpoint
- diagram represents a system module

These relationships form a knowledge graph that supports traceability, dependency analysis, validation, and SSOT export.

## Main Users

### Admin

Manages users, projects, roles, and global platform settings.

### Architect

Creates and validates architecture, APIs, database models, diagrams, and relations.

### Developer

Creates and edits documentation, APIs, diagrams, and implementation-related artifacts.

### Viewer

Can read project documentation, view diagrams, and inspect exported SSOT information.

## Main Modules

1. Authentication and authorization
2. Project management
3. Artifact management
4. Documentation editor
5. API specification management
6. Architecture and diagram management
7. Database model management
8. Knowledge graph and relation engine
9. Validation engine
10. Versioning and traceability
11. Search
12. SSOT export
13. WebSocket-based realtime updates

## High-Level Architecture

```text
Next.js Frontend
   |
   | REST API + WebSocket
   v
Node.js / Express Backend
   |
   v
PostgreSQL Database
```

## Frontend Responsibility

The frontend is responsible for user interaction and visualization:

- dashboards
- forms
- editors
- graph views
- validation panels
- search interface
- export interface

## Backend Responsibility

The backend is responsible for business logic and persistence:

- authentication
- authorization
- CRUD operations
- relationship management
- validation logic
- version tracking
- search processing
- export generation
- WebSocket events

## Database Responsibility

PostgreSQL stores:

- users
- projects
- artifacts
- relationships
- documents
- API specs
- endpoints
- diagrams
- database models
- validation issues
- version history
- export packages

## Engineering Principle

The documentation is treated as a first-class engineering artifact. The platform does not only display documentation; it connects documentation to APIs, architecture, database design, requirements, and validation rules.

## Acceptance Criteria

The system is successful when it can:

- create projects
- create software artifacts
- connect artifacts through typed relationships
- visualize artifact relationships as a graph
- store and render Markdown documentation
- import or define API endpoints
- store diagrams
- validate consistency between modules
- track version history
- search across project artifacts
- export a unified SSOT package
