import { supabase } from '../../core/supabase/client';
import type { Share } from './logic/money.ts';

export interface ExpenseMember {
  id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
}

export interface ExpensesBundle {
  ownerId: string;
  currency: string; // валюта группы по умолчанию
  members: ExpenseMember[];
  shares: Share[]; // только мои доли: где я платил или где я должен
}

// Всё для экрана «Траты» одним запросом. Чужие долги база не отдаст.
export async function fetchExpensesBundle(groupId: string): Promise<ExpensesBundle | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `owner_id,
       group_members(joined_at, profiles(id, username, first_name, photo_url)),
       expense_settings(currency),
       expense_shares(expense_id, payer_id, debtor_id, currency, amount,
         expenses(title, spent_on, created_at))`,
    )
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Связи без сгенерированных типов — уточняем вручную
  const row = data as unknown as {
    owner_id: string;
    group_members: { joined_at: string; profiles: ExpenseMember | null }[];
    expense_settings: { currency: string } | { currency: string }[] | null;
    expense_shares: (Omit<Share, 'title' | 'spent_on' | 'created_at'> & {
      expenses: { title: string; spent_on: string; created_at: string } | null;
    })[];
  };
  const settings = Array.isArray(row.expense_settings) ? row.expense_settings[0] : row.expense_settings;

  return {
    ownerId: row.owner_id,
    currency: settings?.currency ?? 'RUB',
    members: row.group_members
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .flatMap((m) => (m.profiles ? [m.profiles] : [])),
    shares: row.expense_shares.flatMap((s) =>
      s.expenses
        ? [
            {
              expense_id: s.expense_id,
              payer_id: s.payer_id,
              debtor_id: s.debtor_id,
              currency: s.currency,
              amount: Number(s.amount),
              title: s.expenses.title,
              spent_on: s.expenses.spent_on,
              created_at: s.expenses.created_at,
            },
          ]
        : [],
    ),
  };
}

export interface ExpenseInput {
  title: string;
  currency: string;
  spent_on: string;
  shares: { debtor_id: string; cents: number }[];
}

const sharesJson = (input: ExpenseInput) =>
  input.shares.map((s) => ({ debtor_id: s.debtor_id, amount: s.cents / 100 }));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const createExpense = (groupId: string, input: ExpenseInput) =>
  rpc<string>('create_expense', {
    p_group_id: groupId,
    p_title: input.title,
    p_currency: input.currency,
    p_spent_on: input.spent_on,
    p_shares: sharesJson(input),
  });

export const updateExpense = (expenseId: string, input: ExpenseInput) =>
  rpc<void>('update_expense', {
    p_expense_id: expenseId,
    p_title: input.title,
    p_currency: input.currency,
    p_spent_on: input.spent_on,
    p_shares: sharesJson(input),
  });

export const deleteExpense = (expenseId: string) => rpc<void>('delete_expense', { p_expense_id: expenseId });

export const setGroupCurrency = (groupId: string, currency: string) =>
  rpc<void>('set_group_currency', { p_group_id: groupId, p_currency: currency });
