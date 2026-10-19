import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { assert } from './errors.js';

const now = () => new Date().toISOString();
const emailKey = email => createHash('sha256').update(email).digest('hex');
export const publicUser = user => ({ id: user.id, name: user.name, email: user.email });

export class WorkspaceService {
  constructor(store) { this.store = store; }
  async user(id) { return this.store.get('users', id); }
  async userByEmail(email) {
    const key = await this.store.get('emails', emailKey(email));
    return key ? this.user(key.userId) : null;
  }
  async register(input) {
    const user = { id: randomUUID(), name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), createdAt: now() };
    await this.store.transaction(async tx => {
      assert(!await tx.get('emails', emailKey(input.email)), 409, 'An account with this email already exists.');
      tx.set('users', user.id, user);
      tx.set('emails', emailKey(input.email), { userId: user.id });
    });
    return user;
  }
  async teams(userId) {
    const teams = await this.store.query('teams', 'memberIds', 'array-contains', userId);
    return teams.filter(team => !team.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async team(tx, teamId, userId, owner = false) {
    const team = await tx.get('teams', teamId);
    assert(team && !team.deletedAt && team.memberIds.includes(userId), 404, 'Team not found.');
    assert(!owner || team.creatorId === userId, 403, 'Only the team creator can manage this team.');
    return team;
  }
  async createTeam(userId, input) {
    const team = { id: randomUUID(), ...input, creatorId: userId, memberIds: [userId], createdAt: now(), updatedAt: now(), deletedAt: null };
    await this.store.transaction(async tx => tx.set('teams', team.id, team));
    return team;
  }
  async updateTeam(userId, teamId, input) {
    return this.store.transaction(async tx => {
      const team = await this.team(tx, teamId, userId, true);
      const updated = { ...team, ...input, updatedAt: now() };
      tx.set('teams', teamId, updated); return updated;
    });
  }
  async deleteTeam(userId, teamId) {
    await this.store.transaction(async tx => {
      const team = await this.team(tx, teamId, userId, true);
      // Tombstone is atomic: concurrent writes also read this team in a transaction.
      // Retained task records become inaccessible to all members.
      tx.set('teams', teamId, { ...team, deletedAt: now(), updatedAt: now() });
    });
  }
  async members(userId, teamId) {
    const team = await this.team(this.store, teamId, userId);
    return (await Promise.all(team.memberIds.map(id => this.user(id)))).filter(Boolean).map(publicUser);
  }
  async addMember(userId, teamId, email) {
    return this.store.transaction(async tx => {
      const team = await this.team(tx, teamId, userId, true);
      const key = await tx.get('emails', emailKey(email));
      assert(key, 404, 'This person has not registered. Send an invitation instead.');
      assert(!team.memberIds.includes(key.userId), 409, 'This person is already a member.');
      assert(team.memberIds.length < 50, 409, 'A team can have up to 50 members.');
      tx.set('teams', teamId, { ...team, memberIds: [...team.memberIds, key.userId], updatedAt: now() });
    });
  }
  async removeMember(userId, teamId, memberId) {
    await this.store.transaction(async tx => {
      const team = await this.team(tx, teamId, userId, true);
      assert(memberId !== team.creatorId, 400, 'The team creator cannot be removed.');
      assert(team.memberIds.includes(memberId), 404, 'Member not found.');
      const tasks = await tx.query('tasks', 'teamId', '==', teamId);
      assert(!tasks.some(task => task.assigneeId === memberId), 409, 'Reassign this member’s tasks before removing them.');
      tx.set('teams', teamId, { ...team, memberIds: team.memberIds.filter(id => id !== memberId), updatedAt: now() });
    });
  }
  async tasks(userId, filters = {}) {
    const teams = await this.teams(userId);
    if (filters.teamId) assert(teams.some(team => team.id === filters.teamId), 404, 'Team not found.');
    const selected = filters.teamId ? teams.filter(team => team.id === filters.teamId) : teams;
    const tasks = (await Promise.all(selected.map(team => this.store.query('tasks', 'teamId', '==', team.id)))).flat();
    const search = filters.search?.toLowerCase();
    return tasks.filter(task => (!filters.assigneeId || task.assigneeId === filters.assigneeId)
      && (!filters.status || task.status === filters.status)
      && (!search || (task.title + ' ' + task.description).toLowerCase().includes(search)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async task(userId, taskId) {
    const task = await this.store.get('tasks', taskId);
    assert(task, 404, 'Task not found.');
    await this.team(this.store, task.teamId, userId);
    return task;
  }
  async createTask(userId, input) {
    return this.store.transaction(async tx => {
      const team = await this.team(tx, input.teamId, userId);
      assert(!input.assigneeId || team.memberIds.includes(input.assigneeId), 400, 'Assign the task to a member of this team.');
      const task = { ...input, id: randomUUID(), creatorId: userId, createdAt: now(), updatedAt: now() };
      tx.set('tasks', task.id, task); return task;
    });
  }
  async updateTask(userId, taskId, input) {
    return this.store.transaction(async tx => {
      const task = await tx.get('tasks', taskId);
      assert(task, 404, 'Task not found.');
      const team = await this.team(tx, task.teamId, userId);
      const assigneeId = Object.hasOwn(input, 'assigneeId') ? input.assigneeId : task.assigneeId;
      assert(!assigneeId || team.memberIds.includes(assigneeId), 400, 'Assign the task to a member of this team.');
      const updated = { ...task, ...input, updatedAt: now() };
      tx.set('tasks', taskId, updated); return updated;
    });
  }
  async deleteTask(userId, taskId) {
    await this.store.transaction(async tx => {
      const task = await tx.get('tasks', taskId);
      assert(task, 404, 'Task not found.');
      await this.team(tx, task.teamId, userId);
      tx.delete('tasks', taskId);
    });
  }
  async invite(userId, teamId, email) {
    return this.store.transaction(async tx => {
      const team = await this.team(tx, teamId, userId, true);
      const key = await tx.get('emails', emailKey(email));
      assert(!key || !team.memberIds.includes(key.userId), 409, 'This person is already a team member.');
      const existing = await tx.query('invitations', 'teamId', '==', teamId);
      assert(!existing.some(invite => invite.email === email && invite.status === 'pending'), 409, 'An invitation is already pending for this email.');
      const invite = { id: randomUUID(), teamId, teamName: team.name, email, invitedBy: userId, status: 'pending', createdAt: now() };
      tx.set('invitations', invite.id, invite);
      return { ...invite, delivery: 'stubbed', message: 'Invitation saved. No email was sent. The recipient can register or sign in with this email to accept it.' };
    });
  }
  async invitations(user) {
    const invitations = await this.store.query('invitations', 'email', '==', user.email);
    const pending = invitations.filter(invite => invite.status === 'pending');
    const teams = await Promise.all(pending.map(invite => this.store.get('teams', invite.teamId)));
    return pending.filter((invite, index) => teams[index] && !teams[index].deletedAt);
  }
  async respondInvitation(user, invitationId, accept) {
    await this.store.transaction(async tx => {
      const invite = await tx.get('invitations', invitationId);
      assert(invite && invite.email === user.email && invite.status === 'pending', 404, 'Invitation not found.');
      const team = await tx.get('teams', invite.teamId);
      assert(team && !team.deletedAt, 404, 'Team no longer exists.');
      if (accept && !team.memberIds.includes(user.id)) {
        assert(team.memberIds.length < 50, 409, 'This team has reached its member limit.');
        tx.set('teams', team.id, { ...team, memberIds: [...team.memberIds, user.id], updatedAt: now() });
      }
      tx.set('invitations', invitationId, { ...invite, status: accept ? 'accepted' : 'declined', respondedAt: now() });
    });
  }
}
