import { z } from 'zod';
import { FilterXSS } from 'xss';
const textSanitizer = new FilterXSS({
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  allowCommentTag: false,
  css: false,
});
const plain = (min, max) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => textSanitizer.process(value).trim())
    .pipe(z.string().min(min).max(max));
export const id = z.string().uuid();
export const email = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes',
  );
export const registerSchema = z.object({ name: plain(2, 80), email, password }).strict();
export const loginSchema = z
  .object({
    email,
    password: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') <= 72,
        'Password must be at most 72 UTF-8 bytes',
      ),
  })
  .strict();
export const teamSchema = z
  .object({ name: plain(2, 80), description: plain(0, 500).default('') })
  .strict();
export const memberSchema = z.object({ email }).strict();
export const taskSchema = z
  .object({
    teamId: id,
    title: plain(1, 160),
    description: plain(0, 3000).default(''),
    assigneeId: id.nullable().default(null),
    status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }, 'Use a real calendar date')
      .nullable()
      .default(null),
  })
  .strict();
export const taskUpdateSchema = taskSchema
  .omit({ teamId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a field to update');
export const querySchema = z
  .object({
    teamId: id.optional(),
    assigneeId: id.optional(),
    status: z.enum(['todo', 'in_progress', 'done']).optional(),
    search: z.string().trim().max(160).optional(),
  })
  .strict();
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success)
    return res.status(400).json({
      message: 'Please check the submitted fields.',
      errors: result.error.flatten().fieldErrors,
    });
  req.body = result.data;
  next();
};
