export const locales = {
  en: { lang: 'en', locale: 'en_US', home: '/', label: 'English', menu: 'Language' },
  zh: { lang: 'zh-Hans', locale: 'zh_CN', home: '/zh/', label: '中文', menu: '语言' },
  de: { lang: 'de', locale: 'de_DE', home: '/de/', label: 'Deutsch', menu: 'Sprache' },
};

export function languageMenu(language, route = '', updates = false) {
  const current = locales[language];
  return `<details class="language-menu" data-language-menu><summary aria-label="${current.menu}"><i data-lucide="globe" aria-hidden="true"></i><span>${current.label}</span><i data-lucide="chevron-down" aria-hidden="true"></i></summary><nav aria-label="${current.menu}">${Object.entries(locales).map(([key, value]) => `<a href="${value.home}${route}" lang="${value.lang}" hreflang="${value.lang}" data-language-link${updates ? ' data-updates-language' : ''}${key === language ? ' aria-current="true"' : ''}>${value.label}</a>`).join('')}</nav></details>`;
}
