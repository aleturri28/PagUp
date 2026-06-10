import { calculateStudentPayment, roundPaymentTarget } from '../paymentLogic';
import { MoneyItem } from '../../api/database.types';

function item(id: string, value: number): MoneyItem {
  return {
    id,
    value,
    type: value >= 5 ? 'bill' : 'coin',
    imageUri: '',
  };
}

describe('paymentLogic', () => {
  it('rounds target up to 10 cents', () => {
    expect(roundPaymentTarget(13.67)).toBe(13.7);
    expect(roundPaymentTarget(12.5)).toBe(12.5);
  });

  it('finds an exact combination in exact mode when available', () => {
    const inventory = [
      item('a', 10),
      item('b', 2),
      item('c', 0.5),
    ];

    const result = calculateStudentPayment(inventory, 12.5, 'exact');
    expect(result.isInsufficient).toBe(false);
    expect(result.coveredAmount).toBe(12.5);
    expect(result.change).toBe(0);
    expect(result.selectedItems.map((entry) => entry.value)).toEqual([10, 2, 0.5]);
  });

  it('falls back to the smallest covering combination in exact mode', () => {
    const inventory = [
      item('a', 20),
      item('b', 10),
      item('c', 5),
    ];

    const result = calculateStudentPayment(inventory, 13.67, 'exact');
    expect(result.isInsufficient).toBe(false);
    expect(result.coveredAmount).toBe(15);
    expect(result.selectedItems.map((entry) => entry.value)).toEqual([10, 5]);
  });

  it('uses the single immediately higher denomination in fast mode', () => {
    const inventory = [
      item('a', 10),
      item('b', 5),
      item('c', 2),
      item('d', 1),
      item('e', 0.5),
      item('f', 0.2),
    ];

    const result = calculateStudentPayment(inventory, 3.67, 'fast');
    expect(result.isInsufficient).toBe(false);
    expect(result.coveredAmount).toBe(5);
    expect(result.selectedItems.map((entry) => entry.value)).toEqual([5]);
  });

  it('ignores 1, 2 and 5 cent coins when searching combinations', () => {
    const inventory = [
      item('a', 10),
      item('b', 0.1),
      item('c', 0.05),
      item('d', 0.02),
      item('e', 0.01),
    ];

    const result = calculateStudentPayment(inventory, 10.01, 'exact');
    expect(result.isInsufficient).toBe(false);
    expect(result.coveredAmount).toBe(10.1);
    expect(result.selectedItems.map((entry) => entry.value)).toEqual([10, 0.1]);
  });

  it('marks payment insufficient when only tiny coins could close the gap', () => {
    const inventory = [
      item('a', 10),
      item('b', 0.05),
      item('c', 0.02),
      item('d', 0.01),
    ];

    const result = calculateStudentPayment(inventory, 10.01, 'exact');
    expect(result.isInsufficient).toBe(true);
  });
});
