import type { ComponentType } from 'react';

// Описание функции приложения (календарь, траты и т. д.).
// Каждая функция живёт в своей папке src/features/<id> и экспортирует такой объект.
export interface Feature {
  id: string;
  title: string;
  // Экран функции внутри группы
  GroupScreen: ComponentType<{ groupId: string }>;
}

// Чтобы подключить новую функцию, достаточно добавить её сюда.
export const features: Feature[] = [];
