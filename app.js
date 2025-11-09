const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 28; // pixels per day in the Gantt chart

const state = {
  nextId: 1,
  tasks: [],
};

const elements = {
  projectStart: document.getElementById('project-start'),
  workingHours: document.getElementById('working-hours'),
  defaultDuration: document.getElementById('default-duration'),
  seedDemo: document.getElementById('seed-demo'),
  resetProject: document.getElementById('reset-project'),
  taskForm: document.getElementById('task-form'),
  taskName: document.getElementById('task-name'),
  taskDuration: document.getElementById('task-duration'),
  taskStart: document.getElementById('task-start'),
  taskDependencies: document.getElementById('task-dependencies'),
  taskTableBody: document.querySelector('#task-table tbody'),
  taskRowTemplate: document.getElementById('task-row-template'),
  gantt: document.getElementById('gantt-chart'),
  projectSummary: document.getElementById('project-summary'),
};

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
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

function getProjectStartDate() {
  const date = toDate(elements.projectStart.value);
  if (date) {
    date.setHours(0, 0, 0, 0);
    return date;
  }
  return null;
}

function resetTaskForm() {
  elements.taskForm.reset();
  elements.taskDuration.value = '';
  elements.taskDependencies.value = null;
}

function updateDependencyOptions() {
  const select = elements.taskDependencies;
  const previouslySelected = Array.from(select.selectedOptions).map((option) => option.value);
  select.innerHTML = '';

  state.tasks
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((task) => {
      const option = document.createElement('option');
      option.value = String(task.id);
      option.textContent = `${task.id} · ${task.name}`;
      if (previouslySelected.includes(option.value)) {
        option.selected = true;
      }
      select.appendChild(option);
    });
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

function computeSchedule() {
  if (state.tasks.length === 0) {
    elements.taskTableBody.innerHTML = '';
    elements.gantt.innerHTML = '<p class="empty">Add a task to see the schedule.</p>';
    elements.projectSummary.textContent = '';
    return;
  }

  const projectStart = getProjectStartDate() ?? inferFallbackStart();
  const sortedTasks = topologicalSort(state.tasks);
  const taskMap = new Map(sortedTasks.map((task) => [task.id, task]));
  const dependentsMap = new Map(sortedTasks.map((task) => [task.id, []]));

  for (const task of sortedTasks) {
    task.earliestStart = null;
    task.earliestFinish = null;
    task.latestStart = null;
    task.latestFinish = null;
    task.slack = 0;
    task.longestPathDuration = 0;
    task.isCritical = false;
  }

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
    const dependencyFinishTimes = dependencyTasks.map((dep) => dep.earliestFinish?.getTime() ?? projectStart.getTime());
    const dependencyLatestFinish = dependencyFinishTimes.length
      ? Math.max(...dependencyFinishTimes)
      : projectStart.getTime();

    const preferredStart = task.manualStart ? new Date(task.manualStart.getTime()) : null;
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
      const minLatestStart = Math.min(...dependents.map((dep) => dep.latestStart.getTime()));
      task.latestFinish = new Date(minLatestStart);
    }
    task.latestStart = addDays(task.latestFinish, -task.duration);
    task.slack = (task.latestStart.getTime() - task.earliestStart.getTime()) / DAY_IN_MS;
  }

  const criticalDuration = Math.max(...sortedTasks.map((task) => task.longestPathDuration));
  const criticalTasks = sortedTasks.filter((task) =>
    Math.abs(task.longestPathDuration - criticalDuration) < 1e-6
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

  renderTasks(sortedTasks, projectStart, projectFinish);
}

