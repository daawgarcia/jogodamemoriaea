const { z } = require('zod');

const leadSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(150),
  email: z.email('Informe um e-mail válido.').max(180).transform(v => v.toLowerCase()),
  whatsapp: z.string().transform(v => {
    const digits = v.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  }).refine(v => v.length >= 12 && v.length <= 15, 'Informe um WhatsApp com DDD.'),
  city: z.string().trim().min(2, 'Informe sua cidade e UF.').max(120),
  student: z.boolean(),
  cro: z.string().trim().max(40),
  acknowledged: z.literal(true, { error: 'Confirme a leitura do aviso de privacidade.' }),
  marketing: z.boolean()
}).refine(v => v.student || v.cro.length >= 3, { message: 'Informe seu CRO e UF ou selecione estudante.', path: ['cro'] });

const prizeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  quantity: z.number().int().min(1).max(100000)
});

const syncRecordSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  lead: leadSchema,
  createdAt: z.iso.datetime(),
  status: z.enum(['active', 'won', 'cancelled']),
  prize: z.string().max(100),
  moves: z.number().int().nonnegative(),
  delivered: z.boolean(),
  noticeVersion: z.literal('2026-11-v1')
});

module.exports = { leadSchema, prizeSchema, syncRecordSchema };
