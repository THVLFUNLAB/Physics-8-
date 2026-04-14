/**
 * Normalize text for search: lowercase + remove diacritics (Vietnamese)
 */
export const normalizeText = (str: string): string =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
