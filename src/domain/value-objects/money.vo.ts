export class Money {
  private constructor(private readonly amount: number) {
    if (amount < 0) throw new Error('Money amount cannot be negative');
  }

  static create(amount: number): Money {
    return new Money(Math.round(amount * 100) / 100);
  }

  getValue(): number {
    return this.amount;
  }

  add(other: Money): Money {
    return Money.create(this.amount + other.getValue());
  }

  multiply(factor: number): Money {
    return Money.create(this.amount * factor);
  }
}
