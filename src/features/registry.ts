import type { ComponentType } from 'react';
import { calendarFeature } from './calendar';

// Описание функции приложения (календарь, траты и т. д.).
// Каждая функция живёт в своей папке src/features/<id> и экспортирует такой объект.
// Экран группы показывает все функции из списка ниже и открывает
// GroupScreen по адресу /group/<id группы>/<id функции>.
export interface Feature {
  id: string;
  title: string;
  icon: string;
  GroupScreen: ComponentType<{ groupId: string }>;
}

// Чтобы подключить новую функцию, достаточно добавить её сюда.
export const features: Feature[] = [calendarFeature];
