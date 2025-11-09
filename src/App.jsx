import { useMemo, useState } from 'react';

import { PLANNER_VERSION } from './version.js';

const APP_VERSION = PLANNER_VERSION ?? 'dev';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 28;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(date) {
  if (!date) return '—';
  const local = new Date(date.getTime());
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function inferFallbackStart(tasks) {
  const manualStarts = tasks
    .map((task) => toDate(task.manualStart))
    .filter(Boolean)
    .map((date) => date.getTime());
  if (manualStarts.length) {
    const earliest = new Date(Math.min(...manualStarts));
    earliest.setHours(0, 0, 0, 0);
    return earliest;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function topologicalSort(tasks) {
  const map = new Map(tasks.map((task) => [task.id, task]));
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  const graph = new Map();

  for (const task of tasks) {
    for (const dependencyId of task.dependencies) {
      if (!map.has(dependencyId)) {
        throw new Error(`Task ${task.name} references missing dependency ${dependencyId}.`);
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      if (!graph.has(dependencyId)) {
        graph.set(dependencyId, []);
      }
      graph.get(dependencyId).push(task.id);
    }
  }

  const queue = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted = [];
  while (queue.length) {
    const id = queue.shift();
    const task = map.get(id);
    sorted.push(task);
    for (const dependentId of graph.get(id) ?? []) {
      indegree.set(dependentId, indegree.get(dependentId) - 1);
      if (indegree.get(dependentId) === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (sorted.length !== tasks.length) {
    throw new Error('A dependency cycle was detected. Remove one of the circular links to continue.');
  }

  return sorted;
}

function VersionBadge({ version }) {
  return (
    <span className="version-badge" aria-label={`Version ${version}`}>
      v{version}
    </span>
  );
}

function markCritical(task, criticalSet, taskMap) {
  if (criticalSet.has(task.id)) return;
  criticalSet.add(task.id);
  task.isCritical = true;
  if (!task.dependencies.length) return;
  for (const dependencyId of task.dependencies) {
    const dependency = taskMap.get(dependencyId);
    if (!dependency) continue;
    const expected = dependency.longestPathDuration + task.duration;
    if (Math.abs(task.longestPathDuration - expected) < 1e-6) {
      markCritical(dependency, criticalSet, taskMap);
    }
  }
}

function buildSchedule(tasks, settings) {
  if (!tasks.length) {
    return {
      projectStart: null,
      projectFinish: null,
      sortedTasks: [],
    };
  }

  const projectStartInput = toDate(settings.projectStart);
  const projectStart = projectStartInput ?? inferFallbackStart(tasks);

  const workingCopy = tasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.slice(),
    manualStartDate: toDate(task.manualStart),
    earliestStart: null,
    earliestFinish: null,
    latestStart: null,
    latestFinish: null,
    slack: 0,
    longestPathDuration: 0,
    isCritical: false,
  }));

  const sortedTasks = topologicalSort(workingCopy);
  const taskMap = new Map(sortedTasks.map((task) => [task.id, task]));
  const dependentsMap = new Map(sortedTasks.map((task) => [task.id, []]));

  for (const task of sortedTasks) {
    for (const dependencyId of task.dependencies) {
      dependentsMap.get(dependencyId).push(task);
    }
  }

  for (const task of sortedTasks) {
    const dependencyTasks = task.dependencies.map((id) => {
      const dependency = taskMap.get(id);
      if (!dependency) {
        throw new Error(`Missing dependency ${id} for task ${task.name}`);
      }
      return dependency;
    });

    const dependencyFinishTimes = dependencyTasks.map(
      (dep) => dep.earliestFinish?.getTime() ?? projectStart.getTime()
    );

    const dependencyLatestFinish = dependencyFinishTimes.length
      ? Math.max(...dependencyFinishTimes)
      : projectStart.getTime();

    const preferredStart = task.manualStartDate ? new Date(task.manualStartDate.getTime()) : null;
    const chosenStartTime = preferredStart
      ? dependencyTasks.length
        ? Math.max(preferredStart.getTime(), dependencyLatestFinish)
        : preferredStart.getTime()
      : dependencyLatestFinish;

    const startDate = new Date(chosenStartTime);
    startDate.setHours(0, 0, 0, 0);
    const finishDate = addDays(startDate, task.duration);

    task.earliestStart = startDate;
    task.earliestFinish = finishDate;
    const dependencyLongestPath = dependencyTasks.length
      ? Math.max(...dependencyTasks.map((dep) => dep.longestPathDuration))
      : 0;
    task.longestPathDuration = dependencyLongestPath + task.duration;
  }

  const projectFinish = new Date(
    Math.max(...sortedTasks.map((task) => task.earliestFinish.getTime()))
  );

  const reversed = [...sortedTasks].reverse();
  for (const task of reversed) {
    const dependents = dependentsMap.get(task.id);
    if (!dependents.length) {
      task.latestFinish = new Date(projectFinish.getTime());
    } else {
      const minLatestStart = Math.min(
        ...dependents.map((dep) => dep.latestStart.getTime())
      );
      task.latestFinish = new Date(minLatestStart);
    }
    task.latestStart = addDays(task.latestFinish, -task.duration);
    task.slack = (task.latestStart.getTime() - task.earliestStart.getTime()) / DAY_IN_MS;
  }

  const criticalDuration = Math.max(
    ...sortedTasks.map((task) => task.longestPathDuration)
  );
  const criticalTasks = sortedTasks.filter(
    (task) => Math.abs(task.longestPathDuration - criticalDuration) < 1e-6
  );
  const criticalSet = new Set();
  for (const task of criticalTasks) {
    markCritical(task, criticalSet, taskMap);
  }

  for (const task of sortedTasks) {
    if (task.slack <= 0.01) {
      task.isCritical = true;
    }
  }

  return {
    projectStart,
    projectFinish,
    sortedTasks,
  };
}

function SettingsPanel({ settings, onChange, onSeedDemo, onReset }) {
  return (
    <section className="panel" aria-labelledby="project-settings-heading">
      <div className="panel-header">
        <h2 id="project-settings-heading">Project Settings</h2>
      </div>
      <div className="panel-body settings">
        <label className="field">
          <span>Project start date</span>
          <input
            type="date"
            value={settings.projectStart}
            onChange={(event) => onChange('projectStart', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Working day length (hours)</span>
          <input
            type="number"
            min="1"
            max="24"
            value={settings.workingHours}
            onChange={(event) => onChange('workingHours', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Default task duration (days)</span>
          <input
            type="number"
            min="1"
            value={settings.defaultDuration}
            onChange={(event) => onChange('defaultDuration', event.target.value)}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={onSeedDemo}>Load demo project</button>
          <button type="button" className="danger" onClick={onReset}>Reset project</button>
        </div>
      </div>
    </section>
  );
}

function TaskForm({ formState, tasks, onChange, onSubmit }) {
  const dependencyValue = formState.dependencies.map(String);
  const sortedOptions = [...tasks].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="panel" aria-labelledby="task-form-heading">
      <div className="panel-header">
        <h2 id="task-form-heading">Add Task</h2>
      </div>
      <form
        className="panel-body form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="field">
          <span>Task name</span>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => onChange('name', event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Duration (days)</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={formState.duration}
            onChange={(event) => onChange('duration', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Preferred start (optional)</span>
          <input
            type="date"
            value={formState.manualStart}
            onChange={(event) => onChange('manualStart', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Dependencies</span>
          <select
            multiple
            size="5"
            value={dependencyValue}
            onChange={(event) => {
              const values = Array.from(event.target.selectedOptions).map((option) => Number(option.value));
              onChange('dependencies', values);
            }}
            aria-describedby="dependency-hint"
          >
            {sortedOptions.map((task) => (
              <option key={task.id} value={task.id}>
                {task.id} · {task.name}
              </option>
            ))}
          </select>
          <span className="hint" id="dependency-hint">
            Hold Ctrl or ⌘ to pick multiple predecessors. Tasks are scheduled after their latest dependency.
          </span>
        </label>
        <div className="actions">
          <button type="submit">Add task</button>
        </div>
      </form>
    </section>
  );
}

function TaskTable({ schedule, workingHours }) {
  const { sortedTasks, projectStart, projectFinish } = schedule;
  const workingHoursNumber = Number(workingHours) || 8;
  const hasTasks = sortedTasks.length > 0;

  const totalDays = hasTasks
    ? (projectFinish.getTime() - projectStart.getTime()) / DAY_IN_MS
    : 0;
  const totalHours = totalDays * workingHoursNumber;

  const labelMap = new Map(sortedTasks.map((task) => [task.id, task.name]));

  return (
    <section className="panel" aria-labelledby="task-table-heading">
      <div className="panel-header">
        <h2 id="task-table-heading">Task Overview</h2>
        <div className="summary" aria-live="polite">
          {hasTasks
            ? `Timeline: ${formatDate(projectStart)} → ${formatDate(
                projectFinish
              )} • Duration: ${totalDays.toFixed(1)} days (${totalHours.toFixed(1)} hours)`
            : ''}
        </div>
      </div>
      <div className="panel-body">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Task</th>
                <th scope="col">Duration</th>
                <th scope="col">Start</th>
                <th scope="col">Finish</th>
                <th scope="col">Dependencies</th>
                <th scope="col">Slack</th>
              </tr>
            </thead>
            <tbody>
              {hasTasks ? (
                sortedTasks.map((task) => {
                  const slackDays = Math.round(task.slack * 10) / 10;
                  const slackText = `${slackDays === 0 ? '0.0' : slackDays.toFixed(1)} days`;
                  const dependencyLabel = task.dependencies.length
                    ? task.dependencies
                        .map((id) => `${id} · ${labelMap.get(id) ?? 'Unknown'}`)
                        .join(', ')
                    : '—';
                  return (
                    <tr key={task.id} className={task.isCritical ? 'critical-row' : ''}>
                      <td>{task.id}</td>
                      <td>{task.name}</td>
                      <td>{`${task.duration} days`}</td>
                      <td>{formatDate(task.earliestStart)}</td>
                      <td>{formatDate(task.earliestFinish)}</td>
                      <td>{dependencyLabel}</td>
                      <td>{slackText}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="empty">Add a task to see the schedule.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function GanttChart({ schedule }) {
  const { sortedTasks } = schedule;
  if (!sortedTasks.length) {
    return (
      <section className="panel" aria-labelledby="gantt-heading">
        <div className="panel-header">
          <h2 id="gantt-heading">Gantt Chart</h2>
          <div className="legend">
            <span className="legend-item critical">Critical</span>
            <span className="legend-item">Standard</span>
          </div>
        </div>
        <div className="panel-body gantt-container">
          <div className="gantt">
            <p className="empty">Add a task to see the schedule.</p>
          </div>
        </div>
      </section>
    );
  }

  const minStart = Math.min(...sortedTasks.map((task) => task.earliestStart.getTime()));
  const maxFinish = Math.max(...sortedTasks.map((task) => task.earliestFinish.getTime()));
  const totalDays = (maxFinish - minStart) / DAY_IN_MS;
  const timelineWidth = Math.max(totalDays * DAY_WIDTH + 200, 640);

  return (
    <section className="panel" aria-labelledby="gantt-heading">
      <div className="panel-header">
        <h2 id="gantt-heading">Gantt Chart</h2>
        <div className="legend">
          <span className="legend-item critical">Critical</span>
          <span className="legend-item">Standard</span>
        </div>
      </div>
      <div className="panel-body gantt-container">
        <div
          className="gantt"
          role="img"
          aria-label="Project schedule shown as a Gantt chart"
        >
          <div className="gantt-timeline" style={{ minWidth: `${timelineWidth}px` }}>
            {sortedTasks.map((task) => {
              const offsetDays = (task.earliestStart.getTime() - minStart) / DAY_IN_MS;
              const width = Math.max(task.duration * DAY_WIDTH, 6);
              return (
                <div key={task.id} className="gantt-row">
                  <div className="gantt-label">{`${task.id}. ${task.name}`}</div>
                  <div className="gantt-bar-wrapper">
                    <div
                      className={`gantt-bar${task.isCritical ? ' critical' : ''}`}
                      style={{
                        left: `${offsetDays * DAY_WIDTH}px`,
                        width: `${width}px`,
                      }}
                    >
                      {`${formatDate(task.earliestStart)} → ${formatDate(task.earliestFinish)}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [settings, setSettings] = useState({
    projectStart: '',
    workingHours: '8',
    defaultDuration: '1',
  });
  const [tasks, setTasks] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [formState, setFormState] = useState({
    name: '',
    duration: '',
    manualStart: '',
    dependencies: [],
  });

  const schedule = useMemo(() => {
    try {
      return buildSchedule(tasks, settings);
    } catch (error) {
      return { error };
    }
  }, [tasks, settings]);

  const handleSettingChange = (field, value) => {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleFormChange = (field, value) => {
    setFormState((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmitTask = () => {
    const name = formState.name.trim();
    if (!name) return;

    const durationInput = parseFloat(formState.duration);
    const fallbackDuration = parseFloat(settings.defaultDuration) || 1;
    const duration = Number.isFinite(durationInput) && durationInput > 0
      ? durationInput
      : fallbackDuration;

    const newTask = {
      id: nextId,
      name,
      duration,
      dependencies: formState.dependencies.slice(),
      manualStart: formState.manualStart || null,
    };

    try {
      topologicalSort([...tasks, newTask]);
    } catch (error) {
      alert(error.message);
      return;
    }

    setTasks((previous) => [...previous, newTask]);
    setNextId((value) => value + 1);
    setFormState({
      name: '',
      duration: '',
      manualStart: '',
      dependencies: [],
    });
  };

  const handleSeedDemo = () => {
    const projectStart = new Date();
    projectStart.setHours(0, 0, 0, 0);
    const projectStartIso = formatDate(projectStart);

    const demoTasks = [
      {
        name: 'Kick-off workshop',
        duration: 1,
        start: projectStartIso,
        dependencies: [],
      },
      {
        name: 'Requirement analysis',
        duration: 4,
        dependencies: [1],
      },
      {
        name: 'Architecture design',
        duration: 3,
        dependencies: [2],
      },
      {
        name: 'Implementation phase 1',
        duration: 10,
        dependencies: [3],
      },
      {
        name: 'QA & validation',
        duration: 5,
        dependencies: [4],
      },
      {
        name: 'Deployment',
        duration: 2,
        dependencies: [5],
      },
      {
        name: 'Stakeholder sign-off',
        duration: 1,
        dependencies: [5],
      },
    ];

    const seededTasks = demoTasks.map((task, index) => ({
      id: index + 1,
      name: task.name,
      duration: task.duration,
      dependencies: task.dependencies.slice(),
      manualStart: task.start ?? null,
    }));

    setSettings((previous) => ({
      ...previous,
      projectStart: projectStartIso,
    }));
    setTasks(seededTasks);
    setNextId(seededTasks.length + 1);
    setFormState({
      name: '',
      duration: '',
      manualStart: '',
      dependencies: [],
    });
  };

  const handleReset = () => {
    if (!tasks.length) return;
    if (!window.confirm('Remove all tasks and reset the project?')) {
      return;
    }
    setTasks([]);
    setNextId(1);
    setFormState({
      name: '',
      duration: '',
      manualStart: '',
      dependencies: [],
    });
    setSettings((previous) => ({
      ...previous,
      projectStart: '',
    }));
  };

  if (schedule.error) {
    return (
      <main className="error">
        <h1>
          Project Planner Pro <VersionBadge version={APP_VERSION} />
        </h1>
        <p>{schedule.error.message}</p>
      </main>
    );
  }

  return (
    <>
      <header>
        <div className="title-row">
          <h1>Project Planner Pro</h1>
          <VersionBadge version={APP_VERSION} />
        </div>
        <p>
          Create project schedules with dependencies, automatic timelines, and critical path visualisations inspired by
          Microsoft Project.
        </p>
      </header>
      <main>
        <SettingsPanel
          settings={settings}
          onChange={handleSettingChange}
          onSeedDemo={handleSeedDemo}
          onReset={handleReset}
        />
        <TaskForm
          formState={formState}
          tasks={tasks}
          onChange={handleFormChange}
          onSubmit={handleSubmitTask}
        />
        <TaskTable schedule={schedule} workingHours={settings.workingHours} />
        <GanttChart schedule={schedule} />
      </main>
    </>
  );
}

export default App;