function inferFallbackStart() {
  const earliestManual = state.tasks
    .map((task) => task.manualStart)
    .filter(Boolean)
    .map((date) => date.getTime());
  if (earliestManual.length) {
    const earliest = new Date(Math.min(...earliestManual));
    earliest.setHours(0, 0, 0, 0);
    return earliest;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function markCritical(task, criticalSet, taskMap) {
  if (criticalSet.has(task.id)) {
    return;
  }
  criticalSet.add(task.id);
  task.isCritical = true;
  if (!task.dependencies.length) {
    return;
  }
  for (const dependencyId of task.dependencies) {
    const dependency = taskMap.get(dependencyId);
    if (!dependency) continue;
    const expected = dependency.longestPathDuration + task.duration;
    if (Math.abs(task.longestPathDuration - expected) < 1e-6) {
      markCritical(dependency, criticalSet, taskMap);
    }
  }
}

function renderTasks(sortedTasks, projectStart, projectFinish) {
  renderTable(sortedTasks);
  renderSummary(projectStart, projectFinish);
  renderGantt(sortedTasks, projectStart, projectFinish);
}

function renderTable(sortedTasks) {
  const tbody = elements.taskTableBody;
  tbody.innerHTML = '';
  const template = elements.taskRowTemplate.content.firstElementChild;
  const labelMap = new Map(sortedTasks.map((task) => [task.id, task.name]));

  for (const task of sortedTasks) {
    const row = template.cloneNode(true);
    row.querySelector('[data-cell="id"]').textContent = task.id;
    row.querySelector('[data-cell="name"]').textContent = task.name;
    row.querySelector('[data-cell="duration"]').textContent = `${task.duration} days`;
    row.querySelector('[data-cell="start"]').textContent = formatDate(task.earliestStart);
    row.querySelector('[data-cell="finish"]').textContent = formatDate(task.earliestFinish);
    const slackDays = Math.round(task.slack * 10) / 10;
    row.querySelector('[data-cell="dependencies"]').textContent = task.dependencies.length
      ? task.dependencies
          .map((id) => `${id} · ${labelMap.get(id) ?? 'Unknown'}`)
          .join(', ')
      : '—';
    row.querySelector('[data-cell="slack"]').textContent = `${slackDays === 0 ? '0.0' : slackDays.toFixed(1)} days`;
    if (task.isCritical) {
      row.classList.add('critical-row');
    }
    tbody.appendChild(row);
  }
}

function renderSummary(projectStart, projectFinish) {
  const workingHours = Number(elements.workingHours.value) || 8;
  const totalDays = (projectFinish.getTime() - projectStart.getTime()) / DAY_IN_MS;
  const totalHours = totalDays * workingHours;
  elements.projectSummary.textContent = `Timeline: ${formatDate(projectStart)} → ${formatDate(
    projectFinish
  )} • Duration: ${totalDays.toFixed(1)} days (${totalHours.toFixed(1)} hours)`;
}

function renderGantt(sortedTasks, projectStart, projectFinish) {
  const container = elements.gantt;
  container.innerHTML = '';

  const minStart = Math.min(...sortedTasks.map((task) => task.earliestStart.getTime()));
  const maxFinish = Math.max(...sortedTasks.map((task) => task.earliestFinish.getTime()));

  const timeline = document.createElement('div');
  timeline.className = 'gantt-timeline';
  const totalDays = (maxFinish - minStart) / DAY_IN_MS;
  const containerWidth = container.clientWidth || container.offsetWidth || 640;
  const timelineWidth = Math.max(totalDays * DAY_WIDTH + 200, containerWidth);
  timeline.style.minWidth = `${timelineWidth}px`;

  for (const task of sortedTasks) {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const label = document.createElement('div');
    label.className = 'gantt-label';
    label.textContent = `${task.id}. ${task.name}`;
    row.appendChild(label);

    const barWrapper = document.createElement('div');
    barWrapper.className = 'gantt-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'gantt-bar';
    if (task.isCritical) {
      bar.classList.add('critical');
    }

    const offsetDays = (task.earliestStart.getTime() - minStart) / DAY_IN_MS;
    bar.style.left = `${offsetDays * DAY_WIDTH}px`;
    bar.style.width = `${Math.max(task.duration * DAY_WIDTH, 6)}px`;
    bar.textContent = `${formatDate(task.earliestStart)} → ${formatDate(task.earliestFinish)}`;

    barWrapper.appendChild(bar);
    row.appendChild(barWrapper);
    timeline.appendChild(row);
  }

  container.appendChild(timeline);
}

function handleTaskFormSubmit(event) {
  event.preventDefault();
  const name = elements.taskName.value.trim();
  if (!name) {
    return;
  }

  const durationInput = parseFloat(elements.taskDuration.value);
  const duration = Number.isFinite(durationInput) && durationInput > 0
    ? durationInput
    : Number(elements.defaultDuration.value) || 1;

  const manualStart = toDate(elements.taskStart.value);
  if (manualStart) {
    manualStart.setHours(0, 0, 0, 0);
  }

  const dependencies = Array.from(elements.taskDependencies.selectedOptions).map((option) =>
    Number(option.value)
  );

  const newTask = {
    id: state.nextId++,
    name,
    duration,
    dependencies,
    manualStart,
    earliestStart: null,
    earliestFinish: null,
    latestStart: null,
    latestFinish: null,
    slack: 0,
    longestPathDuration: 0,
    isCritical: false,
  };

  state.tasks.push(newTask);

  try {
    topologicalSort(state.tasks);
  } catch (error) {
    state.tasks.pop();
    state.nextId--;
    alert(error.message);
    return;
  }

  resetTaskForm();
  updateDependencyOptions();
  computeSchedule();
}

function handleSeedDemo() {
  state.tasks = [];
  state.nextId = 1;
  const projectStart = new Date();
  projectStart.setHours(0, 0, 0, 0);
  elements.projectStart.value = formatDate(projectStart);

  const demoTasks = [
    {
      name: 'Kick-off workshop',
      duration: 1,
      start: projectStart,
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

  for (const demo of demoTasks) {
    const manualStart = demo.start ? new Date(demo.start.getTime()) : null;
    state.tasks.push({
      id: state.nextId++,
      name: demo.name,
      duration: demo.duration,
      dependencies: demo.dependencies.slice(),
      manualStart,
      earliestStart: null,
      earliestFinish: null,
      latestStart: null,
      latestFinish: null,
      slack: 0,
      longestPathDuration: 0,
      isCritical: false,
    });
  }

  updateDependencyOptions();
  computeSchedule();
}

function handleReset() {
  if (!state.tasks.length) {
    return;
  }
  if (!confirm('Remove all tasks and reset the project?')) {
    return;
  }
  state.tasks = [];
  state.nextId = 1;
  elements.projectStart.value = '';
  updateDependencyOptions();
  computeSchedule();
}

function handleSettingChange() {
  computeSchedule();
}

function init() {
  elements.taskForm.addEventListener('submit', handleTaskFormSubmit);
  elements.seedDemo.addEventListener('click', handleSeedDemo);
  elements.resetProject.addEventListener('click', handleReset);
  elements.projectStart.addEventListener('change', handleSettingChange);
  elements.workingHours.addEventListener('change', handleSettingChange);
  elements.defaultDuration.addEventListener('change', handleSettingChange);

  computeSchedule();
}

init();
