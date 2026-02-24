# Gemini Project Information

This file provides context for the Gemini AI assistant to understand and assist with the Claidex project.

## Project Overview

Claidex is a full-stack application with a Next.js frontend, a Node.js API, and an ETL pipeline for data processing. The project uses PostgreSQL (via Neon) and Neo4j for data storage.

## Frontend

The frontend is a Next.js application located in the `frontend/` directory. It uses:

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **UI Components:** Shadcn/UI (built on Radix UI)

When making frontend changes, please adhere to the existing style and component usage. Use the components from `frontend/components/ui/` whenever possible.

## Backend

The backend consists of a Node.js API in `api/` and another service in `backend/`. The ETL pipeline is in `etl/`.

## General Instructions

*   Adhere to the existing coding style and conventions.
*   When adding new features, include tests.
*   Ensure all changes are verified with the appropriate build and lint commands.
*   Ask for clarification if a request is ambiguous.
