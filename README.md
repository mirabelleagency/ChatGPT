# Project Planner Pro

A lightweight Microsoft Project–style planner implemented as a browser-based React application. It supports task dependencies, automatic scheduling, critical path analysis, and an interactive Gantt chart.

## Getting started

1. Install dependencies (Node.js 18+ recommended):

   ```bash
   npm install
   ```

2. Start the local development environment:

   ```bash
   npm run dev
   ```

   This runs the Vite development server on [http://localhost:5173](http://localhost:5173) with hot module replacement alongside the Express API stub on port `3000`.

3. Build the production bundle:

   ```bash
   npm run build
   ```

4. Serve the optimised build locally (simulates production):

   ```bash
   npm run start
   ```

   The Express server will host the contents of the `dist/` directory on the port specified by `PORT` (default `3000`).

### Key capabilities

- **Task management** – Add tasks with durations, optional preferred start dates, and predecessor dependencies.
- **Automatic scheduling** – Tasks align to the latest finish of their dependencies. Tasks with no dependencies respect the project start date.
- **Critical path analysis** – Slack is calculated for each task and critical activities are highlighted in both the task table and Gantt chart.
- **Interactive Gantt chart** – Visualise the project timeline, complete with dependency offsets and critical path styling.
- **Project presets** – Load a demo project or reset the workspace with a single click.

## Usage tips

1. Set the project start date and working parameters in **Project Settings**.
2. Add tasks via the **Add Task** form. Hold `Ctrl` / `⌘` when selecting multiple dependencies.
3. The **Task Overview** table reveals calculated start/finish dates, dependencies, and slack for each activity.
4. Scroll horizontally within the **Gantt Chart** to review long timelines.

## Development

- The client is bundled with [Vite](https://vitejs.dev/). Use `npm run dev` for HMR or `npm run build` to generate the production-ready assets in `dist/`.
- The Express server in `server/index.js` exposes a `/api/health` endpoint and, in production, serves the built client. During development the Vite dev server proxies `/api/*` requests to the Express process running on port `3000`.
- Adjust the proxy configuration or add additional API routes as needed; the scaffolding is intentionally lightweight.

## Versioning

- **Current version:** `1.2.0` (also exposed at runtime through `src/version.js`).
- Update the version string in `version.js` and document the change in `CHANGELOG.md` for every release.
- Follow [Semantic Versioning](https://semver.org/) when deciding how to bump the version number.

See [`CHANGELOG.md`](CHANGELOG.md) for historical release notes.
