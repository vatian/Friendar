import type { Feature } from '../registry';
import { CalendarScreen } from './CalendarScreen';

export const calendarFeature: Feature = {
  id: 'calendar',
  title: 'Календарь',
  icon: '📅',
  GroupScreen: CalendarScreen,
};
