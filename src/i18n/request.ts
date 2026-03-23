import { defaultLocale, type Locale } from './config';
import en from '../../messages/en.json';
import it from '../../messages/it.json';
import ro from '../../messages/ro.json';

const allMessages: Record<Locale, typeof en> = { en, it, ro };

export function getMessages(locale: Locale) {
  return allMessages[locale] ?? allMessages[defaultLocale];
}
