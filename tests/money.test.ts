import { describe, expect, it } from 'vitest';
import { formatINR, parseRupeesToPaise, paiseToInput } from '../shared/money.js';
import { amountInWords } from '../shared/words.js';
import { amountInKannadaWords, integerToKannadaWords } from '../shared/words-kn.js';
import { periodRange } from '../shared/dates.js';

describe('money', () => {
  it('formats rupees in the Indian system', () => {
    expect(formatINR(5_000_000)).toBe('₹50,000.00');
    expect(formatINR(1_234_567_89)).toBe('₹12,34,567.89');
    expect(formatINR(-50)).toBe('-₹0.50');
  });
  it('parses user input into exact paise', () => {
    expect(parseRupeesToPaise('50,000')).toBe(5_000_000);
    expect(parseRupeesToPaise('₹1,234.5')).toBe(123_450);
    expect(parseRupeesToPaise('0.07')).toBe(7);
    expect(parseRupeesToPaise('12.345')).toBeNull();
    expect(parseRupeesToPaise('-5')).toBeNull();
    expect(parseRupeesToPaise('abc')).toBeNull();
    expect(paiseToInput(123_450)).toBe('1234.50');
  });
  it('writes amounts in English words', () => {
    expect(amountInWords(500_000)).toBe('Rupees Five Thousand Only');
    expect(amountInWords(463_500)).toBe('Rupees Four Thousand Six Hundred Thirty-Five Only');
    expect(amountInWords(12_345_678_00)).toBe('Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only');
    expect(amountInWords(12_350)).toBe('Rupees One Hundred Twenty-Three and Fifty Paise Only');
  });
  it('writes amounts in Kannada words', () => {
    expect(amountInKannadaWords(500_000)).toBe('ಐದು ಸಾವಿರ ರೂಪಾಯಿಗಳು ಮಾತ್ರ');
    expect(amountInKannadaWords(50_000)).toBe('ಐನೂರು ರೂಪಾಯಿಗಳು ಮಾತ್ರ');
    expect(amountInKannadaWords(463_500)).toBe('ನಾಲ್ಕು ಸಾವಿರದ ಆರುನೂರ ಮೂವತ್ತೈದು ರೂಪಾಯಿಗಳು ಮಾತ್ರ');
    expect(integerToKannadaWords(23)).toBe('ಇಪ್ಪತ್ಮೂರು');
    expect(integerToKannadaWords(250_000)).toBe('ಎರಡು ಲಕ್ಷದ ಐವತ್ತು ಸಾವಿರ');
  });
  it('resolves date filters in the Indian calendar', () => {
    expect(periodRange('this_month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('this_year', '2026-10-17')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
