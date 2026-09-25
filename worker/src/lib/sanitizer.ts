const VULGAR_WORDS = ['卧槽', '我操', '傻逼', '煞笔', '妈的', '操蛋'];

export function sanitizeText(text: string): string {
  if (!text) return '';
  let result = text;
  for (const word of VULGAR_WORDS) {
    result = result.split(word).join('**');
  }
  return result;
}

export function maskPhoneNumber(text: string): string {
  if (!text) return '';
  return text.replace(/(1[3-9]\d)\d{4}(\d{4})/g, '$1****$2');
}
