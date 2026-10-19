import { useEffect, useRef, useState } from 'react';
import { Check, FolderKanban, LoaderCircle, UserRound, UsersRound, UserRoundPlus, X } from 'lucide-react';
export const STATUS = { todo: 'To do', in_progress: 'In progress', done: 'Completed' };
export const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' };
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export const initials = name => (name || '?').trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
export const dateLabel = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')) : 'No due date';
export const cx = (...parts) => parts.filter(Boolean).join(' ');
export function Logo({ dark = false }) {
  return <div className={cx('brand', dark && 'brand-dark')}><span className="brand-symbol"><FolderKanban size={22} strokeWidth={1.7} /></span><span>teamspace<span className="brand-dot">.</span></span></div>;
}
export function Avatar({ user, small = false }) { return <span title={user?.name || 'Unassigned'} className={cx('avatar', small && 'avatar-small')}>{user ? initials(user.name) : <UserRound size={14} />}</span>; }
export function Spinner() { return <div className="loading"><LoaderCircle className="spin" size={25} /><p>Loading your workspace…</p></div>; }
export function Alert({ message }) { return message ? <div role="alert" className="form-alert">{message}</div> : null; }
export function Field({ label, error, children }) { return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error.join(' ')}</small>}</label>; }
export function Empty({ title, detail, action }) { return <div className="empty"><span className="empty-icon"><FolderKanban size={28} strokeWidth={1.5} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>; }

export function Dialog({ title, description, children, onClose, wide = false }) {
  const ref = useRef(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    const key = event => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const items = [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={cx('dialog', wide && 'dialog-wide')}><header><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}

export function TaskDialog({ task, initialTeam, teams, members, onSave, onClose }) {
  const [teamId, setTeamId] = useState(task?.teamId || initialTeam || teams[0]?.id || '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState({});
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    const form = new FormData(event.currentTarget);
    const body = { title: form.get('title'), description: form.get('description'), assigneeId: assigneeId || null, status: form.get('status'), priority: form.get('priority'), dueDate: form.get('dueDate') || null, ...(!task ? { teamId } : {}) };
    try { await onSave(task ? '/tasks/' + task.id : '/tasks', { method: task ? 'PATCH' : 'POST', body }, task ? 'Task updated.' : 'Task created.'); onClose(); }
    catch (error) { setError(error.message); setFields(error.fields || {}); } finally { setBusy(false); }
  }
  return <Dialog title={task ? 'Edit task' : 'Create a task'} description="A clear next step makes all the difference." onClose={() => !busy && onClose()} wide><form onSubmit={submit}><Alert message={error} /><Field label="Task title" error={fields.title}><input name="title" defaultValue={task?.title || ''} placeholder="What needs to get done?" maxLength={160} required /></Field><Field label="Description" error={fields.description}><textarea name="description" defaultValue={task?.description || ''} placeholder="Add context, details, or a helpful starting point…" rows={3} maxLength={3000} /></Field><div className="form-grid"><Field label="Team"><select value={teamId} disabled={!!task} onChange={event => { setTeamId(event.target.value); setAssigneeId(''); }} required>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field><Field label="Assign to" error={fields.assigneeId}><select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{(members[teamId] || []).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={task?.status || 'todo'}>{Object.entries(STATUS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field><Field label="Priority"><select name="priority" defaultValue={task?.priority || 'medium'}>{Object.entries(PRIORITY).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field></div><Field label="Due date (optional)" error={fields.dueDate}><input name="dueDate" type="date" defaultValue={task?.dueDate || ''} /></Field><div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !teamId}>{busy && <LoaderCircle size={16} className="spin" />}{task ? 'Save changes' : 'Create task'}</button></div></form></Dialog>;
}

export function TeamDialog({ team, onSave, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await onSave(team ? '/teams/' + team.id : '/teams', { method: team ? 'PATCH' : 'POST', body: { name: data.get('name'), description: data.get('description') } }, team ? 'Team updated.' : 'Your team is ready.'); onClose(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <Dialog title={team ? 'Edit team' : 'Start a new team'} description="Bring the right people together." onClose={() => !busy && onClose()}><form onSubmit={submit}><Alert message={error} /><Field label="Team name"><input name="name" placeholder="e.g. Product & Design" defaultValue={team?.name || ''} minLength={2} maxLength={80} required /></Field><Field label="Description (optional)"><textarea name="description" placeholder="What will your team work on?" defaultValue={team?.description || ''} maxLength={500} rows={3} /></Field><div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{team ? 'Save team' : 'Create team'}</button></div></form></Dialog>;
}

export function MembersDialog({ team, people, user, onSave, onClose }) {
  const owner = team.creatorId === user.id;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [mode, setMode] = useState('add');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const email = new FormData(event.currentTarget).get('email');
    try { const result = await onSave('/teams/' + team.id + (mode === 'add' ? '/members' : '/invitations'), { method: 'POST', body: { email } }, mode === 'add' ? 'Member added.' : 'Invitation saved.'); setMessage(result?.invitation?.message || 'Member added to your team.'); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function remove(memberId) {
    setBusy(true); setError('');
    try { await onSave('/teams/' + team.id + '/members/' + memberId, { method: 'DELETE' }, 'Member removed.'); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <Dialog title={team.name} description={people.length + ' team members'} onClose={() => !busy && onClose()}><Alert message={error} /><div className="member-list">{people.map(member => <div className="member" key={member.id}><Avatar user={member} /><div><strong>{member.name}{member.id === user.id ? ' (you)' : ''}</strong><span>{member.email}</span></div>{member.id === team.creatorId ? <span className="role-label">Creator</span> : owner && <button className="icon-button danger-text" type="button" disabled={busy} aria-label={'Remove ' + member.name} onClick={() => remove(member.id)}><X size={16} /></button>}</div>)}</div>{owner && <form className="member-form" onSubmit={submit}><h3>Grow your team</h3><div className="segmented"><button type="button" className={mode === 'add' ? 'selected' : ''} onClick={() => setMode('add')}>Add registered member</button><button type="button" className={mode === 'invite' ? 'selected' : ''} onClick={() => setMode('invite')}>Invite by email</button></div><Field label="Email address"><input name="email" type="email" placeholder="teammate@company.com" required maxLength={254} /></Field><p className="helper">{mode === 'add' ? 'Add someone who already has a Teamspace account.' : 'No email is sent. They can sign in with this address to accept the invitation.'}</p>{message && <div className="form-success" role="status">{message}</div>}<button className="button primary full" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <UserRoundPlus size={17} />}{mode === 'add' ? 'Add member' : 'Create invitation'}</button></form>}</Dialog>;
}

export function ConfirmDialog({ item, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title={'Delete ' + item.type + '?'} description={item.type === 'team' ? 'The team and its tasks will no longer be accessible to any member.' : 'This task will be permanently removed.'} onClose={() => !busy && onClose()}><p className="confirm-name">{item.name}</p><Alert message={error} /><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Keep {item.type}</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>{busy && <LoaderCircle className="spin" size={16} />}Delete {item.type}</button></div></Dialog>;
}
