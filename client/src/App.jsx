import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Flag,
  FolderKanban,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { request, resetCsrf } from './api';
import Auth from './Auth';
import {
  STATUS,
  PRIORITY,
  todayUTC,
  initials,
  dateLabel,
  cx,
  Logo,
  Avatar,
  Spinner,
  Empty,
  TaskDialog,
  TeamDialog,
  MembersDialog,
  ConfirmDialog,
} from './components';

function TeamCards({ data, user, navigate, setModal }) {
  return (
    <section className="teams-grid">
      {data.teams.length ? (
        data.teams.map((team, index) => (
          <article className="team-card" key={team.id}>
            <div className="team-card-heading">
              <span className={'large-team-square color-' + (index % 4)}>
                {initials(team.name)}
              </span>
              <span className="role-label">
                {team.creatorId === user.id ? 'Creator' : 'Member'}
              </span>
            </div>
            <h2>
              <button onClick={() => navigate('overview', team.id)}>{team.name}</button>
            </h2>
            <p>{team.description || 'A shared space for your team’s next big thing.'}</p>
            <div className="team-card-meta">
              <span>
                <UsersRound size={15} />
                {team.memberIds.length} members
              </span>
              <span>
                <CheckCheck size={15} />
                {data.tasks.filter((task) => task.teamId === team.id).length} tasks
              </span>
            </div>
            <div className="team-card-actions">
              <button
                className="button secondary small"
                onClick={() => setModal({ type: 'members', team })}
              >
                <UsersRound size={15} />
                Members
              </button>
              <div>
                {team.creatorId === user.id && (
                  <>
                    <button
                      className="icon-button"
                      aria-label={'Edit ' + team.name}
                      onClick={() => setModal({ type: 'team', team })}
                    >
                      <Settings2 size={17} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={'Delete ' + team.name}
                      onClick={() =>
                        setModal({
                          type: 'confirm',
                          typeName: 'team',
                          id: team.id,
                          name: team.name,
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))
      ) : (
        <Empty
          title="Great teams start with a hello."
          detail="Create your first team, invite your people, and start making progress."
          action={
            <button className="button primary" onClick={() => setModal({ type: 'team' })}>
              <Plus size={17} />
              Create a team
            </button>
          }
        />
      )}
    </section>
  );
}
function Stats({ tasks }) {
  const completed = tasks.filter((task) => task.status === 'done').length;
  const stats = [
    ['Total tasks', tasks.length, FolderKanban, 'neutral', 'Every step, in one place'],
    [
      'In progress',
      tasks.filter((task) => task.status === 'in_progress').length,
      Clock3,
      'amber',
      'Moving things forward',
    ],
    [
      'Completed',
      completed,
      CheckCheck,
      'green',
      tasks.length
        ? Math.round((completed / tasks.length) * 100) + '% of all tasks'
        : 'Your next win is waiting',
    ],
    [
      'Overdue',
      tasks.filter((task) => task.status !== 'done' && task.dueDate && task.dueDate < todayUTC())
        .length,
      Flag,
      'rose',
      'A little attention goes a long way',
    ],
  ];
  return (
    <section className="stats-grid" aria-label="Task overview">
      {stats.map(([name, count, Icon, color, caption]) => (
        <article className="stat-card" key={name}>
          <div>
            <span>{name}</span>
            <span className={'stat-icon ' + color}>
              <Icon size={17} />
            </span>
          </div>
          <strong>{count.toString().padStart(2, '0')}</strong>
          <p>{caption}</p>
        </article>
      ))}
    </section>
  );
}
function Workspace({ user, onLogout }) {
  const [data, setData] = useState({
    teams: [],
    tasks: [],
    invitations: [],
    reminders: [],
    members: {},
  });
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const [view, setView] = useState('overview'),
    [teamId, setTeamId] = useState(''),
    [tab, setTab] = useState('all');
  const [search, setSearch] = useState(''),
    [assignee, setAssignee] = useState(''),
    [priority, setPriority] = useState('');
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [menuOpen, setMenuOpen] = useState(false),
    [showReminders, setShowReminders] = useState(false);
  const [busyId, setBusyId] = useState(''),
    [refreshing, setRefreshing] = useState(false),
    [sortDue, setSortDue] = useState(false);
  const [dismissedSetup, setDismissedSetup] = useState(false);
  async function refresh() {
    setLoadError('');
    try {
      const [teamsResult, tasksResult, invitationsResult, remindersResult] = await Promise.all([
        request('/teams'),
        request('/tasks'),
        request('/invitations'),
        request('/reminders'),
      ]);
      const members = Object.fromEntries(
        await Promise.all(
          teamsResult.teams.map(async (team) => [
            team.id,
            (await request('/teams/' + team.id + '/members')).members,
          ]),
        ),
      );
      setData({
        teams: teamsResult.teams,
        tasks: tasksResult.tasks,
        invitations: invitationsResult.invitations,
        reminders: remindersResult.tasks,
        members,
      });
      setTeamId((current) =>
        current && !teamsResult.teams.some((team) => team.id === current) ? '' : current,
      );
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function save(path, options, message) {
    const result = await request(path, options);
    await refresh();
    if (message) setToast(message);
    return result;
  }
  async function cycleTask(task) {
    setBusyId(task.id);
    try {
      await save(
        '/tasks/' + task.id,
        { method: 'PATCH', body: { status: task.status === 'done' ? 'todo' : 'done' } },
        task.status === 'done' ? 'Task reopened.' : 'Nice work. Task completed!',
      );
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusyId('');
    }
  }
  async function respond(invite, accept) {
    setBusyId(invite.id);
    try {
      await save(
        '/invitations/' + invite.id + (accept ? '/accept' : '/decline'),
        { method: 'POST' },
        accept ? 'Welcome to the team!' : 'Invitation declined.',
      );
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusyId('');
    }
  }
  const selectedTeam = data.teams.find((team) => team.id === teamId);
  const scopedTasks = useMemo(
    () =>
      data.tasks.filter(
        (task) =>
          (!teamId || task.teamId === teamId) && (view !== 'mine' || task.assigneeId === user.id),
      ),
    [data.tasks, teamId, view, user.id],
  );
  const filteredTasks = useMemo(() => {
    const result = scopedTasks.filter(
      (task) =>
        (tab === 'all' || task.status === tab) &&
        (!assignee || task.assigneeId === assignee) &&
        (!priority || task.priority === priority) &&
        (!search ||
          (task.title + ' ' + task.description).toLowerCase().includes(search.toLowerCase())),
    );
    return sortDue
      ? [...result].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
      : result;
  }, [scopedTasks, tab, assignee, priority, search, sortDue]);
  const allPeople = [
    ...new Map(
      Object.values(data.members)
        .flat()
        .map((member) => [member.id, member]),
    ).values(),
  ];
  const filterPeople = teamId ? data.members[teamId] || [] : allPeople;
  const personById = Object.fromEntries(allPeople.map((person) => [person.id, person]));
  const heading =
    view === 'teams'
      ? 'Your teams'
      : selectedTeam
        ? selectedTeam.name
        : view === 'mine'
          ? 'My tasks'
          : 'Workspace overview';
  const clearFilters = () => {
    setSearch('');
    setAssignee('');
    setPriority('');
    setTab('all');
  };
  function navigate(next, id = '') {
    setView(next);
    setTeamId(id);
    clearFilters();
    setMenuOpen(false);
  }
  const membersTeam =
    modal?.type === 'members' && data.teams.find((team) => team.id === modal.team.id);
  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={cx('sidebar', menuOpen && 'is-open')}>
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-badge">
          <span className="workspace-icon">W</span>
          <div>
            <strong>My workspace</strong>
            <span>Team task manager</span>
          </div>
          <ShieldCheck size={16} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          <button
            className={cx('nav-item', view === 'overview' && !teamId && 'active')}
            onClick={() => navigate('overview')}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button
            className={cx('nav-item', view === 'mine' && 'active')}
            onClick={() => navigate('mine')}
          >
            <CheckCheck size={18} />
            My tasks
            <span className="nav-count">
              {
                data.tasks.filter((task) => task.assigneeId === user.id && task.status !== 'done')
                  .length
              }
            </span>
          </button>
          <button
            className={cx('nav-item', view === 'teams' && 'active')}
            onClick={() => navigate('teams')}
          >
            <UsersRound size={18} />
            Teams<span className="nav-count">{data.teams.length}</span>
          </button>
        </nav>
        <div className="nav-label teams-label">
          <span>YOUR TEAMS</span>
          <button aria-label="Create team" onClick={() => setModal({ type: 'team' })}>
            <Plus size={16} />
          </button>
        </div>
        <nav aria-label="Your teams" className="team-nav">
          {data.teams.map((team, index) => (
            <button
              key={team.id}
              className={cx('nav-item', teamId === team.id && 'active')}
              onClick={() => navigate('overview', team.id)}
            >
              <span className={'team-square color-' + (index % 4)}>
                {team.name[0].toUpperCase()}
              </span>
              <span className="truncate">{team.name}</span>
            </button>
          ))}
          {!data.teams.length && (
            <p className="nav-empty">
              Your next great team
              <br />
              starts right here.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>Better, together.</strong>
            <p>
              Small steps. Shared goals.
              <br />
              Make a little progress today.
            </p>
          </div>
          <div className="user-card">
            <Avatar user={user} />
            <div>
              <strong>{user.name}</strong>
              <span title={user.email}>{user.email}</span>
            </div>
            <button aria-label="Sign out" title="Sign out" onClick={onLogout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{heading}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today-label">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                new Date(),
              )}
            </span>
            <button
              className={cx('notification-button', showReminders && 'selected')}
              aria-label={'Due date reminders, ' + data.reminders.length}
              onClick={() => setShowReminders(!showReminders)}
            >
              <Bell size={19} />
              {data.reminders.length > 0 && <span />}
            </button>
            <Avatar user={user} small />
          </div>
        </header>
        <main className="workspace-main">
          <section className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE PROGRESS, EVERY DAY</span>
              <h1>
                {heading}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === 'teams'
                  ? 'Good people. Shared goals. A place to make things happen.'
                  : selectedTeam
                    ? selectedTeam.description || 'Your team’s priorities, all in one place.'
                    : 'Good to see you, ' +
                      user.name.split(' ')[0] +
                      '. Let’s move things forward.'}
              </p>
            </div>
            <div className="heading-actions">
              <button className="button secondary" onClick={() => setModal({ type: 'team' })}>
                <UsersRound size={17} />
                New team
              </button>
              <button
                className="button primary"
                onClick={() => setModal({ type: data.teams.length ? 'task' : 'team' })}
              >
                <Plus size={18} />
                {data.teams.length ? 'Create task' : 'Create your first team'}
              </button>
            </div>
          </section>
          {showReminders && (
            <section className="reminders-panel">
              <div className="panel-title">
                <h2>
                  <Bell size={17} />
                  Your due date reminders
                </h2>
                <button
                  className="icon-button"
                  aria-label="Close reminders"
                  onClick={() => setShowReminders(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <p>Assigned to you and overdue or due within the next 3 days. Dates use UTC.</p>
              {data.reminders.length ? (
                data.reminders.map((task) => (
                  <button
                    className="reminder-row"
                    key={task.id}
                    onClick={() => setModal({ type: 'task', task })}
                  >
                    <span>{task.title}</span>
                    <strong className={task.dueDate < todayUTC() ? 'danger-text' : ''}>
                      {dateLabel(task.dueDate)}
                      {task.dueDate < todayUTC() ? ' · Overdue' : ''}
                    </strong>
                  </button>
                ))
              ) : (
                <p>No upcoming deadlines. You’re all caught up.</p>
              )}
            </section>
          )}
          {data.invitations.length > 0 && (
            <section className="invitations-panel">
              <h2>
                <UserRoundPlus size={18} />
                You have a team invitation
              </h2>
              {data.invitations.map((invite) => (
                <div className="invitation-row" key={invite.id}>
                  <span>
                    Join <strong>{invite.teamName}</strong>
                  </span>
                  <div>
                    <button
                      className="button secondary small"
                      disabled={!!busyId}
                      onClick={() => respond(invite, false)}
                    >
                      Decline
                    </button>
                    <button
                      className="button primary small"
                      disabled={!!busyId}
                      onClick={() => respond(invite, true)}
                    >
                      Accept invitation
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {loadError && (
            <div className="load-error" role="alert">
              <span>{loadError}</span>
              <button className="button secondary small" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {loading ? (
            <Spinner />
          ) : view === 'teams' ? (
            <TeamCards data={data} user={user} navigate={navigate} setModal={setModal} />
          ) : (
            <>
              <Stats tasks={scopedTasks} />
              {!dismissedSetup && data.teams.length === 0 && !loadError && (
                <section className="welcome-banner">
                  <div className="welcome-illustration">
                    <UsersRound size={32} strokeWidth={1.4} />
                  </div>
                  <div>
                    <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
                    <h2>Good things start with a team.</h2>
                    <p>
                      Create your first team, bring your people in, and turn plans into progress.
                    </p>
                    <button onClick={() => setModal({ type: 'team' })}>
                      Let’s get started
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Dismiss welcome"
                    onClick={() => setDismissedSetup(true)}
                  >
                    <X size={17} />
                  </button>
                </section>
              )}
              <section className="task-section">
                <div className="task-section-heading">
                  <div>
                    <h2>
                      {selectedTeam
                        ? 'Team tasks'
                        : view === 'mine'
                          ? 'Your assigned tasks'
                          : 'All tasks'}
                      <span className="count-badge">{scopedTasks.length}</span>
                    </h2>
                    <p>A clear view of what’s next.</p>
                  </div>
                  {selectedTeam && (
                    <button
                      className="button secondary small"
                      onClick={() => setModal({ type: 'members', team: selectedTeam })}
                    >
                      <UsersRound size={16} />
                      Manage members
                    </button>
                  )}
                </div>
                <div className="task-tabs" role="tablist" aria-label="Task status">
                  {[['all', 'All tasks'], ...Object.entries(STATUS)].map(([value, label]) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={tab === value}
                      className={tab === value ? 'active' : ''}
                      onClick={() => setTab(value)}
                    >
                      {value !== 'all' && <span className={'status-dot ' + value} />}
                      {label}
                      <span>
                        {value === 'all'
                          ? scopedTasks.length
                          : scopedTasks.filter((task) => task.status === value).length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="filter-bar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search tasks"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search tasks…"
                    />
                    {search && (
                      <button aria-label="Clear search" onClick={() => setSearch('')}>
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="filter-controls">
                    <label className="select-filter">
                      <UsersRound size={15} />
                      <select
                        aria-label="Filter by team"
                        value={teamId}
                        onChange={(event) => {
                          setTeamId(event.target.value);
                          setAssignee('');
                        }}
                      >
                        <option value="">All teams</option>
                        {data.teams.map((team) => (
                          <option value={team.id} key={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="select-filter">
                      <UserRound size={15} />
                      <select
                        aria-label="Filter by assignee"
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                      >
                        <option value="">All assignees</option>
                        {filterPeople.map((person) => (
                          <option value={person.id} key={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="select-filter">
                      <SlidersHorizontal size={15} />
                      <select
                        aria-label="Filter by priority"
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                      >
                        <option value="">Priority</option>
                        {Object.entries(PRIORITY).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                {filteredTasks.length ? (
                  <div className="task-table-wrap">
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th>Task name</th>
                          <th>Team</th>
                          <th>Assignee</th>
                          <th>Status</th>
                          <th>Priority</th>
                          <th>
                            <button
                              className={sortDue ? 'sort-active' : ''}
                              onClick={() => setSortDue(!sortDue)}
                            >
                              Due date{sortDue ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            </button>
                          </th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => {
                          const team = data.teams.find((item) => item.id === task.teamId),
                            person = personById[task.assigneeId];
                          return (
                            <tr
                              key={task.id}
                              className={task.status === 'done' ? 'task-completed' : ''}
                            >
                              <td>
                                <div className="task-title-cell">
                                  <button
                                    disabled={busyId === task.id}
                                    className={cx(
                                      'task-check',
                                      task.status === 'done' && 'checked',
                                    )}
                                    aria-label={
                                      (task.status === 'done' ? 'Reopen ' : 'Complete ') +
                                      task.title
                                    }
                                    onClick={() => cycleTask(task)}
                                  >
                                    {busyId === task.id ? (
                                      <LoaderCircle className="spin" size={12} />
                                    ) : task.status === 'done' ? (
                                      <Check size={12} />
                                    ) : null}
                                  </button>
                                  <button
                                    className="task-title"
                                    title={task.description || task.title}
                                    onClick={() => setModal({ type: 'task', task })}
                                  >
                                    {task.title}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <span className="table-team">
                                  <span className="team-dot" />
                                  {team?.name || 'Team'}
                                </span>
                              </td>
                              <td>
                                <span className="table-assignee">
                                  <Avatar user={person} small />
                                  <span>{person ? person.name.split(' ')[0] : 'Unassigned'}</span>
                                </span>
                              </td>
                              <td>
                                <span className={'status-badge ' + task.status}>
                                  <span className={'status-dot ' + task.status} />
                                  {STATUS[task.status]}
                                </span>
                              </td>
                              <td>
                                <span className={'priority-label ' + task.priority}>
                                  {task.priority === 'high' ? (
                                    <ArrowUp size={13} />
                                  ) : task.priority === 'low' ? (
                                    <ArrowDown size={13} />
                                  ) : (
                                    <span className="priority-medium">=</span>
                                  )}
                                  {PRIORITY[task.priority]}
                                </span>
                              </td>
                              <td
                                className={
                                  task.status !== 'done' &&
                                  task.dueDate &&
                                  task.dueDate < todayUTC()
                                    ? 'overdue-date'
                                    : 'due-date'
                                }
                              >
                                {dateLabel(task.dueDate)}
                              </td>
                              <td>
                                <button
                                  className="icon-button row-delete"
                                  aria-label={'Delete task ' + task.title}
                                  onClick={() =>
                                    setModal({
                                      type: 'confirm',
                                      typeName: 'task',
                                      id: task.id,
                                      name: task.title,
                                    })
                                  }
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title={
                      scopedTasks.length
                        ? 'No tasks match this view.'
                        : view === 'mine'
                          ? 'A little breathing room.'
                          : 'A fresh start for your next great idea.'
                    }
                    detail={
                      scopedTasks.length
                        ? 'Try a different search or clear your filters.'
                        : view === 'mine'
                          ? 'Tasks assigned to you will appear here.'
                          : 'Create a task and give your team a clear next step.'
                    }
                    action={
                      scopedTasks.length ? (
                        <button className="button secondary small" onClick={clearFilters}>
                          Clear filters
                        </button>
                      ) : (
                        <button
                          className="button secondary small"
                          onClick={() => setModal({ type: data.teams.length ? 'task' : 'team' })}
                        >
                          <Plus size={16} />
                          {data.teams.length ? 'Create a task' : 'Create a team'}
                        </button>
                      )
                    }
                  />
                )}
                <div className="table-footer">
                  <span>
                    Showing {filteredTasks.length} of {scopedTasks.length} tasks
                  </span>
                  <span>
                    <ShieldCheck size={13} />
                    Shared with your team
                  </span>
                </div>
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span>Made for a little more clarity.</span>
            <span className="footer-wordmark">teamspace.</span>
            <button
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
            >
              {refreshing ? 'Refreshing…' : 'Refresh workspace'}
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      )}
      {modal?.type === 'task' && (
        <TaskDialog
          task={modal.task}
          initialTeam={teamId}
          teams={data.teams}
          members={data.members}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'team' && (
        <TeamDialog team={modal.team} onSave={save} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'members' && membersTeam && (
        <MembersDialog
          team={membersTeam}
          people={data.members[membersTeam.id] || []}
          user={user}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'confirm' && (
        <ConfirmDialog
          item={{ type: modal.typeName, name: modal.name }}
          onClose={() => setModal(null)}
          onConfirm={() =>
            save(
              (modal.typeName === 'team' ? '/teams/' : '/tasks/') + modal.id,
              { method: 'DELETE' },
              modal.typeName === 'team' ? 'Team deleted.' : 'Task deleted.',
            )
          }
        />
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null),
    [booting, setBooting] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const expire = () => {
      setUser(null);
      resetCsrf();
    };
    window.addEventListener('session-expired', expire);
    (async () => {
      try {
        await request('/auth/csrf');
        setUser((await request('/auth/me')).user);
      } catch (error) {
        if (error.status !== 401) setError(error.message);
      } finally {
        setBooting(false);
      }
    })();
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      setUser(null);
      resetCsrf();
    } catch (error) {
      setError(error.message);
    }
  }
  if (booting)
    return (
      <div className="boot-screen">
        <Logo dark />
        <Spinner />
      </div>
    );
  return (
    <>
      {error && (
        <div className="global-alert" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {user ? (
        <Workspace key={user.id} user={user} onLogout={logout} />
      ) : (
        <Auth onLogin={setUser} />
      )}
    </>
  );
}
