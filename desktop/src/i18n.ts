import { translate } from '../shared/locales';
export function language() {
  return 'en';
}
export function tr(message: string) {
  return translate(message);
}
document.documentElement.lang = 'en';
document.documentElement.dir = 'ltr';
