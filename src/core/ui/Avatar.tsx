import { useState } from 'react';

// Фото из Telegram, а если его нет или оно не загрузилось — первая буква имени.
export function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false);

  if (photoUrl && !broken) {
    return <img className="avatar" src={photoUrl} alt="" onError={() => setBroken(true)} />;
  }
  return <span className="avatar avatar-letter">{name.replace('@', '').charAt(0).toUpperCase()}</span>;
}
