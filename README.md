# Project Planner Pro

A lightweight Microsoft Project–style planner implemented as a browser-based React application. It supports task dependencies, automatic scheduling, critical path analysis, and an interactive Gantt chart—all without any build tooling.

## Getting started

Open `index.html` in your favourite browser. Everything runs locally and requires no compilation or server.

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

No external build step is required. Static assets are organised at the repository root:

```
index.html
styles.css
app.jsx
```

The page loads React, ReactDOM, and Babel from CDNs so you can edit the JSX directly without a bundler.

## Versioning

- **Current version:** `1.1.0` (also exposed at runtime through `version.js`).
- Update the version string in `version.js` and document the change in `CHANGELOG.md` for every release.
- Follow [Semantic Versioning](https://semver.org/) when deciding how to bump the version number.

See [`CHANGELOG.md`](CHANGELOG.md) for historical release notes.
