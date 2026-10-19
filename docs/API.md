# REST API

Base path: /api. All routes return JSON except successful deletes, logout, and invitation responses (204).

1. GET /auth/csrf creates a session and returns csrfToken.
2. Send X-CSRF-Token on every POST, PATCH, and DELETE, including registration and login.
3. Registration/login regenerate the session and return a replacement token.
4. Use cookies on every request. Sessions expire after 12 hours.

Only /auth/csrf, /auth/register, and /auth/login are accessible before login. The static HTML shell is public so the login form can render; no workspace records are embedded in HTML.

| Method               | Path                               | Purpose                                                        |
| -------------------- | ---------------------------------- | -------------------------------------------------------------- |
| POST                 | /auth/register                     | name, email, password; signs in immediately                    |
| POST                 | /auth/login                        | email, password                                                |
| GET                  | /auth/me                           | Current user                                                   |
| POST                 | /auth/logout                       | End session                                                    |
| GET / POST           | /teams                             | List accessible teams / create team                            |
| GET / PATCH / DELETE | /teams/:teamId                     | Read / edit name and description / delete                      |
| GET / POST           | /teams/:teamId/members             | List members / add registered user by email                    |
| DELETE               | /teams/:teamId/members/:memberId   | Remove member after reassignment                               |
| POST                 | /teams/:teamId/invitations         | Create email invitation stub                                   |
| GET                  | /invitations                       | Current user's pending invitations                             |
| POST                 | /invitations/:invitationId/accept  | Join team as recipient                                         |
| POST                 | /invitations/:invitationId/decline | Decline as recipient                                           |
| GET / POST           | /tasks                             | List visible tasks / create                                    |
| GET / PATCH / DELETE | /tasks/:taskId                     | Read / update / delete                                         |
| GET                  | /reminders                         | Assigned incomplete tasks due within 3 days, including overdue |

GET /tasks supports teamId, assigneeId, status, and search. IDs must be UUIDs.
Task fields: teamId (create only), title, description, assigneeId (UUID or null), status (todo/in_progress/done), priority (low/medium/high), dueDate (YYYY-MM-DD or null). PATCH accepts any nonempty subset except teamId. Dates use UTC.

Only creators can edit/delete teams, manage members, and create invitations. All current team members may create, read, update, and delete that team's tasks. Assignees must belong to the same team. Team deletion uses a tombstone to prevent racing task writes; associated task documents are retained but cannot be accessed through the application. Removing a member with assigned tasks requires reassignment first.

Firestore collections: users, emails (hashed-email uniqueness index), teams, tasks, invitations.
No client has direct Firestore access. Admin SDK authorization is enforced by the Express service.
