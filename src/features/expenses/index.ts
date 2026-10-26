import { registerErrorMessages } from '../../core/errors';
import type { Feature } from '../registry';
import { ExpensesScreen } from './ExpensesScreen';

registerErrorMessages({
  UNSETTLED_DEBTS:
    'Есть незакрытые долги в «Тратах». Сначала рассчитайтесь — потом можно выйти или удалить участника.',
  INVALID_SHARES: 'Проверьте участников и суммы: должник должен быть в группе, сумма — больше нуля.',
  NOT_AUTHOR: 'Изменить или удалить трату может только тот, кто её записал.',
  NOT_MEMBER: 'Вы больше не состоите в этой группе.',
});

export const expensesFeature: Feature = {
  id: 'expenses',
  title: 'Траты',
  icon: '💸',
  GroupScreen: ExpensesScreen,
};
