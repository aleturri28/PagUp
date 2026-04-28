import { smartExtract } from '../smartExtract';

describe('smartExtract', () => {
  it('returns null for empty string', () => {
    expect(smartExtract('')).toBeNull();
  });

  it('extracts price with comma separator', () => {
    expect(smartExtract('TOTALE 15,50')).toBe(15.50);
  });

  it('extracts price with dot separator', () => {
    expect(smartExtract('TOTAL 15.50')).toBe(15.50);
  });

  it('prefers TOTALE line over other prices', () => {
    const text = 'Pane 2,50\nFormaggi 8,30\nTOTALE 10,80';
    expect(smartExtract(text)).toBe(10.80);
  });

  it('picks highest value when scores are equal', () => {
    expect(smartExtract('2,50\n8,30\n3,00')).toBe(8.30);
  });

  it('returns null for values over 9999.99', () => {
    expect(smartExtract('TOTALE 10000,00')).toBeNull();
  });

  it('prefers EURO keyword line over plain line', () => {
    expect(smartExtract('5,00\n12,90 EURO')).toBe(12.90);
  });

  it('handles DA PAGARE keyword', () => {
    expect(smartExtract('Subtotale 9,50\nDA PAGARE 9,50')).toBe(9.50);
  });

  it('returns null when no price pattern found', () => {
    expect(smartExtract('Grazie per la visita')).toBeNull();
  });
});
